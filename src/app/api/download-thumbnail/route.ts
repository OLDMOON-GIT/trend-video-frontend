import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findJobById } from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';

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

    // 본인의 작업인지 확인
    if (job.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    if (!job.thumbnailPath) {
      return NextResponse.json(
        { error: '썸네일이 없습니다.' },
        { status: 404 }
      );
    }

    // 썸네일 파일 읽기
    const thumbnailBuffer = await fs.readFile(job.thumbnailPath);
    const ext = path.extname(job.thumbnailPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

    // 썸네일 파일명 생성
    const thumbnailName = `${job.title || jobId}_thumbnail${ext}`;

    return new NextResponse(thumbnailBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(thumbnailName)}"`,
      },
    });

  } catch (error: any) {
    console.error('Error downloading thumbnail:', error);
    return NextResponse.json(
      { error: '썸네일 다운로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
