import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const db = new Database(dbPath);

    db.prepare('DELETE FROM title_pool WHERE id = ?').run(id);
    db.close();

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('제목 삭제 실패:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete title' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { used } = body;

    const db = new Database(dbPath);

    db.prepare('UPDATE title_pool SET used = ? WHERE id = ?').run(used, id);
    db.close();

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('제목 수정 실패:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update title' },
      { status: 500 }
    );
  }
}
