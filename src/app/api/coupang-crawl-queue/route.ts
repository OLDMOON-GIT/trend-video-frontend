import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

/**
 * 쿠팡 크롤링 큐 관리 API
 *
 * GET: 큐 상태 조회
 * POST: 재시도 (failed 상태를 pending으로 변경)
 */

// 큐 상태 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');  // pending, processing, done, failed
    const queueId = searchParams.get('queueId');

    let query = `
      SELECT * FROM coupang_crawl_queue
      WHERE user_id = ?
    `;
    const params: any[] = [user.userId];

    if (queueId) {
      query += ` AND id = ?`;
      params.push(queueId);
    } else if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const items = db.prepare(query).all(...params);

    // 통계 정보 추가
    const stats = db.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM coupang_crawl_queue
      WHERE user_id = ?
      GROUP BY status
    `).all(user.userId) as any[];

    const statsObj = {
      pending: 0,
      processing: 0,
      done: 0,
      failed: 0
    };

    stats.forEach(s => {
      statsObj[s.status as keyof typeof statsObj] = s.count;
    });

    return NextResponse.json({
      items,
      stats: statsObj,
      total: items.length
    });

  } catch (error: any) {
    console.error('❌ 큐 조회 오류:', error);
    return NextResponse.json(
      { error: error?.message || '큐 조회 실패' },
      { status: 500 }
    );
  }
}

// 재시도
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { queueId } = body;

    if (!queueId) {
      return NextResponse.json(
        { error: 'queueId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 큐 항목 확인
    const queueItem = db.prepare(`
      SELECT * FROM coupang_crawl_queue
      WHERE id = ? AND user_id = ?
    `).get(queueId, user.userId) as any;

    if (!queueItem) {
      return NextResponse.json(
        { error: '큐 항목을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // failed 또는 done 상태만 재시도 가능
    if (queueItem.status !== 'failed' && queueItem.status !== 'done') {
      return NextResponse.json(
        { error: '재시도할 수 없는 상태입니다. (현재: ' + queueItem.status + ')' },
        { status: 400 }
      );
    }

    console.log('🔄 재시도 시작:', queueId);

    // 재시도: pending으로 변경하고 retry_count 초기화
    db.prepare(`
      UPDATE coupang_crawl_queue
      SET
        status = 'pending',
        retry_count = 0,
        error_message = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(queueId);

    console.log('✅ 재시도 큐에 추가 완료');

    // 즉시 Worker 호출
    fetch(`${request.nextUrl.origin}/api/coupang-crawl-worker`, {
      method: 'GET'
    }).catch(err => {
      console.error('Worker 호출 실패:', err);
    });

    return NextResponse.json({
      success: true,
      message: '재시도가 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 재시도 오류:', error);
    return NextResponse.json(
      { error: error?.message || '재시도 실패' },
      { status: 500 }
    );
  }
}
