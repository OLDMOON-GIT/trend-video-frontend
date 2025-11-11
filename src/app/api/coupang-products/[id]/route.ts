import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

/**
 * PATCH /api/coupang-products/[id] - 상품 정보 수정
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { id: productId } = await params;
    const body = await request.json();
    const { title, description, category, original_price, discount_price, image_url } = body;

    // 상품 소유권 확인
    const product = db.prepare('SELECT * FROM coupang_products WHERE id = ?').get(productId) as any;

    if (!product) {
      return NextResponse.json({ error: '상품을 찾을 수 없습니다' }, { status: 404 });
    }

    if (product.user_id !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    // 업데이트할 필드 준비
    const updates: string[] = [];
    const values: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (original_price !== undefined) {
      updates.push('original_price = ?');
      values.push(original_price);
    }
    if (discount_price !== undefined) {
      updates.push('discount_price = ?');
      values.push(discount_price);
    }
    if (image_url !== undefined) {
      updates.push('image_url = ?');
      values.push(image_url);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: '수정할 내용이 없습니다' }, { status: 400 });
    }

    updates.push('updated_at = datetime("now")');
    values.push(productId);

    // 상품 정보 업데이트
    db.prepare(`
      UPDATE coupang_products
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    return NextResponse.json({ success: true, message: '상품이 수정되었습니다' });

  } catch (error: any) {
    console.error('상품 수정 실패:', error);
    return NextResponse.json({ error: '상품 수정에 실패했습니다' }, { status: 500 });
  }
}

/**
 * DELETE /api/coupang-products/[id] - 상품 삭제
 */
export async function DELETE(
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

    // 상품 삭제
    db.prepare('DELETE FROM coupang_products WHERE id = ?').run(productId);

    return NextResponse.json({ success: true, message: '상품이 삭제되었습니다' });

  } catch (error: any) {
    console.error('상품 삭제 실패:', error);
    return NextResponse.json({ error: '상품 삭제에 실패했습니다' }, { status: 500 });
  }
}
