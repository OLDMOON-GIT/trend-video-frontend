import { NextRequest, NextResponse } from 'next/server';
import { videoJobs } from '@/lib/video-jobs';

/**
 * GET /api/videos/status/[jobId]
 * 영상 생성 작업 상태 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const job = videoJobs.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found', status: 'failed' },
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error: any) {
    console.error('GET /api/videos/status/[jobId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
