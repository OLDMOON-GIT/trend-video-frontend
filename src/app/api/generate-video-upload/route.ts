import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getCurrentUser } from '@/lib/session';
import { createJob, updateJob, addJobLog, flushJobLogs, findJobById, getSettings, deductCredits, addCredits, addCreditHistory } from '@/lib/db';
import { parseJsonSafely } from '@/lib/json-utils';
import kill from 'tree-kill';
import { sendProcessKillFailureEmail, sendProcessKillTimeoutEmail } from '@/utils/email';

const execAsync = promisify(exec);

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

    // JSON 파일에서 제목 추출 (공통 파싱 함수 사용)
    let videoTitle = 'Untitled';
    try {
      const jsonText = await jsonFile.text();

      // parseJsonSafely로 안전하게 파싱 (AI 설명문, 코드 블록 등 자동 제거)
      const parseResult = parseJsonSafely(jsonText, { logErrors: true });

      if (parseResult.success && parseResult.data) {
        if (parseResult.fixed) {
          console.log('⚠️ JSON 자동 수정이 적용되었습니다 (제목 추출)');
        }

        const jsonData = parseResult.data;
        if (jsonData.title) {
          videoTitle = jsonData.title;
          console.log('✅ JSON 제목 추출 성공:', videoTitle);
        }
      } else {
        console.log('⚠️ JSON title 추출 실패, 기본 제목 사용:', parseResult.error);
      }
    } catch (error) {
      console.log('❌ JSON title 추출 중 오류, 기본 제목 사용');
    }

    // 이미지 소스 확인
    const imageSource = formData.get('imageSource') as string || 'none';
    console.log('이미지 소스:', imageSource);

    // 프롬프트 포맷 확인 (product, product-info)
    const promptFormat = formData.get('promptFormat') as string || '';
    console.log('프롬프트 포맷:', promptFormat);

    // TTS 음성 선택 확인
    const ttsVoice = formData.get('ttsVoice') as string || 'ko-KR-SoonBokNeural';
    console.log('TTS 음성:', ttsVoice);

    // 상품 타입이면 title 앞에 [광고] 추가
    if (promptFormat === 'product' || promptFormat === 'product-info') {
      if (!videoTitle.startsWith('[광고]')) {
        videoTitle = `[광고] ${videoTitle}`;
        console.log('✅ 상품 영상 - title에 [광고] 추가:', videoTitle);
      }
    }

    // 비디오 포맷 확인 (longform, shortform, sora2)
    const videoFormat = formData.get('videoFormat') as string || 'longform';
    console.log('비디오 포맷:', videoFormat);

    // 원본 파일명 매핑 정보 파싱
    const originalNamesStr = formData.get('originalNames') as string;
    let originalNames: Record<number, string> = {};
    if (originalNamesStr) {
      try {
        originalNames = JSON.parse(originalNamesStr);
        console.log('✅ 원본 파일명 매핑 정보 수신:', originalNames);
      } catch (error) {
        console.warn('⚠️ 원본 파일명 파싱 실패, 변환된 이름만 사용');
      }
    }

    // 이미지 파일들 수집
    const imageFiles: File[] = [];
    for (let i = 0; i < 50; i++) { // 최대 50개까지 확인
      const img = formData.get(`image_${i}`) as File;
      if (img) imageFiles.push(img);
    }

    // 비디오 파일들 수집
    const videoFiles: File[] = [];
    for (let i = 0; i < 50; i++) { // 최대 50개까지 확인
      const vid = formData.get(`video_${i}`) as File;
      if (vid) videoFiles.push(vid);
    }

    // ⚠️ 중요: 시퀀스 번호 우선, 그 다음 lastModified 오래된 순 정렬
    // 1. 파일명에서 시퀀스 번호 추출 (01.jpg, image_02.png, scene-03.jpg 등)
    // 2. 시퀀스 번호가 있으면 시퀀스 순으로 정렬
    // 3. 시퀀스 번호가 없으면 lastModified 오래된 순으로 정렬
    const extractSequenceNumber = (filename: string): number | null => {
      // 1. 파일명이 숫자로 시작: "1.jpg", "02.png"
      const startMatch = filename.match(/^(\d+)\./);
      if (startMatch) return parseInt(startMatch[1], 10);

      // 2. _숫자. 또는 -숫자. 패턴: "image_01.jpg", "scene-02.png"
      const seqMatch = filename.match(/[_-](\d{1,3})\./);
      if (seqMatch) return parseInt(seqMatch[1], 10);

      // 3. (숫자) 패턴: "Image_fx (47).jpg"
      // 단, 랜덤 ID가 없을 때만
      const parenMatch = filename.match(/\((\d+)\)/);
      if (parenMatch && !filename.match(/[_-]\w{8,}/)) {
        return parseInt(parenMatch[1], 10);
      }

      return null;
    };

    imageFiles.sort((a, b) => {
      const numA = extractSequenceNumber(a.name);
      const numB = extractSequenceNumber(b.name);

      // 둘 다 시퀀스 번호가 있으면: 시퀀스 번호로 정렬
      if (numA !== null && numB !== null) {
        return numA - numB;
      }

      // 시퀀스 번호가 하나만 있으면: 시퀀스 번호 있는게 우선
      if (numA !== null && numB === null) return -1;
      if (numA === null && numB !== null) return 1;

      // 둘 다 없으면: lastModified로 정렬 (오래된 순)
      return a.lastModified - b.lastModified;
    });

    console.log('📷 정렬된 이미지 순서 (시퀀스 우선 → lastModified):');
    imageFiles.forEach((f, i) => {
      const sceneNum = i === 0 ? '씬 0 (폭탄)' : i === imageFiles.length - 1 ? '씬 마지막 (구독)' : `씬 ${i}`;
      const date = new Date(f.lastModified);
      const timeStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}.${ String(date.getMilliseconds()).padStart(3,'0')}`;
      const originalName = originalNames[i] ? ` (원본: ${originalNames[i]})` : '';
      const seqNum = extractSequenceNumber(f.name);
      const seqInfo = seqNum !== null ? ` [시퀀스: ${seqNum}]` : ' [시퀀스 없음]';
      console.log(`  ${sceneNum}: ${f.name}${originalName}${seqInfo} (lastModified: ${timeStr})`);
    });

    // 직접 업로드 모드일 때만 이미지 또는 비디오 필수 체크 (SORA2는 불필요)
    if (videoFormat !== 'sora2' && imageSource === 'none' && imageFiles.length === 0 && videoFiles.length === 0) {
      return NextResponse.json(
        { error: '최소 1개 이상의 이미지 또는 비디오가 필요합니다.' },
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
    const inputPath = path.join(backendPath, 'uploads', projectName);

    // Job을 DB에 저장 (JSON의 title과 videoFormat, ttsVoice 사용)
    await createJob(user.userId, jobId, videoTitle, videoFormat as 'longform' | 'shortform' | 'sora2', undefined, ttsVoice);

    // 비동기로 영상 생성 시작
    generateVideoFromUpload(jobId, user.userId, cost, {
      backendPath,
      inputPath,
      projectName,
      jsonFile,
      imageFiles,
      videoFiles,
      imageSource,
      isAdmin: user.isAdmin || false,
      videoFormat, // 롱폼/숏폼 정보 전달
      originalNames, // 원본 파일명 매핑
      ttsVoice // TTS 음성 선택
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
    videoFiles: File[];
    imageSource: string;
    isAdmin: boolean;
    videoFormat: string; // 'longform', 'shortform', 'sora2'
    originalNames?: Record<number, string>; // 원본 파일명 매핑
    ttsVoice: string; // TTS 음성 선택
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

    // parseJsonSafely로 안전하게 파싱 (AI 설명문, 코드 블록 등 자동 제거)
    const parseResult = parseJsonSafely(jsonText, { logErrors: true });

    if (!parseResult.success) {
      throw new Error(`JSON 파싱 실패: ${parseResult.error}`);
    }

    let jsonData = parseResult.data;

    if (parseResult.fixed) {
      await addJobLog(jobId, '⚠️ JSON 자동 수정이 적용되었습니다\n');
    } else {
      await addJobLog(jobId, '✅ JSON 파싱 성공 (원본 그대로)\n');
    }

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

      await addJobLog(jobId, `\n📷 이미지 ${config.imageFiles.length}개를 저장`);
      await addJobLog(jobId, `⏰ Frontend에서 이미 정렬된 순서대로 저장 (image_00 → 씬 0)`);

      // Frontend에서 이미 image_00, image_01... 형식으로 정렬되어 전송됨
      // 파일명을 image_01, image_02... 형식으로 변경하여 저장 (Python 코드와 호환)
      for (let i = 0; i < config.imageFiles.length; i++) {
        const imgFile = config.imageFiles[i];
        const imgBuffer = Buffer.from(await imgFile.arrayBuffer());
        const ext = imgFile.name.split('.').pop() || 'jpg';

        // image_01.jpg, image_02.png 형식으로 저장 (1부터 시작)
        const finalPath = path.join(config.inputPath, `image_${String(i + 1).padStart(2, '0')}.${ext}`);
        await fs.writeFile(finalPath, imgBuffer);

        const sceneLabel = i === 0 ? '씬 0 (폭탄)' : i === config.imageFiles.length - 1 ? '씬 마지막' : `씬 ${i}`;

        // 원본 파일명 정보 추가
        const originalName = config.originalNames?.[i] ? ` (원본: ${config.originalNames[i]})` : '';
        await addJobLog(jobId, `  ${sceneLabel}: ${imgFile.name}${originalName} → image_${String(i + 1).padStart(2, '0')}.${ext}`);
      }
    } else if (config.imageSource === 'google') {
      await addJobLog(jobId, `\n🔍 Google Image Search를 사용하여 이미지 자동 다운로드 예정`);
    } else if (config.imageSource === 'dalle') {
      await addJobLog(jobId, `\n🎨 DALL-E 3를 사용하여 이미지 자동 생성 예정`);
    }

    // 비디오 파일 저장 (직접 업로드 모드일 때)
    if (config.imageSource === 'none' && config.videoFiles.length > 0) {
      await updateJob(jobId, {
        progress: 35,
        step: '비디오 저장 중...'
      });

      await addJobLog(jobId, `\n🎬 비디오 ${config.videoFiles.length}개를 저장`);

      for (let i = 0; i < config.videoFiles.length; i++) {
        const vidFile = config.videoFiles[i];
        const vidBuffer = Buffer.from(await vidFile.arrayBuffer());
        const ext = vidFile.name.split('.').pop() || 'mp4';

        // video_01.mp4, video_02.mp4 형식으로 저장 (1부터 시작)
        const finalPath = path.join(config.inputPath, `video_${String(i + 1).padStart(2, '0')}.${ext}`);
        await fs.writeFile(finalPath, vidBuffer);

        await addJobLog(jobId, `  비디오 ${i + 1}: ${vidFile.name} → video_${String(i + 1).padStart(2, '0')}.${ext} (${(vidFile.size / 1024 / 1024).toFixed(1)}MB)`);
      }
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
        shell: false,  // shell을 사용하지 않음 (프로세스 트리 단순화)
        detached: false,  // 부모와 함께 종료
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1'
        },
        windowsHide: true  // Windows 콘솔 창 숨김
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

      // TTS 음성 선택
      const voiceArg = ['--voice', config.ttsVoice];
      console.log(`🎤 TTS 음성: ${config.ttsVoice}`);

      // spawn으로 실시간 출력 받기 (UTF-8 인코딩 설정)
      const pythonArgs = ['create_video_from_folder.py', '--folder', `uploads/${config.projectName}`, ...imageSourceArg, ...aspectRatioArg, ...subtitlesArg, ...voiceArg, ...isAdminArg];
      console.log(`🐍 Python 명령어: python ${pythonArgs.join(' ')}`);

      pythonProcess = spawn('python', pythonArgs, {
        cwd: config.backendPath,
        shell: false,  // shell을 사용하지 않음 (프로세스 트리 단순화)
        detached: false,  // 부모와 함께 종료
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1'
        },
        windowsHide: true  // Windows 콘솔 창 숨김
      });
    }

    // 프로세스를 맵에 저장
    runningProcesses.set(jobId, pythonProcess);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let lastProgress = 40;
    let isCancelled = false;

    // stdout 실시간 처리
    pythonProcess.stdout.on('data', async (data: Buffer) => {
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
    pythonProcess.stderr.on('data', async (data: Buffer) => {
      const text = data.toString('utf-8');
      stderrBuffer += text;
      console.error(text);
      await addJobLog(jobId, text);
    });

    // 프로세스 완료 대기
    await new Promise<void>((resolve, reject) => {
      pythonProcess.on('close', (code: number | null) => {
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

      pythonProcess.on('error', (error: Error) => {
        runningProcesses.delete(jobId);
        reject(error);
      });

      // 타임아웃 (2시간) - 강제 종료
      setTimeout(() => {
        if (runningProcesses.has(jobId) && pythonProcess.pid) {
          console.log(`⏰ 타임아웃: 프로세스 트리 강제 종료 ${jobId}, PID: ${pythonProcess.pid}`);

          // tree-kill로 프로세스 트리 전체 강제 종료
          kill(pythonProcess.pid, 'SIGKILL', (err) => {
            if (err) {
              console.error(`❌ tree-kill 실패 (타임아웃): ${err}`);
            } else {
              console.log(`✅ tree-kill 성공 (타임아웃): PID ${pythonProcess.pid}`);
            }
          });

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

    // Job 확인
    const job = await findJobById(jobId);

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

    // 1. 취소 플래그 파일 생성 (Python이 체크하도록)
    try {
      const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
      const inputFolders = await fs.readdir(path.join(backendPath, 'input'));
      const jobFolder = inputFolders.find(f => f.includes(jobId.replace('upload_', '')));

      if (jobFolder) {
        const cancelFilePath = path.join(backendPath, 'input', jobFolder, '.cancel');
        await fs.writeFile(cancelFilePath, 'cancelled by user');
        console.log(`✅ 취소 플래그 파일 생성: ${cancelFilePath}`);
        await addJobLog(jobId, '\n🚫 취소 플래그 설정됨 - Python 프로세스가 감지하면 중단됩니다.');
      } else {
        console.warn(`⚠️ Job 폴더를 찾을 수 없음: ${jobId}`);
      }
    } catch (error: any) {
      console.error(`❌ 취소 플래그 파일 생성 실패: ${error.message}`);
    }

    // 2. 프로세스 강제 종료
    const process = runningProcesses.get(jobId);

    if (process && process.pid) {
      const pid = process.pid;
      console.log(`🛑 프로세스 트리 종료 시작: Job ${jobId}, PID ${pid}`);

      try {
        // tree-kill 라이브러리로 프로세스 트리 전체 강제 종료
        await new Promise<void>((resolve, reject) => {
          kill(pid, 'SIGKILL', (err) => {
            if (err) {
              console.error(`❌ tree-kill 실패: ${err.message}`);
              reject(err);
            } else {
              console.log(`✅ tree-kill 성공: PID ${pid} 및 모든 자식 프로세스 종료`);
              resolve();
            }
          });
        });

        // 추가 정리 (Windows)
        if (process.platform === 'win32') {
          console.log('🧹 Windows 좀비 프로세스 추가 정리...');

          // ShimGen 정리
          try {
            await execAsync('taskkill /F /IM ShimGen.exe 2>nul');
            console.log('✅ ShimGen.exe 정리 완료');
          } catch {
            // ShimGen이 없으면 무시
          }

          // 고아 Python 프로세스 정리 (DALL-E 등)
          try {
            // 현재 작업 디렉토리 관련 python.exe 프로세스 찾아서 종료
            await execAsync('taskkill /F /FI "IMAGENAME eq python.exe" /FI "STATUS eq RUNNING" 2>nul');
            console.log('✅ 고아 Python 프로세스 정리 시도');
          } catch {
            // 프로세스가 없으면 무시
          }
        }

        // 맵에서 제거
        runningProcesses.delete(jobId);
        console.log(`✅ runningProcesses에서 제거: ${jobId}`);

      } catch (error: any) {
        console.error(`❌ 프로세스 종료 실패: ${error.message}`);

        // 에러 발생해도 맵에서 제거
        runningProcesses.delete(jobId);

        // 강제 종료 재시도 (Windows만)
        if (process.platform === 'win32') {
          console.log('🔄 강제 종료 재시도...');
          try {
            await execAsync(`taskkill /F /T /PID ${pid}`);
            console.log('✅ taskkill 재시도 성공');
          } catch (retryErr: any) {
            console.error(`❌ taskkill 재시도도 실패: ${retryErr.message}`);
          }
        }

        // 관리자에게 메일 발송
        await sendProcessKillFailureEmail(
          jobId,
          pid,
          user.userId,
          `프로세스 종료 실패: ${error.message}`
        );
      }
    } else {
      console.log(`⚠️ 실행 중인 프로세스 없음: ${jobId}`);
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
