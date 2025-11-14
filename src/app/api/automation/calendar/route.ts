import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { initAutomationTables, getChannelSettings } from '@/lib/automation';
import Database from 'better-sqlite3';
import path from 'path';

// 테이블 초기화 (최초 1회)
try {
  initAutomationTables();
} catch (error) {
  console.error('Failed to initialize automation tables:', error);
}

// GET: 월별 스케줄 조회 (달력용)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    // 해당 월의 시작일과 종료일 계산
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
    const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // 해당 월의 모든 스케줄 조회 (채널 정보 포함)
    const schedules = db
      .prepare(
        `
      SELECT
        s.id,
        s.title_id,
        s.scheduled_time,
        s.youtube_publish_time,
        s.status,
        t.title,
        t.type,
        t.channel,
        t.category,
        t.tags
      FROM video_schedules s
      JOIN video_titles t ON s.title_id = t.id
      WHERE t.user_id = ?
        AND s.scheduled_time >= ?
        AND s.scheduled_time < ?
      ORDER BY s.scheduled_time ASC
    `
      )
      .all(user.userId, startDate, endDate);

    db.close();

    // 채널 설정 가져오기 (색상 정보)
    const channelSettings = getChannelSettings(user.userId);
    const channelMap = new Map(
      channelSettings.map((setting: any) => [setting.channel_id, setting])
    );

    // 스케줄에 채널 색상 및 채널명 추가
    const schedulesWithColor = schedules.map((schedule: any) => {
      const channelSetting = channelMap.get(schedule.channel);
      return {
        ...schedule,
        color: channelSetting?.color || '#3b82f6', // 기본 파란색
        channel_name: channelSetting?.channel_name || schedule.channel // 채널명 추가
      };
    });

    return NextResponse.json({
      schedules: schedulesWithColor,
      channelSettings: channelSettings
    });
  } catch (error: any) {
    console.error('GET /api/automation/calendar error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 다음 스케줄 자동 생성
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { titleId, channelId } = body;

    if (!titleId || !channelId) {
      return NextResponse.json(
        { error: 'titleId and channelId are required' },
        { status: 400 }
      );
    }

    const { calculateNextScheduleTime, addSchedule } = require('@/lib/automation');

    // 마지막 스케줄 조회
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const lastSchedule = db
      .prepare(
        `
      SELECT scheduled_time
      FROM video_schedules
      WHERE title_id = ?
      ORDER BY scheduled_time DESC
      LIMIT 1
    `
      )
      .get(titleId) as any;

    db.close();

    // 다음 스케줄 시간 계산
    const fromDate = lastSchedule
      ? new Date(lastSchedule.scheduled_time)
      : new Date();
    const nextTime = calculateNextScheduleTime(user.userId, channelId, fromDate);

    if (!nextTime) {
      return NextResponse.json(
        { error: 'Could not calculate next schedule time. Check channel settings.' },
        { status: 400 }
      );
    }

    // 스케줄 추가
    const scheduleId = addSchedule({
      titleId,
      scheduledTime: nextTime.toISOString()
    });

    return NextResponse.json({
      success: true,
      scheduleId,
      scheduledTime: nextTime.toISOString()
    });
  } catch (error: any) {
    console.error('POST /api/automation/calendar error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
