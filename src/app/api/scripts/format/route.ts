import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { extractPureJson, parseJsonSafely } from '@/lib/json-utils';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function POST(request: NextRequest) {
  try {
    console.log('=== JSON 포맷팅 요청 시작 ===');

    const user = await getCurrentUser(request);
    console.log('🔐 인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { scriptId, formattedContent } = body || {};
    console.log('🧾 포맷팅 요청 scriptId:', scriptId, 'formattedContent 전달 여부:', Boolean(formattedContent));

    if (!scriptId) {
      console.log('❌ scriptId 누락');
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    let db: Database.Database | null = null;

    try {
      db = new Database(dbPath);

      const query = 'SELECT * FROM contents WHERE id = ? AND user_id = ? AND type = ?';
      console.log('📄 실행 쿼리:', query);
      console.log('📄 파라미터:', { id: scriptId, user_id: user.userId, type: 'script' });

      const stmt = db.prepare(query);
      const script = stmt.get(scriptId, user.userId, 'script') as any;

      if (!script) {
        console.log('❌ 대본을 찾을 수 없거나 권한이 없습니다.');
        return NextResponse.json(
          { error: '대본을 찾을 수 없거나 권한이 없습니다.' },
          { status: 404 }
        );
      }

      console.log('✅ 대본 조회 성공:', { id: script.id, title: script.title });

      let parsedData: any;

      if (formattedContent && typeof formattedContent === 'string' && formattedContent.trim().length > 0) {
        try {
          parsedData = JSON.parse(formattedContent);
          console.log('✅ 클라이언트에서 전달된 formattedContent 사용');
        } catch (overrideError: any) {
          console.error('❌ formattedContent JSON 파싱 실패:', overrideError);
          return NextResponse.json(
            { error: 'formattedContent가 올바른 JSON 형식이 아닙니다.' },
            { status: 400 }
          );
        }
      } else {
        const rawContent = (script.content || '').trim();
        const cleanedContent = extractPureJson(rawContent) || rawContent;
        const parseResult = parseJsonSafely(cleanedContent, {
          logErrors: true,
          attemptFix: true
        });

        if (!parseResult.success || typeof parseResult.data === 'undefined') {
          console.error('❌ JSON 파싱 실패 (서버 측):', parseResult.error);
          return NextResponse.json(
            { error: parseResult.error || 'JSON 파싱에 실패했습니다.' },
            { status: 400 }
          );
        }

        if (parseResult.fixed) {
          console.log('✨ JSON 자동 보정 결과가 적용되었습니다.');
        }

        parsedData = parseResult.data;
      }

      const formattedContentToSave = JSON.stringify(parsedData, null, 2);
      console.log('📏 원본 길이:', script.content.length, '→ 포맷팅 후:', formattedContentToSave.length);

      const updateQuery = "UPDATE contents SET content = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?";
      const updateStmt = db.prepare(updateQuery);
      const result = updateStmt.run(formattedContentToSave, scriptId, user.userId);

      console.log('📝 업데이트 결과:', { changes: result.changes });

      if (result.changes === 0) {
        console.log('❌ DB 업데이트 실패');
        return NextResponse.json(
          { error: '데이터베이스 업데이트에 실패했습니다.' },
          { status: 500 }
        );
      }

      console.log('✅ JSON 포맷팅 및 저장 성공');

      return NextResponse.json({
        success: true,
        message: 'JSON 포맷팅이 완료되었습니다.',
        formattedContent: formattedContentToSave
      });
    } finally {
      if (db) {
        try {
          db.close();
          console.log('🔌 DB 연결 종료');
        } catch (closeError) {
          console.error('⚠️ DB close 실패:', closeError);
        }
      }
    }
  } catch (error: any) {
    console.error('❌ JSON 포맷팅 에러:', error);
    return NextResponse.json(
      { error: error?.message || 'JSON 포맷팅 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
