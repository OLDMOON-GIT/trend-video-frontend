import { NextRequest, NextResponse } from 'next/server';
import { findScriptById } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const scriptId = params.id;

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    const script = await findScriptById(scriptId);

    if (!script) {
      return NextResponse.json(
        { error: 'Script not found' },
        { status: 404 }
      );
    }

    // 본인의 대본만 조회 가능 (관리자는 모두 조회 가능)
    if (!user.isAdmin && script.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ script });
  } catch (error) {
    console.error('Error fetching script:', error);
    return NextResponse.json(
      { error: 'Failed to fetch script' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const scriptId = params.id;

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { folderId } = body;

    // 스크립트 소유권 확인
    const script = await findScriptById(scriptId);

    if (!script) {
      return NextResponse.json(
        { error: '스크립트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (!user.isAdmin && script.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // folderId가 제공된 경우 폴더 소유권 확인
    if (folderId) {
      const db = new Database(dbPath);
      const folder: any = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(folderId, user.userId);
      db.close();

      if (!folder) {
        return NextResponse.json(
          { error: '폴더를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
    }

    // folder_id 업데이트
    const db = new Database(dbPath);
    db.prepare(`
      UPDATE scripts
      SET folder_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(folderId || null, scriptId);
    db.close();

    return NextResponse.json({
      success: true,
      message: '스크립트가 이동되었습니다.'
    });
  } catch (error) {
    console.error('Error updating script folder:', error);
    return NextResponse.json(
      { error: '스크립트 폴더 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const taskId = params.id;

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 작업 중지 요청: ${taskId}`);

    // DB에서 PID 가져오기
    const db = new Database(dbPath);
    const row: any = db.prepare('SELECT pid FROM scripts_temp WHERE id = ?').get(taskId);

    if (!row || !row.pid) {
      console.log(`⚠️ PID를 찾을 수 없음: ${taskId}`);
      // PID가 없어도 상태는 업데이트
      db.prepare(`
        UPDATE scripts_temp
        SET status = 'ERROR', message = '사용자에 의해 중지됨', pid = NULL
        WHERE id = ?
      `).run(taskId);
      db.close();

      return NextResponse.json({
        success: true,
        message: '작업 상태가 중지로 변경되었습니다. (프로세스 PID 없음)',
        processKilled: false
      });
    }

    const pid = row.pid;
    console.log(`📍 찾은 PID: ${pid}`);

    let killed = false;
    try {
      // Windows와 Unix 계열에 따라 다른 명령 사용
      const isWindows = process.platform === 'win32';

      if (isWindows) {
        // Windows: taskkill로 프로세스 트리 전체 종료
        await execAsync(`taskkill /F /T /PID ${pid}`);
        console.log(`✅ Windows 프로세스 종료 완료: PID ${pid}`);
      } else {
        // Unix: kill 명령 사용
        await execAsync(`kill -9 ${pid}`);
        console.log(`✅ Unix 프로세스 종료 완료: PID ${pid}`);
      }
      killed = true;
    } catch (error: any) {
      // 프로세스가 이미 종료되었거나 존재하지 않는 경우
      console.log(`⚠️ 프로세스 종료 실패 또는 이미 종료됨: ${error.message}`);
      killed = false;
    }

    // DB 상태 업데이트
    try {
      db.prepare(`
        UPDATE scripts_temp
        SET status = 'ERROR', message = '사용자에 의해 중지됨', pid = NULL
        WHERE id = ?
      `).run(taskId);

      // 로그 추가
      const logsRow: any = db.prepare('SELECT logs FROM scripts_temp WHERE id = ?').get(taskId);
      const logs = logsRow?.logs ? JSON.parse(logsRow.logs) : [];
      logs.push({
        timestamp: new Date().toISOString(),
        message: '🛑 사용자에 의해 작업이 중지되었습니다.'
      });
      db.prepare('UPDATE scripts_temp SET logs = ? WHERE id = ?').run(JSON.stringify(logs), taskId);

      console.log(`✅ DB 상태 업데이트 완료: ${taskId}`);
    } catch (dbError) {
      console.error('DB 업데이트 실패:', dbError);
    } finally {
      db.close();
    }

    return NextResponse.json({
      success: true,
      message: '작업이 중지되었습니다.',
      processKilled: killed,
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
