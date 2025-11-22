import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getCurrentUser } from '@/lib/session';

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
    const projectId = searchParams.get('projectId');
    const pathParam = searchParams.get('path');
    const jobId = searchParams.get('jobId');

    console.log('📝 요청 파라미터:', { projectId, pathParam, jobId });

    let absoluteFolderPath: string;
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    if (projectId) {
      // projectId 사용 (자동화 페이지 등)
      const cleanProjectId = projectId.startsWith('project_')
        ? projectId.substring(8)
        : projectId;
      console.log('🆔 Project ID:', cleanProjectId);

      const folderPath = path.join(backendPath, 'input', `project_${cleanProjectId}`);
      absoluteFolderPath = path.resolve(folderPath);
    } else if (pathParam) {
      // path 파라미터 사용 (my-scripts, my-content 등)
      console.log('📂 Path 파라미터:', pathParam);

      // path가 상대 경로면 절대 경로로 변환
      if (pathParam.startsWith('../')) {
        absoluteFolderPath = path.resolve(process.cwd(), pathParam);
      } else if (pathParam.startsWith('project_')) {
        // project_ 로 시작하면 input 폴더에서 찾기
        absoluteFolderPath = path.resolve(backendPath, 'input', pathParam);
      } else {
        absoluteFolderPath = path.resolve(pathParam);
      }
    } else if (jobId) {
      // jobId 사용 (하위 호환성)
      console.log('🎬 Job ID:', jobId);

      // jobId는 video_id이므로 output 폴더에서 찾기
      const folderPath = path.join(backendPath, 'output', jobId);
      absoluteFolderPath = path.resolve(folderPath);
    } else {
      return NextResponse.json(
        { error: 'projectId, path, 또는 jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`📂 폴더 경로: ${absoluteFolderPath}`);

    // 폴더 존재 여부 확인
    if (!fs.existsSync(absoluteFolderPath)) {
      console.error(`❌ 폴더가 존재하지 않습니다: ${absoluteFolderPath}`);
      return NextResponse.json(
        { error: `폴더가 존재하지 않습니다: ${absoluteFolderPath}` },
        { status: 404 }
      );
    }

    // Windows에서 explorer로 폴더 열기
    // Windows 경로 형식으로 변환 (백슬래시)
    const windowsPath = absoluteFolderPath.replace(/\//g, '\\');

    console.log(`🔍 폴더 열기: ${windowsPath}`);

    // explorer.exe를 직접 실행 (포그라운드로 올라옴)
    const explorerProcess = spawn('explorer.exe', [windowsPath], {
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
