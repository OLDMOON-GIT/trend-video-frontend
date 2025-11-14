import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/automation/cleanup
 * stuck된 processing 스케줄 정리
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = new Database(dbPath);

    // 10분 이상 processing 상태인 스케줄 찾기
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const stuckSchedules = db.prepare(`
      SELECT id, title_id FROM video_schedules
      WHERE status = 'processing' AND updated_at < ?
    `).all(tenMinutesAgo) as any[];

    console.log(`🧹 [CLEANUP] Found ${stuckSchedules.length} stuck schedules`);

    let cleanedCount = 0;

    for (const schedule of stuckSchedules) {
      // 파이프라인 확인
      const runningPipelines = db.prepare(`
        SELECT id FROM automation_pipelines
        WHERE schedule_id = ? AND status = 'running'
      `).all(schedule.id) as any[];

      // 실행 중인 파이프라인이 없으면 failed로 변경
      if (runningPipelines.length === 0) {
        db.prepare(`
          UPDATE video_schedules
          SET status = 'failed', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(schedule.id);

        db.prepare(`
          UPDATE video_titles
          SET status = 'failed', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(schedule.title_id);

        db.prepare(`
          INSERT INTO title_logs (title_id, level, message, created_at)
          VALUES (?, 'error', '⚠️ Stuck 스케줄 자동 정리 (10분 이상 진행 없음)', CURRENT_TIMESTAMP)
        `).run(schedule.title_id);

        cleanedCount++;
        console.log(`✅ [CLEANUP] Cleaned schedule: ${schedule.id}`);
      }
    }

    db.close();

    return NextResponse.json({
      success: true,
      cleanedCount,
      message: `${cleanedCount}개의 stuck 스케줄을 정리했습니다`
    });

  } catch (error: any) {
    console.error('POST /api/automation/cleanup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
