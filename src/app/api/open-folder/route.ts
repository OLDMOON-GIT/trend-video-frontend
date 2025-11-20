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

      // project_ 폴더는 backend/input 밑에 생성
      let folderPath: string;
      if (directPath.startsWith('project_')) {
        const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
        folderPath = path.resolve(backendPath, 'input', directPath);
        console.log(`📂 project_ 폴더를 backend/input 밑에 생성: ${folderPath}`);
      } else if (path.isAbsolute(directPath)) {
        folderPath = directPath;
      } else {
        folderPath = path.resolve(process.cwd(), directPath);
      }

      console.log(`📂 절대 경로로 변환: ${folderPath}`);

      // 파일 경로인 경우 디렉토리 추출
      if (fs.existsSync(folderPath) && fs.statSync(folderPath).isFile()) {
        folderPath = path.dirname(folderPath);
      }

      // 폴더가 없으면 생성 (project_ 폴더의 경우 자동화 스크립트 폴더)
      if (!fs.existsSync(folderPath)) {
        const folderBasename = path.basename(folderPath);

        // project_로 시작하는 폴더인 경우 자동 생성 (자동화 스크립트 폴더)
        if (folderBasename.startsWith('project_')) {
          console.log(`📁 자동화 스크립트 폴더 생성 중: ${folderPath}`);

          try {
            fs.mkdirSync(folderPath, { recursive: true });

            // scriptId 추출 (project_ 이후 부분)
            const scriptId = folderBasename.replace('project_', '');

            // DB에서 스크립트 내용 가져오기
            const Database = require('better-sqlite3');
            const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
            const db = new Database(dbPath);

            const content = db.prepare(`
              SELECT content, title
              FROM contents
              WHERE id = ? AND type = 'script'
            `).get(scriptId);

            db.close();

            if (content) {
              // content 파싱
              let contentStr = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);

              // JSON 정리
              contentStr = contentStr.trim();
              if (contentStr.startsWith('JSON')) {
                contentStr = contentStr.substring(4).trim();
              }
              const jsonStart = contentStr.indexOf('{');
              if (jsonStart > 0) {
                contentStr = contentStr.substring(jsonStart);
              }

              // 빈 content 체크
              if (!contentStr || contentStr.length === 0 || !contentStr.includes('{')) {
                console.warn(`⚠️ 대본 content가 비어있거나 JSON이 아님: ${scriptId}`);
                // 빈 폴더만 생성
                console.log(`✅ 빈 폴더 생성 완료: ${folderPath}`);
              } else {
                try {
                  const scriptData = JSON.parse(contentStr);

                  // story.json 파일 생성
                  const storyJson = {
                    ...scriptData,
                    scenes: scriptData.scenes || []
                  };

                  const storyJsonPath = path.join(folderPath, 'story.json');
                  fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');
                  console.log(`✅ 폴더와 story.json 생성 완료: ${folderPath}`);
                } catch (parseError: any) {
                  console.error(`⚠️ JSON 파싱 실패: ${parseError.message}`);
                  console.log(`✅ 빈 폴더만 생성 완료: ${folderPath}`);
                }
              }
            } else {
              console.warn(`⚠️ 스크립트를 찾을 수 없음: ${scriptId}, 빈 폴더만 생성`);
            }
          } catch (createError: any) {
            console.error(`❌ 폴더 생성 실패: ${createError.message}`);
            return NextResponse.json(
              { error: `폴더 생성 실패: ${createError.message}` },
              { status: 500 }
            );
          }
        } else {
          // project_ 폴더가 아니면 에러 반환
          console.error(`❌ 폴더가 존재하지 않습니다: ${folderPath}`);
          return NextResponse.json(
            { error: `폴더가 존재하지 않습니다: ${path.basename(folderPath)}` },
            { status: 404 }
          );
        }
      }

      const windowsPath = folderPath.replace(/\//g, '\\');

      // explorer.exe를 직접 실행 (포그라운드로 올라옴)
      const explorerProcess = spawn('explorer.exe', [windowsPath], {
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

        // uploads, input, output 폴더 찾기
        const uploadsIndex = pathParts.findIndex(p => p === 'uploads');
        const inputIndex = pathParts.findIndex(p => p === 'input');
        const outputIndex = pathParts.findIndex(p => p === 'output');

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
        } else if (outputIndex !== -1 && outputIndex + 1 < pathParts.length) {
          // output 폴더에 있는 경우 (merge 작업 등)
          const projectName = pathParts[outputIndex + 1];
          const folderPath = path.join(backendPath, 'output', projectName);
          absoluteFolderPath = path.resolve(folderPath);
        } else {
          // 기본값
          // jobId에 항상 uploaded_ prefix 추가
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
          // jobId에 항상 uploaded_ prefix 추가
          const projectName = `uploaded_${jobId}`;
          const folderPath = path.join(backendPath, 'uploads', projectName);
          absoluteFolderPath = path.resolve(folderPath);
        }
      }
    }

    console.log(`📁 폴더 열기 요청: ${absoluteFolderPath}`);

    // 폴더 존재 여부 확인
    if (!fs.existsSync(absoluteFolderPath)) {
      // ⭐ jobId로 폴더를 찾지 못한 경우, sourceContentId (script_id)로 재시도
      console.warn(`⚠️ 폴더를 찾을 수 없음: ${absoluteFolderPath}`);

      if (job.sourceContentId) {
        console.log(`🔄 script_id로 재시도: ${job.sourceContentId}`);
        const scriptIdFolder = path.join(backendPath, 'input', `project_${job.sourceContentId}`);
        const resolvedScriptPath = path.resolve(scriptIdFolder);

        if (fs.existsSync(resolvedScriptPath)) {
          console.log(`✅ script_id로 폴더 찾음: ${resolvedScriptPath}`);
          absoluteFolderPath = resolvedScriptPath;
        } else {
          console.error(`❌ script_id 폴더도 없음: ${resolvedScriptPath}`);
          return NextResponse.json(
            { error: `폴더를 찾을 수 없습니다. jobId: ${path.basename(absoluteFolderPath)}, scriptId: ${job.sourceContentId}` },
            { status: 404 }
          );
        }
      } else {
        console.error(`❌ 폴더가 존재하지 않습니다: ${absoluteFolderPath}`);
        return NextResponse.json(
          { error: `폴더가 존재하지 않습니다: ${path.basename(absoluteFolderPath)}` },
          { status: 404 }
        );
      }
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
