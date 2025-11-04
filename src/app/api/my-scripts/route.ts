import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// GET - 사용자의 대본 목록 조회 (contents 테이블 사용)
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

    // URL 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';

    console.log('필터 - 제한:', limit, '| 오프셋:', offset, '| 검색:', search);

    let db: Database.Database | null = null;

    try {
      db = new Database(dbPath);

      console.log('🔍 쿼리:', 'SELECT * FROM contents WHERE user_id = ? AND type = "script" ORDER BY created_at DESC');
      console.log('🔍 파라미터:', user.userId);

      // 1. contents 테이블에서 완료된 대본 가져오기
      let allScripts = db.prepare(`
        SELECT * FROM contents
        WHERE user_id = ? AND type = 'script'
        ORDER BY created_at DESC
      `).all(user.userId) as any[];

      console.log('📊 조회된 완료 대본 개수:', allScripts.length);

      // 2. scripts_temp 테이블에서 모든 대본 가져오기 (에러, 펜딩, 진행중 등 모두 포함)
      // DONE이면서 scriptId가 있는 것만 제외 (이미 contents에 저장됨)
      // scripts_temp는 userId를 저장하지 않으므로 모든 작업을 가져옴
      const tempScripts = db.prepare(`
        SELECT * FROM scripts_temp
        WHERE NOT (status = 'DONE' AND scriptId IS NOT NULL)
        ORDER BY createdAt DESC
      `).all() as any[];

      console.log('📊 조회된 진행 상태 대본 개수 (전체):', tempScripts.length);

      // tempScripts를 Script 형식으로 변환
      const tempScriptsConverted = tempScripts.map((row: any) => {
        const logs = row.logs ? JSON.parse(row.logs) : [];

        // status 매핑: PENDING/ING -> processing, ERROR -> failed, WAITING_LOGIN -> pending
        let mappedStatus: 'pending' | 'processing' | 'completed' | 'failed' = 'processing';
        if (row.status === 'PENDING' || row.status === 'WAITING_LOGIN') {
          mappedStatus = 'pending';
        } else if (row.status === 'ERROR') {
          mappedStatus = 'failed';
        } else if (row.status === 'ING') {
          mappedStatus = 'processing';
        }

        // progress 계산 (로그 개수 기반)
        let progress = 0;
        if (mappedStatus === 'processing') {
          progress = Math.min(Math.floor((logs.length / 10) * 90), 90);
        } else if (mappedStatus === 'failed') {
          progress = 0;
        }

        return {
          id: row.id,
          userId: user.userId, // 현재 사용자로 설정 (scripts_temp에는 userId가 없음)
          title: row.title || row.originalTitle || '제목 없음',
          originalTitle: row.originalTitle,
          content: '', // 진행 중이므로 내용 없음
          status: mappedStatus,
          progress: progress,
          error: row.status === 'ERROR' ? row.message : undefined,
          type: row.type as 'longform' | 'shortform' | 'sora2',
          logs: logs.map((log: any) => typeof log === 'object' ? log.message : log),
          useClaudeLocal: row.useClaudeLocal === 1,
          createdAt: row.createdAt,
          updatedAt: row.createdAt
        };
      });

      // contents → Script 형식으로 변환
      const completedScripts = allScripts.map((row: any) => {
        // 로그 가져오기
        const logsStmt = db!.prepare('SELECT log_message FROM content_logs WHERE content_id = ? ORDER BY created_at');
        const logRows = logsStmt.all(row.id) as any[];
        const logs = logRows.map(l => l.log_message);

        return {
          id: row.id,
          userId: row.user_id,
          title: row.title,
          originalTitle: row.original_title,
          content: row.content || '',
          status: row.status || 'completed',
          progress: row.progress ?? 100,
          error: row.error,
          type: row.format, // format → type
          logs: logs.length > 0 ? logs : undefined,
          tokenUsage: row.input_tokens || row.output_tokens ? {
            input_tokens: row.input_tokens || 0,
            output_tokens: row.output_tokens || 0
          } : undefined,
          useClaudeLocal: row.use_claude_local === 1,
          sourceContentId: row.source_content_id,  // 원본 컨텐츠 ID
          conversionType: row.conversion_type,      // 변환 타입
          isRegenerated: row.is_regenerated === 1,  // 재생성 여부
          createdAt: row.created_at,
          updatedAt: row.updated_at || row.created_at
        };
      });

      // 진행 중인 대본과 완료된 대본 합치기 (최신순으로 정렬)
      allScripts = [...tempScriptsConverted, ...completedScripts].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      console.log('📊 전체 대본 개수 (진행중 + 완료):', allScripts.length);

      // 검색 필터링
      if (search) {
        const searchLower = search.toLowerCase();
        allScripts = allScripts.filter(script =>
          script.title?.toLowerCase().includes(searchLower) ||
          script.originalTitle?.toLowerCase().includes(searchLower) ||
          script.id?.toLowerCase().includes(searchLower) ||
          script.status?.toLowerCase().includes(searchLower)
        );
        console.log('검색 후 대본 개수:', allScripts.length);
      }

      // 전체 개수
      const total = allScripts.length;

      // 페이징
      const scripts = allScripts.slice(offset, offset + limit);

      console.log('대본 목록:', scripts.map(s => ({ id: s.id, title: s.title, status: s.status })));

      return NextResponse.json({
        scripts,
        total,
        hasMore: offset + limit < total
      });

    } finally {
      if (db) {
        try {
          db.close();
        } catch (closeError) {
          console.error('⚠️ DB close 실패:', closeError);
        }
      }
    }

  } catch (error: any) {
    console.error('❌ Error fetching scripts:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error?.message || '대본 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE - 대본 삭제 (contents 테이블 사용)
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
    console.log('🗑️ 삭제 요청 scriptId:', scriptId);

    if (!scriptId) {
      console.log('❌ scriptId 없음');
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    let db: Database.Database | null = null;

    try {
      db = new Database(dbPath);

      // contents 테이블에서 삭제 (소유자 확인 포함)
      const deleteQuery = 'DELETE FROM contents WHERE id = ? AND user_id = ?';
      console.log('🔍 실행할 쿼리:', deleteQuery);
      console.log('🔍 파라미터:', { id: scriptId, user_id: user.userId });

      const stmt = db.prepare(deleteQuery);
      const result = stmt.run(scriptId, user.userId);

      console.log('📊 삭제 결과:', { changes: result.changes });

      if (result.changes > 0) {
        console.log('✅ contents 테이블에서 삭제 성공');
        return NextResponse.json({
          success: true,
          message: '대본이 삭제되었습니다.'
        });
      } else {
        console.log('❌ 삭제 실패: 데이터를 찾을 수 없거나 권한 없음');

        // 디버깅: 해당 ID가 존재하는지 확인
        const checkQuery = 'SELECT id, user_id, type, title FROM contents WHERE id = ?';
        console.log('🔍 존재 확인 쿼리:', checkQuery);
        const checkStmt = db.prepare(checkQuery);
        const existing = checkStmt.get(scriptId);
        console.log('📊 존재 확인 결과:', existing);

        return NextResponse.json(
          { error: '컨텐츠를 찾을 수 없거나 권한이 없습니다.' },
          { status: 404 }
        );
      }

    } finally {
      if (db) {
        try {
          db.close();
          console.log('✅ DB 연결 닫힘');
        } catch (closeError) {
          console.error('⚠️ DB close 실패:', closeError);
        }
      }
    }

  } catch (error: any) {
    console.error('❌ 삭제 에러:', error);
    return NextResponse.json(
      { error: error?.message || '대본 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
