import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { generateShopHtml, type PublishedProduct } from '@/lib/shop-html';

/**
 * 퍼블리시된 상품의 정적 HTML 생성 API
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const products = db
      .prepare(
        `SELECT id, title, description, category, original_price, discount_price, image_url, deep_link
         FROM coupang_products
         WHERE user_id = ? AND status = 'published'
         ORDER BY created_at DESC`
      )
      .all(user.userId) as PublishedProduct[];

    if (!products.length) {
      return NextResponse.json(
        { error: '퍼블리시된 상품이 없습니다.' },
        { status: 404 }
      );
    }

    // 사용자 닉네임 가져오기
    const userInfo = db.prepare('SELECT nickname FROM users WHERE id = ?').get(user.userId) as { nickname?: string } | undefined;
    const nickname = userInfo?.nickname;

    const html = generateShopHtml(products, nickname);

    return NextResponse.json({
      success: true,
      html,
      productCount: products.length,
    });
  } catch (error: any) {
    console.error('정적 HTML 생성 오류:', error);
    return NextResponse.json(
      { error: error?.message || 'HTML을 생성하지 못했습니다.' },
      { status: 500 }
    );
  }
}
