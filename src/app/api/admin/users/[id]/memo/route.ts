import { NextRequest, NextResponse } from 'next/server';
import { updateUser, getUsers } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 관리자 권한 확인
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { memo } = await request.json();

    // 사용자 찾기
    const users = await getUsers();
    const targetUser = users.find(u => u.id === id);

    if (!targetUser) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 메모 업데이트
    await updateUser(id, {
      adminMemo: memo
    });

    return NextResponse.json({
      success: true,
      message: '메모가 저장되었습니다.'
    });

  } catch (error: any) {
    console.error('Save memo error:', error);
    return NextResponse.json(
      { error: '메모 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
