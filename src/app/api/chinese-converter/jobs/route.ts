import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getChineseConverterJobsByUserId } from '@/lib/db-chinese-converter';

/**
 * GET /api/chinese-converter/jobs
 * 사용자의 중국영상변환 작업 목록 조회
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // 데이터베이스에서 사용자 작업 조회
    const userJobs = getChineseConverterJobsByUserId(user.userId);

    console.log('✅ [중국영상변환] 사용자 작업 수:', userJobs.length, '(userId:', user.userId, ')');

    // 프론트엔드 형식에 맞게 변환
    const formattedJobs = userJobs.map(job => ({
      jobId: job.id,
      userId: job.userId,
      status: job.status,
      progress: job.progress,
      logs: job.logs || [],
      videoPath: job.videoPath,
      outputPath: job.outputPath,
      error: job.error,
      createdAt: job.createdAt
    }));

    return NextResponse.json({
      success: true,
      jobs: formattedJobs,
      total: formattedJobs.length
    });

  } catch (error: any) {
    console.error('❌ 중국영상변환 작업 목록 조회 오류:', error);
    return NextResponse.json(
      { error: error.message || '작업 목록 조회 실패' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/chinese-converter/jobs?jobId=xxx
 * 중국영상변환 작업 삭제
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
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

    // 데이터베이스에서 작업 조회
    const { findChineseConverterJobById, deleteChineseConverterJob } = await import('@/lib/db-chinese-converter');
    const job = findChineseConverterJobById(jobId);

    if (!job) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    // 권한 확인
    if (job.userId !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    // 데이터베이스에서 작업 삭제
    const deleted = deleteChineseConverterJob(jobId);

    if (!deleted) {
      return NextResponse.json({ error: '작업 삭제 실패' }, { status: 500 });
    }

    console.log(`✅ 중국영상변환 작업 삭제: ${jobId}`);

    return NextResponse.json({
      success: true,
      message: '작업이 삭제되었습니다'
    });

  } catch (error: any) {
    console.error('❌ 중국영상변환 작업 삭제 오류:', error);
    return NextResponse.json(
      { error: error.message || '작업 삭제 실패' },
      { status: 500 }
    );
  }
}
