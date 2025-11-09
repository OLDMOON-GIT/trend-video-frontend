import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

/**
 * 상품을 쇼핑몰에 퍼블리시 (published 상태로 변경)
 */
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
    const { productIds } = body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: '퍼블리시할 상품을 선택해주세요.' },
        { status: 400 }
      );
    }

    console.log(`🏪 쇼핑몰 퍼블리시 요청 - userId: ${user.userId}, 상품 수: ${productIds.length}`);

    // 먼저 변경이 필요한 상품 개수 확인 (이미 published가 아닌 상품)
    const placeholders = productIds.map(() => '?').join(',');
    const checkStmt = db.prepare(`
      SELECT COUNT(*) as count FROM coupang_products
      WHERE id IN (${placeholders}) AND user_id = ? AND status != 'published'
    `);
    const checkResult = checkStmt.get(...productIds, user.userId) as { count: number };
    const needsUpdate = checkResult.count;

    console.log(`📊 변경 필요: ${needsUpdate}개 / 선택: ${productIds.length}개`);

    if (needsUpdate === 0) {
      console.log('⚠️ 모든 상품이 이미 퍼블리시 상태입니다');
      return NextResponse.json({
        success: true,
        count: 0,
        alreadyPublished: true,
        message: '선택한 모든 상품이 이미 쇼핑몰에 퍼블리시되어 있습니다.'
      });
    }

    // 상품 상태를 published로 변경 (published가 아닌 것만)
    const stmt = db.prepare(`
      UPDATE coupang_products
      SET status = 'published', updated_at = datetime('now')
      WHERE id IN (${placeholders}) AND user_id = ? AND status != 'published'
    `);

    const result = stmt.run(...productIds, user.userId);
    const count = result.changes;

    console.log(`✅ ${count}개 상품 퍼블리시 완료`);

    return NextResponse.json({
      success: true,
      count,
      alreadyPublished: false,
      message: `${count}개 상품이 쇼핑몰에 퍼블리시되었습니다.`
    });

  } catch (error: any) {
    console.error('❌ 퍼블리시 실패:', error);
    return NextResponse.json(
      { error: error?.message || '퍼블리시 실패' },
      { status: 500 }
    );
  }
}
