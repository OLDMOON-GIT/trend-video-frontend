/**
 * 자동화 스케줄러 및 파이프라인 오케스트레이터
 * 제목 → 대본 생성 → 영상 생성 → 유튜브 업로드 → 퍼블리시
 */

import {
  getPendingSchedules,
  getWaitingForUploadSchedules,
  createPipeline,
  updatePipelineStatus,
  updateScheduleStatus,
  addPipelineLog,
  addTitleLog,
  getAutomationSettings
} from './automation';
import { sendErrorEmail } from './email';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// 스케줄러 인터벌
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// 제목 상태 업데이트 헬퍼 함수
function updateTitleStatus(titleId: string, status: 'pending' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'waiting_for_upload' | 'cancelled') {
  try {
    const db = new Database(dbPath);
    db.prepare(`
      UPDATE video_titles
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, titleId);
    db.close();
    console.log(`📝 [Title Status] ${titleId} → ${status}`);
  } catch (error) {
    console.error('Failed to update title status:', error);
  }
}

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
    checkWaitingForUploadSchedules(); // 이미지 업로드 대기 중인 스케줄 체크
  }, checkInterval);
}

// 스케줄러 중지
export function stopAutomationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('⏸️ Automation scheduler stopped (진행 중인 작업은 계속 실행됨)');
    console.log('💡 Note: 이미 시작된 파이프라인은 크레딧이 차감되었으므로 완료까지 진행됩니다.');
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
        // 원자적으로 스케줄 상태를 'processing'으로 변경 (중복 실행 방지)
        const db = new Database(dbPath);
        const result = db.prepare(`
          UPDATE video_schedules
          SET status = 'processing', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending'
        `).run((schedule as any).id);

        // 업데이트된 row가 없으면 다른 스케줄러가 이미 처리 중
        if (result.changes === 0) {
          console.log(`[Scheduler] Schedule ${(schedule as any).id} already being processed by another scheduler`);
          db.close();
          continue;
        }

        // 파이프라인이 이미 존재하는지 확인
        const existingPipeline = db.prepare(`
          SELECT id FROM automation_pipelines WHERE schedule_id = ? LIMIT 1
        `).get((schedule as any).id);

        db.close();

        if (existingPipeline) {
          console.log(`[Scheduler] Pipeline already exists for schedule ${(schedule as any).id}, skipping`);
          continue;
        }

        // 제목 상태도 'processing'으로 변경
        updateTitleStatus((schedule as any).title_id, 'processing');

        // 파이프라인 생성
        const pipelineIds = createPipeline((schedule as any).id);
        console.log(`[Scheduler] Created pipeline for schedule ${(schedule as any).id}`);

        // 파이프라인 실행 (비동기로 실행)
        executePipeline(schedule as any, pipelineIds).catch(error => {
          console.error(`[Scheduler] Pipeline execution failed for ${(schedule as any).id}:`, error);
        });

      } catch (error: any) {
        console.error(`[Scheduler] Failed to process schedule ${(schedule as any).id}:`, error);
        updateScheduleStatus((schedule as any).id, 'failed');
        updateTitleStatus((schedule as any).title_id, 'failed');

        // 에러 이메일 전송
        await sendAutomationErrorEmail(
          (schedule as any).id,
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
export async function executePipeline(schedule: any, pipelineIds: string[]) {
  const [scriptPipelineId, videoPipelineId, uploadPipelineId, publishPipelineId] = pipelineIds;
  const settings = getAutomationSettings();
  const maxRetry = parseInt(settings.max_retry || '3');

  try {
    // ============================================================
    // Stage 1: 대본 생성
    // ============================================================
    addPipelineLog(scriptPipelineId, 'info', `Starting script generation for: ${schedule.title}`);
    addTitleLog(schedule.title_id, 'info', `Starting script generation for: ${schedule.title}`);
    updatePipelineStatus(scriptPipelineId, 'running');

    const scriptResult = await generateScript(schedule, scriptPipelineId, maxRetry);

    if (!scriptResult.success) {
      throw new Error(`Script generation failed: ${scriptResult.error}`);
    }

    updatePipelineStatus(scriptPipelineId, 'completed');

    // video_schedules 테이블에 script_id 저장
    const dbUpdate = new Database(dbPath);
    dbUpdate.prepare(`UPDATE video_schedules SET script_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(scriptResult.scriptId, schedule.id);
    dbUpdate.close();

    updateScheduleStatus(schedule.id, 'processing', { scriptId: scriptResult.scriptId });
    addPipelineLog(scriptPipelineId, 'info', `Script generated successfully: ${scriptResult.scriptId}`);
    addTitleLog(schedule.title_id, 'info', `✅ Script generated successfully: ${scriptResult.scriptId}`);

    // ============================================================
    // 직접 업로드 모드 체크: media_mode가 'upload'이면 이미지 업로드 대기
    // ============================================================
    if (schedule.media_mode === 'upload') {
      updateScheduleStatus(schedule.id, 'waiting_for_upload', { scriptId: scriptResult.scriptId });
      updateTitleStatus(schedule.title_id, 'waiting_for_upload'); // 타이틀 상태도 업데이트
      addPipelineLog(videoPipelineId, 'info', `⏸️ Waiting for manual image upload...`);
      addTitleLog(schedule.title_id, 'info', `⏸️ 이미지를 업로드해주세요. 업로드가 완료되면 자동으로 영상 생성이 시작됩니다.`);

      console.log(`[Scheduler] Schedule ${schedule.id} is waiting for manual image upload`);
      return; // 이미지 업로드 대기, video 단계로 진행하지 않음
    }

    // ============================================================
    // Stage 2: 영상 생성
    // ============================================================
    addPipelineLog(videoPipelineId, 'info', `Starting video generation from script: ${scriptResult.scriptId}`);
    addTitleLog(schedule.title_id, 'info', `🎬 Starting video generation...`);
    updatePipelineStatus(videoPipelineId, 'running');

    const videoResult = await generateVideo(scriptResult.scriptId, videoPipelineId, maxRetry, schedule.title_id, schedule);

    if (!videoResult.success) {
      throw new Error(`Video generation failed: ${videoResult.error}`);
    }

    updatePipelineStatus(videoPipelineId, 'completed');

    // video_schedules 테이블에 video_id 저장
    const dbUpdateVideo = new Database(dbPath);
    dbUpdateVideo.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(videoResult.videoId, schedule.id);
    dbUpdateVideo.close();

    updateScheduleStatus(schedule.id, 'completed', { videoId: videoResult.videoId });
    updateTitleStatus(schedule.title_id, 'completed');
    addPipelineLog(videoPipelineId, 'info', `Video generated successfully: ${videoResult.videoId}`);
    addTitleLog(schedule.title_id, 'info', `✅ Video generated successfully: ${videoResult.videoId}`);

    console.log(`[Scheduler] Video generation completed for schedule ${schedule.id}`);
    return; // 영상 생성 완료, YouTube 업로드는 별도 처리

    // ============================================================
    // Stage 3: 유튜브 업로드
    // ============================================================
    addPipelineLog(uploadPipelineId, 'info', `Starting YouTube upload for video: ${videoResult.videoId}`);
    addTitleLog(schedule.title_id, 'info', `📤 Uploading to YouTube...`);
    updatePipelineStatus(uploadPipelineId, 'running');

    const uploadResult = await uploadToYouTube(videoResult.videoId, schedule, uploadPipelineId, maxRetry);

    if (!uploadResult.success) {
      throw new Error(`YouTube upload failed: ${uploadResult.error}`);
    }

    updatePipelineStatus(uploadPipelineId, 'completed');

    // video_schedules 테이블에 youtube_upload_id 저장
    const dbUpdateUpload = new Database(dbPath);
    dbUpdateUpload.prepare(`UPDATE video_schedules SET youtube_upload_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(uploadResult.uploadId, schedule.id);
    dbUpdateUpload.close();

    updateScheduleStatus(schedule.id, 'processing', { youtubeUploadId: uploadResult.uploadId });
    addPipelineLog(uploadPipelineId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
    addTitleLog(schedule.title_id, 'info', `✅ YouTube upload successful: ${uploadResult.videoUrl}`);

    // ============================================================
    // Stage 4: 유튜브 퍼블리시 (예약 시간에 공개)
    // ============================================================
    addPipelineLog(publishPipelineId, 'info', `Scheduling YouTube publish`);
    addTitleLog(schedule.title_id, 'info', `📅 Scheduling publish...`);
    updatePipelineStatus(publishPipelineId, 'running');

    const publishResult = await scheduleYouTubePublish(uploadResult.uploadId!, schedule, publishPipelineId);

    if (!publishResult.success) {
      throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
    }

    updatePipelineStatus(publishPipelineId, 'completed');
    updateScheduleStatus(schedule.id, 'completed');
    updateTitleStatus(schedule.title_id, 'completed');
    addPipelineLog(publishPipelineId, 'info', `Pipeline completed successfully!`);
    addTitleLog(schedule.title_id, 'info', `🎉 All done! Pipeline completed successfully!`);

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
    updateTitleStatus(schedule.title_id, 'failed');
    addTitleLog(schedule.title_id, 'error', `❌ Pipeline failed: ${error.message}`);

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

// Stage 1: 대본 생성 (재시도 로직 제거)
async function generateScript(schedule: any, pipelineId: string, maxRetry: number) {
  console.log('🔍 [SCHEDULER] generateScript called with schedule:', {
    id: schedule.id,
    title: schedule.title,
    user_id: schedule.user_id,
    hasUserId: !!schedule.user_id
  });

  try {
    addPipelineLog(pipelineId, 'info', `📝 대본 생성 시작...`);
    addTitleLog(schedule.title_id, 'info', `📝 대본 생성 시작...`);

    const requestBody = {
      title: schedule.title,
      type: schedule.type,
      productUrl: schedule.product_url,
      model: schedule.model || 'claude',
      useClaudeLocal: schedule.script_mode !== 'api',
      userId: schedule.user_id,
      category: schedule.category
    };

    console.log('🔍 [SCHEDULER] Request body:', JSON.stringify(requestBody, null, 2));

    // API 방식으로 대본 생성 (내부 요청 헤더 포함)
    console.log('📤 [SCHEDULER] Calling /api/scripts/generate...');
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/scripts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'automation-system'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📥 [SCHEDULER] Script API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [SCHEDULER] Script API error response: ${errorText}`);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch (e) {
        throw new Error(`Script generation failed: ${errorText}`);
      }
      throw new Error(error.error || 'Script generation failed');
    }

    const data = await response.json();
    console.log('✅ [SCHEDULER] Script API response data:', JSON.stringify(data, null, 2));

    // taskId가 반환되면 작업 완료 대기
    if (data.taskId) {
      addPipelineLog(pipelineId, 'info', `Script generation job started: ${data.taskId}`);

      // 작업 완료 대기 (최대 10분)
      const maxWaitTime = 10 * 60 * 1000;
      const startTime = Date.now();
      let lastProgress = 0; // 마지막 진행률 추적

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5초마다 체크

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`🔍 [SCHEDULER] Checking script status for ${data.taskId}... (경과시간: ${elapsed}초)`);
        const statusRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/scripts/status/${data.taskId}`);

        console.log(`📥 [SCHEDULER] Status API response: ${statusRes.status}`);

        if (!statusRes.ok) {
          const errorText = await statusRes.text();
          console.error(`❌ [SCHEDULER] Status API failed: ${statusRes.status}, Response: ${errorText}`);
          continue;
        }

        const statusData = await statusRes.json();
        console.log(`📊 [SCHEDULER] Script Status Response:`, JSON.stringify(statusData, null, 2));

        if (statusData.status === 'completed') {
          addPipelineLog(pipelineId, 'info', `Script generation completed: ${data.taskId}`);
          addTitleLog(schedule.title_id, 'info', '✅ 대본 생성 완료!');
          console.log(`✅ [SCHEDULER] Script generation completed!`);
          return { success: true, scriptId: data.taskId };
        } else if (statusData.status === 'failed') {
          console.error(`❌ [SCHEDULER] Script generation failed: ${statusData.error}`);
          throw new Error(`Script generation failed: ${statusData.error}`);
        }

        // 진행 상황 로그 (progress가 변경될 때만)
        if (statusData.progress && statusData.progress !== lastProgress) {
          lastProgress = statusData.progress;
          const msg = `📝 대본 생성 중... ${statusData.progress}%`;
          addPipelineLog(pipelineId, 'info', msg);
          addTitleLog(schedule.title_id, 'info', msg);
        }
      }

      throw new Error('Script generation timeout (10분 초과)');
    }

    return { success: true, scriptId: data.taskId || data.scriptId };

  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    addPipelineLog(pipelineId, 'error', `❌ 대본 생성 실패: ${errorMsg}`);
    addTitleLog(schedule.title_id, 'error', `❌ 대본 생성 실패: ${errorMsg}`);
    console.error(`❌ [SCHEDULER] Script generation failed:`, error.message);
    return { success: false, error: errorMsg };
  }
}

// Stage 2: 영상 생성 (재시도 로직 제거)
async function generateVideo(scriptId: string, pipelineId: string, maxRetry: number, titleId: string, schedule: any) {
  const settings = getAutomationSettings();
  const mediaMode = schedule.media_mode || settings.media_generation_mode || 'upload';

  try {
    addPipelineLog(pipelineId, 'info', `🎬 영상 생성 시작... (mode: ${mediaMode})`);
    addTitleLog(titleId, 'info', `🎬 영상 생성 시작...`);

    // DB에서 대본 조회
    const db = new Database(dbPath);
    const content = db.prepare(`
      SELECT id, title, content, type, user_id
      FROM contents
      WHERE id = ? AND type = 'script'
    `).get(scriptId) as any;
    db.close();

    if (!content) {
      throw new Error(`Script not found: ${scriptId}`);
    }

    // content 파싱
    let scriptData;
    try {
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

      scriptData = JSON.parse(contentStr);
    } catch (e: any) {
      throw new Error(`Failed to parse script content: ${e.message}`);
    }

    // story.json 생성
    const storyJson = {
      ...scriptData,
      scenes: scriptData.scenes || []
    };

    // 업로드된 이미지가 있는지 확인
    const scriptFolderPath = path.join(process.cwd(), '..', 'trend-video-backend', 'input', `project_${scriptId}`);
    let hasUploadedImages = false;
    if (fs.existsSync(scriptFolderPath)) {
      const files = fs.readdirSync(scriptFolderPath);
      const imageFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
      hasUploadedImages = imageFiles.length > 0;
      if (hasUploadedImages) {
        console.log(`[Scheduler] Found ${imageFiles.length} uploaded image(s) in ${scriptFolderPath}`);
      }
    }

    // 이미지 소스 설정 (업로드된 이미지가 있으면 우선 사용)
    const imageSource = (mediaMode === 'upload' || hasUploadedImages) ? 'none' : mediaMode;

    // 이미지 모델 설정 (imagen3 -> imagen3, 나머지는 dalle3)
    const imageModel = mediaMode === 'imagen3' ? 'imagen3' : 'dalle3';

    // 비디오 포맷
    const videoType = schedule.type || scriptData.metadata?.genre || 'shortform';

    // JSON으로 전송 (내부 요청)
    const requestBody = {
      storyJson,
      userId: content.user_id,
      imageSource,
      imageModel,
      videoFormat: videoType,
      ttsVoice: 'ko-KR-SoonBokNeural',
      title: content.title,
      scriptId  // 자동화용: 이미 업로드된 이미지가 있는 폴더 경로
    };

    console.log('📤 [SCHEDULER] Calling /api/generate-video-upload...');
    console.log('🔍 [SCHEDULER] Request body:', {
      scriptId,
      userId: content.user_id,
      imageSource,
      imageModel,
      videoFormat: videoType
    });

    // /api/generate-video-upload 호출
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'automation-system'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📥 [SCHEDULER] Video API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [SCHEDULER] Video API error response: ${errorText}`);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch (e) {
        throw new Error(`Video generation failed: ${errorText}`);
      }
      throw new Error(error.error || 'Video generation failed');
    }

    const data = await response.json();
    console.log('✅ [SCHEDULER] Video API response data:', JSON.stringify(data, null, 2));

    // 작업이 비동기로 처리되는 경우 폴링
    if (data.jobId) {
      addPipelineLog(pipelineId, 'info', `Video generation job started: ${data.jobId}`);

      // 작업 완료 대기 (최대 30분)
      const maxWaitTime = 30 * 60 * 1000; // 30분
      const startTime = Date.now();
      let lastProgress = 0; // 마지막 진행률 추적

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5초마다 체크

        // 중지 요청 확인 (DB에서 schedule 상태 체크)
        const db = new Database(dbPath);
        const pipeline = db.prepare('SELECT status FROM automation_pipelines WHERE id = ?').get(pipelineId) as any;
        const schedule = db.prepare(`
          SELECT vs.status
          FROM video_schedules vs
          JOIN automation_pipelines ap ON ap.schedule_id = vs.id
          WHERE ap.id = ?
        `).get(pipelineId) as any;
        db.close();

        if (pipeline && pipeline.status === 'failed') {
          console.log(`🛑 [SCHEDULER] Pipeline ${pipelineId} failed`);
          throw new Error('작업이 실패했습니다');
        }

        if (schedule && schedule.status === 'cancelled') {
          console.log(`🛑 [SCHEDULER] Schedule for pipeline ${pipelineId} was cancelled by user`);
          throw new Error('작업이 사용자에 의해 중지되었습니다');
        }

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`🔍 [SCHEDULER] Checking video status for ${data.jobId}... (경과시간: ${elapsed}초)`);

        const statusRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload?jobId=${data.jobId}`);
        console.log(`📥 [SCHEDULER] Video Status API response: ${statusRes.status}`);

        if (!statusRes.ok) {
          const errorText = await statusRes.text();
          console.error(`❌ [SCHEDULER] Video Status API failed: ${statusRes.status}, Response: ${errorText}`);
          continue;
        }

        const statusData = await statusRes.json();
        console.log(`📊 [SCHEDULER] Video Status Response:`, JSON.stringify(statusData, null, 2));

        if (statusData.status === 'completed') {
          addPipelineLog(pipelineId, 'info', `Video generation completed: ${statusData.videoId}`);
          addTitleLog(titleId, 'info', '✅ 영상 생성 완료!');
          console.log(`✅ [SCHEDULER] Video generation completed!`);
          return { success: true, videoId: statusData.videoId };
        } else if (statusData.status === 'failed') {
          console.error(`❌ [SCHEDULER] Video generation failed: ${statusData.error}`);
          throw new Error(`Video generation failed: ${statusData.error}`);
        }

        // 진행 상황 로그 (progress가 변경될 때만)
        if (statusData.progress && statusData.progress !== lastProgress) {
          lastProgress = statusData.progress;
          const msg = `🎬 영상 생성 중... ${statusData.progress}%`;
          console.log(`📈 [SCHEDULER] Video Progress: ${statusData.progress}`);
          addPipelineLog(pipelineId, 'info', msg);
          addTitleLog(titleId, 'info', msg);
        }
      }

      throw new Error('Video generation timeout (30분 초과)');
    }

    // 즉시 완료되는 경우
    return { success: true, videoId: data.videoId };

  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    addPipelineLog(pipelineId, 'error', `❌ 영상 생성 실패: ${errorMsg}`);
    addTitleLog(titleId, 'error', `❌ 영상 생성 실패: ${errorMsg}`);
    console.error(`❌ [SCHEDULER] Video generation failed:`, error.message);
    return { success: false, error: errorMsg };
  }
}

// Stage 3: 유튜브 업로드
async function uploadToYouTube(videoId: string, schedule: any, pipelineId: string, maxRetry: number) {
  try {
    addPipelineLog(pipelineId, 'info', `Uploading to YouTube`);
    console.log(`🔍 [YOUTUBE UPLOAD] videoId: ${videoId}`);

    // jobs 테이블에서 비디오 정보 조회
    const db = new Database(dbPath);
    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(videoId) as any;
    db.close();

    console.log(`🔍 [YOUTUBE UPLOAD] job found:`, {
      hasJob: !!job,
      jobId: job?.id,
      jobVideoPath: job?.video_path,
      jobTitle: job?.title,
      jobStatus: job?.status
    });

    if (!job || !job.video_path) {
      addPipelineLog(pipelineId, 'error', `Video file not found in jobs table. videoId: ${videoId}, hasJob: ${!!job}, hasVideoPath: ${!!job?.video_path}`);
      throw new Error('Video file not found');
    }

    // 비디오 파일 경로 (video_path는 이미 절대 경로)
    const videoPath = job.video_path;
    console.log(`🔍 [YOUTUBE UPLOAD] videoPath: ${videoPath}`);

    // 파일 존재 여부 확인
    const fs = require('fs');
    const fileExists = fs.existsSync(videoPath);
    console.log(`🔍 [YOUTUBE UPLOAD] file exists: ${fileExists}`);

    if (!fileExists) {
      addPipelineLog(pipelineId, 'error', `Video file not found at path: ${videoPath}`);
      throw new Error(`Video file not found at path: ${videoPath}`);
    }

    // YouTube API 호출
    addPipelineLog(pipelineId, 'info', `Calling YouTube upload API for video: ${job.title}`);

    const uploadResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/youtube/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'automation-system'
      },
      body: JSON.stringify({
        videoPath,
        title: job.title || schedule.title,
        description: '', // 빈 문자열 (상품정보 대본이 있으면 자동으로 추가될 예정)
        tags: schedule.tags ? schedule.tags.split(',').map((t: string) => t.trim()) : [],
        privacy: schedule.youtube_schedule === 'immediate' ? 'public' : 'private', // immediate면 바로 공개, 아니면 private
        channelId: schedule.channel,
        jobId: videoId,
        publishAt: schedule.youtube_publish_time,
        userId: schedule.user_id // 내부 요청용 userId 전달
      })
    });

    addPipelineLog(pipelineId, 'info', `YouTube upload API response: ${uploadResponse.status}`);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      addPipelineLog(pipelineId, 'error', `YouTube upload failed: ${errorText}`);
      throw new Error(`YouTube upload failed: ${errorText}`);
    }

    const uploadData = await uploadResponse.json();

    if (!uploadData.success) {
      throw new Error(uploadData.error || 'YouTube upload failed');
    }

    addPipelineLog(pipelineId, 'info', `✅ YouTube upload successful: ${uploadData.videoUrl}`);

    // video_schedules 테이블에 youtube_upload_id 업데이트
    // YouTube API에서 이미 youtube_uploads 테이블에 저장했으므로 중복 저장하지 않음
    if (uploadData.uploadId) {
      const uploadDb = new Database(dbPath);
      uploadDb.prepare(`
        UPDATE video_schedules
        SET youtube_upload_id = ?
        WHERE id = ?
      `).run(uploadData.uploadId, schedule.id);
      uploadDb.close();
      console.log(`✅ video_schedules 업데이트: youtube_upload_id = ${uploadData.uploadId}`);
    }

    return {
      success: true,
      uploadId: uploadData.videoId,
      videoUrl: uploadData.videoUrl
    };

  } catch (error: any) {
    addPipelineLog(pipelineId, 'error', `YouTube upload failed: ${error.message}`);
    addTitleLog(schedule.title_id, 'error', `❌ YouTube upload failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Stage 4: 유튜브 퍼블리시 예약
async function scheduleYouTubePublish(uploadId: string, schedule: any, pipelineId: string) {
  try {
    addPipelineLog(pipelineId, 'info', `Scheduling YouTube publish for: ${schedule.youtube_publish_time || 'immediate'}`);

    // youtube_publish_time이 설정되어 있으면 예약, 없으면 즉시 공개
    if (schedule.youtube_publish_time) {
      addPipelineLog(pipelineId, 'info', `Video will be published at: ${schedule.youtube_publish_time}`);
      addTitleLog(schedule.title_id, 'info', `📅 예약됨: ${new Date(schedule.youtube_publish_time).toLocaleString('ko-KR')}`);
    } else {
      addPipelineLog(pipelineId, 'info', `Video set to immediate publish`);
      addTitleLog(schedule.title_id, 'info', `✅ 즉시 공개 설정됨`);
    }

    return { success: true };

  } catch (error: any) {
    addPipelineLog(pipelineId, 'error', `Failed to schedule publish: ${error.message}`);
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

// ============================================================
// 이미지 업로드 대기 중인 스케줄 확인
// ============================================================

async function checkWaitingForUploadSchedules() {
  try {
    const waitingSchedules = getWaitingForUploadSchedules();

    if (waitingSchedules.length === 0) {
      return;
    }

    console.log(`[Scheduler] Checking ${waitingSchedules.length} schedule(s) waiting for upload`);

    for (const schedule of waitingSchedules) {
      try {
        // script_id가 있는지 확인
        if (!schedule.script_id) {
          console.log(`[Scheduler] Schedule ${schedule.id} has no script_id, skipping`);
          continue;
        }

        // 스크립트 폴더에서 이미지 확인
        const fs = require('fs');
        const scriptFolderPath = path.join(process.cwd(), '..', 'trend-video-backend', 'input', `project_${schedule.script_id}`);

        // 폴더가 존재하는지 확인
        if (!fs.existsSync(scriptFolderPath)) {
          console.log(`[Scheduler] Script folder not found: ${scriptFolderPath}`);
          continue;
        }

        // 이미지 파일 확인 (scene_*.png, scene_*.jpg, scene_*.webp 등)
        const files = fs.readdirSync(scriptFolderPath);
        const imageFiles = files.filter((file: string) =>
          /scene_\d+.*\.(png|jpg|jpeg|webp|gif)$/i.test(file)
        );

        if (imageFiles.length === 0) {
          console.log(`[Scheduler] No images found in ${scriptFolderPath}, waiting...`);
          continue;
        }

        console.log(`[Scheduler] Found ${imageFiles.length} image(s) in ${scriptFolderPath}`);
        console.log(`[Scheduler] Images: ${imageFiles.join(', ')}`);

        // 이미지가 업로드되었으므로 processing 상태로 변경하고 video 단계 시작
        addPipelineLog(schedule.id, 'info', `✅ ${imageFiles.length}개 이미지 업로드 확인됨, 영상 생성을 시작합니다`);
        addTitleLog(schedule.title_id, 'info', `✅ 이미지 ${imageFiles.length}개 업로드 확인됨! 영상 생성을 시작합니다...`);

        updateScheduleStatus(schedule.id, 'processing', { imagesReady: true });

        // video 단계 시작 (비동기)
        const videoPipelineId = schedule.id + '_video';
        resumeVideoGeneration(schedule, videoPipelineId).catch((error: any) => {
          console.error(`[Scheduler] Failed to resume video generation for ${schedule.id}:`, error);
          addPipelineLog(videoPipelineId, 'error', `Video generation failed: ${error.message}`);
          addTitleLog(schedule.title_id, 'error', `❌ 영상 생성 실패: ${error.message}`);
          updatePipelineStatus(videoPipelineId, 'failed');
          updateScheduleStatus(schedule.id, 'failed');
        });

      } catch (error: any) {
        console.error(`[Scheduler] Error checking schedule ${schedule.id}:`, error);
      }
    }

  } catch (error: any) {
    console.error('[Scheduler] Error in checkWaitingForUploadSchedules:', error);
  }
}

// 이미지 업로드 후 video 생성 재개
async function resumeVideoGeneration(schedule: any, videoPipelineId: string) {
  const maxRetry = 3;

  addPipelineLog(videoPipelineId, 'info', `Starting video generation from script: ${schedule.script_id}`);
  addTitleLog(schedule.title_id, 'info', `🎬 영상 생성 중...`);
  updatePipelineStatus(videoPipelineId, 'running');

  const videoResult = await generateVideo(schedule.script_id, videoPipelineId, maxRetry, schedule.title_id, schedule);

  if (!videoResult.success) {
    throw new Error(`Video generation failed: ${videoResult.error}`);
  }

  updatePipelineStatus(videoPipelineId, 'completed');

  // video_schedules 테이블에 video_id 저장
  const dbUpdateVideo = new Database(dbPath);
  dbUpdateVideo.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(videoResult.videoId, schedule.id);
  dbUpdateVideo.close();

  updateScheduleStatus(schedule.id, 'processing', { videoId: videoResult.videoId });
  addPipelineLog(videoPipelineId, 'info', `Video generated successfully: ${videoResult.videoId}`);
  addTitleLog(schedule.title_id, 'info', `✅ 영상 생성 완료: ${videoResult.videoId}`);

  // 이후 upload, publish 단계는 기존 로직 활용
  // TODO: upload와 publish 단계를 별도 함수로 분리하여 재사용
  console.log(`[Scheduler] Video generation completed for ${schedule.id}, continuing with upload...`);

  // Upload 단계 시작
  const uploadPipelineId = schedule.id + '_upload';
  addPipelineLog(uploadPipelineId, 'info', `Starting YouTube upload for video: ${videoResult.videoId}`);
  addTitleLog(schedule.title_id, 'info', `📤 YouTube 업로드 중...`);
  updatePipelineStatus(uploadPipelineId, 'running');

  const uploadResult = await uploadToYouTube(videoResult.videoId, schedule, uploadPipelineId, maxRetry);

  if (!uploadResult.success) {
    throw new Error(`YouTube upload failed: ${uploadResult.error}`);
  }

  updatePipelineStatus(uploadPipelineId, 'completed');

  // video_schedules 테이블에 youtube_upload_id 저장
  // uploadToYouTube에서 이미 업데이트했으므로 중복 업데이트하지 않음
  addPipelineLog(uploadPipelineId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
  addTitleLog(schedule.title_id, 'info', `✅ YouTube 업로드 완료: ${uploadResult.videoUrl}`);

  // Publish 단계
  const publishPipelineId = schedule.id + '_publish';
  addPipelineLog(publishPipelineId, 'info', `Scheduling YouTube publish`);
  addTitleLog(schedule.title_id, 'info', `📅 퍼블리시 예약 중...`);
  updatePipelineStatus(publishPipelineId, 'running');

  const publishResult = await scheduleYouTubePublish(uploadResult.uploadId || '', schedule, publishPipelineId);

  if (!publishResult.success) {
    throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
  }

  updatePipelineStatus(publishPipelineId, 'completed');
  updateScheduleStatus(schedule.id, 'completed');
  updateTitleStatus(schedule.title_id, 'completed');

  addPipelineLog(publishPipelineId, 'info', `Pipeline completed successfully`);
  addTitleLog(schedule.title_id, 'info', `🎉 모든 작업이 완료되었습니다!`);

  console.log(`[Scheduler] Pipeline completed for schedule ${schedule.id}`);
}
