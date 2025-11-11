import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findContentById, getContentLogs } from '@/lib/content';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(request: NextRequest) {
  console.log('=== /api/script-status 시작 ===');

  // 사용자 인증
  const user = await getCurrentUser(request);
  console.log('👤 현재 사용자:', user?.userId);

  if (!user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('🔍 대본 상태 조회:', scriptId);

    // task_* ID인 경우 scripts_temp 테이블에서 조회
    if (scriptId.startsWith('task_')) {
      console.log('🔍 scripts_temp 테이블 조회:', scriptId);
      const db = Database(dbPath);

      try {
        const tempScript = db.prepare(`
          SELECT id, title, status, message, scriptId, logs, createdAt
          FROM scripts_temp
          WHERE id = ?
        `).get(scriptId) as any;

        if (!tempScript) {
          console.log('❌ scripts_temp에도 없음:', scriptId);
          return NextResponse.json(
            {
              error: '대본을 찾을 수 없습니다.',
              errorCode: 'TASK_NOT_FOUND',
              suggestion: '작업이 삭제되었거나 만료되었습니다. 페이지를 새로고침하세요.',
              details: { taskId: scriptId }
            },
            { status: 404 }
          );
        }

        console.log('📦 scripts_temp 결과:', {
          id: tempScript.id,
          status: tempScript.status,
          scriptId: tempScript.scriptId
        });

        // 완료되어 scriptId가 있으면 실제 content로 리다이렉트
        if (tempScript.scriptId) {
          console.log('✅ scriptId 존재, contents 테이블 조회:', tempScript.scriptId);
          const content = findContentById(tempScript.scriptId);

          if (content) {
            const logs = getContentLogs(tempScript.scriptId);
            return NextResponse.json({
              status: content.status,
              title: content.title,
              content: content.content,
              progress: content.progress,
              logs: logs,
              error: content.error,
              _note: 'task ID에서 자동으로 실제 content로 전환됨'
            });
          }
        }

        // scriptId가 없으면 임시 작업 상태 반환
        let logs = [];
        try {
          logs = tempScript.logs ? JSON.parse(tempScript.logs) : [];
        } catch (e) {
          console.error('로그 파싱 실패:', e);
        }

        // 상태 매핑
        let mappedStatus = tempScript.status;
        if (tempScript.status === 'ING' || tempScript.status === 'PENDING') {
          mappedStatus = 'processing';
        } else if (tempScript.status === 'DONE') {
          mappedStatus = 'completed';
        } else if (tempScript.status === 'ERROR') {
          mappedStatus = 'failed';
        }

        return NextResponse.json({
          status: mappedStatus,
          title: tempScript.title,
          message: tempScript.message,
          logs: logs,
          taskId: tempScript.id,
          _warning: tempScript.status === 'ING' ? '작업이 오래 전에 시작되었지만 아직 완료되지 않았습니다.' : null
        });

      } finally {
        db.close();
      }
    }

    // contents 테이블에서 찾기
    console.log('🔍 findContentById 호출 (contents 테이블)...');
    const content = findContentById(scriptId);
    console.log('📦 findContentById 결과:', content ? {
      id: content.id,
      userId: content.userId,
      title: content.title,
      status: content.status
    } : null);

    if (content) {
      // 본인의 대본인지 확인
      if (content.userId !== user.userId) {
        console.log('❌ 권한 없음:', { contentUserId: content.userId, currentUserId: user.userId });
        return NextResponse.json(
          { error: '권한이 없습니다.' },
          { status: 403 }
        );
      }

      // 로그 가져오기
      const logs = getContentLogs(scriptId);

      console.log('✅ 대본 상태 (contents):', {
        id: content.id,
        status: content.status,
        progress: content.progress,
        logsCount: logs.length
      });

      return NextResponse.json({
        status: content.status,
        title: content.title,
        content: content.content,
        progress: content.progress,
        logs: logs,
        error: content.error
      });
    }

    // 대본을 찾을 수 없음
    console.log('❌ 대본을 찾을 수 없음:', scriptId);
    return NextResponse.json(
      {
        error: '대본을 찾을 수 없습니다.',
        errorCode: 'SCRIPT_NOT_FOUND',
        suggestion: '대본이 생성 중이거나 이미 삭제되었을 수 있습니다.',
        details: {
          scriptId: scriptId,
          timestamp: new Date().toISOString()
        }
      },
      { status: 404 }
    );

  } catch (error: any) {
    console.error('❌ 대본 상태 조회 오류:', error);
    return NextResponse.json(
      { error: '대본 상태 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
