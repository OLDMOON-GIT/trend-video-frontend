import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { generateDeeplink, loadUserSettings } from '@/lib/coupang-deeplink';

/**
 * 대기 목록 개별 상품 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { id } = await params;

    db.prepare(`
      DELETE FROM crawled_product_links
      WHERE id = ? AND user_id = ?
    `).run(id, user.userId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ 대기 목록 삭제 오류:', error);
    return NextResponse.json(
      { error: error?.message || '삭제 실패' },
      { status: 500 }
    );
  }
}

/**
 * 대기 목록 → 내 목록 이동
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'move-to-main') {
      // 대기 목록에서 상품 조회
      const pending = db.prepare(`
        SELECT * FROM crawled_product_links
        WHERE id = ? AND user_id = ?
      `).get(id, user.userId) as any;

      if (!pending) {
        return NextResponse.json(
          { error: '상품을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 딥링크 생성
      const settings = await loadUserSettings(user.userId);
      let deepLink = pending.product_url; // 기본값: 원본 URL

      if (settings && settings.accessKey && settings.secretKey) {
        try {
          deepLink = await generateDeeplink(pending.product_url, settings.accessKey, settings.secretKey);
          console.log('✅ 딥링크 생성 성공:', deepLink);
        } catch (error: any) {
          console.warn('⚠️ 딥링크 생성 실패, 원본 URL 사용:', error.message);
        }
      } else {
        console.warn('⚠️ 쿠팡 API 설정 없음, 원본 URL 사용');
      }

      // coupang_products에 추가
      const { v4: uuidv4 } = await import('uuid');
      const productId = uuidv4();

      db.prepare(`
        INSERT INTO coupang_products (
          id, user_id, product_url, deep_link, title, description,
          category, original_price, discount_price, image_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        productId,
        user.userId,
        pending.product_url,
        deepLink, // 생성된 딥링크 또는 원본 URL
        pending.title || '상품명',
        pending.description || '',
        pending.category || '기타',
        pending.original_price || null,
        pending.discount_price || null,
        pending.image_url || ''
      );

      // 대기 목록에서 삭제
      db.prepare(`
        DELETE FROM crawled_product_links WHERE id = ?
      `).run(id);

      console.log(`✅ 대기 목록 → 내 목록 이동: ${productId}`);

      return NextResponse.json({
        success: true,
        productId,
        message: '내 목록으로 이동되었습니다.'
      });
    }

    return NextResponse.json(
      { error: '알 수 없는 액션' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('❌ 대기 목록 처리 오류:', error);
    return NextResponse.json(
      { error: error?.message || '처리 실패' },
      { status: 500 }
    );
  }
}
