import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getCurrentUser } from '@/lib/session';
import { createJob, updateJob, addJobLog, flushJobLogs, findJobById, getSettings, deductCredits, addCredits, addCreditHistory } from '@/lib/db';

// 실행 중인 프로세스 관리
const runningProcesses = new Map<string, ChildProcess>();

export async function POST(request: NextRequest) {
  try {
    // 사용자 인증 확인
    console.log('=== 영상 생성 요청 시작 ===');
    console.log('쿠키:', request.cookies.getAll());

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인이 필요합니다');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log('✅ 인증 성공:', user.email);

    const formData = await request.formData();
    const jsonFile = formData.get('json') as File;

    if (!jsonFile) {
      return NextResponse.json(
        { error: 'JSON 파일이 필요합니다.' },
        { status: 400 }
      );
    }

    // JSON 파일에서 제목 추출
    let videoTitle = 'Untitled';
    try {
      let jsonText = await jsonFile.text();

      // 마크다운 코드 블록 제거 (```json ... ``` 형식)
      jsonText = jsonText
        .replace(/^```json\s*/i, '')  // 시작 부분 제거
        .replace(/\s*```\s*$/i, '')   // 끝 부분 제거
        .trim();

      const jsonData = JSON.parse(jsonText);
      if (jsonData.title) {
        videoTitle = jsonData.title;
      }
    } catch (error) {
      console.log('JSON title 추출 실패, 기본 제목 사용');
    }

    // 이미지 소스 확인
    const imageSource = formData.get('imageSource') as string || 'none';
    console.log('이미지 소스:', imageSource);

    // 비디오 포맷 확인 (longform, shortform, sora2)
    const videoFormat = formData.get('videoFormat') as string || 'longform';
    console.log('비디오 포맷:', videoFormat);

    // 이미지 파일들 수집
    const imageFiles: File[] = [];
    for (let i = 0; i < 50; i++) { // 최대 50개까지 확인
      const img = formData.get(`image_${i}`) as File;
      if (img) imageFiles.push(img);
    }

    // 이미지 파일 정렬: 생성 시간이 오래된 순서대로 (가장 오래된 것이 씬 0)
    // ⚠️ 중요: 이 정렬 로직은 모든 이미지/영상 업로드 API에서 동일하게 적용되어야 함!
    imageFiles.sort((a, b) => {
      // lastModified 시간으로 정렬 (오래된 순 = 작은 값이 먼저)
      // → 가장 먼저 다운로드된 이미지가 씬 0
      // → 마지막에 다운로드된 이미지가 씬 마지막
      return a.lastModified - b.lastModified;
    });

    console.log('📷 정렬된 이미지 순서 (생성 시간 오래된 순):');
    imageFiles.forEach((f, i) => {
      const sceneNum = i === 0 ? '씬 0 (폭탄)' : i === imageFiles.length - 1 ? '씬 마지막 (구독)' : `씬 ${i}`;
      console.log(`  ${sceneNum}: ${f.name} (생성: ${new Date(f.lastModified).toISOString()})`);
    });

    // 직접 업로드 모드일 때만 이미지 필수 체크 (SORA2는 이미지 불필요)
    if (videoFormat !== 'sora2' && imageSource === 'none' && imageFiles.length === 0) {
      return NextResponse.json(
        { error: '최소 1개 이상의 이미지가 필요합니다.' },
        { status: 400 }
      );
    }

    // 크레딧 설정 가져오기
    const settings = await getSettings();
    const cost = settings.videoGenerationCost;

    // 크레딧 차감 시도
    const deductResult = await deductCredits(user.userId, cost);

    if (!deductResult.success) {
      console.log(`❌ 크레딧 부족: ${user.email}, 필요: ${cost}, 보유: ${deductResult.balance}`);
      return NextResponse.json(
        {
          error: `크레딧이 부족합니다. (필요: ${cost}, 보유: ${deductResult.balance})`,
          requiredCredits: cost,
          currentCredits: deductResult.balance
        },
        { status: 402 } // 402 Payment Required
      );
    }

    console.log(`✅ 크레딧 차감 성공: ${user.email}, ${cost} 크레딧 차감, 잔액: ${deductResult.balance}`);

    // 크레딧 히스토리 기록
    await addCreditHistory(user.userId, 'use', -cost, '영상 생성');

    // trend-video-backend 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const jobId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const projectName = `uploaded_${jobId}`;
    const inputPath = path.join(backendPath, 'input', projectName);

    // Job을 DB에 저장 (JSON의 title과 videoFormat 사용)
    await createJob(user.userId, jobId, videoTitle, videoFormat as 'longform' | 'shortform' | 'sora2');

    // 비동기로 영상 생성 시작
    generateVideoFromUpload(jobId, user.userId, cost, {
      backendPath,
      inputPath,
      projectName,
      jsonFile,
      imageFiles,
      imageSource,
      isAdmin: user.isAdmin || false,
      videoFormat // 롱폼/숏폼 정보 전달
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: '영상 생성이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('Error generating video from upload:', error);
    return NextResponse.json(
      { error: error?.message || '영상 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

async function generateVideoFromUpload(
  jobId: string,
  userId: string,
  creditCost: number,
  config: {
    backendPath: string;
    inputPath: string;
    projectName: string;
    jsonFile: File;
    imageFiles: File[];
    imageSource: string;
    isAdmin: boolean;
    videoFormat: string; // 'longform', 'shortform', 'sora2'
  }
) {
  try {
    // 1. 입력 폴더 생성
    await updateJob(jobId, {
      status: 'processing',
      progress: 10,
      step: '프로젝트 폴더 생성 중...'
    });
    await fs.mkdir(config.inputPath, { recursive: true });

    // 2. JSON 파일 저장 (scene_number 추가)
    await updateJob(jobId, {
      progress: 20,
      step: 'JSON 대본 저장 중...'
    });

    const jsonText = await config.jsonFile.text();
    let jsonData = JSON.parse(jsonText.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '').trim());

    // Python 스크립트를 위해 scene_number 필드 추가
    if (jsonData.scenes && Array.isArray(jsonData.scenes)) {
      jsonData.scenes = jsonData.scenes.map((scene: any, index: number) => ({
        ...scene,
        scene_number: index + 1
      }));
    }

    await fs.writeFile(
      path.join(config.inputPath, 'story.json'),
      JSON.stringify(jsonData, null, 2)
    );

    // 3. 이미지 파일 저장 (직접 업로드 모드일 때만)
    if (config.imageSource === 'none' && config.imageFiles.length > 0) {
      await updateJob(jobId, {
        progress: 30,
        step: '이미지 저장 중...'
      });

      await addJobLog(jobId, `\n📷 이미지 ${config.imageFiles.length}개를 생성 시간 순서대로 저장`);
      await addJobLog(jobId, `⏰ 정렬 기준: 생성 시간이 가장 오래된 것 → 씬 0 (폭탄 씬)`);

      for (let i = 0; i < config.imageFiles.length; i++) {
        const imgFile = config.imageFiles[i];
        const imgBuffer = Buffer.from(await imgFile.arrayBuffer());
        const ext = imgFile.name.split('.').pop() || 'jpg';

        // 파일명을 image_01, image_02 형식으로 저장 (씬 순서 유지)
        await fs.writeFile(
          path.join(config.inputPath, `image_${String(i + 1).padStart(2, '0')}.${ext}`),
          imgBuffer
        );

        const sceneLabel = i === 0 ? '씬 0 (폭탄)' : i === config.imageFiles.length - 1 ? '씬 마지막' : `씬 ${i}`;
        await addJobLog(jobId, `  ${sceneLabel}: ${imgFile.name}`);
      }
    } else if (config.imageSource === 'google') {
      await addJobLog(jobId, `\n🔍 Google Image Search를 사용하여 이미지 자동 다운로드 예정`);
    } else if (config.imageSource === 'dalle') {
      await addJobLog(jobId, `\n🎨 DALL-E 3를 사용하여 이미지 자동 생성 예정`);
    }

    // 4. Python 스크립트 실행 (영상 생성) - 실시간 로그
    await updateJob(jobId, {
      progress: 40,
      step: '영상 생성 중... (몇 분 소요될 수 있습니다)'
    });

    const startLog = `${'='.repeat(70)}\n🎬 영상 생성 시작 - Job ID: ${jobId}\n📂 프로젝트: ${config.projectName}\n${'='.repeat(70)}`;
    console.log(`\n${startLog}`);
    await addJobLog(jobId, startLog);

    let pythonProcess: any;
    let workingDir: string;
    let soraOutputDirBefore: string[] = [];

    // SORA2는 trend-video-backend 사용, 나머지는 trend-video-backend 사용
    if (config.videoFormat === 'sora2') {
      // trend-video-backend 경로
      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
      workingDir = backendPath;

      // JSON 파일에서 프롬프트 텍스트 추출
      const promptText = jsonData.scenes?.map((s: any) => s.text || s.prompt).join(' ') || jsonData.prompt || '영상 생성';

      // 임시 프롬프트 파일 생성
      const tempPromptPath = path.join(backendPath, 'prompts', `temp_${jobId}.txt`);
      await fs.writeFile(tempPromptPath, promptText);

      // 실행 전 output 폴더 상태 기록
      const outputPath = path.join(backendPath, 'output');
      try {
        soraOutputDirBefore = await fs.readdir(outputPath);
      } catch (error) {
        soraOutputDirBefore = [];
      }

      const pythonArgs = ['-m', 'src.sora.main', '-f', `prompts/temp_${jobId}.txt`, '-d', '8', '-s', '720x1280'];
      console.log(`🎬 trend-video-backend 명령어: python ${pythonArgs.join(' ')}`);
      await addJobLog(jobId, `\n🎬 SORA2 모드: trend-video-backend 실행\n📝 프롬프트: ${promptText.substring(0, 100)}...\n`);

      pythonProcess = spawn('python', pythonArgs, {
        cwd: backendPath,
        shell: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1'
        }
      });
    } else {
      // trend-video-backend 사용 (기존 로직)
      workingDir = config.backendPath;

      // 이미지 소스 옵션 추가
      const imageSourceArg = config.imageSource && config.imageSource !== 'none'
        ? ['--image-source', config.imageSource]
        : [];

      // 관리자 플래그 추가
      const isAdminArg = config.isAdmin ? ['--is-admin'] : [];

      // 비율 설정 (longform: 16:9, shortform: 9:16)
      const aspectRatio = config.videoFormat === 'shortform' ? '9:16' : '16:9';
      const aspectRatioArg = ['--aspect-ratio', aspectRatio];
      console.log(`📐 비디오 비율: ${aspectRatio} (${config.videoFormat})`);

      // 자막 추가 (기본값이 True이지만 명시적으로 전달)
      const subtitlesArg = ['--add-subtitles'];

      // spawn으로 실시간 출력 받기 (UTF-8 인코딩 설정)
      const pythonArgs = ['create_video_from_folder.py', '--folder', `input/${config.projectName}`, ...imageSourceArg, ...aspectRatioArg, ...subtitlesArg, ...isAdminArg];
      console.log(`🐍 Python 명령어: python ${pythonArgs.join(' ')}`);

      pythonProcess = spawn('python', pythonArgs, {
        cwd: config.backendPath,
        shell: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1'
        }
      });
    }

    // 프로세스를 맵에 저장
    runningProcesses.set(jobId, pythonProcess);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let lastProgress = 40;
    let isCancelled = false;

    // stdout 실시간 처리
    pythonProcess.stdout.on('data', async (data) => {
      const text = data.toString('utf-8');
      stdoutBuffer += text;
      console.log(text);
      await addJobLog(jobId, text);

      // 진행률 추정 (간단한 키워드 기반)
      if (text.includes('TTS 음성 생성') || text.includes('TTS')) {
        lastProgress = Math.min(50, lastProgress + 2);
        await updateJob(jobId, { progress: lastProgress, step: 'TTS 음성 생성 중...' });
      } else if (text.includes('장면 처리') || text.includes('Scene') || text.includes('씬') || text.includes('scene')) {
        lastProgress = Math.min(85, lastProgress + 3);
        await updateJob(jobId, { progress: lastProgress, step: '장면 영상 처리 중...' });
      } else if (text.includes('병합') || text.includes('merge') || text.includes('concat')) {
        lastProgress = 90;
        await updateJob(jobId, { progress: lastProgress, step: '최종 영상 병합 중...' });
      }
    });

    // stderr 실시간 처리
    pythonProcess.stderr.on('data', async (data) => {
      const text = data.toString('utf-8');
      stderrBuffer += text;
      console.error(text);
      await addJobLog(jobId, text);
    });

    // 프로세스 완료 대기
    await new Promise<void>((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        // 맵에서 프로세스 제거
        runningProcesses.delete(jobId);

        if (isCancelled) {
          reject(new Error('사용자가 작업을 취소했습니다.'));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Python 프로세스가 코드 ${code}로 종료되었습니다.`));
        }
      });

      pythonProcess.on('error', (error) => {
        runningProcesses.delete(jobId);
        reject(error);
      });

      // 타임아웃 (2시간)
      setTimeout(() => {
        if (runningProcesses.has(jobId)) {
          pythonProcess.kill();
          runningProcesses.delete(jobId);
          reject(new Error('Python 실행 시간 초과 (2시간)'));
        }
      }, 120 * 60 * 1000);
    });

    // 5. 생성된 영상 찾기
    await updateJob(jobId, {
      progress: 90,
      step: '영상 파일 확인 중...'
    });

    let videoPath: string;
    let generatedPath: string;

    if (config.videoFormat === 'sora2') {
      // trend-video-backend output 폴더에서 찾기
      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
      const outputPath = path.join(backendPath, 'output');

      // 파일 시스템 동기화를 위해 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 실행 후 output 폴더 상태 확인 - 새로 생긴 폴더만 찾기
      const outputDirsAfter = await fs.readdir(outputPath);
      const newDirs = outputDirsAfter.filter(d => !soraOutputDirBefore.includes(d) && d.startsWith('20'));

      await addJobLog(jobId, `\n🔍 디버그: 이전 폴더 수=${soraOutputDirBefore.length}, 현재 폴더 수=${outputDirsAfter.length}`);
      await addJobLog(jobId, `🔍 디버그: 이전 폴더들=${JSON.stringify(soraOutputDirBefore)}`);
      await addJobLog(jobId, `🔍 디버그: 현재 폴더들=${JSON.stringify(outputDirsAfter)}`);
      await addJobLog(jobId, `🔍 디버그: 새 폴더들=${JSON.stringify(newDirs)}`);

      if (newDirs.length === 0) {
        // Python 프로세스 출력 확인
        await addJobLog(jobId, `\n❌ Python stdout:\n${stdoutBuffer}`);
        await addJobLog(jobId, `\n❌ Python stderr:\n${stderrBuffer}`);
        throw new Error('trend-video-backend에서 새로 생성된 폴더를 찾을 수 없습니다. 이전 폴더 수: ' + soraOutputDirBefore.length + ', 현재 폴더 수: ' + outputDirsAfter.length + '. Python 실행 로그를 확인하세요.');
      }

      // 새로 생긴 폴더 중 가장 최신 것 선택 (보통 하나만 있겠지만)
      const sortedNewDirs = newDirs.sort().reverse();
      const latestOutputDir = path.join(outputPath, sortedNewDirs[0]);
      generatedPath = latestOutputDir;

      await addJobLog(jobId, `\n📁 새 output 폴더 발견: ${sortedNewDirs[0]}`);

      // 최종 영상 파일 찾기 (combined 또는 full)
      const files = await fs.readdir(latestOutputDir);
      const videoFile = files.find(f =>
        f.endsWith('.mp4') && (f.includes('combined') || f.includes('full'))
      );

      if (!videoFile) {
        throw new Error('trend-video-backend에서 생성된 최종 영상 파일을 찾을 수 없습니다.');
      }

      videoPath = path.join(latestOutputDir, videoFile);
      await addJobLog(jobId, `\n✅ SORA2 영상 발견: ${videoFile}`);
    } else {
      // trend-video-backend generated_videos 폴더에서 찾기 (기존 로직)
      generatedPath = path.join(config.inputPath, 'generated_videos');
      const files = await fs.readdir(generatedPath);

      // story.json에서 제목 가져와서 파일명 생성
      let expectedFileName: string | null = null;
      try {
        const storyJsonPath = path.join(config.inputPath, 'story.json');
        const storyData = JSON.parse(await fs.readFile(storyJsonPath, 'utf-8'));
        const title = storyData.title || storyData.metadata?.title || 'video';

        // 안전한 파일명으로 변환 (Python과 동일한 로직)
        const safeTitle = title.replace(/[^a-zA-Z0-9가-힣\s._-]/g, '').trim().replace(/\s+/g, '_');
        expectedFileName = `${safeTitle}.mp4`;
        await addJobLog(jobId, `\n📝 예상 파일명: ${expectedFileName}`);
      } catch (error) {
        await addJobLog(jobId, `\n⚠️ 제목 기반 파일명 생성 실패, 기본 탐색 진행`);
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

      videoPath = path.join(generatedPath, videoFile);
      await addJobLog(jobId, `\n✅ 최종 영상 발견: ${videoFile}`);
    }

    // 썸네일 찾기
    let thumbnailPath: string | undefined;

    console.log('📸 썸네일 검색 시작...');
    console.log('  영상 폴더:', generatedPath);

    try {
      const files = await fs.readdir(generatedPath);
      console.log('  폴더 파일들:', files);

      // 썸네일 파일 찾기
      const thumbnailFile = files.find(f =>
        (f === 'thumbnail.jpg' || f === 'thumbnail.png' ||
         f.includes('thumbnail') && (f.endsWith('.jpg') || f.endsWith('.png')))
      );

      if (thumbnailFile) {
        thumbnailPath = path.join(generatedPath, thumbnailFile);
        console.log('✅ 썸네일 발견:', thumbnailPath);
      } else if (config.videoFormat !== 'sora2') {
        // SORA2가 아닐 때만 상위 input 폴더에서 찾기
        console.log('⚠️  generated_videos에서 썸네일 없음, 상위 폴더 확인...');
        try {
          const inputFiles = await fs.readdir(config.inputPath);
          console.log('  input 폴더 파일들:', inputFiles);
          const inputThumbnailFile = inputFiles.find(f =>
            (f === 'thumbnail.jpg' || f === 'thumbnail.png' ||
             f.includes('thumbnail') && (f.endsWith('.jpg') || f.endsWith('.png')))
          );

          if (inputThumbnailFile) {
            thumbnailPath = path.join(config.inputPath, inputThumbnailFile);
            console.log('✅ 썸네일 발견 (input):', thumbnailPath);
          } else {
            console.log('❌ 썸네일 파일을 찾을 수 없습니다.');
          }
        } catch (error) {
          console.log('❌ 썸네일 검색 중 오류:', error);
        }
      } else {
        console.log('⚠️ SORA2: 썸네일 파일 없음');
      }
    } catch (error) {
      console.log('❌ 썸네일 검색 중 오류:', error);
    }

    console.log('최종 썸네일 경로:', thumbnailPath || '없음');

    // 6. 완료
    const completeLog = `\n${'='.repeat(70)}\n✅ 영상 생성 완료!\n📹 파일: ${videoPath}\n${thumbnailPath ? `🖼️ 썸네일: ${thumbnailPath}\n` : ''}🆔 Job ID: ${jobId}\n${'='.repeat(70)}`;
    console.log(completeLog);
    await addJobLog(jobId, completeLog);

    // 모든 로그를 즉시 플러시
    await flushJobLogs();

    // 제목은 이미 Job 생성 시 JSON의 title로 설정되었으므로 업데이트하지 않음
    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      step: '완료!',
      videoPath,
      thumbnailPath
    });

  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);

    // 에러 로그 추가
    await addJobLog(jobId, `\n❌ 오류 발생: ${error.message}`);

    // 모든 로그를 즉시 플러시
    await flushJobLogs();

    // 취소인지 확인
    const isCancelledError = error.message?.includes('취소');

    // 실패 시 크레딧 환불 (취소는 환불 안 함)
    if (!isCancelledError) {
      await addCredits(userId, creditCost);
      await addCreditHistory(userId, 'refund', creditCost, '영상 생성 실패 환불');
      console.log(`💰 크레딧 환불: ${userId}, ${creditCost} 크레딧 환불 (영상 생성 실패)`);
      await addJobLog(jobId, `\n💰 ${creditCost} 크레딧이 환불되었습니다.`);
    }

    await updateJob(jobId, {
      status: isCancelledError ? 'cancelled' : 'failed',
      error: error.message || '알 수 없는 오류'
    });
  }
}

// GET 요청 - 상태 확인
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

    const { findJobById } = await import('@/lib/db');
    const job = await findJobById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    let videoUrl = null;
    if (job.status === 'completed' && job.videoPath) {
      videoUrl = `/api/download-video?jobId=${jobId}`;
    }

    return NextResponse.json({
      status: job.status,
      progress: job.progress,
      step: job.step,
      videoUrl,
      error: job.error || null,
      logs: job.logs || []
    });

  } catch (error: any) {
    console.error('Error checking video status:', error);
    return NextResponse.json(
      { error: error?.message || '상태 확인 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE 요청 - 작업 취소
export async function DELETE(request: NextRequest) {
  try {
    console.log('🛑 DELETE 요청 받음');

    const user = await getCurrentUser(request);

    if (!user) {
      console.log('❌ 인증 실패');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    console.log(`🛑 취소 요청 jobId: ${jobId}`);

    if (!jobId) {
      console.log('❌ jobId 없음');
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    // Job 확인
    console.log(`🔍 DB에서 job 조회 중: ${jobId}`);
    const job = await findJobById(jobId);
    console.log(`📋 Job 조회 결과:`, job ? `찾음 (userId: ${job.userId}, status: ${job.status})` : '없음');

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 본인 작업인지 확인
    if (job.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 이미 완료되었거나 실패한 작업은 취소할 수 없음
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json(
        { error: '이미 완료된 작업은 취소할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 실행 중인 프로세스 찾기
    const process = runningProcesses.get(jobId);

    if (process) {
      console.log(`🛑 작업 취소 요청 (프로세스 종료): ${jobId}`);

      // 프로세스 종료
      process.kill('SIGTERM');

      // 맵에서 제거
      runningProcesses.delete(jobId);
    } else {
      console.log(`🛑 작업 취소 요청 (프로세스 없음, 상태만 변경): ${jobId}`);
    }

    // Job 상태 업데이트 (프로세스가 없어도 실행)
    await updateJob(jobId, {
      status: 'cancelled',
      error: '사용자가 작업을 취소했습니다.',
      step: '취소됨'
    });

    await addJobLog(jobId, '\n🛑 사용자가 영상 생성을 취소했습니다.');
    await flushJobLogs();

    return NextResponse.json({
      success: true,
      message: '작업이 취소되었습니다.'
    });

  } catch (error: any) {
    console.error('Error cancelling video generation:', error);
    return NextResponse.json(
      { error: error?.message || '작업 취소 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
