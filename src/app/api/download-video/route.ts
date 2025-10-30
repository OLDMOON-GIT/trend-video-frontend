import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
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

    // DB에서 job 정보 가져오기
    const job = await findJobById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (job.status !== 'completed' || !job.videoPath) {
      return NextResponse.json(
        { error: '영상이 아직 생성되지 않았습니다.' },
        { status: 404 }
      );
    }

    // videoPath가 절대 경로로 저장되어 있음
    const videoPath = job.videoPath;

    if (!fs.existsSync(videoPath)) {
      return NextResponse.json(
        { error: '영상 파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const videoBuffer = fs.readFileSync(videoPath);
    const fileName = path.basename(videoPath);

    // 영상 파일 다운로드 응답
    return new NextResponse(videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': videoBuffer.length.toString()
      }
    });

  } catch (error: any) {
    console.error('Error downloading video:', error);
    return NextResponse.json(
      { error: error?.message || '영상 다운로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
