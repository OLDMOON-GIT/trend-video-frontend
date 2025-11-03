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

    // STOP 신호 파일 생성 (Backend가 이 파일을 감지하면 자체 종료)
    try {
      // 작업 디렉토리 찾기
      const backendOutputDir = path.join(process.cwd(), '..', 'trend-video-backend', 'output');

      // taskId에 해당하는 폴더 찾기 (여러 패턴 시도)
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
          // 디렉토리가 없으면 다음 시도
          continue;
        }
      }

      if (!stopFilePath) {
        console.log(`⚠️ 작업 디렉토리를 찾을 수 없음. DB 상태만 업데이트합니다.`);
      }
    } catch (error: any) {
      console.error(`⚠️ STOP 파일 생성 실패:`, error.message);
    }

    // DB 상태 업데이트
    try {
      db.prepare(`
        UPDATE scripts_temp
        SET status = 'STOPPING', message = '중지 신호 전송됨 (Backend에서 처리 중)', pid = NULL
        WHERE id = ?
      `).run(taskId);

      // 로그 추가
      const logsRow: any = db.prepare('SELECT logs FROM scripts_temp WHERE id = ?').get(taskId);
      const logs = logsRow?.logs ? JSON.parse(logsRow.logs) : [];
      logs.push({
        timestamp: new Date().toISOString(),
        message: '🛑 중지 신호 전송됨. Backend가 자체 종료합니다.'
      });
      db.prepare('UPDATE scripts_temp SET logs = ? WHERE id = ?').run(JSON.stringify(logs), taskId);

      console.log(`✅ DB 상태 업데이트 완료: ${taskId} (STOPPING)`);
    } catch (dbError) {
      console.error('DB 업데이트 실패:', dbError);
    } finally {
      db.close();
    }

    return NextResponse.json({
      success: true,
      message: '중지 신호가 전송되었습니다. Backend에서 프로세스를 정리합니다.',
      method: 'signal_file'
    });

  } catch (error: any) {
    console.error('Error canceling script:', error);
    return NextResponse.json(
      { error: error.message || '작업 중지 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
