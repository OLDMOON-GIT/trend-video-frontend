import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { QueueManager } from '@/lib/queue-manager';

/**
 * GET /api/queue/list
 * 큐 전체 또는 필터링된 작업 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as any;
    const status = searchParams.get('status') as any;
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const manager = new QueueManager();

    try {
      const tasks = await manager.getQueue({
        type,
        status,
        userId: userId || undefined,
        limit,
        offset
      });

      const summary = await manager.getSummary();

      return NextResponse.json({
        tasks,
        total: tasks.length,
        summary
      });

    } finally {
      manager.close();
    }

  } catch (error: any) {
    console.error('❌ Queue list error:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}
