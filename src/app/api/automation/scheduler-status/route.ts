import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getSchedulerStatus } from '@/lib/automation-scheduler';

// GET: 스케줄러 상태 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = getSchedulerStatus();

    return NextResponse.json({ status });
  } catch (error: any) {
    console.error('GET /api/automation/scheduler-status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch scheduler status' },
      { status: 500 }
    );
  }
}
