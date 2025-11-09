import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';
import { getCurrentUser } from '@/lib/session';

const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', errorCode: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit'));
    const offsetParam = Number(searchParams.get('offset'));

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), MAX_LIMIT)
      : 5;
    const offset = Number.isFinite(offsetParam) && offsetParam > 0
      ? Math.floor(offsetParam)
      : 0;

    const totalRow = db.prepare(
      `SELECT COUNT(*) as count FROM crawl_link_history WHERE user_id = ?`
    ).get(user.userId) as { count: number } | undefined;

    const items = db.prepare(
      `SELECT
        id,
        source_url AS sourceUrl,
        hostname,
        last_result_count AS lastResultCount,
        last_duplicate_count AS lastDuplicateCount,
        last_error_count AS lastErrorCount,
        last_total_links AS lastTotalLinks,
        last_status AS lastStatus,
        last_message AS lastMessage,
        last_job_id AS lastJobId,
        last_crawled_at AS lastCrawledAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM crawl_link_history
      WHERE user_id = ?
      ORDER BY datetime(last_crawled_at) DESC, datetime(created_at) DESC
      LIMIT ? OFFSET ?`
    ).all(user.userId, limit, offset);

    return NextResponse.json({
      items,
      total: totalRow?.count ?? 0,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('❌ 링크 히스토리 조회 실패:', error);
    return NextResponse.json(
      {
        error: error?.message || '링크 히스토리 조회 중 오류가 발생했습니다.',
        errorCode: 'INTERNAL_SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', errorCode: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const sourceUrl = searchParams.get('sourceUrl');

    if (!id && !sourceUrl) {
      return NextResponse.json(
        { error: '삭제할 링크 ID가 필요합니다.', errorCode: 'INVALID_PARAMETERS' },
        { status: 400 }
      );
    }

    const stmt = id
      ? db.prepare(`DELETE FROM crawl_link_history WHERE id = ? AND user_id = ?`)
      : db.prepare(`DELETE FROM crawl_link_history WHERE source_url = ? AND user_id = ?`);

    const result = id
      ? stmt.run(id, user.userId)
      : stmt.run(sourceUrl, user.userId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: '링크 기록을 찾을 수 없습니다.', errorCode: 'HISTORY_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ 링크 히스토리 삭제 실패:', error);
    return NextResponse.json(
      {
        error: error?.message || '링크 히스토리 삭제 중 오류가 발생했습니다.',
        errorCode: 'INTERNAL_SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}
