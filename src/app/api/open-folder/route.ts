import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getCurrentUser } from '@/lib/session';
import { findJobById } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 관리자 권한 확인
    if (!user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
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

    // Job 확인
    const job = await findJobById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 프로젝트 폴더명 추출
    let projectName: string;

    if (job.videoPath) {
      // videoPath에서 추출
      const pathParts = job.videoPath.split('/');
      const inputIndex = pathParts.findIndex(p => p === 'input');
      if (inputIndex !== -1 && inputIndex + 1 < pathParts.length) {
        projectName = pathParts[inputIndex + 1];
      } else {
        projectName = `uploaded_${jobId}`;
      }
    } else {
      projectName = `uploaded_${jobId}`;
    }

    const autoShortsPath = path.join(process.cwd(), '..', 'AutoShortsEditor');
    const folderPath = path.join(autoShortsPath, 'input', projectName);
    const absoluteFolderPath = path.resolve(folderPath);

    console.log(`📁 폴더 열기 요청: ${absoluteFolderPath}`);

    // 폴더 존재 여부 확인
    if (!fs.existsSync(absoluteFolderPath)) {
      console.error(`❌ 폴더가 존재하지 않습니다: ${absoluteFolderPath}`);
      return NextResponse.json(
        { error: `폴더가 존재하지 않습니다: ${projectName}` },
        { status: 404 }
      );
    }

    // Windows에서 explorer로 폴더 열기
    // Windows 경로 형식으로 변환 (백슬래시)
    const windowsPath = absoluteFolderPath.replace(/\//g, '\\');

    // start 명령어 사용 (더 안정적)
    exec(`start "" "${windowsPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error('폴더 열기 오류:', error);
        console.error('stderr:', stderr);
      } else {
        console.log('✅ 폴더 열림:', windowsPath);
      }
    });

    return NextResponse.json({
      success: true,
      message: '폴더를 열었습니다.',
      path: folderPath
    });

  } catch (error: any) {
    console.error('Error opening folder:', error);
    return NextResponse.json(
      { error: error?.message || '폴더 열기 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
