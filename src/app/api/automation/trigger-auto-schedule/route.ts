import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { checkAndCreateAutoSchedules } from '@/lib/automation-scheduler';

// POST: 자동 스케줄 생성 수동 트리거
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[API] Manual trigger of auto-schedule by user ${user.userId}`);

    // 자동 생성 함수 실행
    const result = await checkAndCreateAutoSchedules();

    return NextResponse.json({
      success: true,
      result,
      message: `완료: ${result.success}개 생성, ${result.failed}개 실패, ${result.skipped}개 건너뜀`
    });
  } catch (error: any) {
    console.error('POST /api/automation/trigger-auto-schedule error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to trigger auto-schedule' },
      { status: 500 }
    );
  }
}
