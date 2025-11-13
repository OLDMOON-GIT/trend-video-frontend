/**
 * 자동화 스케줄러 및 파이프라인 오케스트레이터
 * 제목 → 대본 생성 → 영상 생성 → 유튜브 업로드 → 퍼블리시
 */

import {
  getPendingSchedules,
  createPipeline,
  updatePipelineStatus,
  updateScheduleStatus,
  addPipelineLog,
  getAutomationSettings
} from './automation';
import { sendErrorEmail } from './email';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// 스케줄러 인터벌
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// 스케줄러 시작
export function startAutomationScheduler() {
  if (schedulerInterval) {
    console.log('⚠️ Scheduler is already running');
    return;
  }

  const settings = getAutomationSettings();
  const enabled = settings.enabled === 'true';
  const checkInterval = parseInt(settings.check_interval || '60') * 1000;

  if (!enabled) {
    console.log('⚠️ Automation is disabled in settings');
    return;
  }

  console.log(`✅ Automation scheduler started (checking every ${checkInterval / 1000}s)`);

  // 즉시 한 번 실행
  processPendingSchedules();

  // 주기적으로 실행
  schedulerInterval = setInterval(() => {
    processPendingSchedules();
  }, checkInterval);
}

// 스케줄러 중지
export function stopAutomationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('✅ Automation scheduler stopped');
  }
}

// 예약된 스케줄 처리
async function processPendingSchedules() {
  if (isRunning) {
    console.log('⚠️ Previous schedule processing is still running, skipping...');
    return;
  }

  isRunning = true;

  try {
    const pendingSchedules = getPendingSchedules();

    if (pendingSchedules.length === 0) {
      console.log('[Scheduler] No pending schedules');
      return;
    }

    console.log(`[Scheduler] Found ${pendingSchedules.length} pending schedule(s)`);

    for (const schedule of pendingSchedules) {
      try {
        // 스케줄 상태를 'processing'으로 변경
        updateScheduleStatus(schedule.id, 'processing');

        // 파이프라인 생성
        const pipelineIds = createPipeline(schedule.id);
        console.log(`[Scheduler] Created pipeline for schedule ${schedule.id}`);

        // 파이프라인 실행 (비동기로 실행)
        executePipeline(schedule, pipelineIds).catch(error => {
          console.error(`[Scheduler] Pipeline execution failed for ${schedule.id}:`, error);
        });

      } catch (error: any) {
        console.error(`[Scheduler] Failed to process schedule ${schedule.id}:`, error);
        updateScheduleStatus(schedule.id, 'failed');

        // 에러 이메일 전송
        await sendAutomationErrorEmail(
          schedule.id,
          'schedule_processing',
          error.message,
          { schedule }
        );
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error in processPendingSchedules:', error);
  } finally {
    isRunning = false;
  }
}

// 파이프라인 실행
async function executePipeline(schedule: any, pipelineIds: string[]) {
  const [scriptPipelineId, videoPipelineId, uploadPipelineId, publishPipelineId] = pipelineIds;
  const settings = getAutomationSettings();
  const maxRetry = parseInt(settings.max_retry || '3');

  try {
    // ============================================================
    // Stage 1: 대본 생성
    // ============================================================
    addPipelineLog(scriptPipelineId, 'info', `Starting script generation for: ${schedule.title}`);
    updatePipelineStatus(scriptPipelineId, 'running');

    const scriptResult = await generateScript(schedule, scriptPipelineId, maxRetry);

    if (!scriptResult.success) {
      throw new Error(`Script generation failed: ${scriptResult.error}`);
    }

    updatePipelineStatus(scriptPipelineId, 'completed');
    updateScheduleStatus(schedule.id, 'processing', { scriptId: scriptResult.scriptId });
    addPipelineLog(scriptPipelineId, 'info', `Script generated successfully: ${scriptResult.scriptId}`);

    // ============================================================
    // Stage 2: 영상 생성
    // ============================================================
    addPipelineLog(videoPipelineId, 'info', `Starting video generation from script: ${scriptResult.scriptId}`);
    updatePipelineStatus(videoPipelineId, 'running');

    const videoResult = await generateVideo(scriptResult.scriptId, videoPipelineId, maxRetry);

    if (!videoResult.success) {
      throw new Error(`Video generation failed: ${videoResult.error}`);
    }

    updatePipelineStatus(videoPipelineId, 'completed');
    updateScheduleStatus(schedule.id, 'processing', { videoId: videoResult.videoId });
    addPipelineLog(videoPipelineId, 'info', `Video generated successfully: ${videoResult.videoId}`);

    // ============================================================
    // Stage 3: 유튜브 업로드
    // ============================================================
    addPipelineLog(uploadPipelineId, 'info', `Starting YouTube upload for video: ${videoResult.videoId}`);
    updatePipelineStatus(uploadPipelineId, 'running');

    const uploadResult = await uploadToYouTube(videoResult.videoId, schedule, uploadPipelineId, maxRetry);

    if (!uploadResult.success) {
      throw new Error(`YouTube upload failed: ${uploadResult.error}`);
    }

    updatePipelineStatus(uploadPipelineId, 'completed');
    updateScheduleStatus(schedule.id, 'processing', { youtubeUploadId: uploadResult.uploadId });
    addPipelineLog(uploadPipelineId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);

    // ============================================================
    // Stage 4: 유튜브 퍼블리시 (예약 시간에 공개)
    // ============================================================
    addPipelineLog(publishPipelineId, 'info', `Scheduling YouTube publish`);
    updatePipelineStatus(publishPipelineId, 'running');

    const publishResult = await scheduleYouTubePublish(uploadResult.uploadId, schedule, publishPipelineId);

    if (!publishResult.success) {
      throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
    }

    updatePipelineStatus(publishPipelineId, 'completed');
    updateScheduleStatus(schedule.id, 'completed');
    addPipelineLog(publishPipelineId, 'info', `Pipeline completed successfully!`);

    console.log(`✅ [Pipeline] Successfully completed for schedule ${schedule.id}`);

  } catch (error: any) {
    console.error(`❌ [Pipeline] Failed for schedule ${schedule.id}:`, error);

    // 실패한 단계 찾기
    const db = new Database(dbPath);
    const failedPipeline = db.prepare(`
      SELECT * FROM automation_pipelines
      WHERE schedule_id = ? AND status = 'running'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(schedule.id) as any;
    db.close();

    if (failedPipeline) {
      updatePipelineStatus(failedPipeline.id, 'failed', error.message);
      addPipelineLog(failedPipeline.id, 'error', `Pipeline failed: ${error.message}`);
    }

    updateScheduleStatus(schedule.id, 'failed');

    // 에러 이메일 전송
    await sendAutomationErrorEmail(
      schedule.id,
      'pipeline_execution',
      error.message,
      { schedule, failedStage: failedPipeline?.stage }
    );
  }
}

// ============================================================
// 개별 Stage 함수들
// ============================================================

// Stage 1: 대본 생성
async function generateScript(schedule: any, pipelineId: string, maxRetry: number) {
  const settings = getAutomationSettings();
  const mode = settings.script_generation_mode || 'chrome';

  let retryCount = 0;

  while (retryCount < maxRetry) {
    try {
      addPipelineLog(pipelineId, 'info', `Generating script via ${mode} (attempt ${retryCount + 1}/${maxRetry})`);

      if (mode === 'api') {
        // API 방식: 기존 API 호출
        const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/scripts/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: schedule.title,
            type: schedule.type,
            model: 'claude'
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Script generation failed');
        }

        const data = await response.json();
        return { success: true, scriptId: data.taskId };

      } else {
        // 크롬창 방식: Python 스크립트로 크롬 실행
        const { spawn } = require('child_process');
        const scriptPath = path.join(process.cwd(), '..', 'trend-video-backend', 'src', 'ai_aggregator', 'main.py');

        // 제목을 임시 파일에 저장
        const fs = require('fs');
        const tmpFile = path.join(process.cwd(), 'data', `tmp_${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, schedule.title);

        return new Promise((resolve, reject) => {
          const process = spawn('python', ['-m', 'src.ai_aggregator.main', '-f', tmpFile, '-a', 'claude'], {
            cwd: path.join(process.cwd(), '..', 'trend-video-backend'),
            stdio: 'pipe'
          });

          let output = '';
          process.stdout.on('data', (data: any) => {
            const text = data.toString();
            output += text;
            addPipelineLog(pipelineId, 'debug', text);
          });

          process.stderr.on('data', (data: any) => {
            addPipelineLog(pipelineId, 'warn', data.toString());
          });

          process.on('close', (code: number) => {
            // 임시 파일 삭제
            try { fs.unlinkSync(tmpFile); } catch (e) {}

            if (code === 0) {
              // 성공 - 대본이 저장된 경로를 파싱
              const scriptId = `script_${Date.now()}`;
              resolve({ success: true, scriptId });
            } else {
              reject(new Error(`Chrome script generation failed with code ${code}`));
            }
          });
        });
      }

    } catch (error: any) {
      retryCount++;
      addPipelineLog(pipelineId, 'warn', `Script generation failed (attempt ${retryCount}): ${error.message}`);

      if (retryCount >= maxRetry) {
        return { success: false, error: error.message };
      }

      // 재시도 전 대기
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  return { success: false, error: 'Max retry reached' };
}

// Stage 2: 영상 생성
async function generateVideo(scriptId: string, pipelineId: string, maxRetry: number) {
  const settings = getAutomationSettings();
  const mediaMode = settings.media_generation_mode || 'upload';

  let retryCount = 0;

  while (retryCount < maxRetry) {
    try {
      addPipelineLog(pipelineId, 'info', `Generating video via ${mediaMode} (attempt ${retryCount + 1}/${maxRetry})`);

      // 미디어 생성 방식에 따라 다른 API 호출
      const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/videos/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId,
          mediaMode, // upload, dalle, imagen3, sora2
          imageSource: mediaMode === 'upload' ? 'none' : mediaMode,
          videoSource: mediaMode === 'sora2' ? 'sora2' : undefined
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Video generation failed');
      }

      const data = await response.json();

      // 작업이 비동기로 처리되는 경우 폴링
      if (data.jobId) {
        addPipelineLog(pipelineId, 'info', `Video generation job started: ${data.jobId}`);

        // 작업 완료 대기 (최대 30분)
        const maxWaitTime = 30 * 60 * 1000; // 30분
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10초마다 체크

          const statusRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/videos/status/${data.jobId}`);
          const statusData = await statusRes.json();

          if (statusData.status === 'completed') {
            addPipelineLog(pipelineId, 'info', `Video generation completed: ${statusData.videoId}`);
            return { success: true, videoId: statusData.videoId };
          } else if (statusData.status === 'failed') {
            throw new Error(`Video generation failed: ${statusData.error}`);
          }

          // 진행 상황 로그
          if (statusData.progress) {
            addPipelineLog(pipelineId, 'info', `Progress: ${statusData.progress}`);
          }
        }

        throw new Error('Video generation timeout (30분 초과)');
      }

      // 즉시 완료되는 경우
      return { success: true, videoId: data.videoId };

    } catch (error: any) {
      retryCount++;
      addPipelineLog(pipelineId, 'warn', `Video generation failed (attempt ${retryCount}): ${error.message}`);

      if (retryCount >= maxRetry) {
        return { success: false, error: error.message };
      }

      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  return { success: false, error: 'Max retry reached' };
}

// Stage 3: 유튜브 업로드
async function uploadToYouTube(videoId: string, schedule: any, pipelineId: string, maxRetry: number) {
  let retryCount = 0;

  while (retryCount < maxRetry) {
    try {
      addPipelineLog(pipelineId, 'info', `Uploading to YouTube (attempt ${retryCount + 1}/${maxRetry})`);

      // TODO: 유튜브 업로드 API 호출
      // 현재는 수동으로 업로드하는 방식이므로
      // 자동화를 위해서는 YouTube API 통합 필요

      // 임시로 성공 반환
      return {
        success: true,
        uploadId: `upload_${Date.now()}`,
        videoUrl: 'https://youtube.com/watch?v=EXAMPLE'
      };

    } catch (error: any) {
      retryCount++;
      addPipelineLog(pipelineId, 'warn', `YouTube upload failed (attempt ${retryCount}): ${error.message}`);

      if (retryCount >= maxRetry) {
        return { success: false, error: error.message };
      }

      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  return { success: false, error: 'Max retry reached' };
}

// Stage 4: 유튜브 퍼블리시 예약
async function scheduleYouTubePublish(uploadId: string, schedule: any, pipelineId: string) {
  try {
    addPipelineLog(pipelineId, 'info', `Scheduling YouTube publish for: ${schedule.youtube_publish_time || 'immediate'}`);

    // TODO: 유튜브 퍼블리시 시간 설정 API
    // YouTube API의 publishAt 파라미터 사용

    return { success: true };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================
// 에러 알림 함수
// ============================================================

async function sendAutomationErrorEmail(
  scheduleId: string,
  stage: string,
  errorMessage: string,
  context: any
) {
  try {
    const settings = getAutomationSettings();
    const alertEmail = settings.alert_email || 'moony75@gmail.com';

    const subject = `[자동화 실패] ${stage} - ${scheduleId}`;
    const html = `
      <h2>자동화 파이프라인 실패 알림</h2>
      <p><strong>스케줄 ID:</strong> ${scheduleId}</p>
      <p><strong>실패 단계:</strong> ${stage}</p>
      <p><strong>에러 메시지:</strong> ${errorMessage}</p>
      <p><strong>제목:</strong> ${context.schedule?.title || 'N/A'}</p>
      <p><strong>타입:</strong> ${context.schedule?.type || 'N/A'}</p>
      <p><strong>예약 시간:</strong> ${context.schedule?.scheduled_time || 'N/A'}</p>
      <hr>
      <h3>Context:</h3>
      <pre>${JSON.stringify(context, null, 2)}</pre>
      <hr>
      <p><em>이 이메일은 자동화 시스템에서 발송되었습니다.</em></p>
    `;

    await sendErrorEmail(alertEmail, subject, html);
    console.log(`✅ Error email sent to ${alertEmail}`);

  } catch (error) {
    console.error('Failed to send error email:', error);
  }
}

// ============================================================
// 스케줄러 상태 확인
// ============================================================

export function getSchedulerStatus() {
  return {
    isRunning: schedulerInterval !== null,
    settings: getAutomationSettings()
  };
}
