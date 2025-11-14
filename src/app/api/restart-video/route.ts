import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { getCurrentUser } from '@/lib/session';
import { findJobById, updateJob, addJobLog, getSettings, deductCredits, addCredits, addCreditHistory, createJob, flushJobLogs } from '@/lib/db';
import kill from 'tree-kill';
import { sendProcessKillFailureEmail, sendProcessKillTimeoutEmail } from '@/utils/email';
import { parseJsonSafely } from '@/lib/json-utils';

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

    // ⛔ CRITICAL FEATURE: 영상 재생성 - uploads 폴더 지원
    // 버그 이력: 2025-01-12 - uploads 폴더 미지원으로 "폴더를 찾을 수 없습니다" 에러
    // ❌ 절대 'uploads' 타입 제거 금지!
    // 관련 문서: CRITICAL_FEATURES.md
    let oldProjectName: string;
    let folderType: 'input' | 'output' | 'uploads' = 'input'; // 기본값은 input

    if (job.videoPath) {
      // videoPath가 있으면 거기서 추출
      // videoPath 예시:
      // - input: ../trend-video-backend/input/uploaded_upload_123.../generated_videos/final_video.mp4
      // - output: ../trend-video-backend/output/merge_xxxxx/최종영상.mp4
      // - uploads: ../trend-video-backend/uploads/uploaded_upload_123.../최종영상.mp4
      //   또는: C:\Users\...\trend-video-backend\output\merge_xxxxx\최종영상.mp4 (Windows 절대 경로)

      console.log(`🔍 videoPath 원본: ${job.videoPath}`);

      // Windows 백슬래시를 슬래시로 변환
      const normalizedPath = job.videoPath.replace(/\\/g, '/');
      const pathParts = normalizedPath.split('/');

      // uploads 폴더 체크 (업로드로 생성된 경우)
      const uploadsIndex = pathParts.findIndex(p => p === 'uploads');
      if (uploadsIndex !== -1 && uploadsIndex + 1 < pathParts.length) {
        oldProjectName = pathParts[uploadsIndex + 1];
        folderType = 'uploads';
        console.log(`🔍 uploads 폴더에서 프로젝트명 추출: ${oldProjectName}`);
      } else {
        // input 폴더 체크
        const inputIndex = pathParts.findIndex(p => p === 'input');
        if (inputIndex !== -1 && inputIndex + 1 < pathParts.length) {
          oldProjectName = pathParts[inputIndex + 1];
          folderType = 'input';
          console.log(`🔍 input 폴더에서 프로젝트명 추출: ${oldProjectName}`);
        } else {
          // output 폴더 체크 (video-merge로 생성된 경우)
          const outputIndex = pathParts.findIndex(p => p === 'output');
          if (outputIndex !== -1 && outputIndex + 1 < pathParts.length) {
            oldProjectName = pathParts[outputIndex + 1];
            folderType = 'output';
            console.log(`🔍 output 폴더에서 프로젝트명 추출: ${oldProjectName}`);
          } else {
            // videoPath 파싱 실패 시 jobId로 폴백
            oldProjectName = `uploaded_${jobId}`;
            folderType = 'uploads';
            console.log(`⚠️ videoPath 파싱 실패, jobId로 폴백: ${oldProjectName}`);
            console.log(`   pathParts:`, pathParts);
          }
        }
      }
    } else {
      // videoPath가 없으면 jobId로 추출 (upload_xxx... -> uploaded_upload_xxx...)
      oldProjectName = `uploaded_${jobId}`;
      folderType = 'uploads';
      console.log(`🔍 jobId로 프로젝트 폴더명 생성: ${oldProjectName}`);
    }

    // 새로운 jobId 생성
    const newJobId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newProjectName = `uploaded_${newJobId}`;

    // 새로운 Job을 DB에 생성 (제목은 job.title 사용)
    await createJob(user.userId, newJobId, `${job.title || 'Untitled'} (재생성)`);

    // 비동기로 영상 생성 재시작 (새 jobId로)
    restartVideoGeneration(newJobId, user.userId, cost, oldProjectName, newProjectName, user.isAdmin || false, folderType);

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

// DELETE: 재시작 작업 중지
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

    // 이미 완료되거나 실패한 작업은 취소 불가
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json(
        { error: '이미 완료되거나 실패한 작업입니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 재시작 작업 취소 요청: ${jobId} by ${user.email}`);

    // 실행 중인 프로세스 확인 및 종료
    const process = runningProcesses.get(jobId);

    if (process && process.pid) {
      console.log(`🛑 작업 취소 요청 (프로세스 트리 강제 종료): ${jobId}, PID: ${process.pid}`);

      const pid = process.pid;
      let killSucceeded = false;

      // tree-kill로 프로세스 트리 전체 강제 종료
      kill(pid, 'SIGKILL', async (err) => {
        if (err) {
          console.error(`❌ tree-kill 실패: ${err}`);
          await sendProcessKillFailureEmail(jobId, pid, user.userId, `tree-kill 실패: ${err.message || String(err)}`);
        } else {
          console.log(`✅ tree-kill 성공: PID ${pid}`);
          killSucceeded = true;
        }
      });

      // 프로세스 종료 타임아웃 체크 (5초 후)
      setTimeout(async () => {
        if (!killSucceeded) {
          console.warn(`⏱️ 프로세스 종료 타임아웃: PID ${pid}`);
          await sendProcessKillTimeoutEmail(jobId, pid, user.userId, 5);
        }
      }, 5000);

      runningProcesses.delete(jobId);
    } else {
      console.log(`⚠️  실행 중인 프로세스가 없습니다: ${jobId}`);
    }

    // 크레딧 설정 가져오기
    const settings = await getSettings();
    const cost = settings.videoGenerationCost;

    // Job 상태 업데이트
    await updateJob(jobId, {
      status: 'cancelled',
      error: '사용자가 취소함'
    });

    // 로그 플러시
    await flushJobLogs();

    // 로그 추가
    await addJobLog(jobId, '\n\n🛑 사용자가 작업을 취소했습니다.');

    // 크레딧 환불
    await addCredits(user.userId, cost);
    await addCreditHistory(user.userId, 'refund', cost, '재시작 작업 취소 환불');
    await addJobLog(jobId, `💰 ${cost} 크레딧이 환불되었습니다.`);

    console.log(`✅ 재시작 작업 취소 완료: ${jobId}, ${cost} 크레딧 환불`);

    return NextResponse.json({
      success: true,
      message: '작업이 취소되었습니다.',
      refundedCredits: cost
    });

  } catch (error: any) {
    console.error('Error cancelling restart job:', error);
    return NextResponse.json(
      { error: error?.message || '작업 취소 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

async function restartVideoGeneration(newJobId: string, userId: string, creditCost: number, oldProjectName: string, newProjectName: string, isAdmin: boolean, folderType: 'input' | 'output' | 'uploads' = 'input') {
  try {
    // 작업 시작 로그
    await updateJob(newJobId, {
      status: 'processing',
      progress: 5,
      step: '재시작 준비 중...'
    });

    await addJobLog(newJobId, `${'='.repeat(70)}\n🔄 영상 재생성 시작\n📂 기존 프로젝트: ${oldProjectName} (${folderType})\n📂 새 프로젝트: ${newProjectName}\n${'='.repeat(70)}`);

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    // folderType에 따라 완전히 다른 로직 실행
    if (folderType === 'output') {
      // video-merge 재시도
      await restartVideoMerge(newJobId, userId, creditCost, oldProjectName, backendPath);
      return;
    }

    // 이하 기존 로직 (input 또는 uploads 폴더 롱폼 재생성)
    // uploads 폴더도 input처럼 처리 (같은 구조)
    const sourceFolderType = folderType === 'uploads' ? 'uploads' : 'input';
    const oldFolderPath = path.join(backendPath, sourceFolderType, oldProjectName);
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

    // input, uploads 폴더에서 story.json 찾기 (output은 이미 위에서 early return됨)
    await addJobLog(newJobId, `🔍 ${folderType} 폴더에서 story.json 검색...`);
    const storyJsonFile = storyFiles.find(f => f.includes('story') && f.endsWith('.json'));

    if (storyJsonFile) {
      // JSON 파일 읽고 scene_number 추가 (유도리있는 파서 사용)
      const storyJsonPath = path.join(oldFolderPath, storyJsonFile);
      const jsonText = await fs.readFile(storyJsonPath, 'utf-8');
      const parseResult = parseJsonSafely(jsonText, { logErrors: true });

      if (!parseResult.success) {
        throw new Error('story.json 파싱 실패: ' + parseResult.error);
      }

      let jsonData = parseResult.data;
      if (parseResult.fixed) {
        console.log('🔧 story.json 자동 수정 적용됨');
      }

      // Python 스크립트를 위해 scene_number 필드 추가
      if (jsonData.scenes && Array.isArray(jsonData.scenes)) {
        jsonData.scenes = jsonData.scenes.map((scene: any, index: number) => ({
          ...scene,
          scene_number: index + 1
        }));
      }

      // 새 폴더에는 항상 story.json으로 저장 (Python 스크립트가 이 이름을 기대함)
      await fs.writeFile(
        path.join(newFolderPath, 'story.json'),
        JSON.stringify(jsonData, null, 2)
      );
      await addJobLog(newJobId, `✅ ${storyJsonFile} → story.json 복사 완료 (scene_number 추가)`);
    } else {
      throw new Error('story.json 파일을 찾을 수 없습니다.');
    }

    // 모든 이미지 파일들 복사 (.jpg, .png, .jpeg)
    const imageFiles = storyFiles.filter(f =>
      f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg')
    );

    // 모든 비디오 파일들 복사 (.mp4, .mov, .avi, .mkv)
    const videoFiles = storyFiles.filter(f =>
      f.endsWith('.mp4') || f.endsWith('.mov') || f.endsWith('.avi') || f.endsWith('.mkv')
    );

    let hasImages = false;
    let hasVideos = false;

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
    }

    if (videoFiles.length > 0) {
      await addJobLog(newJobId, `\n🎬 비디오 파일 ${videoFiles.length}개 복사 중...`);
      for (const videoFile of videoFiles) {
        await fs.copyFile(
          path.join(oldFolderPath, videoFile),
          path.join(newFolderPath, videoFile)
        );
      }
      await addJobLog(newJobId, `✅ 비디오 ${videoFiles.length}개 복사 완료`);
      hasVideos = true;
    }

    if (!hasImages && !hasVideos) {
      await addJobLog(newJobId, `⚠️  복사할 이미지/비디오 파일이 없습니다. DALL-E로 생성합니다.`);
    }

    await updateJob(newJobId, {
      progress: 20,
      step: '영상 생성 시작...'
    });

    // 이미지 또는 비디오가 있으면 none, 없으면 dalle
    const hasMedia = hasImages || hasVideos;
    const imageSourceArg = hasMedia ? ['--image-source', 'none'] : ['--image-source', 'dalle'];
    const isAdminArg = isAdmin ? ['--is-admin'] : [];

    // 비율 설정 (16:9 가로형 롱폼)
    const aspectRatioArg = ['--aspect-ratio', '16:9'];

    let mediaInfo = '';
    if (hasImages && hasVideos) {
      mediaInfo = `none (기존 이미지 ${imageFiles.length}개 + 비디오 ${videoFiles.length}개 사용)`;
    } else if (hasImages) {
      mediaInfo = `none (기존 이미지 ${imageFiles.length}개 사용)`;
    } else if (hasVideos) {
      mediaInfo = `none (기존 비디오 ${videoFiles.length}개 사용)`;
    } else {
      mediaInfo = 'dalle (새로 생성)';
    }

    await addJobLog(newJobId, `\n🎨 이미지 소스: ${mediaInfo}`);
    await addJobLog(newJobId, `📐 비율: 16:9 (가로형 롱폼)`);

    const pythonArgs = ['create_video_from_folder.py', '--folder', `input/${newProjectName}`, ...imageSourceArg, ...aspectRatioArg, ...isAdminArg];
    console.log(`🐍 Python 재시작 명령어: python ${pythonArgs.join(' ')}`);

    await addJobLog(newJobId, `\n🐍 명령어: python ${pythonArgs.join(' ')}`);

    const pythonProcess = spawn('python', pythonArgs, {
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

          // 실제 생성된 영상 파일 찾기 (프로젝트 루트)
          try {
            const files = await fs.readdir(newFolderPath);

            // story.json에서 제목 가져와서 파일명 생성 (유도리있는 파서 사용)
            let expectedFileName: string | null = null;
            try {
              const storyJsonPath = path.join(newFolderPath, 'story.json');
              const storyJsonContent = await fs.readFile(storyJsonPath, 'utf-8');
              const parseResult = parseJsonSafely(storyJsonContent, { logErrors: true });

              if (!parseResult.success) {
                throw new Error('story.json 파싱 실패: ' + parseResult.error);
              }

              const storyData = parseResult.data;
              if (parseResult.fixed) {
                console.log('🔧 story.json 자동 수정 적용됨');
                await addJobLog(newJobId, `\n🔧 story.json 자동 수정 적용됨`);
              }

              const title = storyData.title || storyData.metadata?.title || 'video';

              // 안전한 파일명으로 변환 (Python과 동일한 로직)
              const safeTitle = title.replace(/[^a-zA-Z0-9가-힣\s._-]/g, '').trim().replace(/\s+/g, '_');
              expectedFileName = `${safeTitle}.mp4`;
              await addJobLog(newJobId, `\n📝 예상 파일명: ${expectedFileName}`);
            } catch (error) {
              await addJobLog(newJobId, `\n⚠️ 제목 기반 파일명 생성 실패, 기본 탐색 진행`);
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

            if (videoFile) {
              const videoPath = path.join(newFolderPath, videoFile);
              await addJobLog(newJobId, `\n✅ 최종 영상 발견: ${videoFile}`);

              // 썸네일 찾기 (영상과 같은 위치)
              let thumbnailPath: string | undefined;
              const thumbnailFile = files.find(f =>
                (f === 'thumbnail.jpg' || f === 'thumbnail.png' ||
                 f.includes('thumbnail') && (f.endsWith('.jpg') || f.endsWith('.png')))
              );

              if (thumbnailFile) {
                thumbnailPath = path.join(newFolderPath, thumbnailFile);
              }

              await updateJob(newJobId, {
                status: 'completed',
                progress: 100,
                step: '완료',
                videoPath,
                thumbnailPath
              });
              await addJobLog(newJobId, '\n✅ 영상 생성 완료!');
            } else {
              throw new Error('생성된 영상 파일을 찾을 수 없습니다.');
            }
          } catch (error: any) {
            console.error(`❌ 영상 파일 확인 실패: ${newJobId}`, error);
            await updateJob(newJobId, {
              status: 'failed',
              error: `영상 파일을 찾을 수 없습니다: ${error.message}`
            });
            await addJobLog(newJobId, `\n❌ 영상 파일 확인 실패: ${error.message}`);
          }
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

      // 타임아웃 (2시간) - 강제 종료
      setTimeout(() => {
        if (runningProcesses.has(newJobId) && pythonProcess.pid) {
          console.log(`⏰ 타임아웃: 프로세스 트리 강제 종료 ${newJobId}, PID: ${pythonProcess.pid}`);

          // tree-kill로 프로세스 트리 전체 강제 종료
          kill(pythonProcess.pid, 'SIGKILL', (err) => {
            if (err) {
              console.error(`❌ tree-kill 실패 (타임아웃): ${err}`);
            } else {
              console.log(`✅ tree-kill 성공 (타임아웃): PID ${pythonProcess.pid}`);
            }
          });

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

// video-merge 재시도 함수
async function restartVideoMerge(newJobId: string, userId: string, creditCost: number, oldProjectName: string, backendPath: string) {
  try {
    await updateJob(newJobId, {
      progress: 10,
      step: 'video-merge 재시도 준비 중...'
    });

    const oldFolderPath = path.join(backendPath, 'output', oldProjectName);

    // 기존 폴더 확인
    try {
      await fs.access(oldFolderPath);
    } catch (error) {
      throw new Error(`기존 프로젝트 폴더를 찾을 수 없습니다: ${oldProjectName}`);
    }

    await addJobLog(newJobId, `\n📁 기존 폴더: ${oldFolderPath}`);

    // 새 output 폴더 생성
    const timestamp = Date.now();
    const newFolderPath = path.join(backendPath, 'output', `merge_${timestamp}`);
    await fs.mkdir(newFolderPath, { recursive: true });
    await addJobLog(newJobId, `📁 새 폴더: ${newFolderPath}`);

    // videos 폴더 복사
    const videosDir = path.join(oldFolderPath, 'videos');
    const newVideosDir = path.join(newFolderPath, 'videos');

    await updateJob(newJobId, {
      progress: 20,
      step: '비디오 파일 복사 중...'
    });

    try {
      await fs.access(videosDir);
      await fs.cp(videosDir, newVideosDir, { recursive: true });
      const videoFiles = await fs.readdir(newVideosDir);
      await addJobLog(newJobId, `✅ 비디오 ${videoFiles.length}개 복사 완료`);
    } catch (error) {
      throw new Error('videos 폴더를 찾을 수 없습니다');
    }

    // config.json 읽기
    const oldConfigPath = path.join(oldFolderPath, 'config.json');
    const configText = await fs.readFile(oldConfigPath, 'utf-8');
    const oldConfig = JSON.parse(configText);

    await addJobLog(newJobId, `📄 설정 읽기 완료`);

    // 비디오 경로 업데이트
    const videoFiles = await fs.readdir(newVideosDir);
    const newVideoPaths = videoFiles
      .filter(f => f.endsWith('.mp4'))
      .sort()
      .map(f => path.join(newVideosDir, f));

    // 새 config.json 생성
    const newConfig = {
      video_files: newVideoPaths,
      narration_text: oldConfig.narration_text || '',
      add_subtitles: oldConfig.add_subtitles || false,
      remove_watermark: oldConfig.remove_watermark || false,
      title: oldConfig.title || '',
      scenes: oldConfig.scenes || null,
      output_dir: newFolderPath
    };

    const newConfigPath = path.join(newFolderPath, 'config.json');
    await fs.writeFile(newConfigPath, JSON.stringify(newConfig, null, 2));

    await updateJob(newJobId, {
      progress: 30,
      step: 'video-merge 실행 중...'
    });

    await addJobLog(newJobId, `\n🚀 video_merge.py 실행 중...\n`);

    // video_merge.py 실행
    const videoMergeScript = path.join(backendPath, 'video_merge.py');
    const pythonProcess = spawn('python', [videoMergeScript, newConfigPath], {
      cwd: backendPath,
      shell: false,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      },
      windowsHide: true
    });

    runningProcesses.set(newJobId, pythonProcess);

    let stdoutBuffer = '';
    let fullOutput = ''; // 전체 출력 저장용

    pythonProcess.stdout.on('data', async (data) => {
      const text = data.toString('utf-8');
      stdoutBuffer += text;
      fullOutput += text; // 전체 출력 누적
      console.log(text);

      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          await addJobLog(newJobId, line);
        }
      }
    });

    pythonProcess.stderr.on('data', async (data) => {
      const text = data.toString('utf-8');
      console.error(text);
      await addJobLog(newJobId, `[stderr] ${text}`);
    });

    pythonProcess.on('close', async (code) => {
      runningProcesses.delete(newJobId);

      if (code === 0) {
        try {
          // 마지막 남은 버퍼도 fullOutput에 추가
          if (stdoutBuffer.trim()) {
            fullOutput += stdoutBuffer;
          }

          // 전체 출력에서 JSON 찾기 (마지막 JSON만 매칭)
          const jsonMatches = fullOutput.match(/\{[^{}]*"success"\s*:\s*true[^{}]*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            // 마지막 JSON 선택 (가장 최근 결과)
            const lastJson = jsonMatches[jsonMatches.length - 1];
            const result = JSON.parse(lastJson);
            const videoPath = result.output_video;

            await addJobLog(newJobId, `\n✅ 비디오 병합 완료!\n📁 출력: ${path.basename(videoPath)}`);

            await updateJob(newJobId, {
              status: 'completed',
              progress: 100,
              videoPath: videoPath
            });
          } else {
            console.error('❌ JSON 파싱 실패 - 전체 출력:', fullOutput);
            throw new Error('Python 스크립트 결과를 파싱할 수 없습니다.');
          }
        } catch (error: any) {
          console.error('❌ 비디오 병합 처리 실패:', error);
          await addJobLog(newJobId, `\n❌ 오류: ${error.message}`);
          await updateJob(newJobId, {
            status: 'failed',
            error: error.message
          });
          // 크레딧 환불
          await addCreditHistory(userId, 'refund', creditCost, 'video-merge 재시도 실패 환불');
          await addJobLog(newJobId, `\n💰 ${creditCost} 크레딧이 환불되었습니다.`);
        }
      } else {
        await addJobLog(newJobId, `\n❌ video_merge.py 실행 실패 (exit code: ${code})`);
        await updateJob(newJobId, {
          status: 'failed',
          error: `Python 프로세스 종료 코드: ${code}`
        });
        // 크레딧 환불
        await addCreditHistory(userId, 'refund', creditCost, 'video-merge 재시도 실패 환불');
        await addJobLog(newJobId, `\n💰 ${creditCost} 크레딧이 환불되었습니다.`);
      }
    });

  } catch (error: any) {
    console.error('❌ video-merge 재시도 실패:', error);
    await updateJob(newJobId, {
      status: 'failed',
      error: error?.message || '알 수 없는 오류'
    });
    await addJobLog(newJobId, `\n❌ 오류 발생: ${error?.message || '알 수 없는 오류'}`);
    // 크레딧 환불
    await addCreditHistory(userId, 'refund', creditCost, 'video-merge 재시도 실패 환불');
    await addJobLog(newJobId, `\n💰 ${creditCost} 크레딧이 환불되었습니다.`);
  }
}
