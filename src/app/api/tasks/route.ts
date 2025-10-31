import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  findTaskById,
  addTaskLog,
  Task
} from '@/lib/db';

// GET: 모든 Task 조회
export async function GET(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const tasks = getAllTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: '작업 목록 조회에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 새 Task 생성
export async function POST(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { content, priority = 0 } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: '작업 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    const task = createTask(content.trim(), priority);
    addTaskLog(task.id, `작업 생성: ${content.trim()}`);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: '작업 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: Task 업데이트
export async function PUT(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { id, content, status, priority } = body;

    if (!id) {
      return NextResponse.json(
        { error: '작업 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const existingTask = findTaskById(id);
    if (!existingTask) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const updates: Partial<Pick<Task, 'content' | 'status' | 'priority'>> = {};

    if (content !== undefined) updates.content = content;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;

    const updatedTask = updateTask(id, updates);

    if (!updatedTask) {
      return NextResponse.json(
        { error: '작업 업데이트에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 로그 추가
    if (status && status !== existingTask.status) {
      const statusLabels = { todo: 'TODO', ing: '진행중', done: '완료' };
      addTaskLog(id, `상태 변경: ${statusLabels[existingTask.status as keyof typeof statusLabels]} → ${statusLabels[status as keyof typeof statusLabels]}`);
    }

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: '작업 업데이트에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: Task 삭제
export async function DELETE(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: '작업 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const success = deleteTask(id);

    if (!success) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: '작업 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
