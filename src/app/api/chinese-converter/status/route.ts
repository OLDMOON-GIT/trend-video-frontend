import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findChineseConverterJobById } from '@/lib/db-chinese-converter';

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

    // 데이터베이스에서 작업 상태 조회
    const job = findChineseConverterJobById(jobId);

    if (!job) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    // 권한 확인
    if (job.userId !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    // 상태 반환 (영상제작과 동일한 형식)
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      logs: job.logs || [], // 로그 배열 전체 반환
      error: job.error,
      videoPath: job.videoPath,
      outputPath: job.outputPath
    });

  } catch (error: any) {
    console.error('❌ 상태 조회 오류:', error);
    return NextResponse.json(
      { error: error.message || '상태 조회 실패' },
      { status: 500 }
    );
  }
}
