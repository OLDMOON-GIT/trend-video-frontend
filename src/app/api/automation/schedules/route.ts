import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  addSchedule,
  getAllSchedules,
  updateScheduleStatus,
  getPipelineDetails
} from '@/lib/automation';

// GET: 모든 스케줄 가져오기
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('id');

    if (scheduleId) {
      // 특정 스케줄의 상세 정보 (파이프라인 포함)
      const details = getPipelineDetails(scheduleId);
      return NextResponse.json({ details });
    }

    const schedules = getAllSchedules();
    return NextResponse.json({ schedules });
  } catch (error: any) {
    console.error('GET /api/automation/schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 새 스케줄 추가
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { titleId, scheduledTime, youtubePublishTime, youtubePrivacy, forceExecute } = body;

    if (!titleId || !scheduledTime) {
      return NextResponse.json({ error: 'Title ID and scheduled time are required' }, { status: 400 });
    }

    // 시간 유효성 검사
    const scheduledDate = new Date(scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
    }

    // 과거 시간 체크 (강제실행이 아닐 때만)
    if (!forceExecute) {
      const now = new Date();
      if (scheduledDate < now) {
        return NextResponse.json({ error: '과거 시간으로 스케줄을 설정할 수 없습니다' }, { status: 400 });
      }
    }

    if (youtubePublishTime) {
      const publishDate = new Date(youtubePublishTime);
      if (isNaN(publishDate.getTime())) {
        return NextResponse.json({ error: 'Invalid YouTube publish time' }, { status: 400 });
      }
    }

    const scheduleId = addSchedule({
      titleId,
      scheduledTime,
      youtubePublishTime,
      youtubePrivacy: youtubePrivacy || 'public'
    });

    return NextResponse.json({ success: true, scheduleId });
  } catch (error: any) {
    console.error('POST /api/automation/schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 스케줄 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('id');

    if (!scheduleId) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }

    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    db.prepare('DELETE FROM video_schedules WHERE id = ?').run(scheduleId);
    db.close();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/automation/schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 스케줄 상태 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, scheduledTime, youtubePublishTime } = body;

    if (!id) {
      return NextResponse.json({ error: 'Schedule ID is required' }, { status: 400 });
    }

    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const updates: string[] = [];
    const values: any[] = [];

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (scheduledTime !== undefined) {
      // 과거 시간 체크
      const scheduledDate = new Date(scheduledTime);
      if (isNaN(scheduledDate.getTime())) {
        db.close();
        return NextResponse.json({ error: 'Invalid scheduled time' }, { status: 400 });
      }
      const now = new Date();
      if (scheduledDate < now) {
        db.close();
        return NextResponse.json({ error: '과거 시간으로 스케줄을 설정할 수 없습니다' }, { status: 400 });
      }
      updates.push('scheduled_time = ?');
      values.push(scheduledTime);
    }
    if (youtubePublishTime !== undefined) {
      updates.push('youtube_publish_time = ?');
      values.push(youtubePublishTime);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`
      UPDATE video_schedules
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    db.close();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/automation/schedules error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
