import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * GET /api/automation/refund
 * 환불 가능한 실패 작업 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = new Database(dbPath);

    // 실패한 스케줄 중 환불되지 않은 목록 조회
    const failedJobs = db.prepare(`
      SELECT
        s.id as schedule_id,
        s.title_id,
        s.created_at,
        s.updated_at,
        t.title,
        t.type,
        t.status as title_status,
        p.stage as failed_stage,
        p.error_message,
        p.started_at,
        p.completed_at
      FROM video_schedules s
      JOIN video_titles t ON s.title_id = t.id
      LEFT JOIN automation_pipelines p ON s.id = p.schedule_id AND p.status = 'failed'
      WHERE s.status = 'failed'
        AND t.status = 'failed'
      ORDER BY s.updated_at DESC
    `).all();

    db.close();

    return NextResponse.json({
      failedJobs,
      count: failedJobs.length
    });

  } catch (error: any) {
    console.error('GET /api/automation/refund error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/automation/refund
 * 수동 환불 처리
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scheduleId, userId, amount, reason } = body;

    if (!scheduleId || !userId || !amount) {
      return NextResponse.json({
        error: 'Schedule ID, User ID, and amount are required'
      }, { status: 400 });
    }

    const db = new Database(dbPath);

    // 스케줄 정보 확인
    const schedule = db.prepare(`
      SELECT s.*, t.title, t.type
      FROM video_schedules s
      JOIN video_titles t ON s.title_id = t.id
      WHERE s.id = ?
    `).get(scheduleId) as any;

    if (!schedule) {
      db.close();
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    if (schedule.status !== 'failed') {
      db.close();
      return NextResponse.json({
        error: 'Only failed schedules can be refunded'
      }, { status: 400 });
    }

    // 사용자 크레딧 증가
    db.prepare(`
      UPDATE users
      SET credits = credits + ?
      WHERE id = ?
    `).run(amount, userId);

    // 환불 기록 저장
    db.prepare(`
      INSERT INTO credit_transactions (
        user_id,
        amount,
        type,
        description,
        created_at
      ) VALUES (?, ?, 'refund', ?, CURRENT_TIMESTAMP)
    `).run(
      userId,
      amount,
      reason || `자동화 작업 실패 환불: ${schedule.title} (${schedule.type})`
    );

    // 스케줄 상태를 completed로 변경
    db.prepare(`
      UPDATE video_schedules
      SET status = 'completed'
      WHERE id = ?
    `).run(scheduleId);

    // 제목 상태를 completed로 변경
    db.prepare(`
      UPDATE video_titles
      SET status = 'completed'
      WHERE id = ?
    `).run(schedule.title_id);

    db.close();

    console.log(`💰 [Refund] ${amount} credits refunded to user ${userId} for schedule ${scheduleId}`);

    return NextResponse.json({
      success: true,
      message: 'Refund processed successfully',
      refundedAmount: amount
    });

  } catch (error: any) {
    console.error('POST /api/automation/refund error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
