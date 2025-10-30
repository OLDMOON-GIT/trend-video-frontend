import { NextRequest, NextResponse } from 'next/server';
import { getChargeRequests } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // 필터 파라미터
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'pending', 'approved', 'rejected', 또는 null (전체)

    // 모든 충전 요청 가져오기
    const allRequests = await getChargeRequests();

    // 상태별 필터링
    const filteredRequests = status
      ? allRequests.filter(r => r.status === status)
      : allRequests;

    // 최신순 정렬
    const sortedRequests = filteredRequests.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // 날짜 형식 변환
    const formattedRequests = sortedRequests.map(req => ({
      ...req,
      createdAt: new Date(req.createdAt).toLocaleString('ko-KR'),
      approvedAt: req.approvedAt ? new Date(req.approvedAt).toLocaleString('ko-KR') : undefined,
      rejectedAt: req.rejectedAt ? new Date(req.rejectedAt).toLocaleString('ko-KR') : undefined
    }));

    return NextResponse.json({ requests: formattedRequests });

  } catch (error: any) {
    console.error('Get charge requests error:', error);
    return NextResponse.json(
      { error: '충전 요청 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
