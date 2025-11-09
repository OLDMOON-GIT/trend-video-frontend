import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { generateShopHtml, PublishedProduct } from '@/lib/shop-html';

function ensureAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || !user.isAdmin) {
    throw new Error('AUTH_REQUIRED');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    ensureAdmin(user);

    const { id: versionId } = await params;

    let products: PublishedProduct[] = [];

    // 'live'는 실시간 published 상품을 의미
    if (versionId === 'live') {
      const liveProducts = db.prepare(`
        SELECT
          id,
          title,
          description,
          category,
          original_price,
          discount_price,
          image_url,
          deep_link,
          created_at
        FROM coupang_products
        WHERE status IN ('active', 'published')
        ORDER BY datetime(created_at) DESC
      `).all() as PublishedProduct[];

      products = liveProducts;
    } else {
      // 특정 버전의 스냅샷에서 상품 가져오기
      const versionRow = db.prepare(`
        SELECT data, name FROM shop_versions WHERE id = ?
      `).get(versionId) as { data: string; name: string } | undefined;

      if (!versionRow) {
        return NextResponse.json(
          { error: '해당 버전을 찾을 수 없습니다.', errorCode: 'VERSION_NOT_FOUND' },
          { status: 404 }
        );
      }

      const versionData = JSON.parse(versionRow.data);
      products = versionData.products || [];
    }

    const html = generateShopHtml(products);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    if (error.message === 'AUTH_REQUIRED') {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', errorCode: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    console.error('❌ 쇼핑몰 HTML 생성 실패:', error);
    return NextResponse.json(
      { error: error?.message || 'HTML을 생성하지 못했습니다.' },
      { status: 500 }
    );
  }
}
