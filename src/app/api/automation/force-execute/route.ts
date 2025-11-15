import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { createPipeline } from '@/lib/automation';
import { executePipeline } from '@/lib/automation-scheduler';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/automation/force-execute
 * 즉시 파이프라인 실행
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

    // 제목 정보 확인
    const title = db.prepare('SELECT * FROM video_titles WHERE id = ?').get(titleId) as any;
    if (!title) {
      db.close();
      return NextResponse.json({ error: 'Title not found' }, { status: 404 });
    }

    // 기존 스케줄 찾기 (pending, scheduled, waiting_for_upload, failed 상태)
    const existingSchedules = db.prepare(`
      SELECT id FROM video_schedules
      WHERE title_id = ? AND status IN ('pending', 'scheduled', 'waiting_for_upload', 'failed')
      ORDER BY created_at ASC
    `).all(titleId) as any[];

    let scheduleId: string;
    const pastTime = new Date(Date.now() - 1000).toISOString(); // 1초 전

    if (existingSchedules.length > 0) {
      console.log(`🔍 [FORCE-EXEC] Found ${existingSchedules.length} existing schedules`);

      // 첫 번째 스케줄을 사용
      scheduleId = existingSchedules[0].id;

      // 해당 스케줄을 업데이트 (과거 시간, processing 상태)
      db.prepare(`
        UPDATE video_schedules
        SET scheduled_time = ?, status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(pastTime, scheduleId);

      console.log(`✅ [FORCE-EXEC] Updated existing schedule: ${scheduleId}`);

      // 나머지 스케줄들은 취소
      for (let i = 1; i < existingSchedules.length; i++) {
        db.prepare(`
          UPDATE video_schedules
          SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(existingSchedules[i].id);

        console.log(`❌ [FORCE-EXEC] Cancelled schedule: ${existingSchedules[i].id}`);
      }
    } else {
      // 기존 스케줄이 없으면 새로 생성
      scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      db.prepare(`
        INSERT INTO video_schedules (id, title_id, scheduled_time, status)
        VALUES (?, ?, ?, 'processing')
      `).run(scheduleId, titleId, pastTime);

      console.log(`✅ [FORCE-EXEC] Created new schedule: ${scheduleId}`);
    }

    // 제목 상태를 processing으로 변경
    db.prepare(`
      UPDATE video_titles
      SET status = 'processing', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(titleId);

    // 기존 파이프라인 삭제 (있다면)
    db.prepare(`
      DELETE FROM automation_pipelines WHERE schedule_id = ?
    `).run(scheduleId);

    db.close();

    // 파이프라인 생성
    const pipelineIds = createPipeline(scheduleId);

    console.log(`🚀 [Force Execute] Starting pipeline for: ${title.title}`);

    // 스케줄 객체 생성
    const schedule = {
      id: scheduleId,
      title_id: titleId,
      title: title.title,
      type: title.type,
      category: title.category,
      tags: title.tags,
      product_url: title.product_url,
      channel: title.channel,
      script_mode: title.script_mode,
      media_mode: title.media_mode,
      model: title.model,
      user_id: title.user_id
    };

    console.log('🔍 [FORCE-EXEC] Title from DB:', {
      id: title.id,
      title: title.title,
      user_id: title.user_id,
      hasUserId: !!title.user_id
    });

    console.log('🔍 [FORCE-EXEC] Schedule object:', {
      id: schedule.id,
      title: schedule.title,
      user_id: schedule.user_id,
      hasUserId: !!schedule.user_id
    });

    // 비동기로 파이프라인 실행 (응답은 즉시 반환)
    setImmediate(() => {
      executePipeline(schedule, pipelineIds).catch((error) => {
        console.error('Pipeline execution error:', error);
      });
    });

    return NextResponse.json({
      success: true,
      scheduleId,
      message: '파이프라인 실행 시작'
    });

  } catch (error: any) {
    console.error('POST /api/automation/force-execute error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
