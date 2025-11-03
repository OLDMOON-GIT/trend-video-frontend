import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export const dynamic = 'force-dynamic';

// PUT /api/jobs/[id] - 작업 폴더 변경
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const jobId = params.id;

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { folderId } = body;

    const db = new Database(dbPath);

    // 작업 소유권 확인
    const job: any = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(jobId, user.userId);

    if (!job) {
      db.close();
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // folderId가 제공된 경우 폴더 소유권 확인
    if (folderId) {
      const folder: any = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(folderId, user.userId);

      if (!folder) {
        db.close();
        return NextResponse.json(
          { error: '폴더를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
    }

    // folder_id 업데이트
    db.prepare(`
      UPDATE jobs
      SET folder_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(folderId || null, jobId);
    db.close();

    return NextResponse.json({
      success: true,
      message: '작업이 이동되었습니다.'
    });
  } catch (error) {
    console.error('Error updating job folder:', error);
    return NextResponse.json(
      { error: '작업 폴더 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
