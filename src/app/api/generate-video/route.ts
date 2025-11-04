import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { parseJsonSafely } from '@/lib/json-utils';

const execAsync = promisify(exec);

// 작업 상태 저장 (메모리 기반, 프로덕션에서는 Redis 등 사용 권장)
const jobs = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  step: string;
  videoPath?: string;
  thumbnailPath?: string;
  error?: string;
}>();

export async function POST(request: NextRequest) {
  try {
    const { script, title, scenes } = await request.json();

    if (!script || !title) {
      return NextResponse.json(
        { error: 'script와 title이 필요합니다.' },
        { status: 400 }
      );
    }

    // trend-video-backend 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const projectName = `project_${jobId}`;
    const inputPath = path.join(backendPath, 'input', projectName);

    // Job 초기화
    jobs.set(jobId, {
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
      scenes
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
  }
) {
  try {
    const job = jobs.get(jobId)!;

    // 1. 입력 폴더 생성
    job.progress = 10;
    job.step = '프로젝트 폴더 생성 중...';
    job.status = 'processing';
    await fs.mkdir(config.inputPath, { recursive: true });

    // 2. story.json 생성
    job.progress = 20;
    job.step = 'JSON 대본 작성 중...';

    const storyJson = {
      title: config.title,
      scenes: config.scenes || [
        {
          scene_number: 1,
          title: config.title,
          narration: config.script,
          image_prompt: config.title
        }
      ]
    };

    await fs.writeFile(
      path.join(config.inputPath, 'story.json'),
      JSON.stringify(storyJson, null, 2),
      'utf-8'
    );

    // 3. Python 스크립트 실행 (영상 생성 + 자막 추가)
    job.progress = 40;
    job.step = '영상 생성 중... (몇 분 소요될 수 있습니다)';

    const pythonCommand = `cd "${config.backendPath}" && python create_video_from_folder.py --folder "input/${config.projectName}" --aspect-ratio "16:9" --add-subtitles`;

    console.log(`Executing: ${pythonCommand}`);
    const { stdout, stderr } = await execAsync(pythonCommand, {
      timeout: 3600000 // 60분 타임아웃 (롱폼은 시간이 오래 걸림)
    });

    console.log('Python stdout:', stdout);
    if (stderr) console.error('Python stderr:', stderr);

    // 4. 생성된 영상 찾기
    job.progress = 90;
    job.step = '영상 파일 확인 중...';

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

  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error.message || '알 수 없는 오류';
    }
  }
}

// 영상 생성 진행 상태 확인
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

    const job = jobs.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
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
