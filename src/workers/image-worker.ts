/**
 * Image Crawler Worker
 *
 * 큐에서 이미지 크롤링 작업을 가져와 실행하는 워커 프로세스
 * task_id 기반으로 작업을 관리합니다.
 */

import { QueueManager, QueueTask } from '@/lib/queue-manager';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

class ImageWorker {
  private manager: QueueManager;
  private running: boolean = false;
  private currentTask: QueueTask | null = null;

  constructor() {
    this.manager = new QueueManager();
  }

  async start() {
    this.running = true;
    console.log('🚀 Image crawler worker started');

    while (this.running) {
      try {
        // 1. 큐에서 다음 작업 가져오기 (script 단계가 완료된 것만)
        this.currentTask = await this.manager.dequeue('image');

        if (!this.currentTask) {
          // 작업 없음, 5초 대기
          await this.sleep(5000);
          continue;
        }

        const taskId = this.currentTask.taskId;
        console.log(`▶️  Processing image task: ${taskId}`);
        await this.manager.appendLog(taskId, 'image', '🚀 이미지 크롤링 시작...');

        // 2. 작업 실행
        await this.processTask(this.currentTask);

        // 3. 완료 처리
        await this.manager.updateTask(taskId, 'image', {
          status: 'completed',
          completedAt: new Date().toISOString()
        });

        await this.manager.appendLog(taskId, 'image', '✅ 이미지 크롤링 완료!');
        console.log(`✅ Image task completed: ${taskId}`);

        // 4. ⭐ 이미지 크롤링 완료 후 자동으로 영상 제작 트리거
        await this.triggerVideoGeneration(taskId);

      } catch (error: any) {
        console.error(`❌ Image task failed:`, error);

        if (this.currentTask) {
          const taskId = this.currentTask.taskId;
          const shouldRetry = this.currentTask.retryCount < this.currentTask.maxRetries;

          if (shouldRetry) {
            // 재시도
            await this.manager.updateTask(taskId, 'image', {
              status: 'waiting',
              retryCount: this.currentTask.retryCount + 1,
              error: error.message
            });
            await this.manager.appendLog(
              taskId, 'image',
              `⚠️ 재시도 ${this.currentTask.retryCount + 1}/${this.currentTask.maxRetries}: ${error.message}`
            );
          } else {
            // 최대 재시도 초과
            await this.manager.updateTask(taskId, 'image', {
              status: 'failed',
              completedAt: new Date().toISOString(),
              error: error.message
            });
            await this.manager.appendLog(
              taskId, 'image',
              `❌ 실패: ${error.message}`
            );
          }
        }
      } finally {
        this.currentTask = null;
      }
    }

    console.log('🛑 Image crawler worker stopped');
  }

  async stop() {
    this.running = false;
    if (this.currentTask) {
      // 현재 작업을 waiting으로 되돌림
      await this.manager.updateTask(this.currentTask.taskId, 'image', {
        status: 'waiting',
        startedAt: undefined
      });
    }
    this.manager.close();
  }

  private async processTask(task: QueueTask): Promise<void> {
    const { metadata, taskId } = task;
    const { scenes, useImageFX = false } = metadata;

    if (!scenes || !Array.isArray(scenes)) {
      throw new Error('씬 데이터가 없습니다.');
    }

    await this.manager.appendLog(taskId, 'image', `📋 ${scenes.length}개 씬 발견`);

    // Python 스크립트 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const pythonScript = path.join(backendPath, 'src', 'image_crawler', 'image_crawler_working.py');

    // 임시 씬 파일 생성
    const tempDir = path.join(backendPath, 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const scenesFilePath = path.join(tempDir, `scenes_${taskId}.json`);
    await fs.writeFile(scenesFilePath, JSON.stringify(scenes, null, 2), 'utf-8');

    // 출력 디렉토리 (task_id 기반)
    const outputDir = path.join(backendPath, 'input', `task_${taskId}`);

    await this.manager.appendLog(taskId, 'image', `📁 출력 폴더: ${outputDir}`);

    // Python 실행
    const pythonArgs = [pythonScript, scenesFilePath];
    if (useImageFX) {
      pythonArgs.push('--use-imagefx');
    }
    pythonArgs.push('--output-dir', outputDir);

    await this.manager.appendLog(
      taskId, 'image',
      useImageFX ? '🚀 ImageFX + Whisk 자동화 시작' : '🚀 Whisk 자동화 시작'
    );

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', pythonArgs, {
        cwd: backendPath,
        shell: true
      });

      let lastLogTime = Date.now();

      pythonProcess.stdout.on('data', async (data) => {
        const output = data.toString().trim();
        console.log(`[Python] ${output}`);

        // 로그 업데이트 (너무 자주 업데이트하지 않도록 throttle)
        const now = Date.now();
        if (now - lastLogTime > 2000) {  // 2초마다
          await this.manager.appendLog(taskId, 'image', output);
          lastLogTime = now;
        }
      });

      pythonProcess.stderr.on('data', async (data) => {
        const error = data.toString().trim();
        console.error(`[Python Error] ${error}`);
        await this.manager.appendLog(taskId, 'image', `❌ ${error}`);
      });

      pythonProcess.on('close', async (code) => {
        console.log(`Python 프로세스 종료: ${code}`);

        // 임시 파일 삭제
        try {
          await fs.unlink(scenesFilePath);
        } catch (err) {
          console.error('임시 파일 삭제 실패:', err);
        }

        if (code === 0) {
          // ⭐ 이미지 파일이 실제로 저장되었는지 확인
          try {
            const outputDirExists = await fs.access(outputDir).then(() => true).catch(() => false);

            if (!outputDirExists) {
              reject(new Error(`출력 디렉토리가 생성되지 않았습니다: ${outputDir}`));
              return;
            }

            const files = await fs.readdir(outputDir);
            const imageFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));

            if (imageFiles.length === 0) {
              reject(new Error(`이미지 파일이 저장되지 않았습니다. 디렉토리: ${outputDir}`));
              return;
            }

            await this.manager.appendLog(
              taskId, 'image',
              `✅ ${imageFiles.length}개 이미지 파일 저장 확인`
            );
            console.log(`✅ ${imageFiles.length}개 이미지 저장됨: ${outputDir}`);

            resolve();
          } catch (err: any) {
            reject(new Error(`이미지 파일 확인 실패: ${err.message}`));
          }
        } else {
          reject(new Error(`Python 스크립트가 오류로 종료되었습니다. (코드: ${code})`));
        }
      });

      pythonProcess.on('error', (err) => {
        reject(err);
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ⭐ 이미지 크롤링 완료 후 자동으로 영상 제작 트리거
   * task_schedules의 status를 waiting_for_upload -> processing으로 변경하여 스케줄러가 다시 처리하도록 함
   */
  private async triggerVideoGeneration(taskId: string): Promise<void> {
    try {
      console.log(`🎬 [TRIGGER] 영상 제작 자동 트리거 시작: ${taskId}`);

      // DB에서 task_id로 스케줄 찾기
      const Database = require('better-sqlite3');
      const path = require('path');
      const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
      const db = new Database(dbPath);

      const schedule = db.prepare(`
        SELECT id, status, title_id
        FROM task_schedules
        WHERE task_id = ?
      `).get(taskId) as any;

      if (!schedule) {
        console.warn(`⚠️ [TRIGGER] 스케줄을 찾을 수 없습니다: ${taskId}`);
        db.close();
        return;
      }

      // waiting_for_upload 상태인 경우만 processing으로 변경
      if (schedule.status === 'waiting_for_upload') {
        db.prepare(`
          UPDATE task_schedules
          SET status = 'processing'
          WHERE id = ?
        `).run(schedule.id);

        // video_titles도 업데이트
        if (schedule.title_id) {
          db.prepare(`
            UPDATE video_titles
            SET status = 'processing'
            WHERE id = ?
          `).run(schedule.title_id);
        }

        console.log(`✅ [TRIGGER] 스케줄 상태 변경: waiting_for_upload -> processing (${schedule.id})`);
        await this.manager.appendLog(taskId, 'image', '🎬 영상 제작 자동 시작...');
      } else {
        console.log(`ℹ️ [TRIGGER] 이미 처리 중이거나 완료된 스케줄: ${schedule.status}`);
      }

      db.close();
    } catch (error: any) {
      console.error(`❌ [TRIGGER] 영상 제작 트리거 실패:`, error);
      await this.manager.appendLog(taskId, 'image', `⚠️ 영상 제작 자동 시작 실패: ${error.message}`);
    }
  }
}

// 워커 실행
if (require.main === module) {
  const worker = new ImageWorker();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n📛 SIGINT 수신. 워커를 종료합니다...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n📛 SIGTERM 수신. 워커를 종료합니다...');
    await worker.stop();
    process.exit(0);
  });

  worker.start().catch((err) => {
    console.error('❌ Worker error:', err);
    process.exit(1);
  });
}

export default ImageWorker;
