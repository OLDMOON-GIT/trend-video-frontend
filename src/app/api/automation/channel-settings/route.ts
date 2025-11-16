import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  initAutomationTables,
  upsertChannelSettings,
  getChannelSettings,
  getChannelSetting,
  updateChannelSettings,
  deleteChannelSettings,
  calculateNextScheduleTime
} from '@/lib/automation';

// 테이블 초기화 (최초 1회)
try {
  initAutomationTables();
} catch (error) {
  console.error('Failed to initialize automation tables:', error);
}

// GET: 채널 설정 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    if (channelId) {
      // 특정 채널 설정 조회
      const setting = getChannelSetting(user.userId, channelId);
      return NextResponse.json({ setting });
    } else {
      // 모든 채널 설정 조회
      const settings = getChannelSettings(user.userId);
      return NextResponse.json({ settings });
    }
  } catch (error: any) {
    console.error('GET /api/automation/channel-settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 채널 설정 추가/업데이트
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // 양쪽 형식 모두 지원 (snake_case와 camelCase)
    const channelId = body.channelId || body.channel_id;
    const channelName = body.channelName || body.channel_name;
    const color = body.color;
    const postingMode = body.postingMode || body.posting_mode;
    const intervalValue = body.intervalValue || body.interval_value;
    const intervalUnit = body.intervalUnit || body.interval_unit;
    const weekdays = body.weekdays;
    const postingTime = body.postingTime || body.posting_time;
    const isActive = body.isActive !== undefined ? body.isActive : body.is_active;
    const categories = body.categories;

    console.log('📝 채널 설정 저장 요청:', { channelId, channelName, postingMode, intervalValue, intervalUnit });

    if (!channelId || !channelName) {
      return NextResponse.json(
        { error: 'channelId and channelName are required' },
        { status: 400 }
      );
    }

    // 유효성 검사
    if (postingMode === 'fixed_interval') {
      if (!intervalValue || !intervalUnit) {
        return NextResponse.json(
          { error: 'intervalValue and intervalUnit are required for fixed_interval mode' },
          { status: 400 }
        );
      }
      if (!['hours', 'days'].includes(intervalUnit)) {
        return NextResponse.json(
          { error: 'intervalUnit must be "hours" or "days"' },
          { status: 400 }
        );
      }
    } else if (postingMode === 'weekday_time') {
      if (!weekdays || !Array.isArray(weekdays) || weekdays.length === 0) {
        return NextResponse.json(
          { error: 'weekdays array is required for weekday_time mode' },
          { status: 400 }
        );
      }
      if (!postingTime || !/^\d{2}:\d{2}$/.test(postingTime)) {
        return NextResponse.json(
          { error: 'postingTime must be in HH:mm format' },
          { status: 400 }
        );
      }
    }

    const id = upsertChannelSettings({
      userId: user.userId,
      channelId,
      channelName,
      color,
      postingMode,
      intervalValue,
      intervalUnit,
      weekdays,
      postingTime,
      isActive,
      categories
    });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('POST /api/automation/channel-settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 채널 설정 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { channelId, ...updates } = body;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    updateChannelSettings(user.userId, channelId, updates);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/automation/channel-settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 채널 설정 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    deleteChannelSettings(user.userId, channelId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/automation/channel-settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
