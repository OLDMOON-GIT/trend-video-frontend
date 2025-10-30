import { NextRequest, NextResponse } from 'next/server';
import { approveChargeRequest, rejectChargeRequest } from '@/lib/db';
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
    const { action, memo } = await request.json();

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: '유효한 action이 필요합니다. (approve 또는 reject)' },
        { status: 400 }
      );
    }

    let result;

    if (action === 'approve') {
      // 충전 요청 승인
      result = await approveChargeRequest(id, user.email);
    } else {
      // 충전 요청 거부
      result = await rejectChargeRequest(id, user.email, memo);
    }

    if (!result) {
      return NextResponse.json(
        { error: '요청을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      request: result,
      message: action === 'approve' ? '충전 요청이 승인되었습니다.' : '충전 요청이 거부되었습니다.'
    });

  } catch (error: any) {
    console.error('Process charge request error:', error);
    return NextResponse.json(
      { error: error.message || '충전 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
