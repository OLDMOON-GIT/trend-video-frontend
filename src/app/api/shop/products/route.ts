import { NextResponse } from 'next/server';
import db from '@/lib/sqlite';

/**
 * 공개 API - 쇼핑몰 상품 목록 조회
 * 인증 불필요 (Vercel 빌드 시 호출)
 */
export async function GET() {
  try {
    // 모든 활성 상품 조회
    const products = db.prepare(`
      SELECT
        id, title, description, category, image_url,
        original_price, discount_price, view_count, click_count,
        created_at
      FROM coupang_products
      WHERE status = 'active'
      ORDER BY created_at DESC
    `).all();

    // 카테고리별 통계
    const categories = db.prepare(`
      SELECT
        category,
        COUNT(*) as count,
        MAX(image_url) as thumbnail
      FROM coupang_products
      WHERE status = 'active'
      GROUP BY category
      ORDER BY count DESC
    `).all();

    console.log(`✅ [공개 API] 상품 ${products.length}개, 카테고리 ${categories.length}개 조회`);

    return NextResponse.json({
      products,
      categories,
      total: products.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ [공개 API] 상품 조회 오류:', error);
    return NextResponse.json(
      { error: '상품 조회 실패', details: error?.message },
      { status: 500 }
    );
  }
}

// CORS 허용 (Vercel에서 빌드 시 접근 가능하도록)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
