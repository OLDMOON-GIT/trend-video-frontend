import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAutoGenerationLogs, getOngoingAutoGenerationLogs } from '@/lib/automation';

// GET: 자동 생성 현황 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'all', 'ongoing'
    const limit = parseInt(searchParams.get('limit') || '50');

    let logs;
    if (type === 'ongoing') {
      logs = getOngoingAutoGenerationLogs(user.userId);
    } else {
      logs = getAutoGenerationLogs(user.userId, limit);
    }

    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('GET /api/automation/generation-status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch generation status' },
      { status: 500 }
    );
  }
}
