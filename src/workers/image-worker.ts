/**
 * Image Crawler Worker
 *
 * 큐에서 이미지 크롤링 작업을 가져와 실행하는 워커 프로세스
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
        // 1. 큐에서 다음 작업 가져오기
        this.currentTask = await this.manager.dequeue('image');

        if (!this.currentTask) {
          // 작업 없음, 5초 대기
          await this.sleep(5000);
          continue;
        }

        console.log(`▶️  Processing image task: ${this.currentTask.id}`);
        await this.manager.appendLog(this.currentTask.id, '🚀 이미지 크롤링 시작...');

        // 2. 작업 실행
        await this.processTask(this.currentTask);

        // 3. 완료 처리
        await this.manager.updateTask(this.currentTask.id, {
          status: 'completed',
          completedAt: new Date().toISOString()
        });

        await this.manager.appendLog(this.currentTask.id, '✅ 이미지 크롤링 완료!');
        console.log(`✅ Image task completed: ${this.currentTask.id}`);

      } catch (error: any) {
        console.error(`❌ Image task failed:`, error);

        if (this.currentTask) {
          const shouldRetry = this.currentTask.retryCount < this.currentTask.maxRetries;

          if (shouldRetry) {
            // 재시도
            await this.manager.updateTask(this.currentTask.id, {
              status: 'waiting',
              retryCount: this.currentTask.retryCount + 1,
              error: error.message
            });
            await this.manager.appendLog(
              this.currentTask.id,
              `⚠️ 재시도 ${this.currentTask.retryCount + 1}/${this.currentTask.maxRetries}: ${error.message}`
            );
          } else {
            // 최대 재시도 초과
            await this.manager.updateTask(this.currentTask.id, {
              status: 'failed',
              completedAt: new Date().toISOString(),
              error: error.message
            });
            await this.manager.appendLog(
              this.currentTask.id,
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
      await this.manager.updateTask(this.currentTask.id, {
        status: 'waiting',
        startedAt: undefined
      });
    }
    this.manager.close();
  }

  private async processTask(task: QueueTask): Promise<void> {
    const { metadata, projectId } = task;
    const { scenes, useImageFX = false } = metadata;

    if (!scenes || !Array.isArray(scenes)) {
      throw new Error('씬 데이터가 없습니다.');
    }

    await this.manager.appendLog(task.id, `📋 ${scenes.length}개 씬 발견`);

    // Python 스크립트 경로
    const workspacePath = path.join(process.cwd(), '..');
    const pythonScript = path.join(workspacePath, 'image_crawler_working.py');
    const backendPath = path.join(workspacePath, 'trend-video-backend');

    // 임시 씬 파일 생성
    const tempDir = path.join(backendPath, 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const scenesFilePath = path.join(tempDir, `scenes_${task.id}.json`);
    await fs.writeFile(scenesFilePath, JSON.stringify(scenes, null, 2), 'utf-8');

    // 출력 디렉토리
    const outputProjectId = projectId.startsWith('project_') ? projectId : `project_${projectId}`;
    const outputDir = path.join(backendPath, 'input', outputProjectId);

    await this.manager.appendLog(task.id, `📁 출력 폴더: ${outputDir}`);

    // Python 실행
    const pythonArgs = [pythonScript, scenesFilePath];
    if (useImageFX) {
      pythonArgs.push('--use-imagefx');
    }
    pythonArgs.push('--output-dir', outputDir);

    await this.manager.appendLog(
      task.id,
      useImageFX ? '🚀 ImageFX + Whisk 자동화 시작' : '🚀 Whisk 자동화 시작'
    );

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', pythonArgs, {
        cwd: workspacePath,
        shell: true
      });

      let lastLogTime = Date.now();

      pythonProcess.stdout.on('data', async (data) => {
        const output = data.toString().trim();
        console.log(`[Python] ${output}`);

        // 로그 업데이트 (너무 자주 업데이트하지 않도록 throttle)
        const now = Date.now();
        if (now - lastLogTime > 2000) {  // 2초마다
          await this.manager.appendLog(task.id, output);
          lastLogTime = now;
        }
      });

      pythonProcess.stderr.on('data', async (data) => {
        const error = data.toString().trim();
        console.error(`[Python Error] ${error}`);
        await this.manager.appendLog(task.id, `❌ ${error}`);
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
          resolve();
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
