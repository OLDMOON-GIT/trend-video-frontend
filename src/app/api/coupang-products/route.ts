import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { v4 as uuidv4 } from 'uuid';

/**
 * 쿠팡 상품 관리 API
 *
 * GET: 상품 목록 조회
 * POST: 새 상품 추가 (자동 크롤링 + AI 분류)
 * PATCH: 상품 정보 수정 (즐겨찾기 등)
 * DELETE: 상품 삭제
 */

// 상품 목록 조회 (큐 상태 포함)
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
    const category = searchParams.get('category');
    const status = searchParams.get('status');

    let query = `
      SELECT
        p.*,
        q.status as queue_status,
        q.retry_count as queue_retry_count,
        q.error_message as queue_error
      FROM coupang_products p
      LEFT JOIN coupang_crawl_queue q ON p.queue_id = q.id
      WHERE p.user_id = ? AND p.status != 'deleted'
    `;
    const params: any[] = [user.userId];

    if (category) {
      query += ` AND p.category = ?`;
      params.push(category);
    }

    if (status) {
      query += ` AND p.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY p.created_at DESC`;

    const products = db.prepare(query).all(...params);

    return NextResponse.json({
      products,
      total: products.length
    });

  } catch (error: any) {
    console.error('❌ 상품 조회 오류:', error);
    return NextResponse.json(
      { error: error?.message || '상품 조회 실패' },
      { status: 500 }
    );
  }
}

// 새 상품 추가 (큐에 등록)
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
    const { productUrl, customCategory, destination, sourceUrl } = body;

    if (!productUrl) {
      return NextResponse.json(
        { error: '상품 URL을 입력해주세요.' },
        { status: 400 }
      );
    }

    console.log('🚀 쿠팡 상품 크롤링 큐에 추가:', productUrl);

    // 크롤링 큐에 추가
    const queueId = uuidv4();
    db.prepare(`
      INSERT INTO coupang_crawl_queue (
        id, user_id, product_url, status, retry_count, max_retries,
        timeout_seconds, custom_category, destination, source_url
      ) VALUES (?, ?, ?, 'pending', 0, 3, 60, ?, ?, ?)
    `).run(
      queueId,
      user.userId,
      productUrl,
      customCategory || null,
      destination || 'my_list', // 기본값: 내목록
      sourceUrl || null
    );

    console.log('✅ 큐에 추가 완료:', queueId);

    // 즉시 Worker 호출하여 처리 시작 (백그라운드)
    fetch(`${request.nextUrl.origin}/api/coupang-crawl-worker`, {
      method: 'GET'
    }).catch(err => {
      console.error('Worker 호출 실패:', err);
    });

    return NextResponse.json({
      success: true,
      queueId,
      message: '상품이 크롤링 큐에 추가되었습니다. 잠시 후 처리됩니다.'
    });

  } catch (error: any) {
    console.error('❌ 큐 추가 오류:', error);
    return NextResponse.json(
      {
        error: error?.message || '큐 추가 실패',
        details: error?.stack
      },
      { status: 500 }
    );
  }
}

// 상품 정보 수정 (즐겨찾기 토글 등)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { productId, isFavorite } = body;

    if (!productId) {
      return NextResponse.json(
        { error: '상품 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 상품 소유권 확인
    const product = db.prepare(`
      SELECT * FROM coupang_products
      WHERE id = ? AND user_id = ?
    `).get(productId, user.userId) as any;

    if (!product) {
      return NextResponse.json(
        { error: '상품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 즐겨찾기 토글
    if (isFavorite !== undefined) {
      console.log(`${isFavorite ? '⭐' : '☆'} 즐겨찾기 ${isFavorite ? '추가' : '제거'}:`, productId);

      db.prepare(`
        UPDATE coupang_products
        SET is_favorite = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(isFavorite ? 1 : 0, productId);

      console.log('✅ 즐겨찾기 업데이트 완료');
    }

    return NextResponse.json({
      success: true,
      message: '상품이 업데이트되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 상품 업데이트 오류:', error);
    return NextResponse.json(
      { error: error?.message || '상품 업데이트 실패' },
      { status: 500 }
    );
  }
}

// 상품 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('id');

    if (!productId) {
      return NextResponse.json(
        { error: '상품 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 상품 소유권 확인
    const product = db.prepare(`
      SELECT * FROM coupang_products
      WHERE id = ? AND user_id = ?
    `).get(productId, user.userId);

    if (!product) {
      return NextResponse.json(
        { error: '상품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('🗑️ 상품 삭제:', productId);

    // 상품 삭제 (status를 deleted로 변경)
    db.prepare(`
      UPDATE coupang_products
      SET status = 'deleted', updated_at = datetime('now')
      WHERE id = ?
    `).run(productId);

    console.log('✅ 상품 삭제 완료');

    return NextResponse.json({
      success: true,
      message: '상품이 삭제되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 상품 삭제 오류:', error);
    return NextResponse.json(
      { error: error?.message || '상품 삭제 실패' },
      { status: 500 }
    );
  }
}

// 참고: 실제 크롤링은 /api/coupang-crawl-worker에서 Puppeteer로 처리됩니다.
// 이 파일의 POST는 큐에 추가만 하고, worker가 처리합니다.
