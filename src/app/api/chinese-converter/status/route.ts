import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

/**
 * GET /api/chinese-converter/status?jobId=xxx
 * 중국영상변환 작업 상태 조회
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId가 필요합니다' }, { status: 400 });
    }

    // TODO: 실제 작업 상태 조회 로직
    // DB 또는 파일 시스템에서 상태 확인

    // 임시 응답
    return NextResponse.json({
      jobId,
      status: 'processing', // pending, processing, completed, failed
      progress: 50,
      message: '🔄 자막 추출 중...'
    });

  } catch (error: any) {
    console.error('❌ 상태 조회 오류:', error);
    return NextResponse.json(
      { error: error.message || '상태 조회 실패' },
      { status: 500 }
    );
  }
}
