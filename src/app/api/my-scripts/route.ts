import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getScriptsByUserId, findScriptById, deleteScript } from '@/lib/db';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// GET - 사용자의 대본 목록 조회 (scripts + scripts_temp 통합)
export async function GET(request: NextRequest) {
  try {
    console.log('=== 대본 목록 조회 요청 시작 ===');

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log('사용자 ID로 대본 조회 중:', user.userId);

    // 1. scripts 테이블에서 API 생성 대본 가져오기
    const apiScripts = await getScriptsByUserId(user.userId);
    console.log('API 대본 개수:', apiScripts.length);

    // 2. scripts_temp 테이블에서 로컬 Claude 생성 대본 가져오기
    let localScripts: any[] = [];
    try {
      const db = new Database(dbPath);
      localScripts = db.prepare(`
        SELECT * FROM scripts_temp
        ORDER BY createdAt DESC
      `).all();

      console.log('로컬 대본 개수:', localScripts.length);

      // scripts_temp의 데이터를 scripts 형식으로 변환
      localScripts = localScripts.map((script: any) => {
        let content = '';

        // scriptId가 있으면 scripts 테이블에서 실제 내용 가져오기
        if (script.scriptId) {
          try {
            const actualScript = db.prepare(`
              SELECT content FROM scripts WHERE id = ?
            `).get(script.scriptId) as any;

            if (actualScript && actualScript.content) {
              content = actualScript.content;
              console.log(`✓ scriptId ${script.scriptId}의 content 로드 완료 (${content.length}자)`);
            }
          } catch (err) {
            console.error(`⚠️ scriptId ${script.scriptId} content 로드 실패:`, err);
          }
        }

        return {
          id: script.id,
          userId: '', // scripts_temp에는 userId가 없음 (전역 공유)
          title: script.title,
          originalTitle: script.originalTitle || script.title,
          content: content, // scripts 테이블에서 가져온 실제 내용
          status: script.status === 'DONE' ? 'completed' :
                  script.status === 'ERROR' ? 'failed' :
                  script.status === 'PENDING' ? 'pending' : 'processing',
          progress: 0, // scripts_temp에는 progress가 없음
          error: script.message?.includes('오류') ? script.message : undefined,
          logs: script.logs ? JSON.parse(script.logs) : [],
          type: script.type as 'longform' | 'shortform' | 'sora2' | undefined,
          useClaudeLocal: script.useClaudeLocal === 1, // 로컬 Claude 사용 여부
          createdAt: script.createdAt,
          updatedAt: script.createdAt
        };
      });

      db.close();
    } catch (error) {
      console.error('⚠️ scripts_temp 조회 실패:', error);
    }

    // 3. 두 목록을 합치고 최신순으로 정렬
    const allScripts = [...apiScripts, ...localScripts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    console.log('전체 대본 개수:', allScripts.length);
    console.log('대본 목록:', allScripts.map(s => ({ id: s.id, title: s.title, status: s.status })));

    return NextResponse.json({
      scripts: allScripts,
      total: allScripts.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching scripts:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error?.message || '대본 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE - 대본 삭제
export async function DELETE(request: NextRequest) {
  try {
    console.log('=== 대본 삭제 요청 시작 ===');

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');
    console.log('scriptId:', scriptId);

    if (!scriptId) {
      console.log('❌ scriptId 없음');
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);

    // 1. scripts 테이블에서 찾기
    const script = await findScriptById(scriptId);

    if (script) {
      // scripts 테이블에 있는 경우 - 소유자 확인 필요
      console.log('찾은 대본 (scripts):', script);
      console.log('대본 소유자:', script.userId, '현재 사용자:', user.userId);

      if (script.userId !== user.userId) {
        console.log('❌ 권한 없음');
        db.close();
        return NextResponse.json(
          { error: '권한이 없습니다.' },
          { status: 403 }
        );
      }

      // 대본 삭제
      console.log('scripts 테이블에서 대본 삭제 시도...');
      const success = await deleteScript(scriptId);
      console.log('삭제 결과:', success);

      db.close();

      if (success) {
        console.log('✅ 대본 삭제 성공');
        return NextResponse.json({
          success: true,
          message: '대본이 삭제되었습니다.'
        });
      } else {
        console.log('❌ 대본 삭제 실패');
        return NextResponse.json(
          { error: '대본 삭제에 실패했습니다.' },
          { status: 500 }
        );
      }
    }

    // 2. scripts_temp 테이블에서 찾기 (로컬 Claude 생성 대본)
    console.log('scripts 테이블에 없음, scripts_temp 확인 중...');
    const tempScript = db.prepare('SELECT * FROM scripts_temp WHERE id = ?').get(scriptId) as any;

    if (tempScript) {
      console.log('찾은 대본 (scripts_temp):', tempScript);

      // scripts_temp는 전역 공유이므로 소유자 확인 없이 삭제 가능
      // 하지만 보안을 위해 관리자만 삭제하도록 제한할 수도 있습니다
      // 여기서는 로그인한 사용자라면 누구나 삭제 가능하도록 설정

      try {
        // scripts_temp에서 삭제
        const deleteTemp = db.prepare('DELETE FROM scripts_temp WHERE id = ?');
        const result = deleteTemp.run(scriptId);

        // 연관된 scripts 항목도 삭제 (scriptId가 있는 경우)
        if (tempScript.scriptId) {
          console.log('연관된 scripts 항목도 삭제:', tempScript.scriptId);
          const deleteScripts = db.prepare('DELETE FROM scripts WHERE id = ?');
          deleteScripts.run(tempScript.scriptId);
        }

        db.close();

        if (result.changes > 0) {
          console.log('✅ scripts_temp에서 대본 삭제 성공');
          return NextResponse.json({
            success: true,
            message: '대본이 삭제되었습니다.'
          });
        } else {
          console.log('❌ scripts_temp에서 대본 삭제 실패');
          return NextResponse.json(
            { error: '대본 삭제에 실패했습니다.' },
            { status: 500 }
          );
        }
      } catch (dbError) {
        console.error('DB 삭제 오류:', dbError);
        db.close();
        return NextResponse.json(
          { error: '대본 삭제 중 데이터베이스 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    }

    // 3. 둘 다 없는 경우
    console.log('❌ 대본을 찾을 수 없음 (scripts, scripts_temp 모두)');
    db.close();
    return NextResponse.json(
      { error: '대본을 찾을 수 없습니다.' },
      { status: 404 }
    );

  } catch (error: any) {
    console.error('Error deleting script:', error);
    return NextResponse.json(
      { error: error?.message || '대본 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
