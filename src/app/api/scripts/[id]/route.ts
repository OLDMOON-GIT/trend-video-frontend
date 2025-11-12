import { NextRequest, NextResponse } from 'next/server';
import { findContentById } from '@/lib/content';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { GetScriptResponse, GetScriptErrorResponse } from '@/types/content';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<GetScriptResponse | GetScriptErrorResponse>> {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json<GetScriptErrorResponse>(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const { id: contentId } = await params;

    if (!contentId) {
      return NextResponse.json<GetScriptErrorResponse>(
        { error: 'contentId가 필요합니다.' },
        { status: 400 }
      );
    }

    const content = findContentById(contentId);

    if (!content || content.type !== 'script') {
      return NextResponse.json<GetScriptErrorResponse>(
        { error: 'Script not found' },
        { status: 404 }
      );
    }

    // 본인의 대본만 조회 가능 (관리자는 모두 조회 가능)
    if (!user.isAdmin && content.userId !== user.userId) {
      return NextResponse.json<GetScriptErrorResponse>(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // ⭐ 타입 안전성: content.productInfo는 자동으로 타입 체크됨
    // Return as 'script' for backward compatibility
    return NextResponse.json<GetScriptResponse>({ script: content });
  } catch (error) {
    console.error('Error fetching script:', error);
    return NextResponse.json<GetScriptErrorResponse>(
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
    const { id: contentId } = await params;

    if (!contentId) {
      return NextResponse.json(
        { error: 'contentId가 필요합니다.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { folderId, content: newContent } = body;

    // 스크립트 소유권 확인
    const content = findContentById(contentId);

    if (!content || content.type !== 'script') {
      return NextResponse.json(
        { error: '스크립트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 대본 내용 수정은 관리자만 가능
    if (newContent !== undefined && !user.isAdmin) {
      return NextResponse.json(
        { error: '대본 수정은 관리자만 가능합니다.' },
        { status: 403 }
      );
    }

    // 폴더 이동은 본인만 가능
    if (folderId !== undefined && !user.isAdmin && content.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    const db = new Database(dbPath);

    try {
      // folderId가 제공된 경우 폴더 소유권 확인
      if (folderId !== undefined) {
        if (folderId) {
          const folder: any = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(folderId, user.userId);
          if (!folder) {
            db.close();
            return NextResponse.json(
              { error: '폴더를 찾을 수 없습니다.' },
              { status: 404 }
            );
          }
        }

        // folder_id 업데이트
        db.prepare(`
          UPDATE contents
          SET folder_id = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(folderId || null, contentId);
      }

      // content가 제공된 경우 대본 내용 업데이트 (관리자 전용)
      if (newContent !== undefined) {
        db.prepare(`
          UPDATE contents
          SET content = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(newContent, contentId);
      }

      db.close();

      const message = newContent !== undefined
        ? '대본이 수정되었습니다.'
        : '스크립트가 이동되었습니다.';

      return NextResponse.json({
        success: true,
        message
      });

    } catch (error) {
      db.close();
      throw error;
    }
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
    const { id: taskId } = await params;

    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 작업 중지 요청: ${taskId}`);

    // DB에서 PID 가져오기 (contents 테이블 사용)
    const db = new Database(dbPath);
    const row: any = db.prepare('SELECT pid FROM contents WHERE id = ?').get(taskId);

    if (!row || !row.pid) {
      console.log(`⚠️ PID를 찾을 수 없음: ${taskId}`);
      // PID가 없어도 상태는 업데이트
      db.prepare(`
        UPDATE contents
        SET status = 'failed', error = '사용자에 의해 중지됨', pid = NULL, updated_at = datetime('now')
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

        // Chrome 브라우저도 함께 종료 (.chrome-automation-profile 사용 중인 프로세스)
        try {
          // PowerShell로 명령줄에 .chrome-automation-profile이 포함된 Chrome 프로세스 찾아서 종료
          const psCommand = `
            Get-Process chrome -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like '*chrome-automation-profile*' } |
            ForEach-Object { Stop-Process -Id $_.Id -Force }
          `.replace(/\n/g, ' ').trim();

          await execAsync(`powershell -Command "${psCommand}"`);
          console.log(`✅ Chrome 자동화 브라우저 종료 완료`);
        } catch (chromeError: any) {
          // Chrome이 없거나 이미 종료된 경우 무시
          console.log(`⚠️ Chrome 종료 실패 또는 이미 종료됨: ${chromeError.message}`);
        }

        // CMD 창도 종료 (Python 스크립트 실행 중인 창)
        try {
          const cmdCommand = `
            Get-Process cmd -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowTitle -like '*자동 열기*' } |
            ForEach-Object { Stop-Process -Id $_.Id -Force }
          `.replace(/\n/g, ' ').trim();

          await execAsync(`powershell -Command "${cmdCommand}"`);
          console.log(`✅ CMD 창 종료 완료`);
        } catch (cmdError: any) {
          console.log(`⚠️ CMD 창 종료 실패 또는 이미 종료됨: ${cmdError.message}`);
        }
      } else {
        // Unix: kill 명령 사용
        await execAsync(`kill -9 ${pid}`);
        console.log(`✅ Unix 프로세스 종료 완료: PID ${pid}`);

        // Chrome 브라우저도 함께 종료
        try {
          await execAsync(`pkill -f "chrome-automation-profile"`);
          console.log(`✅ Chrome 자동화 브라우저 종료 완료`);
        } catch (chromeError: any) {
          console.log(`⚠️ Chrome 종료 실패 또는 이미 종료됨: ${chromeError.message}`);
        }
      }
      killed = true;
    } catch (error: any) {
      // 프로세스가 이미 종료되었거나 존재하지 않는 경우
      console.log(`⚠️ 프로세스 종료 실패 또는 이미 종료됨: ${error.message}`);
      killed = false;
    }

    // DB 상태 업데이트 (contents 테이블 사용)
    try {
      db.prepare(`
        UPDATE contents
        SET status = 'failed', error = '사용자에 의해 중지됨', pid = NULL, updated_at = datetime('now')
        WHERE id = ?
      `).run(taskId);

      // 로그 추가 (content_logs 테이블 사용)
      db.prepare(`
        INSERT INTO content_logs (content_id, log_message)
        VALUES (?, ?)
      `).run(taskId, '🛑 사용자에 의해 작업이 중지되었습니다.');

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
