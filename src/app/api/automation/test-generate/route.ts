import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { checkAndCreateAutoSchedules } from '@/lib/automation-scheduler';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🧪 [Test] Starting auto title generation test...');

    const result = await checkAndCreateAutoSchedules();

    console.log(`🧪 [Test] Completed: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`);

    const details = [];
    if (result.success > 0) {
      details.push(`✅ ${result.success}개 채널에서 제목 생성 성공`);
    }
    if (result.failed > 0) {
      details.push(`❌ ${result.failed}개 채널에서 제목 생성 실패`);
    }
    if (result.skipped > 0) {
      details.push(`⏸️ ${result.skipped}개 채널 스킵 (카테고리 없음 또는 스케줄 이미 존재)`);
    }

    return NextResponse.json({
      success: result.success,
      failed: result.failed,
      skipped: result.skipped,
      details: details.join('\n')
    });

  } catch (error: any) {
    console.error('Failed to test auto title generation:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to test title generation' },
      { status: 500 }
    );
  }
}
