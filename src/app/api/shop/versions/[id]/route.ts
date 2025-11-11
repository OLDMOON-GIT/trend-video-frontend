import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', errorCode: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const row = db.prepare(`
      SELECT
        id,
        version_number,
        name,
        description,
        data,
        total_products,
        is_published,
        created_at,
        updated_at,
        published_at
      FROM shop_versions
      WHERE id = ?
    `).get(id) as any;

    if (!row) {
      return NextResponse.json(
        { error: '해당 버전을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const payload = {
      id: row.id,
      versionNumber: row.version_number,
      name: row.name,
      description: row.description,
      totalProducts: row.total_products,
      isPublished: row.is_published === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      data: JSON.parse(row.data || '{}'),
    };

    return NextResponse.json({ version: payload });
  } catch (error: any) {
    console.error('❌ 쇼핑몰 버전 상세 조회 실패:', error);
    return NextResponse.json(
      { error: error?.message || '버전 정보를 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}
