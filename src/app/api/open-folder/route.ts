import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getCurrentUser } from '@/lib/session';
import { findJobById } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    console.log('📁 폴더 열기 API 호출됨');

    const user = await getCurrentUser(request);
    console.log('👤 사용자:', user?.email, '관리자:', user?.isAdmin);

    if (!user) {
      console.log('❌ 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    console.log('🆔 Job ID:', jobId);

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

    // 권한 확인: 관리자이거나 자신의 작업인 경우만 허용
    if (!user.isAdmin && job.userId !== user.id) {
      return NextResponse.json(
        { error: '이 작업의 폴더를 열 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // video-merge 작업인지 확인
    const isMergeJob = jobId.startsWith('merge_');

    let absoluteFolderPath: string;

    if (isMergeJob && job.videoPath) {
      // video-merge 작업은 videoPath에서 폴더 경로 추출
      absoluteFolderPath = path.dirname(path.resolve(job.videoPath));
    } else {
      // 일반 비디오 작업은 trend-video-backend/input에서 찾기
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

      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
      const folderPath = path.join(backendPath, 'input', projectName);
      absoluteFolderPath = path.resolve(folderPath);
    }

    console.log(`📁 폴더 열기 요청: ${absoluteFolderPath}`);

    // 폴더 존재 여부 확인
    if (!fs.existsSync(absoluteFolderPath)) {
      console.error(`❌ 폴더가 존재하지 않습니다: ${absoluteFolderPath}`);
      return NextResponse.json(
        { error: `폴더가 존재하지 않습니다: ${path.basename(absoluteFolderPath)}` },
        { status: 404 }
      );
    }

    // Windows에서 explorer로 폴더 열기
    // Windows 경로 형식으로 변환 (백슬래시)
    const windowsPath = absoluteFolderPath.replace(/\//g, '\\');

    console.log(`🔍 폴더 열기: ${windowsPath}`);

    // spawn을 사용하여 explorer 실행 (인자를 배열로 전달)
    const explorerProcess = spawn('explorer', [windowsPath], {
      detached: true,
      stdio: 'ignore'
    });

    // 프로세스를 분리하여 부모 프로세스와 독립적으로 실행
    explorerProcess.unref();

    console.log('✅ explorer 프로세스 시작됨:', windowsPath);

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
