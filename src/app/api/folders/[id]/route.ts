import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

interface Folder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

// PUT /api/folders/[id] - 폴더 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { id: folderId } = await params;
    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '폴더 이름을 입력해주세요.' }, { status: 400 });
    }

    if (name.trim().length > 50) {
      return NextResponse.json({ error: '폴더 이름은 50자를 초과할 수 없습니다.' }, { status: 400 });
    }

    // 폴더 소유권 확인
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(folderId, user.userId) as Folder | undefined;

    if (!folder) {
      return NextResponse.json({ error: '폴더를 찾을 수 없습니다.' }, { status: 404 });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE folders
      SET name = ?, color = ?, updated_at = ?
      WHERE id = ?
    `).run(name.trim(), color || folder.color, now, folderId);

    const updatedFolder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as Folder;

    return NextResponse.json({
      success: true,
      folder: updatedFolder
    });
  } catch (error) {
    console.error('폴더 수정 오류:', error);
    return NextResponse.json({ error: '폴더 수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
