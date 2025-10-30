import { NextRequest, NextResponse } from 'next/server';
import { createChargeRequest, getChargeRequestsByUserId } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { amount } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: '유효한 금액을 입력하세요.' },
        { status: 400 }
      );
    }

    // 충전 요청 생성
    const chargeRequest = await createChargeRequest(user.userId, amount);

    return NextResponse.json({
      success: true,
      request: chargeRequest
    });

  } catch (error: any) {
    console.error('Charge request error:', error);
    return NextResponse.json(
      { error: error.message || '충전 요청 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 사용자의 충전 요청 내역 조회
    const requests = await getChargeRequestsByUserId(user.userId);

    return NextResponse.json({
      requests
    });

  } catch (error: any) {
    console.error('Get charge requests error:', error);
    return NextResponse.json(
      { error: '충전 요청 내역 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
