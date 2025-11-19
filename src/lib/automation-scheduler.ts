/**
 * ?먮룞???ㅼ?以꾨윭 諛??뚯씠?꾨씪???ㅼ??ㅽ듃?덉씠??
 * ?쒕ぉ ???蹂??앹꽦 ???곸긽 ?앹꽦 ???좏뒠釉??낅줈?????쇰툝由ъ떆
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

// ?ㅼ?以꾨윭 ?명꽣踰?
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let lastAutoScheduleCheck: Date | null = null;
let lastAutoScheduleResult: { success: number; failed: number; skipped: number } = { success: 0, failed: 0, skipped: 0 };

function isPipelineOrScheduleCancelled(pipelineId: string): boolean {
  try {
    const db = new Database(dbPath);
    const pipeline = db.prepare('SELECT status, schedule_id FROM automation_pipelines WHERE id = ?').get(pipelineId) as { status: string; schedule_id?: string } | undefined;
    let scheduleStatus: string | undefined;

    if (pipeline?.schedule_id) {
      const scheduleRow = db.prepare('SELECT status FROM video_schedules WHERE id = ?').get(pipeline.schedule_id) as { status: string } | undefined;
      scheduleStatus = scheduleRow?.status;
    }

    db.close();

    if (pipeline && (pipeline.status === 'failed' || pipeline.status === 'cancelled')) {
      return true;
    }

    if (scheduleStatus === 'cancelled') {
      return true;
    }
  } catch (error) {
    console.error(`[Scheduler] Failed to check cancellation for pipeline ${pipelineId}:`, (error as Error).message);
  }

  return false;
}

// ?쒕ぉ ?곹깭 ?낅뜲?댄듃 ?ы띁 ?⑥닔
function updateTitleStatus(titleId: string, status: 'pending' | 'scheduled' | 'processing' | 'completed' | 'failed' | 'waiting_for_upload' | 'cancelled') {
  try {
    const db = new Database(dbPath);
    db.prepare(`
      UPDATE video_titles
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, titleId);
    db.close();
    console.log(`?뱷 [Title Status] ${titleId} ??${status}`);
  } catch (error) {
    console.error('Failed to update title status:', error);
  }
}

// ?ㅼ?以꾨윭 ?쒖옉
export function startAutomationScheduler() {
  if (schedulerInterval) {
    console.log('?좑툘 Scheduler is already running');
    return;
  }

  const settings = getAutomationSettings();
  const enabled = settings.enabled === 'true';
  // 理쒖냼 3珥?媛꾧꺽 (以묐났 ?ㅽ뻾 諛⑹?)
  const checkInterval = Math.max(3, parseInt(settings.check_interval || '10')) * 1000;

  if (!enabled) {
    console.log('?좑툘 Automation is disabled in settings');
    return;
  }

  console.log(`??Automation scheduler started (checking every ${checkInterval / 1000}s)`);

  // 利됱떆 ??踰??ㅽ뻾
  processPendingSchedules();

  // ?먮룞 ?쒕ぉ ?앹꽦???쒖꽦?붾맂 寃쎌슦?먮쭔 ?ㅽ뻾
  const autoTitleGeneration = settings.auto_title_generation === 'true';
  if (autoTitleGeneration) {
    checkAndCreateAutoSchedules(); // ?꾩쟾 ?먮룞?? 梨꾨꼸 二쇨린 泥댄겕 諛??먮룞 ?ㅼ?以??앹꽦
    console.log('??Auto title generation is enabled');
  } else {
    console.log('?몌툘 Auto title generation is disabled');
  }

  // 二쇨린?곸쑝濡??ㅽ뻾
  schedulerInterval = setInterval(() => {
    processPendingSchedules();
    checkWaitingForUploadSchedules(); // ?대?吏 ?낅줈???湲?以묒씤 ?ㅼ?以?泥댄겕
    checkReadyToUploadSchedules(); // ?곸긽 ?앹꽦 ?꾨즺?섏뼱 ?낅줈???湲?以묒씤 ?ㅼ?以?泥댄겕
    checkCompletedShortformJobs(); // ?꾨즺???륂뤌 ?묒뾽 泥댄겕 諛??낅줈??

    // ?먮룞 ?쒕ぉ ?앹꽦???쒖꽦?붾맂 寃쎌슦?먮쭔 ?ㅽ뻾
    const settings = getAutomationSettings();
    const autoTitleGeneration = settings.auto_title_generation === 'true';
    if (autoTitleGeneration) {
      checkAndCreateAutoSchedules(); // ?꾩쟾 ?먮룞?? 梨꾨꼸 二쇨린 泥댄겕 諛??먮룞 ?ㅼ?以??앹꽦
    }
  }, checkInterval);
}

// ?ㅼ?以꾨윭 以묒?
export function stopAutomationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    isRunning = false;
    console.log('?몌툘 Automation scheduler stopped (吏꾪뻾 以묒씤 ?묒뾽? 怨꾩냽 ?ㅽ뻾??');
    console.log('?뮕 Note: ?대? ?쒖옉???뚯씠?꾨씪?몄? ?щ젅?㏃씠 李④컧?섏뿀?쇰?濡??꾨즺源뚯? 吏꾪뻾?⑸땲??');
  }
}

// ?덉빟???ㅼ?以?泥섎━
async function processPendingSchedules() {
  if (isRunning) {
    console.log('?좑툘 Previous schedule processing is still running, skipping...');
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

    // Debug: 泥ル쾲吏??ㅼ?以꾩쓽 ?꾩껜 ??濡쒓퉭
    if (pendingSchedules.length > 0) {
      console.log('?뵇 [SCHEDULER] First schedule keys:', Object.keys(pendingSchedules[0] as any));
      console.log('?뵇 [SCHEDULER] First schedule has product_data?:', !!(pendingSchedules[0] as any).product_data);
    }

    for (const schedule of pendingSchedules) {
      try {
        // ?뚯씠?꾨씪?몄씠 ?대? 議댁옱?섎뒗吏 癒쇱? ?뺤씤 (DB ?좉툑?쇰줈 race condition 諛⑹?)
        const db = new Database(dbPath);

        const existingPipeline = db.prepare(`
          SELECT id FROM automation_pipelines WHERE schedule_id = ? LIMIT 1
        `).get((schedule as any).id);

        if (existingPipeline) {
          console.log(`[Scheduler] Pipeline already exists for schedule ${(schedule as any).id}, skipping`);
          db.close();
          continue;
        }

        // ?먯옄?곸쑝濡??ㅼ?以??곹깭瑜?'processing'?쇰줈 蹂寃?(以묐났 ?ㅽ뻾 諛⑹?)
        const result = db.prepare(`
          UPDATE video_schedules
          SET status = 'processing', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending'
        `).run((schedule as any).id);

        // ?낅뜲?댄듃??row媛 ?놁쑝硫??ㅻⅨ ?ㅼ?以꾨윭媛 ?대? 泥섎━ 以?
        if (result.changes === 0) {
          console.log(`[Scheduler] Schedule ${(schedule as any).id} already being processed by another scheduler`);
          db.close();
          continue;
        }

        // 利됱떆 ?뚯씠?꾨씪???앹꽦 (媛숈? DB ?곌껐 ?ъ슜?섏뿬 ?먯옄??蹂댁옣)
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
              // UNIQUE ?쒖빟議곌굔 ?꾨컲 (?대? ?ㅻⅨ ?ㅼ?以꾨윭媛 ?앹꽦??
              if (insertError.code === 'SQLITE_CONSTRAINT_UNIQUE' || insertError.message?.includes('UNIQUE')) {
                console.log(`[Scheduler] Pipeline for stage ${stage} already exists for schedule ${(schedule as any).id}, using existing one`);
                // 湲곗〈 ?뚯씠?꾨씪??ID 媛?몄삤湲?
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

        // ?쒕ぉ ?곹깭??'processing'?쇰줈 蹂寃?
        updateTitleStatus((schedule as any).title_id, 'processing');

        // ?뚯씠?꾨씪???ㅽ뻾 (鍮꾨룞湲곕줈 ?ㅽ뻾)
        executePipeline(schedule as any, pipelineIds).catch(error => {
          console.error(`[Scheduler] Pipeline execution failed for ${(schedule as any).id}:`, error);
        });

      } catch (error: any) {
        console.error(`[Scheduler] Failed to process schedule ${(schedule as any).id}:`, error);
        updateScheduleStatus((schedule as any).id, 'failed');
        updateTitleStatus((schedule as any).title_id, 'failed');

        // ?먮윭 ?대찓???꾩넚
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

// ?뚯씠?꾨씪???ㅽ뻾
export async function executePipeline(schedule: any, pipelineIds: string[]) {
  const [scriptPipelineId, videoPipelineId, uploadPipelineId, publishPipelineId] = pipelineIds;
  const settings = getAutomationSettings();
  const mediaMode = `${schedule.media_mode || settings.media_generation_mode || 'upload'}`.trim();
  const maxRetry = parseInt(settings.max_retry || '3');

  try {
    // ============================================================
    // Stage 1: ?蹂??앹꽦
    // ============================================================
    addPipelineLog(scriptPipelineId, 'info', `Starting script generation for: ${schedule.title}`);
    addTitleLog(schedule.title_id, 'info', `Starting script generation for: ${schedule.title}`);
    updatePipelineStatus(scriptPipelineId, 'running');

    const scriptResult = await generateScript(schedule, scriptPipelineId, maxRetry);

    if (!scriptResult.success) {
      throw new Error(`Script generation failed: ${scriptResult.error}`);
    }

    updatePipelineStatus(scriptPipelineId, 'completed');

    // video_schedules ?뚯씠釉붿뿉 script_id ???
    const dbUpdate = new Database(dbPath);
    dbUpdate.prepare(`UPDATE video_schedules SET script_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(scriptResult.scriptId, schedule.id);
    dbUpdate.close();

    updateScheduleStatus(schedule.id, 'processing', { scriptId: scriptResult.scriptId });
    addPipelineLog(scriptPipelineId, 'info', `Script generated successfully: ${scriptResult.scriptId}`);
    addTitleLog(schedule.title_id, 'info', `??Script generated successfully: ${scriptResult.scriptId}`);

    // ============================================================
    // ?좑툘 DEPRECATED: ?곹뭹?ㅻ챸 ?蹂?蹂꾨룄 ?앹꽦 ?쒓굅
    // ?댁젣 ?곹뭹 ?蹂??앹꽦 ??youtube_description???먮룞 ?ы븿??
    // ============================================================
    console.log('?뱄툘 [SCHEDULER] ?곹뭹 ?蹂몄뿉 youtube_description ?ы븿 ?꾨즺 (蹂꾨룄 ?앹꽦 遺덊븘??');

    // ============================================================
    // 吏곸젒 ?낅줈??紐⑤뱶 泥댄겕: ??댄?/湲곕낯 ?ㅼ젙??'upload'?대㈃ ?대?吏 ?낅줈???湲?
    // ============================================================
    if (mediaMode === 'upload') {
      // ?꾨줈?앺듃 ?대뜑? story.json ?앹꽦
      const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
      const projectFolderPath = path.join(BACKEND_PATH, 'input', `project_${scriptResult.scriptId}`);

      try {
        // ?대뜑媛 ?놁쑝硫??앹꽦
        if (!fs.existsSync(projectFolderPath)) {
          fs.mkdirSync(projectFolderPath, { recursive: true });
          console.log(`?뱚 [SCHEDULER] ?꾨줈?앺듃 ?대뜑 ?앹꽦: ${projectFolderPath}`);
        }

        // DB?먯꽌 ?ㅽ겕由쏀듃 ?댁슜 媛?몄삤湲?
        const dbReadScript = new Database(dbPath);
        const scriptContent = dbReadScript.prepare(`
          SELECT content FROM contents WHERE id = ?
        `).get(scriptResult.scriptId) as { content: string } | undefined;
        dbReadScript.close();

        if (scriptContent && scriptContent.content) {
          // content ?뚯떛
          let contentStr = typeof scriptContent.content === 'string' ? scriptContent.content : JSON.stringify(scriptContent.content);

          // JSON ?뺣━
          contentStr = contentStr.trim();
          if (contentStr.startsWith('JSON')) {
            contentStr = contentStr.substring(4).trim();
          }
          const jsonStart = contentStr.indexOf('{');
          if (jsonStart > 0) {
            contentStr = contentStr.substring(jsonStart);
          }

          const jsonEnd = contentStr.lastIndexOf('}');
          if (jsonEnd > 0 && jsonEnd < contentStr.length - 1) {
            contentStr = contentStr.substring(0, jsonEnd + 1);
          }

          // story.json ?앹꽦
          if (contentStr && contentStr.length > 0 && contentStr.includes('{')) {
            try {
              const scriptData = JSON.parse(contentStr);
              const storyJson = {
                ...scriptData,
                scenes: scriptData.scenes || []
              };

              const storyJsonPath = path.join(projectFolderPath, 'story.json');
              fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');
              console.log(`??[SCHEDULER] story.json ?앹꽦 ?꾨즺: ${storyJsonPath}`);
              addTitleLog(schedule.title_id, 'info', `???꾨줈?앺듃 ?대뜑 諛?story.json ?앹꽦 ?꾨즺`);
            } catch (parseError: any) {
              console.error(`??[SCHEDULER] JSON ?뚯떛 ?ㅽ뙣: ${parseError.message}`);
              addTitleLog(schedule.title_id, 'warn', `?좑툘 story.json ?앹꽦 ?ㅽ뙣 (?섎룞?쇰줈 ?蹂??뺤씤 ?꾩슂)`);
            }
          } else {
            console.warn(`?좑툘 [SCHEDULER] ?蹂?content媛 鍮꾩뼱?덇굅??JSON???꾨떂`);
          }
        }
      } catch (folderError: any) {
        console.error(`??[SCHEDULER] ?대뜑 ?앹꽦 ?ㅽ뙣: ${folderError.message}`);
        addTitleLog(schedule.title_id, 'warn', `?좑툘 ?꾨줈?앺듃 ?대뜑 ?앹꽦 ?ㅽ뙣 (怨꾩냽 吏꾪뻾)`);
      }

      updateScheduleStatus(schedule.id, 'waiting_for_upload', { scriptId: scriptResult.scriptId });
      updateTitleStatus(schedule.title_id, 'waiting_for_upload'); // ??댄? ?곹깭???낅뜲?댄듃
      addPipelineLog(videoPipelineId, 'info', `?몌툘 Waiting for manual image upload...`);
      addTitleLog(schedule.title_id, 'info', `?몌툘 ?대?吏瑜??낅줈?쒗빐二쇱꽭?? ?낅줈?쒓? ?꾨즺?섎㈃ ?먮룞?쇰줈 ?곸긽 ?앹꽦???쒖옉?⑸땲??`);

      console.log(`[Scheduler] Schedule ${schedule.id} is waiting for manual image upload`);
      return; // ?대?吏 ?낅줈???湲? video ?④퀎濡?吏꾪뻾?섏? ?딆쓬
    }

    // ============================================================
    // Stage 2: ?곸긽 ?앹꽦
    // ============================================================
    addPipelineLog(videoPipelineId, 'info', `Starting video generation from script: ${scriptResult.scriptId}`);
    addTitleLog(schedule.title_id, 'info', `?렗 Starting video generation...`);
    updatePipelineStatus(videoPipelineId, 'running');

    const videoResult = await generateVideo(scriptResult.scriptId, videoPipelineId, maxRetry, schedule.title_id, schedule);

    if (!videoResult.success) {
      throw new Error(`Video generation failed: ${videoResult.error}`);
    }

    updatePipelineStatus(videoPipelineId, 'completed');

    // video_schedules ?뚯씠釉붿뿉 video_id ???
    const dbUpdateVideo = new Database(dbPath);
    dbUpdateVideo.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(videoResult.videoId, schedule.id);
    dbUpdateVideo.close();

    updateScheduleStatus(schedule.id, 'processing', { videoId: videoResult.videoId }); // completed ?꾨땲??processing (?낅줈??吏꾪뻾)
    addPipelineLog(videoPipelineId, 'info', `Video generated successfully: ${videoResult.videoId}`);
    addTitleLog(schedule.title_id, 'info', `??Video generated successfully: ${videoResult.videoId}`);

    console.log(`[Scheduler] Video generation completed for schedule ${schedule.id}, continuing with upload...`);
    // return ??젣 - ?먮룞?쇰줈 ?낅줈??吏꾪뻾

    // ============================================================
    // Stage 3: ?좏뒠釉??낅줈??
    // ============================================================
    addPipelineLog(uploadPipelineId, 'info', `Starting YouTube upload for video: ${videoResult.videoId}`);
    addTitleLog(schedule.title_id, 'info', `?뱾 Uploading to YouTube...`);
    updatePipelineStatus(uploadPipelineId, 'running');

    const uploadResult = await uploadToYouTube(videoResult.videoId, schedule, uploadPipelineId, maxRetry);

    if (!uploadResult.success) {
      throw new Error(`YouTube upload failed: ${uploadResult.error}`);
    }

    updatePipelineStatus(uploadPipelineId, 'completed');

    // video_schedules ?뚯씠釉붿뿉 youtube_upload_id ???
    const dbUpdateUpload = new Database(dbPath);
    dbUpdateUpload.prepare(`UPDATE video_schedules SET youtube_upload_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(uploadResult.uploadId, schedule.id);
    dbUpdateUpload.close();

    updateScheduleStatus(schedule.id, 'processing', { youtubeUploadId: uploadResult.uploadId });
    addPipelineLog(uploadPipelineId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
    addTitleLog(schedule.title_id, 'info', `??YouTube upload successful: ${uploadResult.videoUrl}`);

    // ============================================================
    // Stage 4: ?좏뒠釉??쇰툝由ъ떆 (?덉빟 ?쒓컙??怨듦컻)
    // ============================================================
    addPipelineLog(publishPipelineId, 'info', `Scheduling YouTube publish`);
    addTitleLog(schedule.title_id, 'info', `?뱟 Scheduling publish...`);
    updatePipelineStatus(publishPipelineId, 'running');

    const publishResult = await scheduleYouTubePublish(uploadResult.uploadId!, schedule, publishPipelineId);

    if (!publishResult.success) {
      throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
    }

    updatePipelineStatus(publishPipelineId, 'completed');
    updateScheduleStatus(schedule.id, 'completed');
    updateTitleStatus(schedule.title_id, 'completed');
    addPipelineLog(publishPipelineId, 'info', `Pipeline completed successfully!`);
    addTitleLog(schedule.title_id, 'info', `?럦 All done! Pipeline completed successfully!`);

    console.log(`??[Pipeline] Successfully completed for schedule ${schedule.id}`);

    // ============================================================
    // 濡깊뤌 ?꾨즺 ???륂뤌 ?먮룞 ?앹꽦
    // ============================================================
    if (schedule.type === 'longform' && uploadResult.videoUrl) {
      console.log(`?렗 [SHORTFORM] Longform completed, triggering shortform conversion...`);
      addTitleLog(schedule.title_id, 'info', `?렗 濡깊뤌 ?꾨즺! ?륂뤌 蹂???쒖옉...`);

      try {
        // 濡깊뤌 video_id (job_id) 媛?몄삤湲?
        const longformJobId = videoResult.videoId;
        const longformYoutubeUrl = uploadResult.videoUrl;

        console.log(`?뵇 [SHORTFORM] Longform job_id: ${longformJobId}, YouTube URL: ${longformYoutubeUrl}`);

        // convert-to-shorts API ?몄텧
        const convertResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/jobs/${longformJobId}/convert-to-shorts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system',
            'X-User-Id': schedule.user_id // ?몄쬆 ?고쉶??
          }
        });

        if (!convertResponse.ok) {
          const errorText = await convertResponse.text();
          console.error(`??[SHORTFORM] Conversion failed: ${errorText}`);
          addTitleLog(schedule.title_id, 'warn', `?좑툘 ?륂뤌 蹂???ㅽ뙣: ${errorText}`);
        } else {
          const convertData = await convertResponse.json();
          const shortformJobId = convertData.jobId;

          console.log(`??[SHORTFORM] Conversion started, shortform job_id: ${shortformJobId}`);
          addTitleLog(schedule.title_id, 'info', `???륂뤌 蹂???쒖옉??(?묒뾽 ID: ${shortformJobId})`);

          // ?륂뤌 ?묒뾽 ID? 濡깊뤌 YouTube URL ???(?섏쨷???낅줈?쒗븷 ???ъ슜)
          const dbShortform = new Database(dbPath);

          // 而щ읆???놁쑝硫?異붽?
          try {
            dbShortform.exec(`ALTER TABLE video_schedules ADD COLUMN shortform_job_id TEXT`);
          } catch (e: any) {
            if (!e.message?.includes('duplicate column')) {
              console.log('shortform_job_id 而щ읆 異붽? ?쒕룄:', e.message);
            }
          }
          try {
            dbShortform.exec(`ALTER TABLE video_schedules ADD COLUMN longform_youtube_url TEXT`);
          } catch (e: any) {
            if (!e.message?.includes('duplicate column')) {
              console.log('longform_youtube_url 而щ읆 異붽? ?쒕룄:', e.message);
            }
          }
          try {
            dbShortform.exec(`ALTER TABLE video_schedules ADD COLUMN shortform_uploaded INTEGER DEFAULT 0`);
          } catch (e: any) {
            if (!e.message?.includes('duplicate column')) {
              console.log('shortform_uploaded 而щ읆 異붽? ?쒕룄:', e.message);
            }
          }

          dbShortform.prepare(`
            UPDATE video_schedules
            SET shortform_job_id = ?, longform_youtube_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(shortformJobId, longformYoutubeUrl, schedule.id);
          dbShortform.close();

          console.log(`?뮶 [SHORTFORM] Saved shortform_job_id to schedule: ${schedule.id}`);
          addTitleLog(schedule.title_id, 'info', `?뮶 ?륂뤌 ?묒뾽 ?뺣낫 ??λ맖. ?꾨즺 ???먮룞 ?낅줈???덉젙`);
        }
      } catch (error: any) {
        console.error(`??[SHORTFORM] Error during shortform conversion:`, error);
        addTitleLog(schedule.title_id, 'warn', `?좑툘 ?륂뤌 蹂??以??ㅻ쪟: ${error.message}`);
      }
    }

  } catch (error: any) {
    console.error(`??[Pipeline] Failed for schedule ${schedule.id}:`, error);

    // ?ㅽ뙣???④퀎 李얘린
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
    addTitleLog(schedule.title_id, 'error', `??Pipeline failed: ${error.message}`);

    // ?먮윭 ?대찓???꾩넚
    await sendAutomationErrorEmail(
      schedule.id,
      'pipeline_execution',
      error.message,
      { schedule, failedStage: failedPipeline?.stage }
    );
  }
}

// ============================================================
// 媛쒕퀎 Stage ?⑥닔??
// ============================================================

// Stage 1: ?蹂??앹꽦 (?ъ떆??濡쒖쭅 ?쒓굅)
async function generateScript(schedule: any, pipelineId: string, maxRetry: number) {
  console.log('?뵇 [SCHEDULER] generateScript called with schedule:', {
    id: schedule.id,
    title: schedule.title,
    user_id: schedule.user_id,
    hasUserId: !!schedule.user_id
  });
  console.log('?뵇 [SCHEDULER] Full schedule keys:', Object.keys(schedule));
  console.log('?뵇 [SCHEDULER] schedule.product_data exists?:', !!schedule.product_data);
  console.log('?뵇 [SCHEDULER] schedule.type:', schedule.type);

  try {
    addPipelineLog(pipelineId, 'info', `?뱷 ?蹂??앹꽦 ?쒖옉...`);
    addTitleLog(schedule.title_id, 'info', `?뱷 ?蹂??앹꽦 ?쒖옉...`);
    if (isPipelineOrScheduleCancelled(pipelineId)) {
      throw new Error('Automation stopped by user');
    }

    // ?곹뭹 湲곗엯 ?뺣낫?????댁긽 ?ъ슜?섏? ?딆쓬 (?꾨＼?꾪듃 寃곌낵留??쒖슜)
    const productInfo = null;

    const requestBody = {
      title: schedule.title,
      type: schedule.type,
      productUrl: schedule.product_url,
      productInfo: productInfo || null, // undefined ???null ?ъ슜 (JSON.stringify?먯꽌 ?쒖쇅?섏? ?딅룄濡?
      model: schedule.model || 'claude',
      useClaudeLocal: schedule.script_mode !== 'api',
      userId: schedule.user_id,
      category: schedule.category
    };

    console.log('?뵇 [SCHEDULER] Request body:', JSON.stringify(requestBody, null, 2));

    // API 諛⑹떇?쇰줈 ?蹂??앹꽦 (?대? ?붿껌 ?ㅻ뜑 ?ы븿)
    console.log('?뱾 [SCHEDULER] Calling /api/scripts/generate...');
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/scripts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'automation-system'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`?뱿 [SCHEDULER] Script API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`??[SCHEDULER] Script API error response: ${errorText}`);
      let error;
      try {
        error = JSON.parse(errorText);
      } catch (e) {
        throw new Error(`Script generation failed: ${errorText}`);
      }
      throw new Error(error.error || 'Script generation failed');
    }

    const data = await response.json();
    console.log('??[SCHEDULER] Script API response data:', JSON.stringify(data, null, 2));

    // taskId媛 諛섑솚?섎㈃ ?묒뾽 ?꾨즺 ?湲?
    if (data.taskId) {
      addPipelineLog(pipelineId, 'info', `Script generation job started: ${data.taskId}`);

      // ?묒뾽 ?꾨즺 ?湲?(理쒕? 10遺?
      const maxWaitTime = 10 * 60 * 1000;
      const startTime = Date.now();
      let lastProgress = 0; // 留덉?留?吏꾪뻾瑜?異붿쟻

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5珥덈쭏??泥댄겕
        if (isPipelineOrScheduleCancelled(pipelineId)) {
          throw new Error('Automation stopped by user');
        }


        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`?뵇 [SCHEDULER] Checking script status for ${data.taskId}... (寃쎄낵?쒓컙: ${elapsed}珥?`);
        const statusRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/scripts/status/${data.taskId}`);

        console.log(`?뱿 [SCHEDULER] Status API response: ${statusRes.status}`);

        if (!statusRes.ok) {
          const errorText = await statusRes.text();
          console.error(`??[SCHEDULER] Status API failed: ${statusRes.status}, Response: ${errorText}`);
          continue;
        }

        const statusData = await statusRes.json();
        console.log(`?뱤 [SCHEDULER] Script Status Response:`, JSON.stringify(statusData, null, 2));

        if (statusData.status === 'completed') {
          addPipelineLog(pipelineId, 'info', `Script generation completed: ${data.taskId}`);
          addTitleLog(schedule.title_id, 'info', '???蹂??앹꽦 ?꾨즺!');
          console.log(`??[SCHEDULER] Script generation completed!`);
          return { success: true, scriptId: data.taskId };
        } else if (statusData.status === 'failed') {
          console.error(`??[SCHEDULER] Script generation failed: ${statusData.error}`);
          throw new Error(`Script generation failed: ${statusData.error}`);
        }

        // 吏꾪뻾 ?곹솴 濡쒓렇 (progress媛 蹂寃쎈맆 ?뚮쭔)
        if (statusData.progress && statusData.progress !== lastProgress) {
          lastProgress = statusData.progress;
          const msg = `?뱷 ?蹂??앹꽦 以?.. ${statusData.progress}%`;
          addPipelineLog(pipelineId, 'info', msg);
          addTitleLog(schedule.title_id, 'info', msg);
        }
      }

      throw new Error('Script generation timeout (10遺?珥덇낵)');
    }

    return { success: true, scriptId: data.taskId || data.scriptId };

  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    addPipelineLog(pipelineId, 'error', `???蹂??앹꽦 ?ㅽ뙣: ${errorMsg}`);
    addTitleLog(schedule.title_id, 'error', `???蹂??앹꽦 ?ㅽ뙣: ${errorMsg}`);
    console.error(`??[SCHEDULER] Script generation failed:`, error.message);
    return { success: false, error: errorMsg };
  }
}

// Stage 2: ?곸긽 ?앹꽦 (?ъ떆??濡쒖쭅 ?쒓굅)
async function generateVideo(scriptId: string, pipelineId: string, maxRetry: number, titleId: string, schedule: any) {
  const settings = getAutomationSettings();
  const mediaMode = `${schedule.media_mode || settings.media_generation_mode || 'upload'}`.trim();

  try {
    addPipelineLog(pipelineId, 'info', `?렗 ?곸긽 ?앹꽦 ?쒖옉... (mode: ${mediaMode})`);
    addTitleLog(titleId, 'info', `?렗 ?곸긽 ?앹꽦 ?쒖옉...`);

    // DB?먯꽌 ?蹂?議고쉶
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

    // content ?뚯떛
    let scriptData;
    try {
      let contentStr = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);

      // JSON ?뺣━
      contentStr = contentStr.trim();
      if (contentStr.startsWith('JSON')) {
        contentStr = contentStr.substring(4).trim();
      }
      const jsonStart = contentStr.indexOf('{');
      if (jsonStart > 0) {
        contentStr = contentStr.substring(jsonStart);
      }

      const jsonEnd = contentStr.lastIndexOf('}');
      if (jsonEnd > 0 && jsonEnd < contentStr.length - 1) {
        contentStr = contentStr.substring(0, jsonEnd + 1);
      }

      scriptData = JSON.parse(contentStr);
    } catch (e: any) {
      throw new Error(`Failed to parse script content: ${e.message}`);
    }

    // story.json ?앹꽦
    const storyJson = {
      ...scriptData,
      scenes: scriptData.scenes || []
    };

    // ?낅줈?쒕맂 ?대?吏? 鍮꾨뵒???뺤씤
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

    // ??媛쒖닔 ?뺤씤
    const sceneCount = storyJson.scenes?.length || 0;
    const totalMediaCount = imageFiles.length + videoFiles.length;

    // ?몃꽕??遺꾨━ 濡쒖쭅: ?곸긽+?대?吏媛 ?④퍡 ?덇퀬, 珥?誘몃뵒?닿? ?щ낫??留롮쓣 ?뚮쭔 泥??대?吏瑜??몃꽕?쇰줈 ?ъ슜
    let useThumbnailFromFirstImage = false;
    if (hasUploadedImages && hasUploadedVideos && totalMediaCount > sceneCount) {
      // ?뚯씪??scene 踰덊샇 ?쒖쑝濡??뺣젹 (scene_0, scene_1, ...)
      const sortedImages = imageFiles.sort((a, b) => {
        const aMatch = a.match(/scene_(\d+)/);
        const bMatch = b.match(/scene_(\d+)/);
        const aNum = aMatch ? parseInt(aMatch[1]) : 999;
        const bNum = bMatch ? parseInt(bMatch[1]) : 999;
        return aNum - bNum;
      });

      // 泥?踰덉㎏ ?뚯씪??scene_0?닿퀬 ?대?吏?몄? ?뺤씤
      const firstFile = sortedImages[0];
      if (firstFile && /scene_0.*\.(png|jpg|jpeg|webp)$/i.test(firstFile)) {
        useThumbnailFromFirstImage = true;
        console.log(`\n?뱦 [SCHEDULER] ?몃꽕??遺꾨━ 議곌굔 留뚯”: ?곸긽+?대?吏 ?덇퀬 誘몃뵒??${totalMediaCount}) > ??${sceneCount})`);
        console.log(`   ?뼹截??몃꽕?? ${firstFile}`);
        console.log(`   ?벞 ??誘몃뵒?? ${totalMediaCount - 1}媛?(${firstFile} ?쒖쇅)`);
      }
    } else {
      console.log(`\n?뱦 [SCHEDULER] ?몃꽕??遺꾨━ ????`);
      if (!hasUploadedImages || !hasUploadedVideos) {
        console.log(`   - ?곸긽+?대?吏 誘명룷??(?곸긽: ${hasUploadedVideos}, ?대?吏: ${hasUploadedImages})`);
      }
      if (totalMediaCount <= sceneCount) {
        console.log(`   - 誘몃뵒??${totalMediaCount}) ????${sceneCount})`);
      }
      console.log(`   ??紐⑤뱺 誘몃뵒?대? ?ъ뿉 ?ъ슜`);
    }

    // ?대?吏 ?뚯뒪 ?ㅼ젙 (?낅줈?쒕맂 ?대?吏媛 ?덉쑝硫??곗꽑 ?ъ슜)
    const imageSource = (mediaMode === 'upload' || hasUploadedImages) ? 'none' : mediaMode;

    // ?대?吏 紐⑤뜽 ?ㅼ젙 (imagen3 -> imagen3, ?섎㉧吏??dalle3)
    const imageModel = mediaMode === 'imagen3' ? 'imagen3' : 'dalle3';

    // 鍮꾨뵒???щ㎎
    const videoType = schedule.type || scriptData.metadata?.genre || 'shortform';

    // JSON?쇰줈 ?꾩넚 (?대? ?붿껌)
    const requestBody: any = {
      storyJson,
      userId: content.user_id,
      imageSource,
      imageModel,
      videoFormat: videoType,
      ttsVoice: 'ko-KR-SoonBokNeural',
      title: content.title,
      scriptId,  // ?먮룞?붿슜: ?대? ?낅줈?쒕맂 ?대?吏媛 ?덈뒗 ?대뜑 寃쎈줈
      useThumbnailFromFirstImage  // 泥?踰덉㎏ ?대?吏瑜??몃꽕?쇰줈 ?ъ슜 ?щ?
    };

    // ============================================================
    // 以묐났 ?ㅽ뻾 諛⑹?: 媛숈? source_content_id濡??대? ?ㅽ뻾 以묒씤 job???덈뒗吏 ?뺤씤
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
      console.log(`?뵇 [DUPLICATE CHECK] Found existing job: ${existingJob.id} (status: ${existingJob.status})`);
      addPipelineLog(pipelineId, 'info', `?좑툘 ?대? ?ㅽ뻾 以묒씤 ?묒뾽 諛쒓껄: ${existingJob.id}`);
      addTitleLog(titleId, 'info', `?좑툘 湲곗〈 ?묒뾽???ъ궗?⑺빀?덈떎: ${existingJob.id}`);

      jobId = existingJob.id;
      shouldCallApi = false;
    } else {
      // ?덈줈??job ?앹꽦? API?먯꽌 泥섎━ (fresh created_at ??꾩뒪?ы봽濡?
      console.log(`??[DUPLICATE CHECK] No existing job found, will create new job via API`);
      addPipelineLog(pipelineId, 'info', `?뱷 API瑜??듯빐 ??Job ?앹꽦 ?덉젙`);
      shouldCallApi = true;
    }

    console.log('?뱾 [SCHEDULER] Calling /api/generate-video-upload...');
    console.log('?뵇 [SCHEDULER] Request body:', {
      scriptId,
      userId: content.user_id,
      imageSource,
      imageModel,
      videoFormat: videoType
    });

    let response: Response | null = null;
    let data: any = null;

    // 湲곗〈 job???놁쓣 ?뚮쭔 API ?몄텧
    if (shouldCallApi) {
      // API媛 fresh created_at ??꾩뒪?ы봽濡???job???앹꽦?섎룄濡?jobId瑜??꾨떖?섏? ?딆쓬
      // (硫붿씤 ?섏씠吏? ?숈씪??諛⑹떇)

      // /api/generate-video-upload ?몄텧
      response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'automation-system'
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`?뱿 [SCHEDULER] Video API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`??[SCHEDULER] Video API error response: ${errorText}`);
        let error;
        try {
          error = JSON.parse(errorText);
        } catch (e) {
          throw new Error(`Video generation failed: ${errorText}`);
        }
        throw new Error(error.error || 'Video generation failed');
      }

      data = await response.json();
      console.log('??[SCHEDULER] Video API response data:', JSON.stringify(data, null, 2));

      jobId = data.jobId;
    } else {
      // 湲곗〈 job ?ъ궗??- jobId???대? ?ㅼ젙??
      console.log(`?삼툘 [SCHEDULER] Reusing existing job: ${jobId}`);
    }

    // ?묒뾽??鍮꾨룞湲곕줈 泥섎━?섎뒗 寃쎌슦 ?대쭅
    if (jobId) {
      addPipelineLog(pipelineId, 'info', `Video generation job: ${jobId}`);

      // ??FIX: jobId瑜?利됱떆 ??ν븯??吏꾪뻾 以?濡쒓렇 議고쉶 媛?ν븯?꾨줉
      const dbSaveJob = new Database(dbPath);
      const result = dbSaveJob.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(jobId, schedule.id);
      dbSaveJob.close();

      if (result.changes > 0) {
        console.log(`??[SCHEDULER] Saved video_id to schedule: ${jobId} -> ${schedule.id}`);
        addTitleLog(schedule.title_id, 'info', `?렗 ?곸긽 ?앹꽦 ?묒뾽 ?쒖옉: ${jobId}`);
      } else {
        console.error(`??[SCHEDULER] Failed to save video_id! schedule.id: ${schedule.id}, jobId: ${jobId}`);
        addTitleLog(schedule.title_id, 'warn', `?좑툘 video_id ????ㅽ뙣 (?섎룞 ?곌껐 ?꾩슂)`);
      }

      // ?묒뾽 ?꾨즺 ?湲?(理쒕? 30遺?
      const maxWaitTime = 30 * 60 * 1000; // 30遺?
      const startTime = Date.now();
      let lastProgress = 0; // 留덉?留?吏꾪뻾瑜?異붿쟻

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5珥덈쭏??泥댄겕

        // 以묒? ?붿껌 ?뺤씤 (DB?먯꽌 schedule ?곹깭 泥댄겕)
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
          console.log(`⚠️ [SCHEDULER] Pipeline ${pipelineId} failed`);
          throw new Error('작업이 실패했습니다');
        }

        if (scheduleStatus && scheduleStatus.status === 'cancelled') {
          console.log(`⚠️ [SCHEDULER] Schedule for pipeline ${pipelineId} was cancelled by user`);
          throw new Error('작업이 사용자에 의해 중지되었습니다');
        }

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`?뵇 [SCHEDULER] Checking video status for ${jobId}... (寃쎄낵?쒓컙: ${elapsed}珥?`);

        const statusRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload?jobId=${jobId}`);
        console.log(`?뱿 [SCHEDULER] Video Status API response: ${statusRes.status}`);

        if (!statusRes.ok) {
          const errorText = await statusRes.text();
          console.error(`??[SCHEDULER] Video Status API failed: ${statusRes.status}, Response: ${errorText}`);
          continue;
        }

        const statusData = await statusRes.json();
        console.log(`?뱤 [SCHEDULER] Video Status Response:`, JSON.stringify(statusData, null, 2));

        if (statusData.status === 'completed') {
          addPipelineLog(pipelineId, 'info', `Video generation completed: ${statusData.videoId}`);
          addTitleLog(titleId, 'info', '???곸긽 ?앹꽦 ?꾨즺!');
          console.log(`??[SCHEDULER] Video generation completed!`);

          // ?뵦 理쒖쥌 ??? 由ы꽩 吏곸쟾??臾댁“嫄????
          if (statusData.videoId && schedule && schedule.id) {
            const dbFinalSave = new Database(dbPath);
            dbFinalSave.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(statusData.videoId, schedule.id);
            dbFinalSave.close();
            console.log(`?뵦 [FINAL SAVE] Video ID saved: ${statusData.videoId} -> ${schedule.id}`);
          }

          return { success: true, videoId: statusData.videoId };
        } else if (statusData.status === 'failed') {
          console.error(`??[SCHEDULER] Video generation failed: ${statusData.error}`);
          throw new Error(`Video generation failed: ${statusData.error}`);
        }

        // 吏꾪뻾 ?곹솴 濡쒓렇 (progress媛 蹂寃쎈맆 ?뚮쭔)
        if (statusData.progress && statusData.progress !== lastProgress) {
          lastProgress = statusData.progress;
          const msg = `?렗 ?곸긽 ?앹꽦 以?.. ${statusData.progress}%`;
          console.log(`?뱢 [SCHEDULER] Video Progress: ${statusData.progress}`);
          addPipelineLog(pipelineId, 'info', msg);
          addTitleLog(titleId, 'info', msg);
        }
      }

      throw new Error('Video generation timeout (30遺?珥덇낵)');
    }

    // 利됱떆 ?꾨즺?섎뒗 寃쎌슦 (嫄곗쓽 ?놁?留?諛⑹뼱 肄붾뱶)
    return { success: true, videoId: data?.videoId || jobId };

  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    addPipelineLog(pipelineId, 'error', `???곸긽 ?앹꽦 ?ㅽ뙣: ${errorMsg}`);
    addTitleLog(titleId, 'error', `???곸긽 ?앹꽦 ?ㅽ뙣: ${errorMsg}`);
    console.error(`??[SCHEDULER] Video generation failed:`, error.message);
    return { success: false, error: errorMsg };
  }
}

// Stage 3: ?좏뒠釉??낅줈??
async function uploadToYouTube(videoId: string, schedule: any, pipelineId: string, maxRetry: number) {
  try {
    addPipelineLog(pipelineId, 'info', `Uploading to YouTube`);
    console.log(`?뵇 [YOUTUBE UPLOAD] videoId: ${videoId}`);

    // jobs ?뚯씠釉붿뿉??鍮꾨뵒???뺣낫 議고쉶
    const db = new Database(dbPath);
    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(videoId) as any;
    db.close();

    console.log(`?뵇 [YOUTUBE UPLOAD] job found:`, {
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

    // 鍮꾨뵒???뚯씪 寃쎈줈 (video_path???대? ?덈? 寃쎈줈)
    const videoPath = job.video_path;
    console.log(`?뵇 [YOUTUBE UPLOAD] videoPath: ${videoPath}`);

    // ?뚯씪 議댁옱 ?щ? ?뺤씤
    const fs = require('fs');
    const fileExists = fs.existsSync(videoPath);
    console.log(`?뵇 [YOUTUBE UPLOAD] file exists: ${fileExists}`);

    if (!fileExists) {
      addPipelineLog(pipelineId, 'error', `Video file not found at path: ${videoPath}`);
      throw new Error(`Video file not found at path: ${videoPath}`);
    }

    // ?뵏 以묐났 泥댄겕: ?대? ?낅줈?쒕맂 ?곸긽?몄? ?뺤씤
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
      console.warn(`?좑툘 [YOUTUBE] 以묐났 ?낅줈??諛⑹?: videoId=${videoId}???대? ?낅줈?쒕맖 (${existingUpload.video_url})`);
      addPipelineLog(pipelineId, 'info', `?좑툘 ?대? ?낅줈?쒕맂 ?곸긽?낅땲?? ${existingUpload.video_url}`);

      // ?ㅼ?以??곹깭 ?낅뜲?댄듃
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
      }; // 以묐났 ?낅줈??諛⑹? - 湲곗〈 ?낅줈???뺣낫 諛섑솚
    }

    // YouTube API ?몄텧
    const privacyValue = schedule.youtube_privacy || 'public';
    addPipelineLog(pipelineId, 'info', `Calling YouTube upload API for video: ${job.title}`);
    addPipelineLog(pipelineId, 'info', `YouTube 怨듦컻 ?ㅼ젙: ${privacyValue} (DB媛? ${schedule.youtube_privacy})`);

    const uploadResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/youtube/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'automation-system'
      },
      body: JSON.stringify({
        videoPath,
        title: job.title || schedule.title,
        description: '', // 鍮?臾몄옄??(?곹뭹?뺣낫 ?蹂몄씠 ?덉쑝硫??먮룞?쇰줈 異붽????덉젙)
        tags: schedule.tags ? schedule.tags.split(',').map((t: string) => t.trim()) : [],
        privacy: privacyValue, // ?ъ슜???ㅼ젙 ?곗꽑, ?놁쑝硫?public
        channelId: schedule.channel,
        jobId: videoId,
        publishAt: schedule.youtube_publish_time,
        userId: schedule.user_id, // ?대? ?붿껌??userId ?꾨떖
        type: job.type // ?곹뭹 ????꾨떖 (?곹뭹?뺣낫 ?蹂?寃?됱슜)
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

    addPipelineLog(pipelineId, 'info', `??YouTube upload successful: ${uploadData.videoUrl}`);

    // video_schedules ?뚯씠釉붿뿉 youtube_upload_id? youtube_url ?낅뜲?댄듃
    // YouTube API?먯꽌 ?대? youtube_uploads ?뚯씠釉붿뿉 ??ν뻽?쇰?濡?以묐났 ??ν븯吏 ?딆쓬
    if (uploadData.uploadId || uploadData.videoUrl) {
      const uploadDb = new Database(dbPath);
      uploadDb.prepare(`
        UPDATE video_schedules
        SET youtube_upload_id = ?, youtube_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(uploadData.uploadId || null, uploadData.videoUrl || null, schedule.id);
      uploadDb.close();
      console.log(`??video_schedules ?낅뜲?댄듃: youtube_upload_id = ${uploadData.uploadId}, youtube_url = ${uploadData.videoUrl}`);
    }

    return {
      success: true,
      uploadId: uploadData.videoId,
      videoUrl: uploadData.videoUrl
    };

  } catch (error: any) {
    addPipelineLog(pipelineId, 'error', `YouTube upload failed: ${error.message}`);
    addTitleLog(schedule.title_id, 'error', `??YouTube upload failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Stage 4: ?좏뒠釉??쇰툝由ъ떆 ?덉빟
async function scheduleYouTubePublish(uploadId: string, schedule: any, pipelineId: string) {
  try {
    addPipelineLog(pipelineId, 'info', `Scheduling YouTube publish for: ${schedule.youtube_publish_time || 'immediate'}`);

    // youtube_publish_time???ㅼ젙?섏뼱 ?덉쑝硫??덉빟, ?놁쑝硫?利됱떆 怨듦컻
    if (schedule.youtube_publish_time) {
      addPipelineLog(pipelineId, 'info', `Video will be published at: ${schedule.youtube_publish_time}`);
      addTitleLog(schedule.title_id, 'info', `?뱟 ?덉빟?? ${new Date(schedule.youtube_publish_time).toLocaleString('ko-KR')}`);
    } else {
      addPipelineLog(pipelineId, 'info', `Video set to immediate publish`);
      addTitleLog(schedule.title_id, 'info', `??利됱떆 怨듦컻 ?ㅼ젙??);
    }

    return { success: true };

  } catch (error: any) {
    addPipelineLog(pipelineId, 'error', `Failed to schedule publish: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================================
// ?먮윭 ?뚮┝ ?⑥닔
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

    const subject = `[?먮룞???ㅽ뙣] ${stage} - ${scheduleId}`;
    const html = `
      <h2>?먮룞???뚯씠?꾨씪???ㅽ뙣 ?뚮┝</h2>
      <p><strong>?ㅼ?以?ID:</strong> ${scheduleId}</p>
      <p><strong>?ㅽ뙣 ?④퀎:</strong> ${stage}</p>
      <p><strong>?먮윭 硫붿떆吏:</strong> ${errorMessage}</p>
      <p><strong>?쒕ぉ:</strong> ${context.schedule?.title || 'N/A'}</p>
      <p><strong>???</strong> ${context.schedule?.type || 'N/A'}</p>
      <p><strong>?덉빟 ?쒓컙:</strong> ${context.schedule?.scheduled_time || 'N/A'}</p>
      <hr>
      <h3>Context:</h3>
      <pre>${JSON.stringify(context, null, 2)}</pre>
      <hr>
      <p><em>???대찓?쇱? ?먮룞???쒖뒪?쒖뿉??諛쒖넚?섏뿀?듬땲??</em></p>
    `;

    await sendErrorEmail(alertEmail, subject, html);
    console.log(`??Error email sent to ${alertEmail}`);

  } catch (error) {
    console.error('Failed to send error email:', error);
  }
}

// ============================================================
// ?ㅼ?以꾨윭 ?곹깭 ?뺤씤
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
// ?대?吏 ?낅줈???湲?以묒씤 ?ㅼ?以??뺤씤
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

        // script_id媛 ?덈뒗吏 ?뺤씤
        if (!schedule.script_id) {
          console.log(`[Scheduler] Schedule ${schedule.id} has no script_id, skipping`);
          continue;
        }

        // ?ㅽ겕由쏀듃 ?대뜑?먯꽌 ?대?吏 ?뺤씤
        const fs = require('fs');
        const scriptFolderPath = path.join(process.cwd(), '..', 'trend-video-backend', 'input', `project_${schedule.script_id}`);

        // ?대뜑媛 議댁옱?섎뒗吏 ?뺤씤
        if (!fs.existsSync(scriptFolderPath)) {
          console.log(`[Scheduler] Script folder not found: ${scriptFolderPath}`);
          continue;
        }

        // ?대?吏 ?뚯씪 ?뺤씤 (scene_*.png, scene_*.jpg, scene_*.webp ??
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

        // ?대?吏媛 ?낅줈?쒕릺?덉쑝誘濡?processing ?곹깭濡?蹂寃쏀븯怨?video ?④퀎 ?쒖옉
        console.log(`[Scheduler] ??${imageFiles.length} images found for ${schedule.id}`);
        addPipelineLog(schedule.id, 'info', `??${imageFiles.length}媛??대?吏 ?낅줈???뺤씤?? ?곸긽 ?앹꽦???쒖옉?⑸땲??);
        addTitleLog(schedule.title_id, 'info', `???대?吏 ${imageFiles.length}媛??낅줈???뺤씤??`);
        addTitleLog(schedule.title_id, 'info', `?렗 ?곸긽 ?앹꽦???쒖옉?⑸땲??.. (?좎떆留?湲곕떎?ㅼ＜?몄슂)`);

        updateScheduleStatus(schedule.id, 'processing');

        // video ?④퀎 ?쒖옉 (鍮꾨룞湲?
        // 湲곗〈???앹꽦??video pipeline ID 李얘린
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
          addTitleLog(schedule.title_id, 'error', `???곸긽 ?앹꽦 ?ㅽ뙣: ${error.message}`);
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

// ?곸긽 ?앹꽦 ?꾨즺?섏뼱 ?낅줈???湲?以묒씤 ?ㅼ?以?泥댄겕 諛??낅줈???쒖옉
async function checkReadyToUploadSchedules() {
  try {
    // ============================================================
    // ?뵦 蹂듦뎄 濡쒖쭅: processing ?곹깭???ㅼ?以꾩쓽 ?뺥솗???뚯씠?꾨씪???④퀎 ?뚯븙
    // Pipeline stages: script ??video ??upload ??publish
    // ============================================================
    const dbRecovery = new Database(dbPath);
    const orphanedSchedules = dbRecovery.prepare(`
      SELECT s.id, s.script_id, s.title_id
      FROM video_schedules s
      WHERE s.status = 'processing'
        AND s.script_id IS NOT NULL
        AND s.video_id IS NULL
        AND s.youtube_url IS NULL
      ORDER BY s.created_at ASC
      LIMIT 10
    `).all() as any[];

    if (orphanedSchedules.length > 0) {
      console.log(`?뵇 [RECOVERY] Checking ${orphanedSchedules.length} processing schedule(s) without video_id`);

      for (const orphan of orphanedSchedules) {
        try {
          // ?뱤 ?뚯씠?꾨씪???④퀎蹂??곹깭 議고쉶
          const pipelines = dbRecovery.prepare(`
            SELECT stage, status
            FROM automation_pipelines
            WHERE schedule_id = ?
            ORDER BY
              CASE stage
                WHEN 'script' THEN 1
                WHEN 'video' THEN 2
                WHEN 'upload' THEN 3
                WHEN 'publish' THEN 4
              END
          `).all(orphan.id) as any[];

          const pipelineStatus = {
            script: pipelines.find((p: any) => p.stage === 'script')?.status || 'unknown',
            video: pipelines.find((p: any) => p.stage === 'video')?.status || 'unknown',
            upload: pipelines.find((p: any) => p.stage === 'upload')?.status || 'unknown',
            publish: pipelines.find((p: any) => p.stage === 'publish')?.status || 'unknown'
          };

          console.log(`?뱤 [RECOVERY] Schedule ${orphan.id} pipeline:`, pipelineStatus);

          // ?뵇 ?꾩옱 ?④퀎 ?뚯븙
          if (pipelineStatus.script !== 'completed') {
            console.log(`??[RECOVERY] Schedule ${orphan.id}: Script stage not completed yet (${pipelineStatus.script})`);
            continue;
          }

          if (pipelineStatus.video === 'pending' || pipelineStatus.video === 'unknown') {
            console.log(`??[RECOVERY] Schedule ${orphan.id}: Video stage pending (waiting for images or processing)`);
            continue;
          }

          if (pipelineStatus.video === 'running') {
            // Video ?④퀎 吏꾪뻾 以?- job ?곹깭 ?뺤씤
            const job = dbRecovery.prepare(`
              SELECT id, status, progress
              FROM jobs
              WHERE source_content_id = ?
              ORDER BY created_at DESC
              LIMIT 1
            `).get(orphan.script_id) as any;

            if (job) {
              if (job.status === 'completed') {
                // ??Job ?꾨즺??- video pipeline? running?댁?留??ㅼ젣濡쒕뒗 ?꾨즺
                console.log(`??[RECOVERY] Job ${job.id} completed but video pipeline stuck in 'running'`);
                console.log(`   ?붴? Linking video_id: ${job.id} ??schedule: ${orphan.id}`);

                dbRecovery.prepare(`
                  UPDATE video_schedules
                  SET video_id = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `).run(job.id, orphan.id);

                // Video pipeline??completed濡??낅뜲?댄듃
                dbRecovery.prepare(`
                  UPDATE automation_pipelines
                  SET status = 'completed'
                  WHERE schedule_id = ? AND stage = 'video'
                `).run(orphan.id);

                addTitleLog(orphan.title_id, 'info', `?뵕 ?곸긽 ?묒뾽 ?먮룞 ?곌껐?? ${job.id}`);
                console.log(`?뵕 [RECOVERY] Successfully linked video_id and updated pipeline`);

              } else {
                console.log(`??[RECOVERY] Job ${job.id} still ${job.status} (${job.progress || 0}%)`);
              }
            } else {
              console.log(`?좑툘 [RECOVERY] Video pipeline running but no job found`);
            }
            continue;
          }

          if (pipelineStatus.video === 'completed') {
            // Video pipeline? completed?몃뜲 video_id媛 ?녿뒗 寃쎌슦 - job 李얠븘???곌껐
            const job = dbRecovery.prepare(`
              SELECT id, status
              FROM jobs
              WHERE source_content_id = ?
                AND status = 'completed'
              ORDER BY created_at DESC
              LIMIT 1
            `).get(orphan.script_id) as any;

            if (job) {
              console.log(`??[RECOVERY] Video completed but video_id not linked`);
              console.log(`   ?붴? Linking video_id: ${job.id} ??schedule: ${orphan.id}`);

              dbRecovery.prepare(`
                UPDATE video_schedules
                SET video_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(job.id, orphan.id);

              addTitleLog(orphan.title_id, 'info', `?뵕 ?곸긽 ?묒뾽 ?먮룞 ?곌껐?? ${job.id}`);
              console.log(`?뵕 [RECOVERY] Successfully linked video_id`);
            } else {
              console.log(`??[RECOVERY] Video pipeline completed but no completed job found`);
            }
          }

        } catch (recoveryError: any) {
          console.error(`??[RECOVERY] Failed to recover schedule ${orphan.id}:`, recoveryError.message);
        }
      }
    }
    dbRecovery.close();

    // ============================================================
    // 湲곗〈 濡쒖쭅: video_id媛 ?덈뒗 ?ㅼ?以?李얠븘???낅줈??
    // ============================================================
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

        // Upload pipeline 李얘린
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

        // ?대? running?닿굅??completed硫??ㅽ궢
        if (uploadPipeline.status === 'running' || uploadPipeline.status === 'completed') {
          console.log(`[Scheduler] Upload pipeline already ${uploadPipeline.status} for ${schedule.id}, skipping`);
          continue;
        }

        const uploadPipelineId = uploadPipeline.id;
        const maxRetry = 3;

        // 鍮꾨룞湲곕줈 ?낅줈???쒖옉
        resumeUploadPipeline(schedule, uploadPipelineId, maxRetry).catch((error: any) => {
          console.error(`[Scheduler] Failed to upload for ${schedule.id}:`, error);
          addPipelineLog(uploadPipelineId, 'error', `Upload failed: ${error.message}`);
          addTitleLog(schedule.title_id, 'error', `???낅줈???ㅽ뙣: ${error.message}`);
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

// ?곸긽 ?앹꽦 ?꾨즺 ???낅줈???ш컻
async function resumeUploadPipeline(schedule: any, uploadPipelineId: string, maxRetry: number) {
  addPipelineLog(uploadPipelineId, 'info', `Starting YouTube upload for video: ${schedule.video_id}`);
  addTitleLog(schedule.title_id, 'info', `?뱾 YouTube ?낅줈??以?..`);
  updatePipelineStatus(uploadPipelineId, 'running');

  const uploadResult = await uploadToYouTube(schedule.video_id, schedule, uploadPipelineId, maxRetry);

  if (!uploadResult.success) {
    throw new Error(`YouTube upload failed: ${uploadResult.error}`);
  }

  updatePipelineStatus(uploadPipelineId, 'completed');

  // video_schedules ?뚯씠釉붿뿉 youtube_url ???
  const db = new Database(dbPath);
  db.prepare(`
    UPDATE video_schedules
    SET youtube_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(uploadResult.videoUrl, schedule.id);
  db.close();

  addPipelineLog(uploadPipelineId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
  addTitleLog(schedule.title_id, 'info', `??YouTube ?낅줈???꾨즺: ${uploadResult.videoUrl}`);

  // Publish ?④퀎
  const dbPublish = new Database(dbPath);
  const publishPipeline = dbPublish.prepare(`
    SELECT id FROM automation_pipelines
    WHERE schedule_id = ? AND stage = 'publish'
    LIMIT 1
  `).get(schedule.id) as any;
  dbPublish.close();

  const publishPipelineId = publishPipeline?.id || (schedule.id + '_publish');

  addPipelineLog(publishPipelineId, 'info', `Scheduling YouTube publish`);
  addTitleLog(schedule.title_id, 'info', `?뱟 ?쇰툝由ъ떆 ?덉빟 以?..`);
  updatePipelineStatus(publishPipelineId, 'running');

  const publishResult = await scheduleYouTubePublish(uploadResult.uploadId || '', schedule, publishPipelineId);

  if (!publishResult.success) {
    throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
  }

  updatePipelineStatus(publishPipelineId, 'completed');
  updateScheduleStatus(schedule.id, 'completed');
  updateTitleStatus(schedule.title_id, 'completed');

  addPipelineLog(publishPipelineId, 'info', `Pipeline completed successfully`);
  addTitleLog(schedule.title_id, 'info', `?럦 紐⑤뱺 ?묒뾽???꾨즺?섏뿀?듬땲??`);

  console.log(`[Scheduler] Upload pipeline completed for schedule ${schedule.id}`);
}

// ?대?吏 ?낅줈????video ?앹꽦 ?ш컻
async function resumeVideoGeneration(schedule: any, videoPipelineId: string) {
  const maxRetry = 3;

  addPipelineLog(videoPipelineId, 'info', `Starting video generation from script: ${schedule.script_id}`);
  addTitleLog(schedule.title_id, 'info', `?렗 ?곸긽 ?앹꽦 以?..`);
  updatePipelineStatus(videoPipelineId, 'running');

  const videoResult = await generateVideo(schedule.script_id, videoPipelineId, maxRetry, schedule.title_id, schedule);

  if (!videoResult.success) {
    throw new Error(`Video generation failed: ${videoResult.error}`);
  }

  if (!videoResult.videoId) {
    throw new Error('Video generation succeeded but videoId is missing');
  }

  console.log(`??[SCHEDULER] Video generation completed, videoId: ${videoResult.videoId}, schedule: ${schedule.id}`);

  updatePipelineStatus(videoPipelineId, 'completed');

  // video_schedules ?뚯씠釉붿뿉 video_id ???(?대? ??λ릺???덉?留?理쒖쥌 ?뺤씤)
  const dbUpdateVideo = new Database(dbPath);
  dbUpdateVideo.prepare(`UPDATE video_schedules SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(videoResult.videoId, schedule.id);
  dbUpdateVideo.close();
  console.log(`??[SCHEDULER] Video ID saved to schedule: ${videoResult.videoId} -> ${schedule.id}`);

  updateScheduleStatus(schedule.id, 'processing', { videoId: videoResult.videoId });
  addPipelineLog(videoPipelineId, 'info', `Video generated successfully: ${videoResult.videoId}`);
  addTitleLog(schedule.title_id, 'info', `???곸긽 ?앹꽦 ?꾨즺: ${videoResult.videoId}`);

  // ?댄썑 upload, publish ?④퀎??湲곗〈 濡쒖쭅 ?쒖슜
  // TODO: upload? publish ?④퀎瑜?蹂꾨룄 ?⑥닔濡?遺꾨━?섏뿬 ?ъ궗??
  console.log(`[Scheduler] Video generation completed for ${schedule.id}, continuing with upload...`);

  // Upload ?④퀎 ?쒖옉 - 湲곗〈 pipeline 李얘린
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
  addTitleLog(schedule.title_id, 'info', `?뱾 YouTube ?낅줈??以?..`);
  updatePipelineStatus(uploadPipelineId, 'running');

  const uploadResult = await uploadToYouTube(videoResult.videoId, schedule, uploadPipelineId, maxRetry);

  if (!uploadResult.success) {
    throw new Error(`YouTube upload failed: ${uploadResult.error}`);
  }

  updatePipelineStatus(uploadPipelineId, 'completed');

  // video_schedules ?뚯씠釉붿뿉 youtube_url ???
  const db = new Database(dbPath);
  db.prepare(`
    UPDATE video_schedules
    SET youtube_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(uploadResult.videoUrl, schedule.id);
  db.close();

  addPipelineLog(uploadPipelineId, 'info', `YouTube upload successful: ${uploadResult.videoUrl}`);
  addTitleLog(schedule.title_id, 'info', `??YouTube ?낅줈???꾨즺: ${uploadResult.videoUrl}`);

  // Publish ?④퀎 - 湲곗〈 pipeline 李얘린
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
  addTitleLog(schedule.title_id, 'info', `?뱟 ?쇰툝由ъ떆 ?덉빟 以?..`);
  updatePipelineStatus(publishPipelineId, 'running');

  const publishResult = await scheduleYouTubePublish(uploadResult.uploadId || '', schedule, publishPipelineId);

  if (!publishResult.success) {
    throw new Error(`YouTube publish scheduling failed: ${publishResult.error}`);
  }

  updatePipelineStatus(publishPipelineId, 'completed');
  updateScheduleStatus(schedule.id, 'completed');
  updateTitleStatus(schedule.title_id, 'completed');

  addPipelineLog(publishPipelineId, 'info', `Pipeline completed successfully`);
  addTitleLog(schedule.title_id, 'info', `?럦 紐⑤뱺 ?묒뾽???꾨즺?섏뿀?듬땲??`);

  console.log(`[Scheduler] Pipeline completed for schedule ${schedule.id}`);
}

// ========== ?꾩쟾 ?먮룞?? 梨꾨꼸 二쇨린 泥댄겕 諛??먮룞 ?ㅼ?以??앹꽦 ==========

/**
 * 梨꾨꼸蹂?二쇨린瑜??뺤씤?섍퀬, 二쇨린媛 ?꾨옒?덉쑝硫??먮룞?쇰줈 ?쒕ぉ ?앹꽦 ???ㅼ?以?異붽?
 * 1. 紐⑤뱺 ?쒖꽦?붾맂 梨꾨꼸 ?ㅼ젙 議고쉶
 * 2. 媛?梨꾨꼸???ㅼ쓬 ?ㅼ?以??쒓컙 怨꾩궛
 * 3. ?ㅼ쓬 ?ㅼ?以꾩씠 ?놁쑝硫?(?먮뒗 二쇨린媛 ?꾨옒?덉쑝硫?:
 *    - 移댄뀒怨좊━?먯꽌 ?쒕뜡?섍쾶 ?좏깮
 *    - AI濡??쒕ぉ ?앹꽦
 *    - ?쒕ぉ DB??異붽?
 *    - ?ㅼ?以??먮룞 異붽?
 */
export async function checkAndCreateAutoSchedules() {
  try {
    // ?좑툘 癒쇱? ?먮룞 ?쒕ぉ ?앹꽦???쒖꽦?붾릺???덈뒗吏 ?뺤씤
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

    // 1. 紐⑤뱺 ?쒖꽦?붾맂 梨꾨꼸 ?ㅼ젙 議고쉶
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
        // categories媛 ?녾굅??鍮?臾몄옄?댁씠硫??먮룞 ?앹꽦 遺덇?
        if (!setting.categories || setting.categories.trim() === '') {
          console.log(`[AutoScheduler] ?몌툘 Channel ${setting.channel_name}: No categories configured, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        let categories;
        try {
          categories = JSON.parse(setting.categories);
        } catch (parseError) {
          console.log(`[AutoScheduler] ?몌툘 Channel ${setting.channel_name}: Invalid categories JSON, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        if (!categories || !Array.isArray(categories) || categories.length === 0) {
          console.log(`[AutoScheduler] ?몌툘 Channel ${setting.channel_name}: Empty categories array, skipping auto-generation`);
          skippedCount++;
          continue;
        }

        // 2. ??梨꾨꼸??理쒓렐 ?ㅼ?以??뺤씤
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

        // 3. ?ㅼ쓬 ?ㅼ?以??쒓컙 怨꾩궛
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

        // 4. ?ㅼ쓬 ?ㅼ?以꾩씠 ?대? 議댁옱?섎뒗吏 ?뺤씤
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

        // 5. 移댄뀒怨좊━?먯꽌 ?쒕뜡 ?좏깮
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];

        console.log(`[AutoScheduler] Channel ${setting.channel_name}: Generating content for category "${randomCategory}"`);

        let titleId: string;
        let generatedTitle: string;
        let productData: any = null;

        // 6. 移댄뀒怨좊━蹂?遺꾧린 泥섎━
        if (randomCategory === '?곹뭹') {
          // === ?곹뭹 移댄뀒怨좊━: 荑좏뙜 踰좎뒪???곹뭹 議고쉶 ===
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Fetching Coupang bestseller...`);

          const result = await generateProductTitle(setting.user_id, setting.channel_id, setting.channel_name);
          if (!result) {
            throw new Error('Failed to generate product title');
          }

          titleId = result.titleId;
          generatedTitle = result.title;
          productData = result.productData;

        } else {
          // === ?ㅻⅨ 移댄뀒怨좊━: 硫??紐⑤뜽 AI ?됯? ?쒖뒪??===
          console.log(`[AutoScheduler] Channel ${setting.channel_name}: Using multi-model AI evaluation...`);

          const result = await generateTitleWithMultiModelEvaluation(randomCategory, setting.user_id, setting.channel_id, setting.channel_name);
          if (!result) {
            throw new Error('Failed to generate title with multi-model evaluation');
          }

          titleId = result.titleId;
          generatedTitle = result.title;
        }

        console.log(`[AutoScheduler] Channel ${setting.channel_name}: Created title ${titleId}`);

        // 8. ?ㅼ?以??먮룞 異붽?
        const { addSchedule } = await import('./automation');
        const scheduleId = addSchedule({
          titleId,
          scheduledTime: nextScheduleTime.toISOString(),
          youtubePrivacy: 'public' // 湲곕낯媛? ?꾩슂 ??梨꾨꼸 ?ㅼ젙??異붽? 媛??
        });

        console.log(`[AutoScheduler] ??Channel ${setting.channel_name}: Auto-scheduled "${generatedTitle}" for ${nextScheduleTime.toISOString()}`);

        // 9. 濡쒓렇 異붽?
        const { addTitleLog } = await import('./automation');
        addTitleLog(titleId, 'info', `?쨼 ?꾩쟾 ?먮룞?? 二쇨린 ?꾨옒濡??쒕ぉ ?먮룞 ?앹꽦 諛??ㅼ?以?異붽? (梨꾨꼸: ${setting.channel_name}, 移댄뀒怨좊━: ${randomCategory})`);

        successCount++;

      } catch (channelError: any) {
        console.error(`[AutoScheduler] Error processing channel ${setting.channel_name}:`, channelError);
        failedCount++;
        // 媛쒕퀎 梨꾨꼸 ?ㅽ뙣???꾩껜 ?꾨줈?몄뒪瑜?以묐떒?섏? ?딆쓬
      }
    }

    lastAutoScheduleResult = { success: successCount, failed: failedCount, skipped: skippedCount };
    console.log(`[AutoScheduler] ??Completed: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`);
    return lastAutoScheduleResult;

  } catch (error: any) {
    console.error('[AutoScheduler] Error in checkAndCreateAutoSchedules:', error);
    lastAutoScheduleResult = { success: 0, failed: 1, skipped: 0 };
    return lastAutoScheduleResult;
  }
}

// ============================================================
// ?곹뭹 移댄뀒怨좊━: 荑좏뙜 踰좎뒪???곹뭹 議고쉶 諛??쒕ぉ ?앹꽦
// ============================================================

async function generateProductTitle(
  userId: string,
  channelId: string,
  channelName: string
): Promise<{ titleId: string; title: string; productData: any } | null> {
  const { startAutoGenerationLog, updateAutoGenerationLog } = await import('./automation');
  let logId: string | null = null;

  try {
    // 濡쒓렇 ?쒖옉
    logId = startAutoGenerationLog({
      userId,
      channelId,
      channelName,
      category: '?곹뭹'
    });

    // 珥덇린 ?곹깭 ?낅뜲?댄듃
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'started',
        step: '荑좏뙜 踰좎뒪???곹뭹 議고쉶 以?..'
      });
    }

    // 1. 荑좏뙜 踰좎뒪???곹뭹 議고쉶 (?대? ?⑥닔 吏곸젒 ?ъ슜)
    const { getCoupangBestsellers, generateAffiliateDeepLink } = await import('./coupang');
    const result = await getCoupangBestsellers(userId, '1001');

    if (!result.success || !result.products || result.products.length === 0) {
      console.log('[ProductTitle] No products found');
      if (logId) {
        updateAutoGenerationLog(logId, {
          status: 'failed',
          step: '?곹뭹 ?놁쓬',
          errorMessage: 'No products found'
        });
      }
      return null;
    }

    const products = result.products;

    // 濡쒓렇 ?낅뜲?댄듃: 以묐났 ?뺤씤
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'fetching',
        step: '湲곗〈 ?곹뭹怨?以묐났 ?뺤씤 以?..'
      });
    }

    // 2. DB?먯꽌 湲곗〈 ?곹뭹 議고쉶
    const db = new Database(dbPath);
    const existingUrls = db.prepare(`
      SELECT product_url FROM coupang_products WHERE user_id = ?
    `).all(userId).map((row: any) => row.product_url);
    db.close();

    // 3. DB???녿뒗 ?곹뭹 李얘린
    const newProduct = products.find((p: any) => !existingUrls.includes(p.productUrl));

    if (!newProduct) {
      console.log('[ProductTitle] All products already in DB, skipping');
      if (logId) {
        updateAutoGenerationLog(logId, {
          status: 'failed',
          step: '以묐났 ?곹뭹',
          errorMessage: 'All products already exist in database'
        });
      }
      return null;
    }

    
    const affiliateLink = await generateAffiliateDeepLink(userId, newProduct.productUrl);

    console.log(`[ProductTitle] Found new product: ${newProduct.productName}`);

    // 濡쒓렇 ?낅뜲?댄듃: ???곹뭹 諛쒓껄
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'generating',
        step: `???곹뭹 諛쒓껄: ${newProduct.productName.substring(0, 30)}...`,
        productInfo: {
          productName: newProduct.productName,
          productPrice: newProduct.productPrice,
          productImage: newProduct.productImage
        }
      });
    }

    // 4. ?곹뭹 DB??異붽?
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
      affiliateLink,
      newProduct.productName,
      newProduct.productName, // description???쒕ぉ ?ъ슜
      '媛?꾨뵒吏??, // 湲곕낯 移댄뀒怨좊━
      newProduct.productPrice || 0,
      newProduct.productPrice || 0,
      newProduct.productImage || ''
    );
    db2.close();

    console.log(`[ProductTitle] Added product to DB: ${productId}`);

    // 5. ?쒕ぉ ?앹꽦 (?곹뭹 ?대쫫 湲곕컲)
    const title = `${newProduct.productName.substring(0, 50)}... 由щ럭`;

    // 6. video_titles??異붽?
    const { addVideoTitle } = await import('./automation');
    const titleId = addVideoTitle({
      title,
      type: 'product',
      category: '?곹뭹',
      channel: '', // ?섏쨷???ㅼ?以?異붽? ???ㅼ젙
      scriptMode: 'chrome',
      mediaMode: 'dalle3',
      model: 'gemini', // ?곹뭹? Gemini 湲곕낯
      userId,
      productUrl: affiliateLink
    });

    // 濡쒓렇 ?꾨즺
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'completed',
        step: '?쒕ぉ ?앹꽦 ?꾨즺',
        bestTitle: title,
        bestScore: 100, // ?곹뭹 ?쒕ぉ? ?먯닔 ?됯? ?놁쓬
        resultTitleId: titleId
      });
    }

    return {
      titleId,
      title,
      productData: { ...newProduct, deepLink: affiliateLink }
    };

  } catch (error: any) {
    console.error('[ProductTitle] Error:', error);
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'failed',
        step: '?먮윭 諛쒖깮',
        errorMessage: error.message || 'Unknown error'
      });
    }
    return null;
  }
}

// ============================================================
// 洹쒖튃 湲곕컲 ?쒕ぉ ?먯닔 ?됯? (AI 鍮꾩슜 ?덇컧)
// ============================================================

/**
 * 媛꾨떒??洹쒖튃 湲곕컲?쇰줈 ?쒕ぉ ?먯닔瑜??됯??⑸땲??
 * AI API ?몄텧 ?놁씠 濡쒖뺄?먯꽌 鍮좊Ⅴ寃??됯??????덉뒿?덈떎.
 */
function evaluateTitleWithRules(title: string, category: string): number {
  let score = 0;

  // 1. ?쒕ぉ 湲몄씠 ?됯? (20-60?먭? 理쒖쟻)
  const length = title.length;
  if (length >= 20 && length <= 60) {
    score += 30; // 理쒖쟻 湲몄씠
  } else if (length >= 15 && length < 20) {
    score += 20; // ?쎄컙 吏㏃쓬
  } else if (length > 60 && length <= 80) {
    score += 20; // ?쎄컙 源
  } else if (length < 15) {
    score += 5; // ?덈Т 吏㏃쓬
  } else {
    score += 10; // ?덈Т 源
  }

  // 2. ?뱀닔臾몄옄 ?됯? (?멸린???좊컻)
  const hasQuestion = title.includes('?');
  const hasExclamation = title.includes('!');
  const hasEllipsis = title.includes('...');
  const hasQuotes = title.includes('"') || title.includes("'");

  if (hasQuestion) score += 10;
  if (hasExclamation) score += 8;
  if (hasEllipsis) score += 5;
  if (hasQuotes) score += 5;

  // 3. 媛먯젙 ?ㅼ썙???됯?
  const emotionalKeywords = [
    '?꾪쉶', '蹂듭닔', '諛섏쟾', '異⑷꺽', '?덈Ъ', '媛먮룞',
    '諛곗떊', '鍮꾨?', '吏꾩떎', '理쒗썑', '洹??, '?깃났',
    '?듭풄', '?붾젮', '臾대쫷', '?몃㈃', '?밸떦', '?꾩꽕',
    '?뚭퀬蹂대땲', '寃곌뎅', '?쒕뵒??, '?앺뙋??, '理쒓퀬'
  ];

  let emotionalCount = 0;
  for (const keyword of emotionalKeywords) {
    if (title.includes(keyword)) {
      emotionalCount++;
    }
  }
  score += Math.min(emotionalCount * 5, 20); // 理쒕? 20??

  // 4. ?レ옄 ?ы븿 ?щ? (援ъ껜??
  if (/\d+/.test(title)) {
    score += 8;
  }

  // 5. 移댄뀒怨좊━ 愿???ㅼ썙???됯?
  const categoryKeywords: Record<string, string[]> = {
    '?쒕땲?댁궗??: ['?쒖뼱癒몃땲', '硫곕뒓由?, '怨좊?媛덈벑', '?쒕똻', '?묐줈??],
    '蹂듭닔洹?: ['蹂듭닔', '臾댁떆', 'CEO', '洹??, '諛곗떊??, '?좎엯'],
    '?덈턿?먯궗??: ['?덈턿', '遺곹븳', '?⑦븳', '?먯쑀', '??쒕?援?],
    '留됱옣?쒕씪留?: ['異쒖깮', '鍮꾨?', '?щ쾶', '諛곕떎瑜?, '移쒖옄?뺤씤'],
  };

  const keywords = categoryKeywords[category] || [];
  let categoryCount = 0;
  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      categoryCount++;
    }
  }
  score += Math.min(categoryCount * 7, 15); // 理쒕? 15??

  // 6. 臾몄옣 援ъ“ ?됯?
  const hasComma = (title.match(/,/g) || []).length;
  if (hasComma >= 1 && hasComma <= 2) {
    score += 7; // ?곸젅??援ъ“
  }

  // 7. 二쇱뼱 紐낇솗???됯? (媛??以묒슂!)
  // 臾몄젣: "臾댁떆?뱁뻽??泥?냼遺, CEO媛 ??鍮꾧껐" - ?꾧? CEO媛 ?먮뒗吏 遺덈챸??
  // ?닿껐: "泥?냼遺瑜?臾댁떆?덈뜕 洹몃뱾, CEO媛 ??洹몃? ?욎뿉??.." - 二쇱뼱媛 紐낇솗??
  let clarityScore = 0;

  // 7-1. 紐⑹쟻寃?議곗궗 + 怨쇨굅???⑦꽩 (媛?댁옄 紐낆떆)
  // "~瑜?臾댁떆?덈뜕", "~??愿대∼?붾뜕", "~?먭쾶 諛곗떊?뱁뻽?? ??
  const aggressorPatterns = [
    /[?꾨?]?\s*(臾댁떆|愿대∼??諛곗떊|?댁쳯|?몃㈃|臾댁떆??李⑤퀎).*?[?덈뜕|???섎뜕]/,
    /?먭쾶\s*(諛곗떊|臾댁떆).*??뱁뻽??
  ];

  let hasAggressor = false;
  for (const pattern of aggressorPatterns) {
    if (pattern.test(title)) {
      hasAggressor = true;
      break;
    }
  }

  // 7-2. 紐낇솗??二쇱뼱 ?紐낆궗 ?먮뒗 吏?쒖뼱
  // "洹몃뱾", "洹몃?", "洹?, "洹??욎뿉??, "洹몃? ?욎뿉"
  const hasClearSubject = /洹몃뱾|洹몃?|洹???洹멸?|洹몃?/.test(title);

  // 7-3. ?쒓컙 ?쒗쁽 + 蹂???⑦꽩 (怨쇨굅-?꾩옱 ?鍮?
  // "3????, "10??留뚯뿉" ??+ "CEO媛 ??, "?깃났?? ??
  const hasTimeTransition = /\d+??s*(??留뚯뿉|??.*?(媛 ??濡??섑?|??洹???洹?/.test(title);

  // 7-4. ?좊ℓ???⑦꽩 媛먯젏
  // "臾댁떆?뱁뻽??泥?냼遺, CEO濡?.." - 泥?냼遺媛 二쇱뼱?몄? 遺덈챸??
  const hasAmbiguousPattern = /?뱁뻽??*?,.*?濡?s*(?깃났|蹂???깃레)/.test(title) && !hasClearSubject;

  // ?먯닔 怨꾩궛
  if (hasAggressor) clarityScore += 8; // 媛?댁옄 紐낆떆
  if (hasClearSubject) clarityScore += 7; // 紐낇솗??二쇱뼱
  if (hasTimeTransition) clarityScore += 5; // ?쒓컙+蹂??
  if (hasAmbiguousPattern) clarityScore -= 10; // ?좊ℓ???⑦꽩 媛먯젏

  score += Math.max(0, clarityScore); // 理쒕? 20??(媛먯젏 媛??

  // 理쒖쥌 ?먯닔瑜?0-100 踰붿쐞濡??쒗븳
  return Math.min(100, Math.max(0, score));
}

// ============================================================
// ?ㅻⅨ 移댄뀒怨좊━: 硫??紐⑤뜽 AI ?됯? 諛?理쒓퀬 ?먯닔 ?쒕ぉ ?좏깮
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
    // ?쒕ぉ ? ?ъ슜 ?ㅼ젙 ?뺤씤
    const settings = getAutomationSettings();
    const useTitlePool = settings.use_title_pool === 'true';

    // 濡쒓렇 ?쒖옉
    logId = startAutoGenerationLog({
      userId,
      channelId,
      channelName,
      category
    });

    // 珥덇린 ?곹깭 ?낅뜲?댄듃
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'started',
        step: useTitlePool ? '怨좏뭹吏??쒕ぉ ? ?뺤씤 以?..' : 'AI濡??쒕ぉ ?앹꽦 以鍮?以?..'
      });
    }

    // ?렞 ?좏깮?ы빆: ?쒕ぉ ? ?ъ슜 (?ㅼ젙???곕씪)
    if (useTitlePool) {
      console.log(`[TitlePool] Checking title pool for category "${category}"...`);
      const poolTitle = getTitleFromPool(category, 90) as any;

      if (poolTitle) {
        console.log(`[TitlePool] ??Found high-quality title from pool (score: ${poolTitle.score})`);
        console.log(`[TitlePool] Title: "${poolTitle.title}"`);

        // 移댄뀒怨좊━蹂?鍮꾨뵒?????寃곗젙
        let videoType: 'longform' | 'shortform' | 'product' = 'longform';
        if (category.includes('??) || category === 'shortform' || category === 'Shorts') {
          videoType = 'shortform';
        }

        // video_titles??異붽?
        const titleId = addVideoTitle({
          title: poolTitle.title,
          type: videoType,
          category,
          channel: channelId,
          scriptMode: 'chrome',
          mediaMode: 'dalle3',
          model: 'ollama-pool', // ??먯꽌 媛?몄솕?뚯쓣 ?쒖떆
          userId
        });

        // 濡쒓렇 ?꾨즺
        if (logId) {
          updateAutoGenerationLog(logId, {
            status: 'completed',
            step: '?쒕ぉ ??먯꽌 ?좏깮 ?꾨즺 (鍮꾩슜 $0)',
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

      console.log(`[TitlePool] ?좑툘 No high-quality titles in pool, falling back to AI generation...`);
    }

    // 移댄뀒怨좊━蹂?湲곕낯 紐⑤뜽 寃곗젙
    let defaultModel = 'claude'; // 湲곕낯媛?
    let videoType: 'longform' | 'shortform' | 'product' = 'longform'; // 湲곕낯媛?

    if (category.includes('??) || category === 'shortform' || category === 'Shorts') {
      defaultModel = 'chatgpt';
      videoType = 'shortform';
    } else if (category.includes('濡?) || category === 'longform') {
      defaultModel = 'claude';
      videoType = 'longform';
    }

    console.log(`[TitleGen] Generating titles for category "${category}" using ${defaultModel} (type: ${videoType})...`);

    // 濡쒓렇 ?낅뜲?댄듃: 紐⑤뜽 ?몄텧
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'generating',
        step: `${defaultModel.toUpperCase()}濡??쒕ぉ ?앹꽦 以?..`,
        modelsUsed: [defaultModel]
      });
    }

    // 2. ?좏깮??紐⑤뜽濡??쒕ぉ ?앹꽦
    const titles = await generateTitlesWithModel(category, defaultModel);

    // 2. ?쒕ぉ ?섏쭛
    const allTitles = titles.map((t: string) => ({ title: t, model: defaultModel, score: 0 }));

    if (allTitles.length === 0) {
      console.error('[MultiModel] No titles generated from any model');
      if (logId) {
        updateAutoGenerationLog(logId, {
          status: 'failed',
          step: '?쒕ぉ ?앹꽦 ?ㅽ뙣',
          errorMessage: 'No titles generated from any model'
        });
      }
      return null;
    }

    console.log(`[TitleGen] Generated ${allTitles.length} titles`);

    // 濡쒓렇 ?낅뜲?댄듃: 洹쒖튃 湲곕컲 ?됯?
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'evaluating',
        step: `洹쒖튃 湲곕컲?쇰줈 ?쒕ぉ ?됯? 以?.. (AI 鍮꾩슜 ?덇컧)`
      });
    }

    // 3. 洹쒖튃 湲곕컲?쇰줈 媛??쒕ぉ ?됯?
    const scoredTitles = allTitles.map((item: any) => ({
      ...item,
      score: evaluateTitleWithRules(item.title, category)
    }));

    // 4. 理쒓퀬 ?먯닔???쒕ぉ ?좏깮
    scoredTitles.sort((a, b) => b.score - a.score);
    const bestTitle = scoredTitles[0];

    console.log(`[TitleGen] Evaluated ${scoredTitles.length} titles with rule-based scoring`);
    console.log(`[TitleGen] Best title (score: ${bestTitle.score}): "${bestTitle.title}" (model: ${bestTitle.model})`);

    // ?곸쐞 3媛??쒕ぉ 濡쒓렇 異쒕젰
    scoredTitles.slice(0, 3).forEach((item: any, index: number) => {
      console.log(`  ${index + 1}. [${item.score}?? ${item.title}`);
    });

    // 5. video_titles??異붽?
    const titleId = addVideoTitle({
      title: bestTitle.title,
      type: videoType, // 移댄뀒怨좊━???곕씪 longform ?먮뒗 shortform
      category,
      channel: channelId,
      scriptMode: 'chrome',
      mediaMode: 'dalle3',
      model: bestTitle.model,
      userId
    });

    // 濡쒓렇 ?꾨즺
    if (logId) {
      updateAutoGenerationLog(logId, {
        status: 'completed',
        step: '?쒕ぉ ?좎젙 ?꾨즺 (洹쒖튃 湲곕컲 ?됯?)',
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
        step: '?먮윭 諛쒖깮',
        errorMessage: error.message || 'Unknown error'
      });
    }
    return null;
  }
}

// ?뱀젙 紐⑤뜽濡??쒕ぉ ?앹꽦 (?대? ?⑥닔 吏곸젒 ?ъ슜)
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

// ?쒕ぉ ?먯닔 ?됯? (?대? ?⑥닔 吏곸젒 ?ъ슜)
async function evaluateTitleScore(title: string, category: string): Promise<number> {
  try {
    const { evaluateTitleScore: evaluate } = await import('./ai-title-generation');
    return await evaluate(title, category);
  } catch (error: any) {
    console.error('[ScoreEvaluation] Error:', error);
    return 50; // ?먮윭 ??以묎컙 ?먯닔
  }
}

// ============================================================
// ?륂뤌 ?먮룞 ?낅줈??泥댁빱
// ============================================================
/**
 * ?꾨즺???륂뤌 ?묒뾽??李얠븘??YouTube???낅줈?쒗빀?덈떎.
 * ?낅줈?????ㅻ챸???濡깊뤌 留곹겕瑜?異붽??⑸땲??
 */
export async function checkCompletedShortformJobs() {
  try {
    const db = new Database(dbPath);

    // shortform_job_id媛 ?덇퀬 ?꾩쭅 ?낅줈?쒕릺吏 ?딆? ?ㅼ?以?李얘린
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

    console.log(`?뵇 [SHORTFORM CHECKER] Found ${schedulesWithShortform.length} schedules with shortform jobs`);

    for (const schedule of schedulesWithShortform) {
      try {
        const shortformJobId = schedule.shortform_job_id;
        const longformYoutubeUrl = schedule.longform_youtube_url;

        console.log(`?뵇 [SHORTFORM] Checking shortform job: ${shortformJobId}`);

        // ?륂뤌 ?묒뾽 ?곹깭 ?뺤씤
        const shortformJob = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(shortformJobId) as any;

        if (!shortformJob) {
          console.log(`?좑툘 [SHORTFORM] Job not found: ${shortformJobId}`);
          continue;
        }

        console.log(`?뵇 [SHORTFORM] Job status: ${shortformJob.status}`);

        if (shortformJob.status !== 'completed') {
          console.log(`??[SHORTFORM] Job not yet completed: ${shortformJob.status}`);
          continue;
        }

        // ?륂뤌 ?꾨즺??- YouTube ?낅줈???쒖옉
        console.log(`??[SHORTFORM] Shortform completed! Starting YouTube upload...`);
        addTitleLog(schedule.title_id, 'info', `???륂뤌 ?앹꽦 ?꾨즺! YouTube ?낅줈???쒖옉...`);

        // ?뚯씠?꾨씪??ID ?앹꽦
        const uploadPipelineId = schedule.id + '_shortform_upload';
        updatePipelineStatus(uploadPipelineId, 'running');

        // YouTube ?낅줈??(濡깊뤌 留곹겕瑜??ㅻ챸???異붽?)
        const videoPath = shortformJob.video_path;
        const title = shortformJob.title || schedule.title;

        // ?ㅻ챸???濡깊뤌 留곹겕 異붽?
        let description = '';
        if (longformYoutubeUrl) {
          description = `濡깊뤌 : ${longformYoutubeUrl}`;
        }

        console.log(`?뱾 [SHORTFORM] Uploading to YouTube with description: ${description}`);
        addTitleLog(schedule.title_id, 'info', `?뱾 ?륂뤌 YouTube ?낅줈??以?.. (?ㅻ챸: ${description})`);

        const uploadResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/youtube/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Request': 'automation-system'
          },
          body: JSON.stringify({
            videoPath,
            title: `${title} (?쇱툩)`,
            description,
            tags: schedule.tags ? schedule.tags.split(',').map((t: string) => t.trim()) : [],
            privacy: schedule.youtube_privacy || 'public',
            channelId: schedule.channel,
            jobId: shortformJobId,
            publishAt: null, // ?륂뤌? 利됱떆 怨듦컻
            userId: schedule.user_id,
            type: 'shortform'
          })
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error(`??[SHORTFORM] Upload failed: ${errorText}`);
          addTitleLog(schedule.title_id, 'error', `???륂뤌 ?낅줈???ㅽ뙣: ${errorText}`);
          updatePipelineStatus(uploadPipelineId, 'failed', errorText);
          continue;
        }

        const uploadData = await uploadResponse.json();

        if (!uploadData.success) {
          console.error(`??[SHORTFORM] Upload failed: ${uploadData.error}`);
          addTitleLog(schedule.title_id, 'error', `???륂뤌 ?낅줈???ㅽ뙣: ${uploadData.error}`);
          updatePipelineStatus(uploadPipelineId, 'failed', uploadData.error);
          continue;
        }

        // ?낅줈???깃났 - shortform_uploaded ?뚮옒洹??낅뜲?댄듃
        db.prepare(`
          UPDATE video_schedules
          SET shortform_uploaded = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(schedule.id);

        console.log(`??[SHORTFORM] Upload successful: ${uploadData.videoUrl}`);
        addTitleLog(schedule.title_id, 'info', `???륂뤌 YouTube ?낅줈???꾨즺!`);
        addTitleLog(schedule.title_id, 'info', `?럦 ?륂뤌: ${uploadData.videoUrl}`);
        updatePipelineStatus(uploadPipelineId, 'completed');

      } catch (error: any) {
        console.error(`??[SHORTFORM] Error processing shortform for schedule ${schedule.id}:`, error);
        addTitleLog(schedule.title_id, 'error', `???륂뤌 泥섎━ 以??ㅻ쪟: ${error.message}`);
      }
    }

    db.close();
  } catch (error: any) {
    console.error('??[SHORTFORM CHECKER] Error:', error);
  }
}

