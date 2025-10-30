import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getUserCredits, getCreditHistoryByUserId } from '@/lib/db';

// GET - 사용자 크레딧 및 히스토리 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('history') === 'true';

    const credits = await getUserCredits(user.userId);
    const response: any = { credits };

    if (includeHistory) {
      const history = await getCreditHistoryByUserId(user.userId);
      response.history = history;
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Error fetching credits:', error);
    return NextResponse.json(
      { error: '크레딧 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
