import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function POST(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { taskId } = body;

    if (!taskId || typeof taskId !== 'string') {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 작업 중지 요청: ${taskId}`);

    const db = new Database(dbPath);

    // 1. PID 가져오기
    let pid: number | null = null;
    try {
      const row: any = db.prepare('SELECT pid FROM scripts_temp WHERE id = ?').get(taskId);
      pid = row?.pid || null;
      console.log(`📌 PID 조회: ${pid}`);
    } catch (error: any) {
      console.error('PID 조회 실패:', error.message);
    }

    // 2. 프로세스 강제 종료 (PID가 있는 경우)
    if (pid) {
      try {
        console.log(`🔪 프로세스 강제 종료 시도: PID ${pid}`);

        // Windows에서 taskkill 사용
        if (process.platform === 'win32') {
          const { exec } = require('child_process');
          exec(`taskkill /F /PID ${pid} /T`, (error: any, stdout: any, stderr: any) => {
            if (error) {
              console.error(`⚠️ taskkill 실패: ${error.message}`);
            } else {
              console.log(`✅ 프로세스 종료 완료: PID ${pid}`);
              console.log(stdout);
            }
          });
        } else {
          // Unix/Linux/Mac에서 SIGKILL 사용
          process.kill(pid, 'SIGKILL');
          console.log(`✅ 프로세스 종료 완료: PID ${pid}`);
        }
      } catch (killError: any) {
        console.error(`⚠️ 프로세스 종료 실패: ${killError.message}`);
        // 프로세스가 이미 종료되었을 수 있으므로 계속 진행
      }
    } else {
      console.log('⚠️ PID가 없어서 프로세스를 강제 종료할 수 없습니다.');
    }

    // 3. STOP 신호 파일 생성 (보조 수단)
    try {
      const backendOutputDir = path.join(process.cwd(), '..', 'trend-video-backend', 'output');

      const possiblePaths = [
        path.join(backendOutputDir, taskId),
        path.join(process.cwd(), 'output', taskId),
        path.join(backendOutputDir, `script_${taskId}`),
        path.join(process.cwd(), 'output', `script_${taskId}`)
      ];

      let stopFilePath: string | null = null;
      for (const dirPath of possiblePaths) {
        try {
          await fs.access(dirPath);
          stopFilePath = path.join(dirPath, 'STOP');
          await fs.writeFile(stopFilePath, `STOP\nTimestamp: ${new Date().toISOString()}\nTaskId: ${taskId}`);
          console.log(`✅ STOP 신호 파일 생성: ${stopFilePath}`);
          break;
        } catch {
          continue;
        }
      }

      if (!stopFilePath) {
        console.log(`⚠️ 작업 디렉토리를 찾을 수 없음`);
      }
    } catch (error: any) {
      console.error(`⚠️ STOP 파일 생성 실패:`, error.message);
    }

    // 4. DB 상태 업데이트
    try {
      db.prepare(`
        UPDATE scripts_temp
        SET status = 'cancelled', message = '사용자가 작업을 취소했습니다', pid = NULL
        WHERE id = ?
      `).run(taskId);

      // 로그 추가
      const logsRow: any = db.prepare('SELECT logs FROM scripts_temp WHERE id = ?').get(taskId);
      const logs = logsRow?.logs ? JSON.parse(logsRow.logs) : [];
      logs.push({
        timestamp: new Date().toISOString(),
        message: `🛑 작업 취소됨${pid ? ` (PID ${pid} 강제 종료)` : ''}`
      });
      db.prepare('UPDATE scripts_temp SET logs = ? WHERE id = ?').run(JSON.stringify(logs), taskId);

      console.log(`✅ DB 상태 업데이트 완료: ${taskId} (cancelled)`);
    } catch (dbError) {
      console.error('DB 업데이트 실패:', dbError);
    } finally {
      db.close();
    }

    return NextResponse.json({
      success: true,
      message: pid ? `프로세스가 강제 종료되었습니다 (PID: ${pid})` : '작업이 취소되었습니다.',
      method: pid ? 'force_kill' : 'signal_only',
      pid: pid
    });

  } catch (error: any) {
    console.error('Error canceling script:', error);
    return NextResponse.json(
      { error: error.message || '작업 중지 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
