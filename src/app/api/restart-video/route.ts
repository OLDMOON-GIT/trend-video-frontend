import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { getCurrentUser } from '@/lib/session';
import { findJobById, updateJob, addJobLog, getSettings, deductCredits, addCredits, addCreditHistory, createJob } from '@/lib/db';

// 실행 중인 프로세스 맵
const runningProcesses = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { jobId } = await request.json();

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

    console.log(`🔄 작업 재시작 요청: ${jobId} (${job.status}) by ${user.email}`);

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
    await addCreditHistory(user.userId, 'use', -cost, '영상 재생성');

    // 프로젝트 폴더명 추출
    let oldProjectName: string;

    if (job.videoPath) {
      // videoPath가 있으면 거기서 추출
      // videoPath 예시: ../trend-video-backend/input/uploaded_upload_123.../generated_videos/final_video.mp4
      const pathParts = job.videoPath.split('/');
      const inputIndex = pathParts.findIndex(p => p === 'input');
      if (inputIndex !== -1 && inputIndex + 1 < pathParts.length) {
        oldProjectName = pathParts[inputIndex + 1];
        console.log(`🔍 videoPath에서 프로젝트 폴더명 추출: ${oldProjectName}`);
      } else {
        // videoPath 파싱 실패 시 jobId로 폴백
        oldProjectName = `uploaded_${jobId}`;
        console.log(`🔍 jobId로 프로젝트 폴더명 생성: ${oldProjectName}`);
      }
    } else {
      // videoPath가 없으면 jobId로 추출 (upload_xxx... -> uploaded_upload_xxx...)
      oldProjectName = `uploaded_${jobId}`;
      console.log(`🔍 jobId로 프로젝트 폴더명 생성: ${oldProjectName}`);
    }

    // 새로운 jobId 생성
    const newJobId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newProjectName = `uploaded_${newJobId}`;

    // 새로운 Job을 DB에 생성 (제목은 job.title 사용)
    await createJob(user.userId, newJobId, `${job.title || 'Untitled'} (재생성)`);

    // 비동기로 영상 생성 재시작 (새 jobId로)
    restartVideoGeneration(newJobId, user.userId, cost, oldProjectName, newProjectName, user.isAdmin || false);

    return NextResponse.json({
      success: true,
      jobId: newJobId,
      message: '작업이 재시작되었습니다.'
    });

  } catch (error: any) {
    console.error('Error restarting video:', error);
    return NextResponse.json(
      { error: error?.message || '작업 재시작 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

async function restartVideoGeneration(newJobId: string, userId: string, creditCost: number, oldProjectName: string, newProjectName: string, isAdmin: boolean) {
  try {
    // 작업 시작 로그
    await updateJob(newJobId, {
      status: 'processing',
      progress: 5,
      step: '재시작 준비 중...'
    });

    await addJobLog(newJobId, `${'='.repeat(70)}\n🔄 영상 재생성 시작\n📂 기존 프로젝트: ${oldProjectName}\n📂 새 프로젝트: ${newProjectName}\n${'='.repeat(70)}`);

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const oldFolderPath = path.join(backendPath, 'input', oldProjectName);
    const newFolderPath = path.join(backendPath, 'input', newProjectName);

    // 기존 폴더 존재 확인
    try {
      await fs.access(oldFolderPath);
    } catch (error) {
      throw new Error(`기존 프로젝트 폴더를 찾을 수 없습니다: ${oldProjectName}`);
    }

    // 새 폴더 생성 및 리소스 복사
    await updateJob(newJobId, {
      progress: 10,
      step: '프로젝트 리소스 복사 중...'
    });

    await addJobLog(newJobId, `\n📁 새 프로젝트 폴더 생성: ${newFolderPath}`);
    await fs.mkdir(newFolderPath, { recursive: true });

    // story.json 파일 복사
    const allFiles = await fs.readdir(oldFolderPath);

    // generated_videos, audio, temp 등 생성된 폴더는 제외
    const storyFiles = [];
    for (const file of allFiles) {
      const stat = await fs.stat(path.join(oldFolderPath, file));
      if (stat.isFile()) {
        storyFiles.push(file);
      }
    }

    const storyJsonFile = storyFiles.find(f => f.includes('story') && f.endsWith('.json'));

    if (storyJsonFile) {
      // JSON 파일 읽고 scene_number 추가
      const storyJsonPath = path.join(oldFolderPath, storyJsonFile);
      const jsonText = await fs.readFile(storyJsonPath, 'utf-8');
      let jsonData = JSON.parse(jsonText);

      // Python 스크립트를 위해 scene_number 필드 추가
      if (jsonData.scenes && Array.isArray(jsonData.scenes)) {
        jsonData.scenes = jsonData.scenes.map((scene: any, index: number) => ({
          ...scene,
          scene_number: index + 1
        }));
      }

      await fs.writeFile(
        path.join(newFolderPath, storyJsonFile),
        JSON.stringify(jsonData, null, 2)
      );
      await addJobLog(newJobId, `✅ ${storyJsonFile} 복사 완료 (scene_number 추가)`);
    } else {
      throw new Error('story.json 파일을 찾을 수 없습니다.');
    }

    // 모든 이미지 파일들 복사 (.jpg, .png, .jpeg)
    const imageFiles = storyFiles.filter(f =>
      f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg')
    );

    let hasImages = false;

    if (imageFiles.length > 0) {
      await addJobLog(newJobId, `\n📷 이미지 파일 ${imageFiles.length}개 복사 중...`);
      for (const imageFile of imageFiles) {
        await fs.copyFile(
          path.join(oldFolderPath, imageFile),
          path.join(newFolderPath, imageFile)
        );
      }
      await addJobLog(newJobId, `✅ 이미지 ${imageFiles.length}개 복사 완료`);
      hasImages = true;
    } else {
      await addJobLog(newJobId, `⚠️  복사할 이미지 파일이 없습니다. DALL-E로 생성합니다.`);
      hasImages = false;
    }

    await updateJob(newJobId, {
      progress: 20,
      step: '영상 생성 시작...'
    });

    // 이미지가 있으면 none, 없으면 dalle
    const imageSourceArg = hasImages ? ['--image-source', 'none'] : ['--image-source', 'dalle'];
    const isAdminArg = isAdmin ? ['--is-admin'] : [];

    // 비율 설정 (16:9 가로형 롱폼)
    const aspectRatioArg = ['--aspect-ratio', '16:9'];

    await addJobLog(newJobId, `\n🎨 이미지 소스: ${hasImages ? 'none (기존 이미지 사용)' : 'dalle (새로 생성)'}`);
    await addJobLog(newJobId, `📐 비율: 16:9 (가로형 롱폼)`);

    const pythonArgs = ['create_video_from_folder.py', '--folder', `input/${newProjectName}`, ...imageSourceArg, ...aspectRatioArg, ...isAdminArg];
    console.log(`🐍 Python 재시작 명령어: python ${pythonArgs.join(' ')}`);

    await addJobLog(newJobId, `\n🐍 명령어: python ${pythonArgs.join(' ')}`);

    const pythonProcess = spawn('python', pythonArgs, {
      cwd: backendPath,
      shell: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      }
    });

    runningProcesses.set(newJobId, pythonProcess);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let lastProgress = 10;

    // stdout 실시간 처리
    pythonProcess.stdout.on('data', async (data) => {
      const text = data.toString('utf-8');
      stdoutBuffer += text;
      console.log(text);

      // 로그를 줄 단위로 처리
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          await addJobLog(newJobId, line);
        }
      }

      // 진행률 추정
      if (text.includes('TTS 음성 생성') || text.includes('TTS')) {
        lastProgress = Math.min(50, lastProgress + 2);
        await updateJob(newJobId, { progress: lastProgress, step: 'TTS 음성 생성 중...' });
      } else if (text.includes('이미지 생성') || text.includes('DALL-E') || text.includes('image')) {
        lastProgress = Math.min(70, lastProgress + 2);
        await updateJob(newJobId, { progress: lastProgress, step: '이미지 생성 중...' });
      } else if (text.includes('장면 처리') || text.includes('Scene') || text.includes('씬') || text.includes('scene')) {
        lastProgress = Math.min(85, lastProgress + 2);
        await updateJob(newJobId, { progress: lastProgress, step: '장면 영상 처리 중...' });
      } else if (text.includes('병합') || text.includes('merge') || text.includes('concat')) {
        lastProgress = 90;
        await updateJob(newJobId, { progress: lastProgress, step: '최종 영상 병합 중...' });
      }
    });

    // stderr 실시간 처리
    pythonProcess.stderr.on('data', async (data) => {
      const text = data.toString('utf-8');
      stderrBuffer += text;
      console.error(text);

      // stderr도 줄 단위로 로그에 추가
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          await addJobLog(newJobId, line);
        }
      }
    });

    // 프로세스 완료 대기
    await new Promise<void>((resolve, reject) => {
      pythonProcess.on('close', async (code) => {
        runningProcesses.delete(newJobId);

        if (code === 0) {
          console.log(`✅ 작업 재시작 성공: ${newJobId}`);
          await updateJob(newJobId, {
            status: 'completed',
            progress: 100,
            step: '완료',
            videoPath: `../trend-video-backend/input/${newProjectName}/generated_videos/final_video.mp4`
          });
          await addJobLog(newJobId, '\n✅ 영상 생성 완료!');
        } else {
          console.error(`❌ 작업 재시작 실패: ${newJobId}, 종료 코드: ${code}`);
          await updateJob(newJobId, {
            status: 'failed',
            error: `Python 스크립트 실행 실패 (종료 코드: ${code})`
          });
          await addJobLog(newJobId, `\n❌ 영상 생성 실패 (종료 코드: ${code})`);
        }

        resolve();
      });

      pythonProcess.on('error', async (error) => {
        runningProcesses.delete(newJobId);
        console.error(`❌ 작업 재시작 오류: ${newJobId}`, error);
        await updateJob(newJobId, {
          status: 'failed',
          error: `프로세스 실행 오류: ${error.message}`
        });
        reject(error);
      });

      // 타임아웃 (2시간)
      setTimeout(() => {
        if (runningProcesses.has(newJobId)) {
          pythonProcess.kill();
          runningProcesses.delete(newJobId);
          reject(new Error('Python 실행 시간 초과 (2시간)'));
        }
      }, 120 * 60 * 1000);
    });

  } catch (error: any) {
    console.error(`❌ 재시작 중 오류: ${newJobId}`, error);

    // 실패 시 크레딧 환불
    await addCredits(userId, creditCost);
    await addCreditHistory(userId, 'refund', creditCost, '영상 재생성 실패 환불');
    console.log(`💰 크레딧 환불: ${userId}, ${creditCost} 크레딧 환불 (영상 재생성 실패)`);

    await updateJob(newJobId, {
      status: 'failed',
      error: error?.message || '알 수 없는 오류'
    });
    await addJobLog(newJobId, `\n❌ 오류 발생: ${error?.message || '알 수 없는 오류'}`);
    await addJobLog(newJobId, `\n💰 ${creditCost} 크레딧이 환불되었습니다.`);
  }
}
