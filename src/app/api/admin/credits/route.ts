import { NextRequest, NextResponse } from 'next/server';
import { addCredits, findUserByEmail, addCreditHistory } from '@/lib/db';
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

    const { userId, amount, description } = await request.json();

    if (!userId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: '사용자 ID와 양수 금액이 필요합니다.' },
        { status: 400 }
      );
    }

    // 크레딧 추가
    const updatedUser = await addCredits(userId, amount);

    if (!updatedUser) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 크레딧 히스토리 추가
    await addCreditHistory(
      userId,
      'charge',
      amount,
      description || `관리자 크레딧 부여 (${user.email})`
    );

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        credits: updatedUser.credits
      }
    });

  } catch (error: any) {
    console.error('Credits grant error:', error);
    return NextResponse.json(
      { error: '크레딧 부여 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
