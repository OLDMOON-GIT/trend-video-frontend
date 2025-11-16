import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * PATCH /api/automation/titles/[id]
 * 제목 상태 업데이트
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const titleId = id;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const db = new Database(dbPath);

    // 제목 상태 업데이트
    db.prepare(`
      UPDATE video_titles
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, titleId);

    db.close();

    console.log(`✅ [Title Status Update] ${titleId} → ${status}`);

    return NextResponse.json({
      success: true,
      message: 'Title status updated'
    });

  } catch (error: any) {
    console.error('PATCH /api/automation/titles/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
