import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getTitlePoolStats } from '@/lib/automation';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = getTitlePoolStats();

    return NextResponse.json({ stats });

  } catch (error: any) {
    console.error('제목 풀 통계 조회 실패:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
