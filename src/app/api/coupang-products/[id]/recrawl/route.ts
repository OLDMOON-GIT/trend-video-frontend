import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/coupang-products/[id]/recrawl - 상품 재크롤링
 * 기존 상품의 URL로 크롤링 큐에 다시 추가하여 정보를 업데이트합니다
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { id: productId } = await params;

    // 상품 소유권 확인
    const product = db.prepare('SELECT * FROM coupang_products WHERE id = ?').get(productId) as any;

    if (!product) {
      return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });
    }

    if (product.user_id !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    if (!product.product_url) {
      return NextResponse.json({ error: '상품 URL이 없습니다' }, { status: 400 });
    }

    console.log('🔄 상품 재크롤링 요청:', product.product_url);

    // 크롤링 큐에 추가
    const queueId = uuidv4();
    db.prepare(`
      INSERT INTO coupang_crawl_queue (
        id, user_id, product_url, status, retry_count, max_retries,
        timeout_seconds, custom_category, destination, source_url
      ) VALUES (?, ?, ?, 'pending', 0, 3, 60, ?, 'my-list', ?)
    `).run(
      queueId,
      user.userId,
      product.product_url,
      product.category || null,
      product.source_url || null
    );

    // 상품의 queue_id 업데이트
    db.prepare(`
      UPDATE coupang_products
      SET queue_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(queueId, productId);

    console.log('✅ 크롤링 큐에 추가됨:', queueId);

    return NextResponse.json({
      success: true,
      message: '크롤링 큐에 추가되었습니다. 잠시 후 정보가 업데이트됩니다.',
      queueId
    });

  } catch (error: any) {
    console.error('재크롤링 실패:', error);
    return NextResponse.json({ error: '재크롤링에 실패했습니다' }, { status: 500 });
  }
}
