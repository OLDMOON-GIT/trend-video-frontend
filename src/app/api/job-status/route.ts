import { NextRequest, NextResponse } from 'next/server';
import { findJobById } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    const job = await findJobById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: job.status,
      progress: job.progress || 0,
      logs: job.logs || '',
      outputPath: job.videoPath || job.outputPath,
      error: job.error
    });

  } catch (error: any) {
    console.error('Job 상태 조회 오류:', error);
    return NextResponse.json(
      { error: error.message || '상태 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
