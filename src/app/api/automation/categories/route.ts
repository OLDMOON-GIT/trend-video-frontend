import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  addCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  initDefaultCategories,
} from '@/lib/automation';

// GET: 카테고리 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 기본 카테고리 초기화 (없을 경우에만)
    initDefaultCategories(user.userId);

    const categories = getCategories(user.userId);
    return NextResponse.json({ categories });
  } catch (error: any) {
    console.error('GET /api/automation/categories error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

// POST: 카테고리 추가
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const id = addCategory({
      userId: user.userId,
      name,
      description,
    });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('POST /api/automation/categories error:', error);

    // UNIQUE constraint 에러 처리
    if (error.message?.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: '이미 존재하는 카테고리 이름입니다.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to add category' },
      { status: 500 }
    );
  }
}

// PATCH: 카테고리 수정
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }

    updateCategory({
      id,
      userId: user.userId,
      name,
      description,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/automation/categories error:', error);

    // UNIQUE constraint 에러 처리
    if (error.message?.includes('UNIQUE constraint')) {
      return NextResponse.json(
        { error: '이미 존재하는 카테고리 이름입니다.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update category' },
      { status: 500 }
    );
  }
}

// DELETE: 카테고리 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      );
    }

    deleteCategory(id, user.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/automation/categories error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete category' },
      { status: 500 }
    );
  }
}
