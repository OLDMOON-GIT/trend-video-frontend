import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

interface Folder {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

// GET /api/folders - 폴더 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const folders = db.prepare(`
      SELECT * FROM folders
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(user.userId) as Folder[];

    return NextResponse.json({ folders });
  } catch (error) {
    console.error('폴더 목록 조회 오류:', error);
    return NextResponse.json({ error: '폴더 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST /api/folders - 폴더 생성
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '폴더 이름을 입력해주세요.' }, { status: 400 });
    }

    if (name.trim().length > 50) {
      return NextResponse.json({ error: '폴더 이름은 50자를 초과할 수 없습니다.' }, { status: 400 });
    }

    const folderId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO folders (id, user_id, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(folderId, user.userId, name.trim(), color || '#8B5CF6', now, now);

    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId) as Folder;

    return NextResponse.json({
      success: true,
      folder
    }, { status: 201 });
  } catch (error) {
    console.error('폴더 생성 오류:', error);
    return NextResponse.json({ error: '폴더 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE /api/folders?id=xxx - 폴더 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('id');

    if (!folderId) {
      return NextResponse.json({ error: '폴더 ID가 필요합니다.' }, { status: 400 });
    }

    // 폴더 소유권 확인
    const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(folderId, user.userId) as Folder | undefined;

    if (!folder) {
      return NextResponse.json({ error: '폴더를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 폴더 삭제 (CASCADE로 인해 연관된 scripts/jobs의 folder_id는 NULL로 설정됨)
    db.prepare('DELETE FROM folders WHERE id = ?').run(folderId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('폴더 삭제 오류:', error);
    return NextResponse.json({ error: '폴더 삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
