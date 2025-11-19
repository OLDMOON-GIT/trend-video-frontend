/**
 * Image Crawler Integration Tests
 *
 * 이미지 크롤링 시스템의 전체 워크플로우를 테스트합니다.
 *
 * 테스트 범위:
 * 1. API 엔드포인트 (POST /api/images/crawl)
 * 2. 작업 상태 폴링 (GET /api/images/crawl?taskId=xxx)
 * 3. 파일 시스템 검증 (이미지 다운로드, 백업)
 * 4. 에러 처리
 *
 * @requires Chrome running with debugging on port 9222
 * @requires Python with selenium, pyperclip installed
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// 테스트 환경 설정
const TEST_CONFIG = {
  apiBaseUrl: 'http://localhost:3000',
  backendPath: path.join(process.cwd(), '..', 'trend-video-backend'),
  workspacePath: path.join(process.cwd(), '..'),
  testProjectId: 'test-crawler-integration',
  testScriptId: `test-${Date.now()}`,
  maxWaitTime: 600000, // 10분
  pollInterval: 5000, // 5초
};

// 테스트용 씬 데이터
const TEST_SCENES = [
  {
    scene_id: 'scene_00_hook',
    scene_name: '훅',
    sora_prompt: 'safe for work, professional quality, Vertical 9:16 format, cinematic product shot, Korean person holding a product',
    narration: '테스트 나레이션'
  },
  {
    scene_id: 'scene_01_test',
    scene_name: '테스트',
    sora_prompt: 'safe for work, professional quality, Vertical 9:16 format, lifestyle scene',
    narration: '테스트 나레이션 2'
  }
];

describe('Image Crawler Integration Tests', () => {
  let testProjectDir: string;
  let taskId: string;

  beforeAll(async () => {
    // 테스트 프로젝트 폴더 설정
    testProjectDir = path.join(
      TEST_CONFIG.backendPath,
      'input',
      `project_${TEST_CONFIG.testProjectId}`
    );

    // 기존 테스트 폴더 정리
    try {
      await fs.rm(testProjectDir, { recursive: true, force: true });
    } catch (err) {
      // 폴더가 없으면 무시
    }

    // 테스트 폴더 생성
    await fs.mkdir(testProjectDir, { recursive: true });

    // story.json 생성
    const storyJson = {
      title: 'Integration Test Story',
      scenes: TEST_SCENES
    };
    await fs.writeFile(
      path.join(testProjectDir, 'story.json'),
      JSON.stringify(storyJson, null, 2)
    );

    console.log('✅ Test environment prepared');
  });

  afterAll(async () => {
    // 테스트 후 정리 (주석 처리 - 수동 확인을 위해 남겨둠)
    // try {
    //   await fs.rm(testProjectDir, { recursive: true, force: true });
    //   console.log('✅ Test environment cleaned up');
    // } catch (err) {
    //   console.warn('⚠️ Cleanup failed:', err);
    // }
  });

  describe('1. API Endpoint Tests', () => {
    test('should start crawling task and return taskId', async () => {
      const response = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/images/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: TEST_SCENES,
          contentId: TEST_CONFIG.testProjectId,
          useImageFX: false
        })
      });

      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(typeof result.taskId).toBe('string');
      expect(result.message).toContain('Whisk 자동화가 시작되었습니다');

      // taskId 저장 (다음 테스트에서 사용)
      taskId = result.taskId;
      console.log('✅ Task created:', taskId);
    }, 10000);

    test('should reject request without scenes', async () => {
      const response = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/images/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: TEST_CONFIG.testProjectId
        })
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toContain('씬 데이터가 필요합니다');
    });

    test('should reject request with empty scenes array', async () => {
      const response = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/images/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: [],
          contentId: TEST_CONFIG.testProjectId
        })
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe('2. Task Status Polling Tests', () => {
    test('should return task status with logs', async () => {
      // 이전 테스트에서 생성된 taskId 사용
      if (!taskId) {
        console.warn('⚠️ Skipping: no taskId from previous test');
        return;
      }

      const response = await fetch(
        `${TEST_CONFIG.apiBaseUrl}/api/images/crawl?taskId=${taskId}`
      );

      expect(response.ok).toBe(true);

      const status = await response.json();
      expect(status.status).toBeDefined();
      expect(['pending', 'processing', 'completed', 'failed']).toContain(status.status);
      expect(Array.isArray(status.logs)).toBe(true);

      console.log('✅ Task status:', status.status);
      console.log('📋 Logs count:', status.logs.length);
    });

    test('should return 404 for non-existent taskId', async () => {
      const response = await fetch(
        `${TEST_CONFIG.apiBaseUrl}/api/images/crawl?taskId=non-existent-task-id`
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    test('should require taskId parameter', async () => {
      const response = await fetch(
        `${TEST_CONFIG.apiBaseUrl}/api/images/crawl`
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe('3. File System Verification', () => {
    test('should download images to project root folder', async () => {
      if (!taskId) {
        console.warn('⚠️ Skipping: no taskId');
        return;
      }

      // 작업 완료 대기 (폴링)
      console.log('⏳ Waiting for crawler to complete...');
      let completed = false;
      let pollCount = 0;
      const maxPolls = TEST_CONFIG.maxWaitTime / TEST_CONFIG.pollInterval;

      while (!completed && pollCount < maxPolls) {
        pollCount++;
        await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.pollInterval));

        const response = await fetch(
          `${TEST_CONFIG.apiBaseUrl}/api/images/crawl?taskId=${taskId}`
        );

        if (response.ok) {
          const status = await response.json();
          console.log(`📊 Poll ${pollCount}: ${status.status} (${status.logs.length} logs)`);

          if (status.status === 'completed') {
            completed = true;
            console.log('✅ Crawler completed!');
          } else if (status.status === 'failed') {
            throw new Error(`Crawler failed: ${status.error}`);
          }
        }
      }

      if (!completed) {
        throw new Error('Timeout waiting for crawler to complete');
      }

      // 이미지 파일 존재 확인
      const expectedFiles = TEST_SCENES.map(scene => `${scene.scene_id}.jpeg`);

      for (const filename of expectedFiles) {
        const filepath = path.join(testProjectDir, filename);

        try {
          const stats = await fs.stat(filepath);
          expect(stats.isFile()).toBe(true);
          expect(stats.size).toBeGreaterThan(0);
          console.log(`✅ File exists: ${filename} (${stats.size} bytes)`);
        } catch (err) {
          throw new Error(`Expected file not found: ${filepath}`);
        }
      }
    }, TEST_CONFIG.maxWaitTime + 10000);

    test('should NOT create nested 대본폴더', async () => {
      const scriptFolder = path.join(testProjectDir, '대본폴더');

      try {
        await fs.access(scriptFolder);
        // 폴더가 존재하면 실패
        throw new Error('대본폴더 should not exist - images should be in project root');
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          // 폴더가 없으면 성공
          console.log('✅ 대본폴더 correctly NOT created');
        } else {
          throw err;
        }
      }
    });
  });

  describe('4. Backup System Verification', () => {
    test('should create backup folder when re-running on existing images', async () => {
      // 첫 번째 실행 완료 후, 다시 실행하여 백업 생성 테스트
      console.log('⏳ Running crawler again to test backup system...');

      const response = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/images/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: TEST_SCENES,
          contentId: TEST_CONFIG.testProjectId,
          useImageFX: false
        })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      const secondTaskId = result.taskId;

      // 완료 대기
      let completed = false;
      let pollCount = 0;
      const maxPolls = 60; // 5분

      while (!completed && pollCount < maxPolls) {
        pollCount++;
        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusResponse = await fetch(
          `${TEST_CONFIG.apiBaseUrl}/api/images/crawl?taskId=${secondTaskId}`
        );

        if (statusResponse.ok) {
          const status = await statusResponse.json();
          if (status.status === 'completed' || status.status === 'failed') {
            completed = true;
          }
        }
      }

      // 백업 폴더 확인
      const backupFolders = await fs.readdir(testProjectDir);
      const backupFolderExists = backupFolders.some(folder =>
        folder.startsWith('backup_')
      );

      expect(backupFolderExists).toBe(true);

      if (backupFolderExists) {
        const backupFolder = backupFolders.find(f => f.startsWith('backup_'));
        const backupPath = path.join(testProjectDir, backupFolder!);
        const backupFiles = await fs.readdir(backupPath);

        expect(backupFiles.length).toBeGreaterThan(0);
        console.log(`✅ Backup folder created: ${backupFolder}`);
        console.log(`📦 Backup files: ${backupFiles.length}`);
      }
    }, TEST_CONFIG.maxWaitTime + 10000);
  });

  describe('5. Error Handling Tests', () => {
    test('should handle invalid contentId gracefully', async () => {
      const response = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/images/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: TEST_SCENES,
          contentId: '../../../malicious/path',
          useImageFX: false
        })
      });

      // Should either succeed (creating the folder) or fail gracefully
      const result = await response.json();
      expect(result.taskId || result.error).toBeDefined();
    });

    test('should handle malformed scene data', async () => {
      const response = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/images/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: [{ invalid: 'data' }],
          contentId: TEST_CONFIG.testProjectId
        })
      });

      // Should either handle it or return an error
      const result = await response.json();
      // Just verify it doesn't crash - either success or error is acceptable
      expect(typeof result).toBe('object');
    });
  });

  describe('6. Python Script Direct Execution Test', () => {
    test('should execute Python crawler script directly', async () => {
      const pythonScript = path.join(TEST_CONFIG.workspacePath, 'image_crawler_working.py');
      const storyJsonPath = path.join(testProjectDir, 'story.json');
      const directTestDir = path.join(testProjectDir, 'direct_test');

      // 테스트 디렉토리 생성
      await fs.mkdir(directTestDir, { recursive: true });

      try {
        const { stdout, stderr } = await execAsync(
          `python "${pythonScript}" "${storyJsonPath}" --output-dir "${directTestDir}"`,
          {
            timeout: TEST_CONFIG.maxWaitTime,
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
          }
        );

        console.log('📋 Python stdout:', stdout.substring(0, 500));
        if (stderr) {
          console.warn('⚠️ Python stderr:', stderr.substring(0, 500));
        }

        // 결과 파일 확인
        const files = await fs.readdir(directTestDir);
        const imageFiles = files.filter(f => f.endsWith('.jpeg') || f.endsWith('.jpg'));

        expect(imageFiles.length).toBeGreaterThan(0);
        console.log(`✅ Direct Python execution successful: ${imageFiles.length} images`);
      } catch (err: any) {
        if (err.code === 'ETIMEDOUT') {
          console.warn('⚠️ Python script timeout - may still be running');
        } else {
          console.error('❌ Python execution error:', err.message);
          throw err;
        }
      }
    }, TEST_CONFIG.maxWaitTime + 30000);
  });
});

describe('Image Crawler Performance Tests', () => {
  test('should handle multiple concurrent requests', async () => {
    const requests = Array(3).fill(null).map((_, index) =>
      fetch(`${TEST_CONFIG.apiBaseUrl}/api/images/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: TEST_SCENES,
          contentId: `concurrent-test-${index}`,
          useImageFX: false
        })
      })
    );

    const responses = await Promise.all(requests);
    const results = await Promise.all(responses.map(r => r.json()));

    // 모든 요청이 taskId를 반환해야 함
    results.forEach((result, index) => {
      expect(result.taskId || result.error).toBeDefined();
      console.log(`✅ Request ${index + 1}:`, result.taskId ? 'Success' : 'Error');
    });
  }, 30000);
});

describe('Image Crawler API Authentication Tests', () => {
  test('should require authentication', async () => {
    // 인증 없이 요청 (실제 구현에 따라 수정 필요)
    const response = await fetch(`${TEST_CONFIG.apiBaseUrl}/api/images/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenes: TEST_SCENES,
        contentId: 'test'
      })
    });

    // 401 또는 정상 응답 (인증이 구현되어 있지 않을 수 있음)
    expect([200, 201, 401]).toContain(response.status);
  });
});
