import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { QueueManager } from '@/lib/queue-manager';

/**
 * GET /api/queue/status/[taskId]
 * 특정 작업의 상태 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = params;

    const manager = new QueueManager();

    try {
      const task = await manager.getTask(taskId);

      if (!task) {
        return NextResponse.json(
          { error: '작업을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 큐 내 위치 계산 (waiting 상태일 때만)
      const position = task.status === 'waiting'
        ? await manager.getPosition(taskId)
        : null;

      return NextResponse.json({
        task,
        position
      });

    } finally {
      manager.close();
    }

  } catch (error: any) {
    console.error('❌ Queue status error:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}
