import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { findJobById } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const directPath = searchParams.get('path');

    let videoPath: string;

    // 직접 경로가 제공된 경우 (중국영상변환 등)
    if (directPath) {
      videoPath = directPath;
      console.log('📥 직접 경로로 다운로드:', videoPath);
    } else if (jobId) {
      // jobId로 조회 (일반 영상제작)
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

      videoPath = job.videoPath;
    } else {
      return NextResponse.json(
        { error: 'jobId 또는 path가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!fs.existsSync(videoPath)) {
      console.error('❌ 파일 없음:', videoPath);
      return NextResponse.json(
        { error: `영상 파일을 찾을 수 없습니다: ${path.basename(videoPath)}` },
        { status: 404 }
      );
    }

    const fileName = path.basename(videoPath);
    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;

    console.log('📥 다운로드 시작:', fileName, `(${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // 파일 스트림 생성
    const fileStream = fs.createReadStream(videoPath);

    // ReadableStream으로 변환
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk: string | Buffer) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          controller.enqueue(new Uint8Array(buffer));
        });
        fileStream.on('end', () => {
          controller.close();
        });
        fileStream.on('error', (error) => {
          console.error('❌ 스트림 오류:', error);
          controller.error(error);
        });
      },
      cancel() {
        fileStream.destroy();
      }
    });

    // 영상 파일 다운로드 응답 (스트리밍)
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': fileSize.toString(),
        'Cache-Control': 'no-cache'
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
