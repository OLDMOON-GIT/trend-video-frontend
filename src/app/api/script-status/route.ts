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

    // 1. contents 테이블에서 찾기
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

    // 2. contents에 없으면 scripts_temp 테이블에서 찾기 (로컬 Claude 생성 대본)
    console.log('🔍 scripts_temp 테이블 조회...');
    let database: Database.Database | null = null;
    try {
      database = new Database(dbPath);
      const tempScript = database.prepare(`
        SELECT * FROM scripts_temp WHERE id = ?
      `).get(scriptId) as any;

      if (tempScript) {
        console.log('📦 scripts_temp 결과:', {
          id: tempScript.id,
          title: tempScript.title,
          status: tempScript.status
        });

        // scripts_temp는 전역 공유이므로 소유자 확인 없이 조회 가능
        const logs = tempScript.logs ? JSON.parse(tempScript.logs) : [];

        // 상태 매핑: PENDING -> pending, DONE -> completed, ERROR -> failed
        const mappedStatus =
          tempScript.status === 'DONE' ? 'completed' :
          tempScript.status === 'ERROR' ? 'failed' :
          tempScript.status === 'PENDING' ? 'pending' : 'processing';

        // scriptId가 있으면 실제 contents 테이블에서 content 가져오기
        let actualContent = '';
        if (tempScript.scriptId) {
          try {
            const contentRow = database.prepare(`
              SELECT content FROM contents WHERE id = ?
            `).get(tempScript.scriptId) as any;

            if (contentRow && contentRow.content) {
              actualContent = contentRow.content;
              console.log(`✓ contentId ${tempScript.scriptId}의 content 로드 완료 (${actualContent.length}자)`);
            }
          } catch (err) {
            console.error(`⚠️ contentId ${tempScript.scriptId} content 로드 실패:`, err);
          }
        }

        console.log('✅ 대본 상태 (scripts_temp):', {
          id: tempScript.id,
          status: mappedStatus,
          logsCount: logs.length
        });

        return NextResponse.json({
          status: mappedStatus,
          title: tempScript.title,
          content: actualContent,
          progress: mappedStatus === 'completed' ? 100 : mappedStatus === 'processing' ? 50 : 0,
          logs: logs,
          error: tempScript.status === 'ERROR' ? tempScript.message : undefined
        });
      }
    } finally {
      if (database) {
        database.close();
      }
    }

    // 3. 둘 다 없으면 404
    console.log('❌ 대본을 찾을 수 없음:', scriptId);
    return NextResponse.json(
      { error: '대본을 찾을 수 없습니다.' },
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
