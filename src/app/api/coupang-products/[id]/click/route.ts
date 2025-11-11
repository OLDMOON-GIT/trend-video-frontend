import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';

/**
 * 쿠팡 딥링크 클릭 추적 API
 *
 * POST: 클릭 카운트 증가 후 딥링크 반환
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;

    // 상품 조회
    const product = db.prepare(`
      SELECT deep_link FROM coupang_products
      WHERE id = ? AND status = 'active'
    `).get(productId) as any;

    if (!product) {
      return NextResponse.json(
        { error: '상품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 클릭 카운트 증가
    db.prepare(`
      UPDATE coupang_products
      SET click_count = click_count + 1
      WHERE id = ?
    `).run(productId);

    console.log('📊 클릭 추적:', productId);

    return NextResponse.json({
      success: true,
      deepLink: product.deep_link
    });

  } catch (error: any) {
    console.error('❌ 클릭 추적 오류:', error);
    return NextResponse.json(
      { error: error?.message || '클릭 추적 실패' },
      { status: 500 }
    );
  }
}
