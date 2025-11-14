import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  startAutomationScheduler,
  stopAutomationScheduler,
  getSchedulerStatus
} from '@/lib/automation-scheduler';
import { getAutomationSettings, updateAutomationSetting } from '@/lib/automation';

// 서버 시작 시 자동으로 스케줄러 시작
try {
  const settings = getAutomationSettings();
  if (settings.enabled === 'true') {
    console.log('🚀 [AUTO-START] Starting automation scheduler...');
    startAutomationScheduler();
    console.log('✅ [AUTO-START] Automation scheduler started');
  } else {
    console.log('⏸️ [AUTO-START] Automation scheduler is disabled in settings');
  }
} catch (error) {
  console.error('❌ [AUTO-START] Failed to start automation scheduler:', error);
}

// GET: 스케줄러 상태 확인
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = getSchedulerStatus();
    return NextResponse.json({ status });
  } catch (error: any) {
    console.error('GET /api/automation/scheduler error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 스케줄러 시작/중지
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body; // 'start' or 'stop'

    if (action === 'start') {
      // 설정에서 enabled를 true로 변경
      updateAutomationSetting('enabled', 'true');
      startAutomationScheduler();
      return NextResponse.json({ success: true, message: 'Scheduler started' });

    } else if (action === 'stop') {
      // 설정에서 enabled를 false로 변경
      updateAutomationSetting('enabled', 'false');
      stopAutomationScheduler();
      return NextResponse.json({ success: true, message: 'Scheduler stopped' });

    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error: any) {
    console.error('POST /api/automation/scheduler error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 스케줄러 설정 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
    }

    // 설정 업데이트
    for (const [key, value] of Object.entries(settings)) {
      updateAutomationSetting(key, String(value));
    }

    // 스케줄러가 실행 중이면 재시작
    const status = getSchedulerStatus();
    if (status.isRunning) {
      stopAutomationScheduler();
      startAutomationScheduler();
    }

    return NextResponse.json({ success: true, message: 'Settings updated' });

  } catch (error: any) {
    console.error('PATCH /api/automation/scheduler error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
