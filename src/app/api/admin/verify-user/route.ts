import { NextRequest, NextResponse } from 'next/server';
import { updateUser, getUsers } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: '사용자 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용자 찾기
    const users = await getUsers();
    const targetUser = users.find(u => u.id === userId);

    if (!targetUser) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 이메일 인증 완료 처리
    await updateUser(userId, {
      emailVerified: true,
      emailVerificationToken: undefined
    });

    return NextResponse.json({
      success: true,
      message: `${targetUser.name}님의 이메일 인증이 완료되었습니다.`
    });

  } catch (error: any) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { error: '이메일 인증 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
