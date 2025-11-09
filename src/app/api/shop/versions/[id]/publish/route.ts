import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

export async function POST(
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
    const exists = db.prepare(`SELECT id FROM shop_versions WHERE id = ?`).get(id);

    if (!exists) {
      return NextResponse.json(
        { error: '해당 버전을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    db.prepare(`UPDATE shop_versions SET is_published = 0 WHERE id != ?`).run(id);
    db.prepare(`
      UPDATE shop_versions
      SET is_published = 1,
          published_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ 쇼핑몰 버전 퍼블리시 실패:', error);
    return NextResponse.json(
      { error: error?.message || '퍼블리시하지 못했습니다.' },
      { status: 500 }
    );
  }
}
