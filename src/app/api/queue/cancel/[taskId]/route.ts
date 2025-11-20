import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { QueueManager } from '@/lib/queue-manager';

/**
 * DELETE /api/queue/cancel/[taskId]
 * 작업 취소 (waiting 상태만 가능)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { taskId } = await params;

    const manager = new QueueManager();

    try {
      const task = await manager.getTask(taskId);

      if (!task) {
        return NextResponse.json(
          { error: '작업을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 권한 확인 (관리자 또는 작업 생성자)
      if (!user.isAdmin && task.userId !== user.email && task.userId !== user.userId) {
        return NextResponse.json(
          { error: '권한이 없습니다.' },
          { status: 403 }
        );
      }

      if (task.status !== 'waiting') {
        return NextResponse.json(
          { error: `취소할 수 없습니다. 현재 상태: ${task.status}` },
          { status: 400 }
        );
      }

      const success = await manager.cancel(taskId);

      if (success) {
        return NextResponse.json({
          success: true,
          message: '작업이 취소되었습니다.'
        });
      } else {
        return NextResponse.json(
          { error: '취소 실패' },
          { status: 500 }
        );
      }

    } finally {
      manager.close();
    }

  } catch (error: any) {
    console.error('❌ Queue cancel error:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}
