import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

/**
 * 배포 API (Deprecated)
 * - Vercel 배포에서 Google Sites 배포로 변경됨
 * - 이제 Google Sites iframe 임베드 방식 사용
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: '이 기능은 더 이상 사용되지 않습니다.\n\nGoogle Sites 배포로 변경되었습니다.\n\n설정 페이지에서 Google Sites URL을 설정하고 임베드 코드를 복사하세요.',
        deprecated: true,
        redirectUrl: '/admin/settings?tab=google-sites'
      },
      { status: 410 } // 410 Gone - 더 이상 사용 불가
    );

  } catch (error: any) {
    console.error('❌ API 오류:', error);
    return NextResponse.json(
      { error: error?.message || '요청 실패' },
      { status: 500 }
    );
  }
}
