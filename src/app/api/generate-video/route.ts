import { NextRequest, NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { parseJsonSafely } from '@/lib/json-utils';
import { videoJobs } from '@/lib/video-jobs';
import { createJob } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { script, title, scenes, type, imageSource, sourceContentId, userId } = await request.json();

    if (!script || !title) {
      return NextResponse.json(
        { error: 'script와 title이 필요합니다.' },
        { status: 400 }
      );
    }

    // 사용자 인증 (내부 요청이 아닌 경우)
    const isInternal = request.headers.get('X-Internal-Request') === 'automation-system';
    let userIdToUse = userId; // 자동화 시스템에서 전달한 userId 사용

    if (!isInternal) {
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userIdToUse = user.userId;
    }

    if (!userIdToUse) {
      console.error('❌ [GENERATE-VIDEO] No userId provided');
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // trend-video-backend 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const projectName = `project_${jobId}`;
    const inputPath = path.join(backendPath, 'input', projectName);

    // DB에 Job 생성 (jobs 테이블)
    console.log(`📝 [GENERATE-VIDEO] Creating job in DB: ${jobId} for user: ${userIdToUse}`);
    createJob(userIdToUse, jobId, title, type || 'longform', sourceContentId);

    // 메모리에도 Job 초기화
    videoJobs.set(jobId, {
      status: 'pending',
      progress: 0,
      step: '준비 중...'
    });

    // 비동기로 영상 생성 시작
    generateVideoAsync(jobId, {
      backendPath,
      inputPath,
      projectName,
      title,
      script,
      scenes,
      type: type || 'longform', // 기본값은 longform
      imageSource: imageSource || 'none', // 이미지 소스 (none, dalle, imagen3 등)
      userId: userIdToUse
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: '영상 생성이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('Error generating video:', error);
    return NextResponse.json(
      { error: error?.message || '영상 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

async function generateVideoAsync(
  jobId: string,
  config: {
    backendPath: string;
    inputPath: string;
    projectName: string;
    title: string;
    script: string;
    scenes?: any[];
    type?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';
    imageSource?: string;
    userId: string;
  }
) {
  const { updateJob, addJobLog } = require('@/lib/db');

  try {
    const job = videoJobs.get(jobId)!;

    // 1. 입력 폴더 생성
    job.progress = 10;
    job.step = '프로젝트 폴더 생성 중...';
    job.status = 'processing';

    // DB 업데이트
    updateJob(jobId, { status: 'processing', progress: 10, step: '프로젝트 폴더 생성 중...' });
    addJobLog(jobId, '프로젝트 폴더 생성 중...');

    await fs.mkdir(config.inputPath, { recursive: true });
    addJobLog(jobId, `✅ 프로젝트 폴더 생성 완료: ${config.projectName}`);

    // 2. story.json 생성
    job.progress = 20;
    job.step = 'JSON 대본 작성 중...';
    updateJob(jobId, { progress: 20, step: 'JSON 대본 작성 중...' });
    addJobLog(jobId, '📝 JSON 대본 작성 중...');

    const storyJson = {
      title: config.title,
      scenes: config.scenes || [
        {
          scene_number: 1,
          title: config.title,
          narration: config.script,
          image_prompt: config.title,
          created_at: new Date().toISOString() // 생성 시간 추가
        }
      ]
    };

    await fs.writeFile(
      path.join(config.inputPath, 'story.json'),
      JSON.stringify(storyJson, null, 2),
      'utf-8'
    );
    addJobLog(jobId, `✅ story.json 생성 완료 (씬 개수: ${storyJson.scenes.length}개)`);

    // 3. Python 스크립트 실행 (영상 생성 + 자막 추가)
    job.progress = 40;
    job.step = '영상 생성 중... (몇 분 소요될 수 있습니다)';
    updateJob(jobId, { progress: 40, step: '영상 생성 중... (몇 분 소요될 수 있습니다)' });

    // 타입에 따라 aspect-ratio 결정 (shortform은 9:16, 나머지는 16:9)
    const aspectRatio = config.type === 'shortform' ? '9:16' : '16:9';
    console.log(`📐 영상 비율 설정: ${aspectRatio} (타입: ${config.type || 'longform'})`);

    // 이미지 소스 설정 (none, dalle, imagen3 등)
    const imageSource = config.imageSource || 'none';
    console.log(`🖼️  이미지 소스: ${imageSource}`);

    addJobLog(jobId, '🎬 영상 생성 시작...');
    addJobLog(jobId, `📐 비율: ${config.type === 'shortform' ? '세로 (9:16)' : '가로 (16:9)'}`);
    addJobLog(jobId, `🖼️ 이미지 소스: ${imageSource}`);

    // Python 스크립트를 spawn으로 실행해서 실시간 로그 출력
    const pythonArgs = [
      'create_video_from_folder.py',
      '--folder', `input/${config.projectName}`,
      '--aspect-ratio', aspectRatio,
      '--add-subtitles',
      '--image-source', imageSource
    ];

    console.log(`Executing: python ${pythonArgs.join(' ')}`);
    addJobLog(jobId, `실행: python ${pythonArgs.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const pythonProcess = spawn('python', pythonArgs, {
        cwd: config.backendPath,
        shell: true,
        env: {
          ...process.env,
          JOB_ID: jobId  // Python 로깅 핸들러가 사용
        }
      });

      let currentProgress = 40;
      const progressIncrement = 50 / 100; // 40% ~ 90% 사이를 100단계로 나눔

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Python] ${output}`);

        // 로그를 줄 단위로 분리해서 DB에 저장
        const lines = output.split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          addJobLog(jobId, line);

          // 특정 키워드에 따라 진행률 조정
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('downloading') || lowerLine.includes('다운로드')) {
            currentProgress = Math.max(currentProgress, 45);
            job.step = '미디어 다운로드 중...';
          } else if (lowerLine.includes('generating image') || lowerLine.includes('이미지 생성')) {
            currentProgress = Math.max(currentProgress, 50);
            job.step = '이미지 생성 중...';
          } else if (lowerLine.includes('tts') || lowerLine.includes('음성 생성')) {
            currentProgress = Math.max(currentProgress, 60);
            job.step = 'TTS 음성 생성 중...';
          } else if (lowerLine.includes('subtitle') || lowerLine.includes('자막')) {
            currentProgress = Math.max(currentProgress, 75);
            job.step = '자막 생성 중...';
          } else if (lowerLine.includes('merging') || lowerLine.includes('합치기') || lowerLine.includes('병합')) {
            currentProgress = Math.max(currentProgress, 85);
            job.step = '영상 병합 중...';
          } else if (lowerLine.includes('scene') && lowerLine.match(/\d+/)) {
            // 씬 번호 감지
            const sceneMatch = line.match(/scene[_\s]*(\d+)/i) || line.match(/씬[_\s]*(\d+)/);
            if (sceneMatch) {
              const sceneNum = parseInt(sceneMatch[1]);
              addJobLog(jobId, `🎬 씬 ${sceneNum} 처리 중...`);
            }
          }

          // 진행률 증가 (최대 90%까지)
          if (currentProgress < 90) {
            currentProgress = Math.min(90, currentProgress + progressIncrement);
            job.progress = Math.floor(currentProgress);
            updateJob(jobId, { progress: Math.floor(currentProgress), step: job.step });
          }
        });
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(`[Python Error] ${output}`);

        // 에러도 로그에 저장
        const lines = output.split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          addJobLog(jobId, `⚠️ ${line}`);
        });
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Python process completed successfully');
          addJobLog(jobId, '✅ Python 스크립트 실행 완료');
          resolve();
        } else {
          console.error(`❌ Python process exited with code ${code}`);
          addJobLog(jobId, `❌ Python 스크립트 실패 (exit code: ${code})`);
          reject(new Error(`Python process exited with code ${code}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('❌ Python process error:', error);
        addJobLog(jobId, `❌ Python 실행 에러: ${error.message}`);
        reject(error);
      });

      // 60분 타임아웃
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Python execution timeout (60 minutes)'));
      }, 3600000);
    });

    // 4. 생성된 영상 찾기
    job.progress = 90;
    job.step = '영상 파일 확인 중...';
    updateJob(jobId, { progress: 90, step: '영상 파일 확인 중...' });
    addJobLog(jobId, '영상 파일 확인 중...');

    const generatedPath = path.join(config.inputPath, 'generated_videos');
    const files = await fs.readdir(generatedPath);

    // story.json에서 제목 가져와서 파일명 생성 (유도리있는 파서 사용)
    let expectedFileName: string | null = null;
    try {
      const storyJsonPath = path.join(config.inputPath, 'story.json');
      const storyJsonContent = await fs.readFile(storyJsonPath, 'utf-8');
      const parseResult = parseJsonSafely(storyJsonContent, { logErrors: true });

      if (!parseResult.success) {
        throw new Error('story.json 파싱 실패: ' + parseResult.error);
      }

      const storyData = parseResult.data;
      if (parseResult.fixed) {
        console.log('🔧 story.json 자동 수정 적용됨');
      }

      const title = storyData.title || storyData.metadata?.title || 'video';

      // 안전한 파일명으로 변환 (Python과 동일한 로직)
      const safeTitle = title.replace(/[^a-zA-Z0-9가-힣\s._-]/g, '').trim().replace(/\s+/g, '_');
      expectedFileName = `${safeTitle}.mp4`;
      console.log('📝 예상 파일명:', expectedFileName);
    } catch (error) {
      console.log('⚠️ 제목 기반 파일명 생성 실패, 기본 탐색 진행');
    }

    // 1순위: 제목 기반 파일명 찾기
    let videoFile = expectedFileName ? files.find(f => f === expectedFileName) : null;

    // 2순위: merged.mp4 찾기
    if (!videoFile) {
      videoFile = files.find(f => f === 'merged.mp4');
    }

    // 3순위: scene_를 포함하지 않는 다른 mp4 파일 찾기
    if (!videoFile) {
      videoFile = files.find(f => f.endsWith('.mp4') && !f.includes('scene_'));
    }

    if (!videoFile) {
      throw new Error('생성된 영상 파일을 찾을 수 없습니다.');
    }

    const videoPath = path.join(generatedPath, videoFile);
    console.log('✅ 최종 영상 발견:', videoFile);

    // 썸네일 찾기 (youtube_thumbnail.jpg)
    let thumbnailPath: string | undefined;
    try {
      const thumbnailFile = path.join(config.inputPath, 'youtube_thumbnail.jpg');
      const thumbnailExists = await fs.access(thumbnailFile).then(() => true).catch(() => false);
      if (thumbnailExists) {
        thumbnailPath = thumbnailFile;
        console.log('Thumbnail found:', thumbnailPath);
      }
    } catch (err) {
      console.warn('Thumbnail not found, skipping...');
    }

    // 5. 완료
    job.progress = 100;
    job.step = '완료!';
    job.status = 'completed';
    job.videoPath = videoPath;
    job.thumbnailPath = thumbnailPath;
    job.videoId = jobId; // videoId 설정

    // DB 업데이트 (완료)
    updateJob(jobId, {
      status: 'completed',
      progress: 100,
      step: '완료!',
      videoPath: videoPath,
      thumbnailPath: thumbnailPath
    });
    addJobLog(jobId, '✅ 영상 생성 완료!');
    console.log(`✅ [GENERATE-VIDEO] Job ${jobId} completed successfully`);

  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);
    const job = videoJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error.message || '알 수 없는 오류';
    }

    // DB 업데이트 (실패)
    updateJob(jobId, {
      status: 'failed',
      error: error.message || '알 수 없는 오류'
    });
    addJobLog(jobId, `❌ 영상 생성 실패: ${error.message}`);
    console.error(`❌ [GENERATE-VIDEO] Job ${jobId} failed:`, error);
  }
}

// 영상 생성 진행 상태 확인
export async function GET(request: NextRequest) {
  const { findJobById } = require('@/lib/db');

  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 1. 메모리에서 먼저 찾기 (실시간 업데이트용)
    let job = videoJobs.get(jobId);

    // 2. 메모리에 없으면 DB에서 찾기
    if (!job) {
      const dbJob = findJobById(jobId);
      if (!dbJob) {
        return NextResponse.json(
          { error: '작업을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // DB Job을 메모리 형식으로 변환
      job = {
        status: dbJob.status,
        progress: dbJob.progress,
        step: dbJob.step,
        videoPath: dbJob.videoPath,
        thumbnailPath: dbJob.thumbnailPath,
        videoId: dbJob.id,
        error: dbJob.error
      };
    }

    // 완료된 경우 영상 파일 URL 생성
    let videoUrl = null;
    let thumbnailUrl = null;
    if (job.status === 'completed' && job.videoPath) {
      // 파일 경로를 상대 URL로 변환 (프로덕션에서는 별도 저장소 필요)
      videoUrl = `/api/download-video?jobId=${jobId}`;
    }
    if (job.status === 'completed' && job.thumbnailPath) {
      thumbnailUrl = `/api/download-thumbnail?jobId=${jobId}`;
    }

    return NextResponse.json({
      status: job.status,
      progress: job.progress,
      step: job.step,
      videoUrl,
      thumbnailUrl,
      videoId: job.videoId || jobId,
      error: job.error || null
    });

  } catch (error: any) {
    console.error('Error checking video status:', error);
    return NextResponse.json(
      { error: error?.message || '상태 확인 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
