import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getCurrentUser } from '@/lib/session';
import { findJobById } from '@/lib/db';

async function handleOpenFolder(request: NextRequest) {
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
    const directPath = searchParams.get('path'); // 직접 경로 지원
    console.log('🆔 Job ID:', jobId, '직접 경로:', directPath);

    // 직접 경로가 제공된 경우
    if (directPath) {
      console.log(`📁 직접 경로로 폴더 열기: ${directPath}`);

      // 파일 경로인 경우 디렉토리 추출
      let folderPath = directPath;
      if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
        folderPath = path.dirname(directPath);
      }

      if (!fs.existsSync(folderPath)) {
        console.error(`❌ 폴더가 존재하지 않습니다: ${folderPath}`);
        return NextResponse.json(
          { error: `폴더가 존재하지 않습니다: ${path.basename(folderPath)}` },
          { status: 404 }
        );
      }

      const windowsPath = folderPath.replace(/\//g, '\\');
      const explorerProcess = spawn('explorer', [windowsPath], {
        detached: true,
        stdio: 'ignore'
      });
      explorerProcess.unref();

      console.log('✅ explorer 프로세스 시작됨:', windowsPath);

      return NextResponse.json({
        success: true,
        message: '폴더를 열었습니다.',
        path: folderPath
      });
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId 또는 path가 필요합니다.' },
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
    if (!user.isAdmin && job.userId !== user.userId) {
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
      // 일반 비디오 작업은 trend-video-backend/uploads 또는 input에서 찾기
      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

      if (job.videoPath) {
        // videoPath에서 추출 (절대 경로와 상대 경로 모두 지원)
        const normalizedPath = job.videoPath.replace(/\\/g, '/');
        const pathParts = normalizedPath.split('/');

        // uploads 또는 input 폴더 찾기
        const uploadsIndex = pathParts.findIndex(p => p === 'uploads');
        const inputIndex = pathParts.findIndex(p => p === 'input');

        if (uploadsIndex !== -1 && uploadsIndex + 1 < pathParts.length) {
          // uploads 폴더에 있는 경우
          const projectName = pathParts[uploadsIndex + 1];
          const folderPath = path.join(backendPath, 'uploads', projectName);
          absoluteFolderPath = path.resolve(folderPath);
        } else if (inputIndex !== -1 && inputIndex + 1 < pathParts.length) {
          // input 폴더에 있는 경우 (쇼츠 변환)
          const projectName = pathParts[inputIndex + 1];
          const folderPath = path.join(backendPath, 'input', projectName);
          absoluteFolderPath = path.resolve(folderPath);
        } else {
          // 기본값
          const projectName = `uploaded_${jobId}`;
          const folderPath = path.join(backendPath, 'uploads', projectName);
          absoluteFolderPath = path.resolve(folderPath);
        }
      } else {
        // videoPath 없으면 type에 따라 추정
        if (job.type === 'shortform') {
          // 쇼츠 작업은 input/shorts_* 패턴
          // jobId에서 timestamp 추출 (job_1762844840576_xxx 형식)
          const timestampMatch = jobId.match(/job_(\d+)_/);
          if (timestampMatch) {
            const timestamp = timestampMatch[1];
            const projectName = `shorts_${timestamp}`;
            const folderPath = path.join(backendPath, 'input', projectName);
            absoluteFolderPath = path.resolve(folderPath);
            console.log(`📂 쇼츠 작업 폴더 추정: ${absoluteFolderPath}`);
          } else {
            // timestamp 추출 실패 시 기본값
            const projectName = `uploaded_${jobId}`;
            const folderPath = path.join(backendPath, 'uploads', projectName);
            absoluteFolderPath = path.resolve(folderPath);
          }
        } else {
          // 일반 작업은 uploads/uploaded_* 패턴
          const projectName = `uploaded_${jobId}`;
          const folderPath = path.join(backendPath, 'uploads', projectName);
          absoluteFolderPath = path.resolve(folderPath);
        }
      }
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
      path: absoluteFolderPath
    });

  } catch (error: any) {
    console.error('Error opening folder:', error);
    return NextResponse.json(
      { error: error?.message || '폴더 열기 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST와 GET 모두 지원
export async function POST(request: NextRequest) {
  return handleOpenFolder(request);
}

export async function GET(request: NextRequest) {
  return handleOpenFolder(request);
}
