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
    // 내부 요청 확인 (자동화 시스템)
    const isInternal = request.headers.get('X-Internal-Request') === 'automation-system';
    console.log('=== 영상 생성 요청 시작 ===');
    console.log('내부 요청:', isInternal);

    let user: any;
    let userId: string;
    let jsonFile: File | null = null;
    let imageSource: string;
    let imageModel: string;
    let videoFormat: string;
    let ttsVoice: string;
    let videoTitle: string;
    let promptFormat: string = '';
    let originalNames: Record<number, string> = {};

    let scriptId: string | undefined;

    if (isInternal) {
      // 내부 요청: JSON으로 받음
      const body = await request.json();
      userId = body.userId;
      imageSource = body.imageSource || 'none';
      imageModel = body.imageModel || 'dalle3';
      videoFormat = body.videoFormat || 'shortform';
      ttsVoice = body.ttsVoice || 'ko-KR-SoonBokNeural';
      videoTitle = body.title || 'Untitled';
      scriptId = body.scriptId; // 자동화용: 이미 업로드된 이미지 폴더

      if (!userId) {
        console.log('❌ 내부 요청: userId가 필요합니다');
        return NextResponse.json(
          { error: 'Internal request requires userId' },
          { status: 400 }
        );
      }

      // JSON을 File 객체로 변환
      const jsonBlob = new Blob([JSON.stringify(body.storyJson, null, 2)], { type: 'application/json' });
      jsonFile = new File([jsonBlob], 'story.json', { type: 'application/json' });

      // 관리자로 간주 (크레딧 차감 안함)
      user = {
        userId,
        email: 'automation-system',
        isAdmin: true
      };

      console.log('✅ 내부 요청 인증:', user);
    } else {
      // 일반 요청: 쿠키로 사용자 인증
      console.log('쿠키:', request.cookies.getAll());
      user = await getCurrentUser(request);
      console.log('인증된 사용자:', user);

      if (!user) {
        console.log('❌ 인증 실패: 로그인이 필요합니다');
        return NextResponse.json(
          { error: '로그인이 필요합니다.' },
          { status: 401 }
        );
      }

      userId = user.userId;
      console.log('✅ 인증 성공:', user.email);

      // FormData 파싱
      const formDataGeneral = await request.formData();
      jsonFile = formDataGeneral.get('json') as File;
      imageSource = formDataGeneral.get('imageSource') as string || 'none';
      imageModel = formDataGeneral.get('imageModel') as string || 'dalle3';
      videoFormat = formDataGeneral.get('videoFormat') as string || 'longform';
      ttsVoice = formDataGeneral.get('ttsVoice') as string || 'ko-KR-SoonBokNeural';
      promptFormat = formDataGeneral.get('promptFormat') as string || '';
      const originalNamesStr = formDataGeneral.get('originalNames') as string;
      if (originalNamesStr) {
        try {
          originalNames = JSON.parse(originalNamesStr);
          console.log('✅ 원본 파일명 매핑 정보 수신:', originalNames);
        } catch (error) {
          console.warn('⚠️ 원본 파일명 파싱 실패, 변환된 이름만 사용');
        }
      }

      // 미디어 파일을 저장할 배열 생성 (일반 요청용)
      (global as any).tempMediaFiles = [];
      for (let i = 0; i < 100; i++) {
        const media = formDataGeneral.get(`media_${i}`) as File;
        if (media) {
          const mediaType: 'image' | 'video' = media.type.startsWith('image/') ? 'image' : 'video';
          (global as any).tempMediaFiles.push({ file: media, mediaType });
        }
      }

      // JSON 파일에서 제목 추출
      videoTitle = 'Untitled';
      try {
        const jsonText = await jsonFile.text();
        const parseResult = parseJsonSafely(jsonText, { logErrors: true });
        if (parseResult.success && parseResult.data?.title) {
          videoTitle = parseResult.data.title;
          console.log('✅ JSON 제목 추출 성공:', videoTitle);
        }
      } catch (error) {
        console.log('❌ JSON title 추출 중 오류, 기본 제목 사용');
      }

      console.log('프롬프트 포맷:', promptFormat);

      // 상품 타입이면 title 앞에 [광고] 추가
      if (promptFormat === 'product' || promptFormat === 'product-info') {
        if (!videoTitle.startsWith('[광고]')) {
          videoTitle = `[광고] ${videoTitle}`;
          console.log('✅ 상품 영상 - title에 [광고] 추가:', videoTitle);
        }
      }
    }

    if (!jsonFile) {
      return NextResponse.json(
        { error: 'JSON 파일이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('이미지 소스:', imageSource);
    console.log('TTS 음성:', ttsVoice);
    console.log('이미지 모델:', imageModel);

    // 비디오 포맷 확인 (longform, shortform, sora2)
    console.log('비디오 포맷:', videoFormat);

    // 미디어 파일들 수집 (통합 인덱스로 순서 보존!)
    type MediaFile = File & { mediaType: 'image' | 'video' };
    let allMediaFiles: MediaFile[] = [];

    if (!isInternal && (global as any).tempMediaFiles) {
      allMediaFiles = (global as any).tempMediaFiles.map((item: any) =>
        Object.assign(item.file, { mediaType: item.mediaType })
      );
      delete (global as any).tempMediaFiles;

      console.log('📷 수신된 미디어 순서 (Frontend 정렬 그대로 유지):');
      allMediaFiles.forEach((f, i) => {
        const mediaIcon = f.mediaType === 'image' ? '🖼️' : '🎬';
        const originalName = originalNames[i] ? ` (원본: ${originalNames[i]})` : '';
        console.log(`  ${i + 1}. ${mediaIcon} ${f.name}${originalName}`);
      });
    }

    // 직접 업로드 모드일 때만 이미지 또는 비디오 필수 체크 (SORA2는 불필요, 내부 요청은 이미 폴더에 있음)
    if (!isInternal && videoFormat !== 'sora2' && imageSource === 'none' && allMediaFiles.length === 0) {
      return NextResponse.json(
        { error: '최소 1개 이상의 이미지 또는 비디오가 필요합니다.' },
        { status: 400 }
      );
    }

    // 크레딧 차감 (내부 요청은 차감 안함)
    const settings = await getSettings();
    const cost = settings.videoGenerationCost;

    if (!isInternal) {
      // 일반 요청만 크레딧 차감
      const deductResult = await deductCredits(userId, cost);

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
      await addCreditHistory(userId, 'use', -cost, '영상 생성');
    } else {
      console.log(`✅ 내부 요청: 크레딧 차감 생략`);
    }

    // trend-video-backend 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    // 자동화 요청인 경우 이미 업로드된 폴더 사용, 일반 요청인 경우 새 폴더 생성
    let jobId: string;
    let projectName: string;
    let inputPath: string;

    if (scriptId) {
      // 자동화: 이미 업로드된 폴더 사용
      jobId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      projectName = `project_${scriptId}`;
      inputPath = path.join(backendPath, 'input', projectName);
      console.log(`🔄 [자동화] 기존 폴더 사용: ${inputPath}`);
    } else {
      // 일반: 새 폴더 생성
      jobId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      projectName = `uploaded_${jobId}`;
      inputPath = path.join(backendPath, 'uploads', projectName);
      console.log(`📁 [일반] 새 폴더 생성: ${inputPath}`);
    }

    // JSON에서 카테고리 읽기
    let category: string | undefined;
    try {
      const jsonContent = await jsonFile.text();
      const jsonData = JSON.parse(jsonContent);
      category = jsonData.metadata?.category || jsonData.category;
      if (category) {
        console.log('🎭 대본 카테고리:', category);
      }
    } catch (error) {
      console.log('⚠️ JSON에서 카테고리를 읽을 수 없습니다:', error);
    }

    // Job을 DB에 저장 (JSON의 title과 videoFormat, ttsVoice, category 사용)
    await createJob(userId, jobId, videoTitle, videoFormat as 'longform' | 'shortform' | 'sora2', undefined, ttsVoice, category);

    // 비동기로 영상 생성 시작
    generateVideoFromUpload(jobId, userId, cost, {
      backendPath,
      inputPath,
      projectName,
      jsonFile,
      allMediaFiles, // 이미지+비디오 통합 정렬된 배열
      imageSource,
      isAdmin: user.isAdmin || false,
      videoFormat, // 롱폼/숏폼 정보 전달
      originalNames, // 원본 파일명 매핑
      ttsVoice, // TTS 음성 선택
      imageModel, // 이미지 생성 모델
      scriptId // 자동화용: 이미 업로드된 폴더 식별자
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
    allMediaFiles: Array<File & { mediaType: 'image' | 'video' }>; // 이미지+비디오 통합 정렬된 배열
    imageSource: string;
    isAdmin: boolean;
    videoFormat: string; // 'longform', 'shortform', 'sora2'
    originalNames?: Record<number, string>; // 원본 파일명 매핑
    ttsVoice: string; // TTS 음성 선택
    imageModel: string; // 이미지 생성 모델 ('dalle3', 'imagen3')
    scriptId?: string; // 자동화용: 이미 업로드된 폴더 식별자
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

    // 3. 이미지+비디오 파일 저장 (직접 업로드 모드일 때만)
    if (config.imageSource === 'none' && config.allMediaFiles.length > 0) {
      await updateJob(jobId, {
        progress: 30,
        step: '미디어 파일 저장 중...'
      });

      const imageFiles = config.allMediaFiles.filter(f => f.mediaType === 'image');
      const videoFiles = config.allMediaFiles.filter(f => f.mediaType === 'video');

      await addJobLog(jobId, `\n📷🎬 미디어 ${config.allMediaFiles.length}개 저장 (이미지: ${imageFiles.length}개, 비디오: ${videoFiles.length}개)`);
      await addJobLog(jobId, `⏰ Frontend에서 시퀀스 번호로 통합 정렬된 순서대로 저장 (통합 시퀀스 유지)`);

      // Frontend에서 이미 시퀀스 번호로 정렬되어 전송됨
      // 통합 시퀀스 번호를 파일명에 포함하여 저장 (Python backend에서 다시 통합 정렬 시 순서 유지)
      for (let i = 0; i < config.allMediaFiles.length; i++) {
        const file = config.allMediaFiles[i];
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split('.').pop() || (file.mediaType === 'image' ? 'jpg' : 'mp4');

        // 통합 시퀀스 번호 (i+1)를 파일명에 포함
        const unifiedSeq = String(i + 1).padStart(2, '0');

        if (file.mediaType === 'image') {
          const finalPath = path.join(config.inputPath, `${unifiedSeq}.${ext}`);
          await fs.writeFile(finalPath, buffer);

          const originalName = config.originalNames?.[i] ? ` (원본: ${config.originalNames[i]})` : '';
          await addJobLog(jobId, `  🖼️  [통합 #${i + 1}] ${file.name}${originalName} → ${unifiedSeq}.${ext}`);
        } else {
          const finalPath = path.join(config.inputPath, `${unifiedSeq}.${ext}`);
          await fs.writeFile(finalPath, buffer);

          const originalName = config.originalNames?.[i] ? ` (원본: ${config.originalNames[i]})` : '';
          await addJobLog(jobId, `  🎬 [통합 #${i + 1}] ${file.name}${originalName} → ${unifiedSeq}.${ext} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
        }
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

      const pythonArgs = ['-m', 'src.sora.main', '-f', `prompts/temp_${jobId}.txt`, '-d', '8', '-s', '720x1280', '--job-id', jobId];
      console.log(`🎬 trend-video-backend 명령어: python ${pythonArgs.join(' ')}`);
      await addJobLog(jobId, `\n🎬 SORA2 모드: trend-video-backend 실행\n🆔 Job ID: ${jobId}\n📝 프롬프트: ${promptText.substring(0, 100)}...\n`);

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

      // 이미지 생성 모델 선택 (dalle3 -> openai, imagen3 -> imagen3)
      const imageProviderMap: Record<string, string> = {
        'dalle3': 'openai',
        'imagen3': 'imagen3'
      };
      const imageProvider = imageProviderMap[config.imageModel] || 'openai';
      const imageProviderArg = ['--image-provider', imageProvider];
      console.log(`🎨 이미지 생성 모델: ${config.imageModel} (provider: ${imageProvider})`);

      // spawn으로 실시간 출력 받기 (UTF-8 인코딩 설정)
      const jobIdArg = ['--job-id', jobId];
      // 자동화인 경우 input/ 폴더, 일반인 경우 uploads/ 폴더 사용
      const folderPrefix = config.scriptId ? 'input' : 'uploads';
      const pythonArgs = ['create_video_from_folder.py', '--folder', `${folderPrefix}/${config.projectName}`, ...imageSourceArg, ...aspectRatioArg, ...subtitlesArg, ...voiceArg, ...imageProviderArg, ...isAdminArg, ...jobIdArg];
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
    let latestOutputDir: string | undefined;

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
      latestOutputDir = path.join(outputPath, sortedNewDirs[0]);
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
      // 프로젝트 루트에서 최종 영상 찾기 (영상병합과 같은 위치)
      const files = await fs.readdir(config.inputPath);

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

      videoPath = path.join(config.inputPath, videoFile);
      await addJobLog(jobId, `\n✅ 최종 영상 발견: ${videoFile}`);
    }

    // 썸네일 찾기 (영상과 같은 위치)
    let thumbnailPath: string | undefined;

    console.log('📸 썸네일 검색 시작...');
    console.log('  프로젝트 폴더:', config.inputPath);

    try {
      if (config.videoFormat === 'sora2' && latestOutputDir) {
        // SORA2는 latestOutputDir에서 찾기
        const files = await fs.readdir(latestOutputDir);
        const thumbnailFile = files.find(f =>
          (f === 'thumbnail.jpg' || f === 'thumbnail.png' ||
           f.includes('thumbnail') && (f.endsWith('.jpg') || f.endsWith('.png')))
        );
        if (thumbnailFile) {
          thumbnailPath = path.join(latestOutputDir, thumbnailFile);
          console.log('✅ SORA2 썸네일 발견:', thumbnailPath);
        }
      } else {
        // 일반: inputPath에서 찾기 (영상병합과 같은 위치)
        const inputFiles = await fs.readdir(config.inputPath);
        console.log('  폴더 파일들:', inputFiles);
        const inputThumbnailFile = inputFiles.find(f =>
          (f === 'thumbnail.jpg' || f === 'thumbnail.png' ||
           f.includes('thumbnail') && (f.endsWith('.jpg') || f.endsWith('.png')))
        );

        if (inputThumbnailFile) {
          thumbnailPath = path.join(config.inputPath, inputThumbnailFile);
          console.log('✅ 썸네일 발견:', thumbnailPath);
        } else {
          console.log('❌ 썸네일 파일을 찾을 수 없습니다.');
        }
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
    await addJobLog(jobId, `\n${'='.repeat(70)}\n❌ 오류 발생 - Job ID: ${jobId}\n오류 내용: ${error.message}\n${'='.repeat(70)}`);

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
      videoId: jobId,  // automation에서 사용할 videoId 추가
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
    const runningProcess = runningProcesses.get(jobId);

    if (runningProcess && runningProcess.pid) {
      const pid = runningProcess.pid;
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
