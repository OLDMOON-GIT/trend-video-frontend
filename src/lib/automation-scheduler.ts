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
let lastAutoScheduleCheck: Date | null = null;
let lastAutoScheduleResult: { success: number; failed: number; skipped: number } = { success: 0, failed: 0, skipped: 0 };

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
  // 최소 3초 간격 (중복 실행 방지)
  const checkInterval = Math.max(3, parseInt(settings.check_interval || '10')) * 1000;

  if (!enabled) {
    console.log('⚠️ Automation is disabled in settings');
    return;
  }

  console.log(`✅ Automation scheduler started (checking every ${checkInterval / 1000}s)`);

  // 즉시 한 번 실행
  processPendingSchedules();

  // 자동 제목 생성이 활성화된 경우에만 실행
  const autoTitleGeneration = settings.auto_title_generation === 'true';
  if (autoTitleGeneration) {
    checkAndCreateAutoSchedules(); // 완전 자동화: 채널 주기 체크 및 자동 스케줄 생성
    console.log('✅ Auto title generation is enabled');
  } else {
    console.log('⏸️ Auto title generation is disabled');
  }

  // 주기적으로 실행
  schedulerInterval = setInterval(() => {
    processPendingSchedules();
    checkWaitingForUploadSchedules(); // 이미지 업로드 대기 중인 스케줄 체크
    checkReadyToUploadSchedules(); // 영상 생성 완료되어 업로드 대기 중인 스케줄 체크
    checkCompletedShortformJobs(); // 완료된 숏폼 작업 체크 및 업로드

    // 자동 제목 생성이 활성화된 경우에만 실행
    const settings = getAutomationSettings();
    const autoTitleGeneration = settings.auto_title_generation === 'true';
    if (autoTitleGeneration) {
      checkAndCreateAutoSchedules(); // 완전 자동화: 채널 주기 체크 및 자동 스케줄 생성
    }
  }, checkInterval);
}

// 스케줄러 중지
export function stopAutomationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    isRunning = false;
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

    // Debug: 첫번째 스케줄의 전체 키 로깅
    if (pendingSchedules.length > 0) {
      console.log('🔍 [SCHEDULER] First schedule keys:', Object.keys(pendingSchedules[0] as any));
      console.log('🔍 [SCHEDULER] First schedule has product_data?:', !!(pendingSchedules[0] as any).product_data);
    }

    for (const schedule of pendingSchedules) {
      try {
        // 파이프라인이 이미 존재하는지 먼저 확인 (DB 잠금으로 race condition 방지)
        const db = new Database(dbPath);

        const existingPipeline = db.prepare(`
          SELECT id FROM automation_pipelines WHERE schedule_id = ? LIMIT 1
        `).get((schedule as any).id);

        if (existingPipeline) {
          console.log(`[Scheduler] Pipeline already exists for schedule ${(schedule as any).id}, skipping`);
          db.close();
          continue;
        }

        // 원자적으로 스케줄 상태를 'processing'으로 변경 (중복 실행 방지)
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

        // 즉시 파이프라인 생성 (같은 DB 연결 사용하여 원자성 보장)
        const stages = ['script', 'video', 'upload', 'publish'];
        const pipelineIds: string[] = [];

        try {
          for (const stage of stages) {
            const id = `pipeline_${Date.now()}_${stage}_${Math.random().toString(36).substr(2, 9)}`;
            try {
              db.prepare(`
                INSERT INTO automation_pipelines (id, schedule_id, stage, status)
                VALUES (?, ?, ?, 'pending')
              `).run(id, (schedule as any).id, stage);
              pipelineIds.push(id);
            } catch (insertError: any) {
              // UNIQUE 제약조건 위반 (이미 다른 스케줄러가 생성함)
              if (insertError.code === 'SQLITE_CONSTRAINT_UNIQUE' || insertError.message?.includes('UNIQUE')) {
                console.log(`[Scheduler] Pipeline for stage ${stage} already exists for schedule ${(schedule as any).id}, using existing one`);
                // 기존 파이프라인 ID 가져오기
                const existing = db.prepare(`
                  SELECT id FROM automation_pipelines WHERE schedule_id = ? AND stage = ?
                `).get((schedule as any).id, stage) as any;
                if (existing) {
                  pipelineIds.push(existing.id);
                }
              } else {
                throw insertError;
              }
            }
          }
        } catch (pipelineError) {
          db.close();
          throw pipelineError;
        }

        db.close();
        console.log(`[Scheduler] Created/Retrieved pipeline for schedule ${(schedule as any).id}`);

        // 제목 상태도 'processing'으로 변경
        updateTitleStatus((schedule as any).title_id, 'processing');

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
    // 상품 타입이면 상품설명 대본 자동 생성
    // ============================================================
    if (schedule.type === 'product' || schedule.type === 'product-info') {
      addPipelineLog(scriptPipelineId, 'info', `🛍️ 상품 타입 감지 - 상품설명 대본 생성 시작...`);
      addTitleLog(schedule.title_id, 'info', `🛍️ 상품설명 대본 생성 중...`);

      try {
        // 원본 스크립트 내용 읽기
        addTitleLog(schedule.title_id, 'info', `📖 원본 스크립트 읽는 중...`);
        const dbReadScript = new Database(dbPath);
        const sourceScript = dbReadScript.prepare(`
          SELECT content FROM contents WHERE id = ?
        `).get(scriptResult.scriptId) as { content: string } | undefined;
        dbReadScript.close();

        if (!sourceScript || !sourceScript.content) {
          throw new Error('원본 스크립트를 찾을 수 없습니다');
        }
        addTitleLog(schedule.title_id, 'info', `✅ 원본 스크립트 로드 완료`);

        // product-info 프롬프트 템플릿 읽기
        addTitleLog(schedule.title_id, 'info', `📋 상품설명 프롬프트 템플릿 로드 중...`);
        const promptResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/product-info-prompt`);
        if (!promptResponse.ok) {
          throw new Error('상품설명 프롬프트 템플릿을 불러올 수 없습니다');
        }
        const promptData = await promptResponse.json();
        addTitleLog(schedule.title_id, 'info', `✅ 프롬프트 템플릿 로드 완료`);

        // 상품설명 대본 생성 API 호출
        const modelName = schedule.model === 'claude' ? 'Claude' : schedule.model === 'chatgpt' ? 'ChatGPT' : 'Gemini';
        addTitleLog(schedule.title_id, 'info', `🤖 ${modelName}로 상품설명 생성 중... (1-2분 소요)`);

        const productInfoResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-script`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system'
          },
          body: JSON.stringify({
            userId: schedule.user_id,
            prompt: promptData.prompt,
            topic: schedule.title,
            format: 'product-info',
            model: schedule.model || 'claude',
            productInfo: sourceScript.content // 원본 스크립트 내용 전달
          })
        });

        if (!productInfoResponse.ok) {
          const errorText = await productInfoResponse.text();
          throw new Error(`상품설명 대본 생성 API 실패: ${productInfoResponse.status} - ${errorText}`);
        }

        const productInfoData = await productInfoResponse.json();
        console.log(`✅ [SCHEDULER] 상품설명 대본 생성 완료: ${productInfoData.id}`);
        addPipelineLog(scriptPipelineId, 'info', `✅ 상품설명 대본 생성 완료: ${productInfoData.id}`);
        addTitleLog(schedule.title_id, 'info', `✅ 상품설명 대본 생성 완료! (ID: ${productInfoData.id})`);
      } catch (error: any) {
        console.error(`❌ [SCHEDULER] 상품설명 대본 생성 실패:`, error);
        addPipelineLog(scriptPipelineId, 'warn', `⚠️ 상품설명 대본 생성 실패 (계속 진행): ${error.message}`);
        addTitleLog(schedule.title_id, 'warn', `⚠️ 상품설명 대본 생성 실패 (영상 생성은 계속됨)`);
        // 상품설명 생성 실패해도 영상 생성은 계속 진행
      }
    }

    // ============================================================
    // 직접 업로드 모드 체크: media_mode가 'upload'이면 이미지 업로드 대기
    // ============================================================
    if (schedule.media_mode === 'upload') {
      // 프로젝트 폴더와 story.json 생성
      const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
      const projectFolderPath = path.join(BACKEND_PATH, 'input', `project_${scriptResult.scriptId}`);

      try {
        // 폴더가 없으면 생성
        if (!fs.existsSync(projectFolderPath)) {
          fs.mkdirSync(projectFolderPath, { recursive: true });
          console.log(`📁 [SCHEDULER] 프로젝트 폴더 생성: ${projectFolderPath}`);
        }

        // DB에서 스크립트 내용 가져오기
        const dbReadScript = new Database(dbPath);
        const scriptContent = dbReadScript.prepare(`
          SELECT content FROM contents WHERE id = ?
        `).get(scriptResult.scriptId) as { content: string } | undefined;
        dbReadScript.close();

        if (scriptContent && scriptContent.content) {
          // content 파싱
          let contentStr = typeof scriptContent.content === 'string' ? scriptContent.content : JSON.stringify(scriptContent.content);

          // JSON 정리
          contentStr = contentStr.trim();
          if (contentStr.startsWith('JSON')) {
            contentStr = contentStr.substring(4).trim();
          }
          const jsonStart = contentStr.indexOf('{');
          if (jsonStart > 0) {
            contentStr = contentStr.substring(jsonStart);
          }

          // story.json 생성
          if (contentStr && contentStr.length > 0 && contentStr.includes('{')) {
            try {
              const scriptData = JSON.parse(contentStr);
              const storyJson = {
                ...scriptData,
                scenes: scriptData.scenes || []
              };

              const storyJsonPath = path.join(projectFolderPath, 'story.json');
              fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');
              console.log(`✅ [SCHEDULER] story.json 생성 완료: ${storyJsonPath}`);
              addTitleLog(schedule.title_id, 'info', `✅ 프로젝트 폴더 및 story.json 생성 완료`);
            } catch (parseError: any) {
              console.error(`❌ [SCHEDULER] JSON 파싱 실패: ${parseError.message}`);
              addTitleLog(schedule.title_id, 'warn', `⚠️ story.json 생성 실패 (수동으로 대본 확인 필요)`);
            }
          } else {
            console.warn(`⚠️ [SCHEDULER] 대본 content가 비어있거나 JSON이 아님`);
          }
        }
      } catch (folderError: any) {
        console.error(`❌ [SCHEDULER] 폴더 생성 실패: ${folderError.message}`);
        addTitleLog(schedule.title_id, 'warn', `⚠️ 프로젝트 폴더 생성 실패 (계속 진행)`);
      }

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

    updateScheduleStatus(schedule.id, 'processing', { videoId: videoResult.videoId }); // completed 아니라 processing (업로드 진행)
    addPipelineLog(videoPipelineId, 'info', `Video generated successfully: ${videoResult.videoId}`);
    addTitleLog(schedule.title_id, 'info', `✅ Video generated successfully: ${videoResult.videoId}`);

    console.log(`[Scheduler] Video generation completed for schedule ${schedule.id}, continuing with upload...`);
    // return 삭제 - 자동으로 업로드 진행

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

    // ============================================================
    // 롱폼 완료 후 숏폼 자동 생성
    // ============================================================
    if (schedule.type === 'longform' && uploadResult.videoUrl) {
      console.log(`🎬 [SHORTFORM] Longform completed, triggering shortform conversion...`);
      addTitleLog(schedule.title_id, 'info', `🎬 롱폼 완료! 숏폼 변환 시작...`);

      try {
        // 롱폼 video_id (job_id) 가져오기
        const longformJobId = videoResult.videoId;
        const longformYoutubeUrl = uploadResult.videoUrl;

        console.log(`🔍 [SHORTFORM] Longform job_id: ${longformJobId}, YouTube URL: ${longformYoutubeUrl}`);

        // convert-to-shorts API 호출
        const convertResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/jobs/${longformJobId}/convert-to-shorts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system',
            'X-User-Id': schedule.user_id // 인증 우회용
          }
        });

        if (!convertResponse.ok) {
          const errorText = await convertResponse.text();
          console.error(`❌ [SHORTFORM] Conversion failed: ${errorText}`);
          addTitleLog(schedule.title_id, 'warn', `⚠️ 숏폼 변환 실패: ${errorText}`);
        } else {
          const convertData = await convertResponse.json();
          const shortformJobId = convertData.jobId;

          console.log(`✅ [SHORTFORM] Conversion started, shortform job_id: ${shortformJobId}`);
          addTitleLog(schedule.title_id, 'info', `✅ 숏폼 변환 시작됨 (작업 ID: ${shortformJobId})`);

          // 숏폼 작업 ID와 롱폼 YouTube URL 저장 (나중에 업로드할 때 사용)
          const dbShortform = new Database(dbPath);

          // 컬럼이 없으면 추가
          try {
            dbShortform.exec(`ALTER TABLE video_schedules ADD COLUMN shortform_job_id TEXT`);
          } catch (e: any) {
            if (!e.message?.includes('duplicate column')) {
              console.log('shortform_job_id 컬럼 추가 시도:', e.message);
            }
          }
          try {
            dbShortform.exec(`ALTER TABLE video_schedules ADD COLUMN longform_youtube_url TEXT`);
          } catch (e: any) {
            if (!e.message?.includes('duplicate column')) {
              console.log('longform_youtube_url 컬럼 추가 시도:', e.message);
            }
          }
          try {
            dbShortform.exec(`ALTER TABLE video_schedules ADD COLUMN shortform_uploaded INTEGER DEFAULT 0`);
          } catch (e: any) {
            if (!e.message?.includes('duplicate column')) {
              console.log('shortform_uploaded 컬럼 추가 시도:', e.message);
            }
          }

          dbShortform.prepare(`
            UPDATE video_schedules
            SET shortform_job_id = ?, longform_youtube_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(shortformJobId, longformYoutubeUrl, schedule.id);
          dbShortform.close();

          console.log(`💾 [SHORTFORM] Saved shortform_job_id to schedule: ${schedule.id}`);
          addTitleLog(schedule.title_id, 'info', `💾 숏폼 작업 정보 저장됨. 완료 후 자동 업로드 예정`);
        }
      } catch (error: any) {
        console.error(`❌ [SHORTFORM] Error during shortform conversion:`, error);
        addTitleLog(schedule.title_id, 'warn', `⚠️ 숏폼 변환 중 오류: ${error.message}`);
      }
    }

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
  console.log('🔍 [SCHEDULER] Full schedule keys:', Object.keys(schedule));
  console.log('🔍 [SCHEDULER] schedule.product_data exists?:', !!schedule.product_data);
  console.log('🔍 [SCHEDULER] schedule.type:', schedule.type);

  try {
    addPipelineLog(pipelineId, 'info', `📝 대본 생성 시작...`);
    addTitleLog(schedule.title_id, 'info', `📝 대본 생성 시작...`);

    // product_data가 있으면 JSON 파싱
    let productInfo = undefined;
    if (schedule.product_data) {
      try {
        productInfo = JSON.parse(schedule.product_data);
        console.log('🛍️ [SCHEDULER] Product data found:', productInfo);
        console.log('  - title:', productInfo?.title);
        console.log('  - thumbnail:', productInfo?.thumbnail);
        console.log('  - product_link:', productInfo?.product_link);
        console.log('  - description:', productInfo?.description);
      } catch (e) {
        console.error('❌ [SCHEDULER] Failed to parse product_data:', e);
        console.error('  - Raw product_data:', schedule.product_data);
      }
    } else {
      console.warn(`⚠️ [SCHEDULER] No product_data for type: ${schedule.type}`);
    }

    const requestBody = {
      title: schedule.title,
      type: schedule.type,
      productUrl: schedule.product_url,
      productInfo: productInfo || null, // undefined 대신 null 사용 (JSON.stringify에서 제외되지 않도록)
      model: schedule.model || 'claude',
      useClaudeLocal: schedule.script_mode !== 'api',
      userId: schedule.user_id,
      category: schedule.category
    };

    console.log('🔍 [SCHEDULER] Request body:', JSON.stringify(requestBody, null, 2));
    console.log(`  - productInfo 전달: ${requestBody.productInfo ? 'YES ✅' : 'NO ❌'}`);

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

    if (!content.user_id) {
      throw new Error(`Script ${scriptId} has no user_id`);
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

    // 업로드된 이미지와 비디오 확인
    const scriptFolderPath = path.join(process.cwd(), '..', 'trend-video-backend', 'input', `project_${scriptId}`);
    let hasUploadedImages = false;
    let hasUploadedVideos = false;
    let imageFiles: string[] = [];
    let videoFiles: string[] = [];
    if (fs.existsSync(scriptFolderPath)) {
      const files = fs.readdirSync(scriptFolderPath);
      imageFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
      videoFiles = files.filter(f => /\.(mp4|mov|avi|mkv)$/i.test(f));
      hasUploadedImages = imageFiles.length > 0;
      hasUploadedVideos = videoFiles.length > 0;
      if (hasUploadedImages || hasUploadedVideos) {
        console.log(`[Scheduler] Found ${imageFiles.length} image(s) and ${videoFiles.length} video(s) in ${scriptFolderPath}`);
      }
    }

    // 씬 개수 확인
    const sceneCount = storyJson.scenes?.length || 0;
    const totalMediaCount = imageFiles.length + videoFiles.length;

    // 썸네일 분리 로직: 영상+이미지가 함께 있고, 총 미디어가 씬보다 많을 때만 첫 이미지를 썸네일로 사용
    let useThumbnailFromFirstImage = false;
    if (hasUploadedImages && hasUploadedVideos && totalMediaCount > sceneCount) {
      // 파일을 scene 번호 순으로 정렬 (scene_0, scene_1, ...)
      const sortedImages = imageFiles.sort((a, b) => {
        const aMatch = a.match(/scene_(\d+)/);
        const bMatch = b.match(/scene_(\d+)/);
        const aNum = aMatch ? parseInt(aMatch[1]) : 999;
        const bNum = bMatch ? parseInt(bMatch[1]) : 999;
        return aNum - bNum;
      });

      // 첫 번째 파일이 scene_0이고 이미지인지 확인
      const firstFile = sortedImages[0];
      if (firstFile && /scene_0.*\.(png|jpg|jpeg|webp)$/i.test(firstFile)) {
        useThumbnailFromFirstImage = true;
        console.log(`\n📌 [SCHEDULER] 썸네일 분리 조건 만족: 영상+이미지 있고 미디어(${totalMediaCount}) > 씬(${sceneCount})`);
        console.log(`   🖼️ 썸네일: ${firstFile}`);
        console.log(`   📹 씬 미디어: ${totalMediaCount - 1}개 (${firstFile} 제외)`);
      }
    } else {
      console.log(`\n📌 [SCHEDULER] 썸네일 분리 안 함:`);
      if (!hasUploadedImages || !hasUploadedVideos) {
        console.log(`   - 영상+이미지 미포함 (영상: ${hasUploadedVideos}, 이미지: ${hasUploadedImages})`);
      }
      if (totalMediaCount <= sceneCount) {
        console.log(`   - 미디어(${totalMediaCount}) ≤ 씬(${sceneCount})`);
      }
      console.log(`   → 모든 미디어를 씬에 사용`);
    }

    // 이미지 소스 설정 (업로드된 이미지가 있으면 우선 사용)
    const imageSource = (mediaMode === 'upload' || hasUploadedImages) ? 'none' : mediaMode;

    // 이미지 모델 설정 (imagen3 -> imagen3, 나머지는 dalle3)
    const imageModel = mediaMode === 'imagen3' ? 'imagen3' : 'dalle3';

    // 비디오 포맷
    const videoType = schedule.type || scriptData.metadata?.genre || 'shortform';

    // JSON으로 전송 (내부 요청)
    const requestBody: any = {
      storyJson,
      userId: content.user_id,
      imageSource,
      imageModel,
      videoFormat: videoType,
      ttsVoice: 'ko-KR-SoonBokNeural',
      title: content.title,
      scriptId,  // 자동화용: 이미 업로드된 이미지가 있는 폴더 경로
      useThumbnailFromFirstImage  // 첫 번째 이미지를 썸네일로 사용 여부
    };

    // ============================================================
    // 중복 실행 방지: 같은 source_content_id로 이미 실행 중인 job이 있는지 확인
    // ============================================================
    const dbCheck = new Database(dbPath);
    let jobId: string | undefined;
    let shouldCallApi = true;

    const existingJob = dbCheck.prepare(`
      SELECT id, status, title
      FROM jobs
      WHERE source_content_id = ?
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(scriptId) as any;

    dbCheck.close();

    if (existingJob) {
      console.log(`🔍 [DUPLICATE CHECK] Found existing job: ${existingJob.id} (status: ${existingJob.status})`);
      addPipelineLog(pipelineId, 'info', `⚠️ 이미 실행 중인 작업 발견: ${existingJob.id}`);
      addTitleLog(titleId, 'info', `⚠️ 기존 작업을 재사용합니다: ${existingJob.id}`);

      jobId = existingJob.id;
      shouldCallApi = false;
    } else {
      // 새로운 job 생성은 API에서 처리 (fresh created_at 타임스탬프로)
      console.log(`✅ [DUPLICATE CHECK] No existing job found, will create new job via API`);
      addPipelineLog(pipelineId, 'info', `📝 API를 통해 새 Job 생성 예정`);
      shouldCallApi = true;
    }

    console.log('📤 [SCHEDULER] Calling /api/generate-video-upload...');
    console.log('🔍 [SCHEDULER] Request body:', {
      scriptId,
      userId: content.user_id,
      imageSource,
      imageModel,
      videoFormat: videoType
    });

    let response: Response | null = null;
    let data: any = null;

    // 기존 job이 없을 때만 API 호출
    if (shouldCallApi) {
      // API가 fresh created_at 타임스탬프로 새 job을 생성하도록 jobId를 전달하지 않음
      // (메인 페이지와 동일한 방식)

      // /api/generate-video-upload 호출
      response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload`, {
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

      data = await response.json();
      console.log('✅ [SCHEDULER] Video API response data:', JSON.stringify(data, null, 2));

      jobId = data.jobId;
    } else {
      // 기존 job 재사용 - jobId는 이미 설정됨
      console.log(`♻️ [SCHEDULER] Reusing existing job: ${jobId}`);
    }

    // 작업이 비동기로 처리되는 경우 폴링
    if (jobId) {
      addPipelineLog(pipelineId, 'info', `Video generation job: ${jobId}`);

      // ✅ FIX: jobId를 즉시 저장하여 진행 중 로그 조회 가능하도록
      const dbSaveJob = new Database(dbPath);
      const result = dbSaveJob.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(jobId, schedule.id);
      dbSaveJob.close();

      if (result.changes > 0) {
        console.log(`✅ [SCHEDULER] Saved video_id to schedule: ${jobId} -> ${schedule.id}`);
        addTitleLog(schedule.title_id, 'info', `🎬 영상 생성 작업 시작: ${jobId}`);
      } else {
        console.error(`❌ [SCHEDULER] Failed to save video_id! schedule.id: ${schedule.id}, jobId: ${jobId}`);
        addTitleLog(schedule.title_id, 'warn', `⚠️ video_id 저장 실패 (수동 연결 필요)`);
      }

      // 작업 완료 대기 (최대 30분)
      const maxWaitTime = 30 * 60 * 1000; // 30분
      const startTime = Date.now();
      let lastProgress = 0; // 마지막 진행률 추적

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5초마다 체크

        // 중지 요청 확인 (DB에서 schedule 상태 체크)
        const db = new Database(dbPath);
        const pipeline = db.prepare('SELECT status FROM automation_pipelines WHERE id = ?').get(pipelineId) as any;
        const scheduleStatus = db.prepare(`
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

        if (scheduleStatus && scheduleStatus.status === 'cancelled') {
          console.log(`🛑 [SCHEDULER] Schedule for pipeline ${pipelineId} was cancelled by user`);
          throw new Error('작업이 사용자에 의해 중지되었습니다');
        }

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`🔍 [SCHEDULER] Checking video status for ${jobId}... (경과시간: ${elapsed}초)`);

        const statusRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload?jobId=${jobId}`);
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

          // 🔥 최종 저장: 리턴 직전에 무조건 저장
          if (statusData.videoId && schedule && schedule.id) {
            const dbFinalSave = new Database(dbPath);
            dbFinalSave.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(statusData.videoId, schedule.id);
            dbFinalSave.close();
            console.log(`🔥 [FINAL SAVE] Video ID saved: ${statusData.videoId} -> ${schedule.id}`);
          }

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

    // 즉시 완료되는 경우 (거의 없지만 방어 코드)
    return { success: true, videoId: data?.videoId || jobId };

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

    // 🔒 중복 체크: 이미 업로드된 영상인지 확인
    const dbUploadCheck = new Database(dbPath);
    const existingUpload = dbUploadCheck.prepare(`
      SELECT id, video_url FROM youtube_uploads
      WHERE job_id = ?
        AND video_url IS NOT NULL
        AND video_url != ''
      LIMIT 1
    `).get(videoId) as { id: string; video_url: string } | undefined;
    dbUploadCheck.close();

    if (existingUpload) {
      console.warn(`⚠️ [YOUTUBE] 중복 업로드 방지: videoId=${videoId}는 이미 업로드됨 (${existingUpload.video_url})`);
      addPipelineLog(pipelineId, 'info', `⚠️ 이미 업로드된 영상입니다: ${existingUpload.video_url}`);

      // 스케줄 상태 업데이트
      const dbStatus = new Database(dbPath);
      dbStatus.prepare(`
        UPDATE video_schedules
        SET status = 'completed', youtube_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(existingUpload.video_url, schedule.id);
      dbStatus.close();

      return {
        success: true,
        uploadId: existingUpload.id,
        videoUrl: existingUpload.video_url
      }; // 중복 업로드 방지 - 기존 업로드 정보 반환
    }

    // YouTube API 호출
    const privacyValue = schedule.youtube_privacy || 'public';
    addPipelineLog(pipelineId, 'info', `Calling YouTube upload API for video: ${job.title}`);
    addPipelineLog(pipelineId, 'info', `YouTube 공개 설정: ${privacyValue} (DB값: ${schedule.youtube_privacy})`);

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
        privacy: privacyValue, // 사용자 설정 우선, 없으면 public
        channelId: schedule.channel,
        jobId: videoId,
        publishAt: schedule.youtube_publish_time,
        userId: schedule.user_id, // 내부 요청용 userId 전달
        type: job.type // 상품 타입 전달 (상품정보 대본 검색용)
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

    // video_schedules 테이블에 youtube_upload_id와 youtube_url 업데이트
    // YouTube API에서 이미 youtube_uploads 테이블에 저장했으므로 중복 저장하지 않음
    if (uploadData.uploadId || uploadData.videoUrl) {
      const uploadDb = new Database(dbPath);
      uploadDb.prepare(`
        UPDATE video_schedules
        SET youtube_upload_id = ?, youtube_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(uploadData.uploadId || null, uploadData.videoUrl || null, schedule.id);
      uploadDb.close();
      console.log(`✅ video_schedules 업데이트: youtube_upload_id = ${uploadData.uploadId}, youtube_url = ${uploadData.videoUrl}`);
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
    settings: getAutomationSettings(),
    lastAutoScheduleCheck: lastAutoScheduleCheck ? lastAutoScheduleCheck.toISOString() : null,
    lastAutoScheduleResult
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

    for (const scheduleRaw of waitingSchedules) {
      try {
        const schedule = scheduleRaw as any; // Type assertion for better type safety

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
        console.log(`[Scheduler] ✅ ${imageFiles.length} images found for ${schedule.id}`);
        addPipelineLog(schedule.id, 'info', `✅ ${imageFiles.length}개 이미지 업로드 확인됨, 영상 생성을 시작합니다`);
        addTitleLog(schedule.title_id, 'info', `✅ 이미지 ${imageFiles.length}개 업로드 확인됨!`);
        addTitleLog(schedule.title_id, 'info', `🎬 영상 생성을 시작합니다... (잠시만 기다려주세요)`);

        updateScheduleStatus(schedule.id, 'processing');

        // video 단계 시작 (비동기)
        // 기존에 생성된 video pipeline ID 찾기
        const db = new Database(dbPath);
        const videoPipeline = db.prepare(`
          SELECT id FROM automation_pipelines
          WHERE schedule_id = ? AND stage = 'video'
          LIMIT 1
        `).get(schedule.id) as any;
        db.close();

        const videoPipelineId = videoPipeline?.id || (schedule.id + '_video');
        console.log(`[Scheduler] Using video pipeline ID: ${videoPipelineId}`);
        console.log(`[Scheduler] Starting resumeVideoGeneration for ${schedule.id}`);

        resumeVideoGeneration(schedule, videoPipelineId).catch((error: any) => {
          console.error(`[Scheduler] Failed to resume video generation for ${schedule.id}:`, error);
          console.error(`[Scheduler] Error stack:`, error.stack);
          addPipelineLog(videoPipelineId, 'error', `Video generation failed: ${error.message}`);
          addTitleLog(schedule.title_id, 'error', `❌ 영상 생성 실패: ${error.message}`);
          updatePipelineStatus(videoPipelineId, 'failed');
          updateScheduleStatus(schedule.id, 'failed');
        });

      } catch (error: any) {
        console.error(`[Scheduler] Error checking schedule ${(scheduleRaw as any).id}:`, error);
      }
    }

  } catch (error: any) {
    console.error('[Scheduler] Error in checkWaitingForUploadSchedules:', error);
  }
}

// 영상 생성 완료되어 업로드 대기 중인 스케줄 체크 및 업로드 시작
async function checkReadyToUploadSchedules() {
  try {
    const db = new Database(dbPath);
    const readySchedules = db.prepare(`
      SELECT s.*, t.title, t.type, t.user_id
      FROM video_schedules s
      JOIN video_titles t ON s.title_id = t.id
      WHERE s.video_id IS NOT NULL
        AND s.youtube_url IS NULL
        AND s.status = 'processing'
      ORDER BY s.created_at ASC
      LIMIT 5
    `).all() as any[];
    db.close();

    if (readySchedules.length === 0) {
      return;
    }

    console.log(`[Scheduler] Found ${readySchedules.length} schedule(s) ready for upload`);

    for (const schedule of readySchedules) {
      try {
        console.log(`[Scheduler] Starting upload for schedule ${schedule.id}, video: ${schedule.video_id}`);

        // Upload pipeline 찾기
        const dbUpload = new Database(dbPath);
        const uploadPipeline = dbUpload.prepare(`
          SELECT id, status FROM automation_pipelines
          WHERE schedule_id = ? AND stage = 'upload'
          LIMIT 1
        `).get(schedule.id) as any;
        dbUpload.close();

        if (!uploadPipeline) {
          console.log(`[Scheduler] No upload pipeline found for ${schedule.id}, skipping`);
          continue;
        }

        // 이미 running이거나 completed면 스킵
        if (uploadPipeline.status === 'running' || uploadPipeline.status === 'completed') {
          console.log(`[Scheduler] Upload pipeline already ${uploadPipeline.status} for ${schedule.id}, skipping`);
          continue;
        }

        const uploadPipelineId = uploadPipeline.id;
        const maxRetry = 3;

        // 비동기로 업로드 시작
        resumeUploadPipeline(schedule, uploadPipelineId, maxRetry).catch((error: any) => {
          console.error(`[Scheduler] Failed to upload for ${schedule.id}:`, error);
          addPipelineLog(uploadPipelineId, 'error', `Upload failed: ${error.message}`);
          addTitleLog(schedule.title_id, 'error', `❌ 업로드 실패: ${error.message}`);
          updatePipelineStatus(uploadPipelineId, 'failed');
          updateScheduleStatus(schedule.id, 'failed');
        });

      } catch (error: any) {
        console.error(`[Scheduler] Error checking ready schedule ${schedule.id}:`, error);
      }
    }

  } catch (error: any) {
    console.error('[Scheduler] Error in checkReadyToUploadSchedules:', error);
  }
}

// 영상 생성 완료 후 업로드 재개
async function resumeUploadPipeline(schedule: any, uploadPipelineId: string, maxRetry: number) {
  addPipelineLog(uploadPipelineId, 'info', `Starting YouTube upload for video: ${schedule.video_id}`);
  addTitleLog(schedule.title_id, 'info', `📤 YouTube 업로드 중...`);
  updatePipelineStatus(uploadPipelineId, 'running');

  const uploadResult = await uploadToYouTube(schedule.video_id, schedule, uploadPipelineId, maxRetry);

  if (!uploadResult.success) {
    throw new Error(`YouTube upload failed: ${uploadResult.error}`);
  }

  updatePipelineStatus(uploadPipelineId, 'completed');

  // video_schedules 테이블에 youtube_url 저장
  const db = new Database(dbPath);
  db.prepare(`
    UPDATE video_schedules
    SET youtube_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(uploadResult.videoUrl, schedule.id);
  db.close();

  addPipelineLog(uploadPipelineId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
  addTitleLog(schedule.title_id, 'info', `✅ YouTube 업로드 완료: ${uploadResult.videoUrl}`);

  // Publish 단계
  const dbPublish = new Database(dbPath);
  const publishPipeline = dbPublish.prepare(`
    SELECT id FROM automation_pipelines
    WHERE schedule_id = ? AND stage = 'publish'
    LIMIT 1
  `).get(schedule.id) as any;
  dbPublish.close();

  const publishPipelineId = publishPipeline?.id || (schedule.id + '_publish');

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

  console.log(`[Scheduler] Upload pipeline completed for schedule ${schedule.id}`);
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

  if (!videoResult.videoId) {
    throw new Error('Video generation succeeded but videoId is missing');
  }

  console.log(`✅ [SCHEDULER] Video generation completed, videoId: ${videoResult.videoId}, schedule: ${schedule.id}`);

  updatePipelineStatus(videoPipelineId, 'completed');

  // video_schedules 테이블에 video_id 저장 (이미 저장되어 있지만 최종 확인)
  const dbUpdateVideo = new Database(dbPath);
  dbUpdateVideo.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(videoResult.videoId, schedule.id);
  dbUpdateVideo.close();
  console.log(`✅ [SCHEDULER] Video ID saved to schedule: ${videoResult.videoId} -> ${schedule.id}`);

  updateScheduleStatus(schedule.id, 'processing', { videoId: videoResult.videoId });
  addPipelineLog(videoPipelineId, 'info', `Video generated successfully: ${videoResult.videoId}`);
  addTitleLog(schedule.title_id, 'info', `✅ 영상 생성 완료: ${videoResult.videoId}`);

  // 이후 upload, publish 단계는 기존 로직 활용
  // TODO: upload와 publish 단계를 별도 함수로 분리하여 재사용
  console.log(`[Scheduler] Video generation completed for ${schedule.id}, continuing with upload...`);

  // Upload 단계 시작 - 기존 pipeline 찾기
  const dbUpload = new Database(dbPath);
  const uploadPipeline = dbUpload.prepare(`
    SELECT id FROM automation_pipelines
    WHERE schedule_id = ? AND stage = 'upload'
    LIMIT 1
  `).get(schedule.id) as any;
  dbUpload.close();

  const uploadPipelineId = uploadPipeline?.id || (schedule.id + '_upload');
  console.log(`[Scheduler] Using upload pipeline ID: ${uploadPipelineId}`);

  addPipelineLog(uploadPipelineId, 'info', `Starting YouTube upload for video: ${videoResult.videoId}`);
  addTitleLog(schedule.title_id, 'info', `📤 YouTube 업로드 중...`);
  updatePipelineStatus(uploadPipelineId, 'running');

  const uploadResult = await uploadToYouTube(videoResult.videoId, schedule, uploadPipelineId, maxRetry);

  if (!uploadResult.success) {
    throw new Error(`YouTube upload failed: ${uploadResult.error}`);
  }

  updatePipelineStatus(uploadPipelineId, 'completed');

  // video_schedules 테이블에 youtube_url 저장
  const db = new Database(dbPath);
  db.prepare(`
    UPDATE video_schedules
    SET youtube_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(uploadResult.videoUrl, schedule.id);
  db.close();

  addPipelineLog(uploadPipelineId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
  addTitleLog(schedule.title_id, 'info', `✅ YouTube 업로드 완료: ${uploadResult.videoUrl}`);

  // Publish 단계 - 기존 pipeline 찾기
  const dbPublish = new Database(dbPath);
  const publishPipeline = dbPublish.prepare(`
    SELECT id FROM automation_pipelines
    WHERE schedule_id = ? AND stage = 'publish'
    LIMIT 1
  `).get(schedule.id) as any;
  dbPublish.close();

  const publishPipelineId = publishPipeline?.id || (schedule.id + '_publish');
  console.log(`[Scheduler] Using publish pipeline ID: ${publishPipelineId}`);

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

// ========== 완전 자동화: 채널 주기 체크 및 자동 스케줄 생성 ==========

/**
 * 채널별 주기를 확인하고, 주기가 도래했으면 자동으로 제목 생성 → 스케줄 추가
 * 1. 모든 활성화된 채널 설정 조회
 * 2. 각 채널의 다음 스케줄 시간 계산
 * 3. 다음 스케줄이 없으면 (또는 주기가 도래했으면):
 *    - 카테고리에서 랜덤하게 선택
 *    - AI로 제목 생성
 *    - 제목 DB에 추가
 *    - 스케줄 자동 추가
 */
export async function checkAndCreateAutoSchedules() {
  try {
    // ⚠️ 먼저 자동 제목 생성이 활성화되어 있는지 확인
    const settings = getAutomationSettings();
    const autoTitleGeneration = settings.auto_title_generation === 'true';

    if (!autoTitleGeneration) {
      console.log('[AutoScheduler] Auto title generation is disabled, skipping');
      lastAutoScheduleResult = { success: 0, failed: 0, skipped: 0 };
      return { success: 0, failed: 0, skipped: 0 };
    }

    lastAutoScheduleCheck = new Date();
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    const db = new Database(dbPath);

    // 1. 모든 활성화된 채널 설정 조회
    const channelSettings = db.prepare(`
      SELECT * FROM youtube_channel_settings
      WHERE is_active = 1
    `).all() as any[];

    db.close();

    if (channelSettings.length === 0) {
      console.log('[AutoScheduler] No active channel settings found');
      lastAutoScheduleResult = { success: 0, failed: 0, skipped: 0 };
      return { success: 0, failed: 0, skipped: 0 };
    }

    console.log(`[AutoScheduler] Checking ${channelSettings.length} active channels for auto-scheduling`);

    for (const setting of channelSettings) {
      try {
        // categories가 없거나 빈 문자열이면 자동 생성 불가
        if (!setting.categories || setting.categories.trim() === '') {
          console.log(`[AutoScheduler] ⏸️ Channel ${setting.channel_name}: No categories configured, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        let categories;
        try {
          categories = JSON.parse(setting.categories);
        } catch (parseError) {
          console.log(`[AutoScheduler] ⏸️ Channel ${setting.channel_name}: Invalid categories JSON, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        if (!categories || !Array.isArray(categories) || categories.length === 0) {
          console.log(`[AutoScheduler] ⏸️ Channel ${setting.channel_name}: Empty categories array, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        // 2. 이 채널의 최근 스케줄 확인
        const db2 = new Database(dbPath);
        const lastSchedule = db2.prepare(`
          SELECT s.*, t.channel
          FROM video_schedules s
          JOIN video_titles t ON s.title_id = t.id
          WHERE t.channel = ? AND t.user_id = ?
          ORDER BY s.scheduled_time DESC
          LIMIT 1
        `).get(setting.channel_id, setting.user_id) as any;
        db2.close();

        // 3. 다음 스케줄 시간 계산
        const { calculateNextScheduleTime } = await import('./automation');
        const nextScheduleTime = calculateNextScheduleTime(
          setting.user_id,
          setting.channel_id,
          lastSchedule ? new Date(lastSchedule.scheduled_time) : undefined
        );

        if (!nextScheduleTime) {
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Could not calculate next schedule time`);
          skippedCount++;
          continue;
        }

        // 4. 다음 스케줄이 이미 존재하는지 확인
        const db3 = new Database(dbPath);
        const existingSchedule = db3.prepare(`
          SELECT s.id
          FROM video_schedules s
          JOIN video_titles t ON s.title_id = t.id
          WHERE t.channel = ? AND t.user_id = ?
            AND s.scheduled_time >= ?
            AND s.status IN ('pending', 'processing')
          LIMIT 1
        `).get(
          setting.channel_id,
          setting.user_id,
          nextScheduleTime.toISOString()
        ) as any;
        db3.close();

        if (existingSchedule) {
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Schedule already exists for next time, skipping`);
          skippedCount++;
          continue;
        }

        // 5. 카테고리에서 랜덤 선택
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];

        console.log(`[AutoScheduler] Channel ${setting.channel_name}: Generating content for category "${randomCategory}"`);

        let titleId: string;
        let generatedTitle: string;
        let productData: any = null;

        // 6. 카테고리별 분기 처리
        if (randomCategory === '상품') {
          // === 상품 카테고리: 쿠팡 베스트 상품 조회 ===
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Fetching Coupang bestseller...`);

          const result = await generateProductTitle(setting.user_id, setting.channel_id, setting.channel_name);
          if (!result) {
            throw new Error('Failed to generate product title');
          }

          titleId = result.titleId;
          generatedTitle = result.title;
          productData = result.productData;

        } else {
          // === 다른 카테고리: 멀티 모델 AI 평가 시스템 ===
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Using multi-model AI evaluation...`);

          const result = await generateTitleWithMultiModelEvaluation(randomCategory, setting.user_id, setting.channel_id, setting.channel_name);
          if (!result) {
            throw new Error('Failed to generate title with multi-model evaluation');
          }

          titleId = result.titleId;
          generatedTitle = result.title;
        }

        console.log(`[AutoScheduler] Channel ${setting.channel_name}: Created title ${titleId}`);

        // 8. 스케줄 자동 추가
        const { addSchedule } = await import('./automation');
        const scheduleId = addSchedule({
          titleId,
          scheduledTime: nextScheduleTime.toISOString(),
          youtubePrivacy: 'public' // 기본값, 필요 시 채널 설정에 추가 가능
        });

        console.log(`[AutoScheduler] ✅ Channel ${setting.channel_name}: Auto-scheduled "${generatedTitle}" for ${nextScheduleTime.toISOString()}`);

        // 9. 로그 추가
        const { addTitleLog } = await import('./automation');
        addTitleLog(titleId, 'info', `🤖 완전 자동화: 주기 도래로 제목 자동 생성 및 스케줄 추가 (채널: ${setting.channel_name}, 카테고리: ${randomCategory})`);

        successCount++;

      } catch (channelError: any) {
        console.error(`[AutoScheduler] Error processing channel ${setting.channel_name}:`, channelError);
        failedCount++;
        // 개별 채널 실패는 전체 프로세스를 중단하지 않음
      }
    }

    lastAutoScheduleResult = { success: successCount, failed: failedCount, skipped: skippedCount };
    console.log(`[AutoScheduler] ✅ Completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`);
    return lastAutoScheduleResult;

  } catch (error: any) {
    console.error('[AutoScheduler] Error in checkAndCreateAutoSchedules:', error);
    lastAutoScheduleResult = { success: 0, failed: 1, skipped: 0 };
    return lastAutoScheduleResult;
  }
}

// ============================================================
// 상품 카테고리: 쿠팡 베스트 상품 조회 및 제목 생성
// ============================================================

async function generateProductTitle(
  userId: string,
  channelId: string,
  channelName: string
): Promise<{ titleId: string; title: string; productData: any } | null> {
  const { startAutoGenerationLog, updateAutoGenerationLog } = await import('./automation');
  let logId: string | null = null;

  try {
    // 로그 시작
    logId = startAutoGenerationLog({
      userId,
      channelId,
      channelName,
      category: '상품'
    });

    // 초기 상태 업데이트
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'started',
        step: '쿠팡 베스트 상품 조회 중...'
      });
    }

    // 1. 쿠팡 베스트 상품 조회 (내부 함수 직접 사용)
    const { getCoupangBestsellers } = await import('./coupang');
    const result = await getCoupangBestsellers(userId, '1001');

    if (!result.success || !result.products || result.products.length === 0) {
      console.log('[ProductTitle] No products found');
      if (logId) {
        updateAutoGenerationLog(logId, {
          status: 'failed',
          step: '상품 없음',
          errorMessage: 'No products found'
        });
      }
      return null;
    }

    const products = result.products;

    // 로그 업데이트: 중복 확인
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'fetching',
        step: '기존 상품과 중복 확인 중...'
      });
    }

    // 2. DB에서 기존 상품 조회
    const db = new Database(dbPath);
    const existingUrls = db.prepare(`
      SELECT product_url FROM coupang_products WHERE user_id = ?
    `).all(userId).map((row: any) => row.product_url);
    db.close();

    // 3. DB에 없는 상품 찾기
    const newProduct = products.find((p: any) => !existingUrls.includes(p.productUrl));

    if (!newProduct) {
      console.log('[ProductTitle] All products already in DB, skipping');
      if (logId) {
        updateAutoGenerationLog(logId, {
          status: 'failed',
          step: '중복 상품',
          errorMessage: 'All products already exist in database'
        });
      }
      return null;
    }

    console.log(`[ProductTitle] Found new product: ${newProduct.productName}`);

    // 로그 업데이트: 새 상품 발견
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'generating',
        step: `새 상품 발견: ${newProduct.productName.substring(0, 30)}...`,
        productInfo: {
          productName: newProduct.productName,
          productPrice: newProduct.productPrice,
          productImage: newProduct.productImage
        }
      });
    }

    // 4. 상품 DB에 추가
    const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const db2 = new Database(dbPath);
    db2.prepare(`
      INSERT INTO coupang_products
        (id, user_id, product_url, deep_link, title, description, category, original_price, discount_price, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      productId,
      userId,
      newProduct.productUrl,
      newProduct.link || '',
      newProduct.productName,
      newProduct.productName, // description도 제목 사용
      '가전디지털', // 기본 카테고리
      newProduct.productPrice || 0,
      newProduct.productPrice || 0,
      newProduct.productImage || ''
    );
    db2.close();

    console.log(`[ProductTitle] Added product to DB: ${productId}`);

    // 5. 제목 생성 (상품 이름 기반)
    const title = `${newProduct.productName.substring(0, 50)}... 리뷰`;

    // 6. video_titles에 추가
    const { addVideoTitle } = await import('./automation');
    const titleId = addVideoTitle({
      title,
      type: 'product',
      category: '상품',
      channel: '', // 나중에 스케줄 추가 시 설정
      scriptMode: 'chrome',
      mediaMode: 'dalle3',
      model: 'gemini', // 상품은 Gemini 기본
      userId,
      productUrl: newProduct.productUrl
    });

    // 로그 완료
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'completed',
        step: '제목 생성 완료',
        bestTitle: title,
        bestScore: 100, // 상품 제목은 점수 평가 없음
        resultTitleId: titleId
      });
    }

    return {
      titleId,
      title,
      productData: newProduct
    };

  } catch (error: any) {
    console.error('[ProductTitle] Error:', error);
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'failed',
        step: '에러 발생',
        errorMessage: error.message || 'Unknown error'
      });
    }
    return null;
  }
}

// ============================================================
// 규칙 기반 제목 점수 평가 (AI 비용 절감)
// ============================================================

/**
 * 간단한 규칙 기반으로 제목 점수를 평가합니다.
 * AI API 호출 없이 로컬에서 빠르게 평가할 수 있습니다.
 */
function evaluateTitleWithRules(title: string, category: string): number {
  let score = 0;

  // 1. 제목 길이 평가 (20-60자가 최적)
  const length = title.length;
  if (length >= 20 && length <= 60) {
    score += 30; // 최적 길이
  } else if (length >= 15 && length < 20) {
    score += 20; // 약간 짧음
  } else if (length > 60 && length <= 80) {
    score += 20; // 약간 김
  } else if (length < 15) {
    score += 5; // 너무 짧음
  } else {
    score += 10; // 너무 김
  }

  // 2. 특수문자 평가 (호기심 유발)
  const hasQuestion = title.includes('?');
  const hasExclamation = title.includes('!');
  const hasEllipsis = title.includes('...');
  const hasQuotes = title.includes('"') || title.includes("'");

  if (hasQuestion) score += 10;
  if (hasExclamation) score += 8;
  if (hasEllipsis) score += 5;
  if (hasQuotes) score += 5;

  // 3. 감정 키워드 평가
  const emotionalKeywords = [
    '후회', '복수', '반전', '충격', '눈물', '감동',
    '배신', '비밀', '진실', '최후', '귀환', '성공',
    '통쾌', '화려', '무릎', '외면', '당당', '전설',
    '알고보니', '결국', '드디어', '끝판왕', '최고'
  ];

  let emotionalCount = 0;
  for (const keyword of emotionalKeywords) {
    if (title.includes(keyword)) {
      emotionalCount++;
    }
  }
  score += Math.min(emotionalCount * 5, 20); // 최대 20점

  // 4. 숫자 포함 여부 (구체성)
  if (/\d+/.test(title)) {
    score += 8;
  }

  // 5. 카테고리 관련 키워드 평가
  const categoryKeywords: Record<string, string[]> = {
    '시니어사연': ['시어머니', '며느리', '고부갈등', '시댁', '양로원'],
    '복수극': ['복수', '무시', 'CEO', '귀환', '배신자', '신입'],
    '탈북자사연': ['탈북', '북한', '남한', '자유', '대한민국'],
    '막장드라마': ['출생', '비밀', '재벌', '배다른', '친자확인'],
  };

  const keywords = categoryKeywords[category] || [];
  let categoryCount = 0;
  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      categoryCount++;
    }
  }
  score += Math.min(categoryCount * 7, 15); // 최대 15점

  // 6. 문장 구조 평가
  const hasComma = (title.match(/,/g) || []).length;
  if (hasComma >= 1 && hasComma <= 2) {
    score += 7; // 적절한 구조
  }

  // 7. 주어 명확성 평가 (가장 중요!)
  // 문제: "무시당했던 청소부, CEO가 된 비결" - 누가 CEO가 됐는지 불명확
  // 해결: "청소부를 무시했던 그들, CEO가 된 그녀 앞에서..." - 주어가 명확함
  let clarityScore = 0;

  // 7-1. 목적격 조사 + 과거형 패턴 (가해자 명시)
  // "~를 무시했던", "~을 괴롭혔던", "~에게 배신당했던" 등
  const aggressorPatterns = [
    /[을를]?\s*(무시|괴롭히|배신|내쫓|외면|무시당|차별).*?[했던|한|하던]/,
    /에게\s*(배신|무시).*?당했던/
  ];

  let hasAggressor = false;
  for (const pattern of aggressorPatterns) {
    if (pattern.test(title)) {
      hasAggressor = true;
      break;
    }
  }

  // 7-2. 명확한 주어 대명사 또는 지시어
  // "그들", "그녀", "그", "그 앞에서", "그녀 앞에"
  const hasClearSubject = /그들|그녀|그 앞|그가|그를/.test(title);

  // 7-3. 시간 표현 + 변화 패턴 (과거-현재 대비)
  // "3년 후", "10년 만에" 등 + "CEO가 된", "성공한" 등
  const hasTimeTransition = /\d+년\s*(후|만에|뒤).*?(가 된|로 나타|한 그|된 그)/.test(title);

  // 7-4. 애매한 패턴 감점
  // "무시당했던 청소부, CEO로..." - 청소부가 주어인지 불명확
  const hasAmbiguousPattern = /당했던.*?,.*?로\s*(성공|변신|등극)/.test(title) && !hasClearSubject;

  // 점수 계산
  if (hasAggressor) clarityScore += 8; // 가해자 명시
  if (hasClearSubject) clarityScore += 7; // 명확한 주어
  if (hasTimeTransition) clarityScore += 5; // 시간+변화
  if (hasAmbiguousPattern) clarityScore -= 10; // 애매한 패턴 감점

  score += Math.max(0, clarityScore); // 최대 20점 (감점 가능)

  // 최종 점수를 0-100 범위로 제한
  return Math.min(100, Math.max(0, score));
}

// ============================================================
// 다른 카테고리: 멀티 모델 AI 평가 및 최고 점수 제목 선택
// ============================================================

async function generateTitleWithMultiModelEvaluation(
  category: string,
  userId: string,
  channelId: string,
  channelName: string
): Promise<{ titleId: string; title: string } | null> {
  const { startAutoGenerationLog, updateAutoGenerationLog, getTitleFromPool, addVideoTitle } = await import('./automation');
  let logId: string | null = null;

  try {
    // 제목 풀 사용 설정 확인
    const settings = getAutomationSettings();
    const useTitlePool = settings.use_title_pool === 'true';

    // 로그 시작
    logId = startAutoGenerationLog({
      userId,
      channelId,
      channelName,
      category
    });

    // 초기 상태 업데이트
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'started',
        step: useTitlePool ? '고품질 제목 풀 확인 중...' : 'AI로 제목 생성 준비 중...'
      });
    }

    // 🎯 선택사항: 제목 풀 사용 (설정에 따라)
    if (useTitlePool) {
      console.log(`[TitlePool] Checking title pool for category "${category}"...`);
      const poolTitle = getTitleFromPool(category, 90) as any;

      if (poolTitle) {
        console.log(`[TitlePool] ✅ Found high-quality title from pool (score: ${poolTitle.score})`);
        console.log(`[TitlePool] Title: "${poolTitle.title}"`);

        // 카테고리별 비디오 타입 결정
        let videoType = 'longform';
        if (category.includes('숏') || category === 'shortform' || category === 'Shorts') {
          videoType = 'shortform';
        }

        // video_titles에 추가
        const titleId = addVideoTitle({
          title: poolTitle.title,
          type: videoType,
          category,
          channel: channelId,
          scriptMode: 'chrome',
          mediaMode: 'dalle3',
          model: 'ollama-pool', // 풀에서 가져왔음을 표시
          userId
        });

        // 로그 완료
        if (logId) {
          updateAutoGenerationLog(logId, {
            status: 'completed',
            step: '제목 풀에서 선택 완료 (비용 $0)',
            bestTitle: poolTitle.title,
            bestScore: poolTitle.score,
            resultTitleId: titleId
          });
        }

        return {
          titleId,
          title: poolTitle.title
        };
      }

      console.log(`[TitlePool] ⚠️ No high-quality titles in pool, falling back to AI generation...`);
    }

    // 카테고리별 기본 모델 결정
    let defaultModel = 'claude'; // 기본값
    let videoType = 'longform'; // 기본값

    if (category.includes('숏') || category === 'shortform' || category === 'Shorts') {
      defaultModel = 'chatgpt';
      videoType = 'shortform';
    } else if (category.includes('롱') || category === 'longform') {
      defaultModel = 'claude';
      videoType = 'longform';
    }

    console.log(`[TitleGen] Generating titles for category "${category}" using ${defaultModel} (type: ${videoType})...`);

    // 로그 업데이트: 모델 호출
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'generating',
        step: `${defaultModel.toUpperCase()}로 제목 생성 중...`,
        modelsUsed: [defaultModel]
      });
    }

    // 2. 선택된 모델로 제목 생성
    const titles = await generateTitlesWithModel(category, defaultModel);

    // 2. 제목 수집
    const allTitles = titles.map((t: string) => ({ title: t, model: defaultModel, score: 0 }));

    if (allTitles.length === 0) {
      console.error('[MultiModel] No titles generated from any model');
      if (logId) {
        updateAutoGenerationLog(logId, {
          status: 'failed',
          step: '제목 생성 실패',
          errorMessage: 'No titles generated from any model'
        });
      }
      return null;
    }

    console.log(`[TitleGen] Generated ${allTitles.length} titles`);

    // 로그 업데이트: 규칙 기반 평가
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'evaluating',
        step: `규칙 기반으로 제목 평가 중... (AI 비용 절감)`
      });
    }

    // 3. 규칙 기반으로 각 제목 평가
    const scoredTitles = allTitles.map((item: any) => ({
      ...item,
      score: evaluateTitleWithRules(item.title, category)
    }));

    // 4. 최고 점수의 제목 선택
    scoredTitles.sort((a, b) => b.score - a.score);
    const bestTitle = scoredTitles[0];

    console.log(`[TitleGen] Evaluated ${scoredTitles.length} titles with rule-based scoring`);
    console.log(`[TitleGen] Best title (score: ${bestTitle.score}): "${bestTitle.title}" (model: ${bestTitle.model})`);

    // 상위 3개 제목 로그 출력
    scoredTitles.slice(0, 3).forEach((item: any, index: number) => {
      console.log(`  ${index + 1}. [${item.score}점] ${item.title}`);
    });

    // 5. video_titles에 추가
    const titleId = addVideoTitle({
      title: bestTitle.title,
      type: videoType, // 카테고리에 따라 longform 또는 shortform
      category,
      channel: channelId,
      scriptMode: 'chrome',
      mediaMode: 'dalle3',
      model: bestTitle.model,
      userId
    });

    // 로그 완료
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'completed',
        step: '제목 선정 완료 (규칙 기반 평가)',
        titlesGenerated: scoredTitles,
        bestTitle: bestTitle.title,
        bestScore: bestTitle.score,
        resultTitleId: titleId
      });
    }

    return {
      titleId,
      title: bestTitle.title
    };

  } catch (error: any) {
    console.error('[MultiModel] Error:', error);
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'failed',
        step: '에러 발생',
        errorMessage: error.message || 'Unknown error'
      });
    }
    return null;
  }
}

// 특정 모델로 제목 생성 (내부 함수 직접 사용)
async function generateTitlesWithModel(category: string, model: string): Promise<string[]> {
  try {
    const {
      generateTitlesWithClaude,
      generateTitlesWithChatGPT,
      generateTitlesWithGemini
    } = await import('./ai-title-generation');

    if (model === 'claude') {
      return await generateTitlesWithClaude(category, 3);
    } else if (model === 'chatgpt') {
      return await generateTitlesWithChatGPT(category, 3);
    } else if (model === 'gemini') {
      return await generateTitlesWithGemini(category, 3);
    } else {
      console.error(`[${model}] Unknown model`);
      return [];
    }

  } catch (error: any) {
    console.error(`[${model}] Error:`, error);
    return [];
  }
}

// 제목 점수 평가 (내부 함수 직접 사용)
async function evaluateTitleScore(title: string, category: string): Promise<number> {
  try {
    const { evaluateTitleScore: evaluate } = await import('./ai-title-generation');
    return await evaluate(title, category);
  } catch (error: any) {
    console.error('[ScoreEvaluation] Error:', error);
    return 50; // 에러 시 중간 점수
  }
}

// ============================================================
// 숏폼 자동 업로드 체커
// ============================================================
/**
 * 완료된 숏폼 작업을 찾아서 YouTube에 업로드합니다.
 * 업로드 시 설명란에 롱폼 링크를 추가합니다.
 */
export async function checkCompletedShortformJobs() {
  try {
    const db = new Database(dbPath);

    // shortform_job_id가 있고 아직 업로드되지 않은 스케줄 찾기
    const schedulesWithShortform = db.prepare(`
      SELECT vs.*, vt.user_id, vt.channel, vt.tags
      FROM video_schedules vs
      LEFT JOIN video_titles vt ON vs.title_id = vt.id
      WHERE vs.shortform_job_id IS NOT NULL
        AND (vs.shortform_uploaded IS NULL OR vs.shortform_uploaded = 0)
    `).all() as any[];

    if (schedulesWithShortform.length === 0) {
      return;
    }

    console.log(`🔍 [SHORTFORM CHECKER] Found ${schedulesWithShortform.length} schedules with shortform jobs`);

    for (const schedule of schedulesWithShortform) {
      try {
        const shortformJobId = schedule.shortform_job_id;
        const longformYoutubeUrl = schedule.longform_youtube_url;

        console.log(`🔍 [SHORTFORM] Checking shortform job: ${shortformJobId}`);

        // 숏폼 작업 상태 확인
        const shortformJob = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(shortformJobId) as any;

        if (!shortformJob) {
          console.log(`⚠️ [SHORTFORM] Job not found: ${shortformJobId}`);
          continue;
        }

        console.log(`🔍 [SHORTFORM] Job status: ${shortformJob.status}`);

        if (shortformJob.status !== 'completed') {
          console.log(`⏳ [SHORTFORM] Job not yet completed: ${shortformJob.status}`);
          continue;
        }

        // 숏폼 완료됨 - YouTube 업로드 시작
        console.log(`✅ [SHORTFORM] Shortform completed! Starting YouTube upload...`);
        addTitleLog(schedule.title_id, 'info', `✅ 숏폼 생성 완료! YouTube 업로드 시작...`);

        // 파이프라인 생성
        const uploadPipelineId = createPipeline(schedule.id, 'upload', 'shortform_upload');
        updatePipelineStatus(uploadPipelineId, 'running');

        // YouTube 업로드 (롱폼 링크를 설명란에 추가)
        const videoPath = shortformJob.video_path;
        const title = shortformJob.title || schedule.title;

        // 설명란에 롱폼 링크 추가
        let description = '';
        if (longformYoutubeUrl) {
          description = `롱폼 : ${longformYoutubeUrl}`;
        }

        console.log(`📤 [SHORTFORM] Uploading to YouTube with description: ${description}`);
        addTitleLog(schedule.title_id, 'info', `📤 숏폼 YouTube 업로드 중... (설명: ${description})`);

        const uploadResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/youtube/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system'
          },
          body: JSON.stringify({
            videoPath,
            title: `${title} (쇼츠)`,
            description,
            tags: schedule.tags ? schedule.tags.split(',').map((t: string) => t.trim()) : [],
            privacy: schedule.youtube_privacy || 'public',
            channelId: schedule.channel,
            jobId: shortformJobId,
            publishAt: null, // 숏폼은 즉시 공개
            userId: schedule.user_id,
            type: 'shortform'
          })
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`❌ [SHORTFORM] Upload failed: ${errorText}`);
          addTitleLog(schedule.title_id, 'error', `❌ 숏폼 업로드 실패: ${errorText}`);
          updatePipelineStatus(uploadPipelineId, 'failed', errorText);
          continue;
        }

        const uploadData = await uploadResponse.json();

        if (!uploadData.success) {
          console.error(`❌ [SHORTFORM] Upload failed: ${uploadData.error}`);
          addTitleLog(schedule.title_id, 'error', `❌ 숏폼 업로드 실패: ${uploadData.error}`);
          updatePipelineStatus(uploadPipelineId, 'failed', uploadData.error);
          continue;
        }

        // 업로드 성공 - shortform_uploaded 플래그 업데이트
        db.prepare(`
          UPDATE video_schedules
          SET shortform_uploaded = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(schedule.id);

        console.log(`✅ [SHORTFORM] Upload successful: ${uploadData.videoUrl}`);
        addTitleLog(schedule.title_id, 'info', `✅ 숏폼 YouTube 업로드 완료!`);
        addTitleLog(schedule.title_id, 'info', `🎉 숏폼: ${uploadData.videoUrl}`);
        updatePipelineStatus(uploadPipelineId, 'completed');

      } catch (error: any) {
        console.error(`❌ [SHORTFORM] Error processing shortform for schedule ${schedule.id}:`, error);
        addTitleLog(schedule.title_id, 'error', `❌ 숏폼 처리 중 오류: ${error.message}`);
      }
    }

    db.close();
  } catch (error: any) {
    console.error('❌ [SHORTFORM CHECKER] Error:', error);
  }
}
