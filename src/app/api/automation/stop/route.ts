import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/automation/stop
 * 진행 중인 작업 중지
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { titleId } = body;

    if (!titleId) {
      return NextResponse.json({ error: 'Title ID is required' }, { status: 400 });
    }

    const db = new Database(dbPath);

    console.log(`🛑 [STOP] Stopping tasks for title: ${titleId}`);

    // 0. title 정보 가져오기
    const title = db.prepare('SELECT title FROM video_titles WHERE id = ?').get(titleId) as any;
    if (!title) {
      db.close();
      return NextResponse.json({ error: 'Title not found' }, { status: 404 });
    }

    console.log(`🔍 [STOP] Title name: ${title.title}`);

    // 1. 해당 title의 모든 processing 스케줄 찾기
    const schedules = db.prepare(`
      SELECT id FROM video_schedules
      WHERE title_id = ? AND status = 'processing'
    `).all(titleId) as any[];

    console.log(`🔍 [STOP] Found ${schedules.length} processing schedules`);

    // 2. 각 스케줄에 대해 중지 처리
    for (const schedule of schedules) {
      // 2.1 파이프라인 찾기
      const pipelines = db.prepare(`
        SELECT id FROM automation_pipelines
        WHERE schedule_id = ? AND status IN ('running', 'pending')
      `).all(schedule.id) as any[];

      console.log(`🔍 [STOP] Schedule ${schedule.id}: Found ${pipelines.length} pipelines`);

      // 2.2 각 파이프라인을 cancelled로 변경
      for (const pipeline of pipelines) {
        db.prepare(`
          UPDATE automation_pipelines
          SET status = 'failed', completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(pipeline.id);

        console.log(`✅ [STOP] Pipeline ${pipeline.id} cancelled`);
      }

      // 2.3 스케줄을 cancelled로 변경
      db.prepare(`
        UPDATE video_schedules
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(schedule.id);

      console.log(`✅ [STOP] Schedule ${schedule.id} cancelled`);
    }

    // 3. 해당 title과 관련된 모든 진행 중인 contents 찾기 및 중지 (상태만 변경)
    const contents = db.prepare(`
      SELECT id FROM contents
      WHERE title = ? AND status IN ('processing', 'pending')
    `).all(title.title) as any[];

    console.log(`🔍 [STOP] Found ${contents.length} processing contents`);

    // 3.1 content를 failed로 변경 (프로세스는 종료하지 않음)
    for (const content of contents) {
      db.prepare(`
        UPDATE contents
        SET status = 'failed',
            error = 'Manually stopped by user',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(content.id);

      console.log(`✅ [STOP] Content ${content.id} stopped (status only)`);
    }

    // 4. title을 failed로 변경
    db.prepare(`
      UPDATE video_titles
      SET status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(titleId);

    // 5. title 로그 추가
    db.prepare(`
      INSERT INTO title_logs (title_id, level, message, created_at)
      VALUES (?, 'info', '🛑 작업이 사용자에 의해 중지되었습니다', CURRENT_TIMESTAMP)
    `).run(titleId);

    db.close();

    console.log(`✅ [STOP] All tasks for title ${titleId} stopped`);

    return NextResponse.json({
      success: true,
      message: '작업이 중지되었습니다',
      stoppedSchedules: schedules.length,
      stoppedContents: contents.length
    });

  } catch (error: any) {
    console.error('POST /api/automation/stop error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
