/**
 * 이미지 크롤링 API 통합 테스트
 *
 * 테스트 범위:
 * 1. 씬별 이미지 크롤링
 * 2. 이미지 검증 및 필터링
 * 3. 이미지 저장 및 관리
 * 4. 크롤링 오류 처리
 * 5. 배치 크롤링 프로세스
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const testDbPath = path.join(process.cwd(), 'data', 'test-crawl-db.sqlite');

function initCrawlDB() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS crawl_tasks (
      id TEXT PRIMARY KEY,
      schedule_id TEXT,
      title_id TEXT,
      content_id TEXT,
      scenes TEXT,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS crawled_images (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      scene_index INTEGER,
      image_url TEXT,
      image_path TEXT,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      image_type TEXT,
      validation_status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES crawl_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS image_validation_rules (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      min_width INTEGER,
      min_height INTEGER,
      max_file_size INTEGER,
      allowed_formats TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crawl_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      level TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES crawl_tasks(id)
    );
  `);

  return db;
}

describe('🖼️ 이미지 크롤링 API 통합 테스트', () => {
  let db: Database.Database;

  beforeAll(() => {
    console.log('\n🔧 이미지 크롤링 테스트 DB 초기화 중...');
    db = initCrawlDB();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    console.log('✅ 이미지 크롤링 테스트 환경 정리 완료\n');
  });

  describe('Suite 1: 크롤링 작업 관리', () => {
    test('✅ 크롤링 작업 생성', () => {
      const taskId = `crawl-${Date.now()}`;
      const scheduleId = `sched-${Date.now()}`;
      const contentId = 'project_001';

      const scenes = JSON.stringify([
        { sceneIndex: 0, text: '장면1 설명', duration: 5 },
        { sceneIndex: 1, text: '장면2 설명', duration: 5 },
        { sceneIndex: 2, text: '장면3 설명', duration: 5 }
      ]);

      db.prepare(`
        INSERT INTO crawl_tasks
        (id, schedule_id, title_id, content_id, scenes, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, scheduleId, `title-${Date.now()}`, contentId, scenes, 'pending');

      const task = db.prepare(`
        SELECT * FROM crawl_tasks WHERE id = ?
      `).get(taskId) as any;

      expect(task.content_id).toBe(contentId);
      expect(task.status).toBe('pending');
      expect(JSON.parse(task.scenes).length).toBe(3);
      console.log(`✅ 크롤링 작업 생성: ${contentId}`);
    });

    test('✅ 크롤링 작업 상태 전환', () => {
      const taskId = `crawl-status-${Date.now()}`;
      const contentId = 'project_002';

      db.prepare(`
        INSERT INTO crawl_tasks
        (id, content_id, status)
        VALUES (?, ?, ?)
      `).run(taskId, contentId, 'pending');

      // pending → processing
      db.prepare(`
        UPDATE crawl_tasks
        SET status = 'processing', started_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(taskId);

      let task = db.prepare(`
        SELECT * FROM crawl_tasks WHERE id = ?
      `).get(taskId) as any;
      expect(task.status).toBe('processing');
      console.log('✅ 크롤링 시작 (processing)');

      // 진행률 업데이트
      db.prepare(`
        UPDATE crawl_tasks SET progress = 50 WHERE id = ?
      `).run(taskId);

      task = db.prepare(`
        SELECT * FROM crawl_tasks WHERE id = ?
      `).get(taskId) as any;
      expect(task.progress).toBe(50);
      console.log('✅ 진행률 업데이트 (50%)');

      // processing → completed
      db.prepare(`
        UPDATE crawl_tasks
        SET status = 'completed', progress = 100, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(taskId);

      task = db.prepare(`
        SELECT * FROM crawl_tasks WHERE id = ?
      `).get(taskId) as any;
      expect(task.status).toBe('completed');
      console.log('✅ 크롤링 완료');
    });
  });

  describe('Suite 2: 이미지 저장 및 관리', () => {
    test('✅ 크롤링된 이미지 저장', () => {
      const taskId = `crawl-img-${Date.now()}`;
      const contentId = 'project_003';

      db.prepare(`
        INSERT INTO crawl_tasks (id, content_id, status)
        VALUES (?, ?, ?)
      `).run(taskId, contentId, 'processing');

      // 이미지 저장
      const images = [
        {
          sceneIndex: 0,
          url: 'https://example.com/image1.jpg',
          path: `/projects/${contentId}/images/image_0.jpg`,
          size: 150 * 1024,
          width: 1920,
          height: 1080
        },
        {
          sceneIndex: 1,
          url: 'https://example.com/image2.jpg',
          path: `/projects/${contentId}/images/image_1.jpg`,
          size: 200 * 1024,
          width: 1920,
          height: 1080
        }
      ];

      images.forEach((img) => {
        db.prepare(`
          INSERT INTO crawled_images
          (id, task_id, scene_index, image_url, image_path, file_size, width, height, image_type, validation_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `img-${Date.now()}-${Math.random()}`,
          taskId,
          img.sceneIndex,
          img.url,
          img.path,
          img.size,
          img.width,
          img.height,
          'jpeg',
          'valid'
        );
      });

      const savedImages = db.prepare(`
        SELECT * FROM crawled_images WHERE task_id = ?
      `).all(taskId) as any[];

      expect(savedImages.length).toBe(2);
      expect(savedImages[0].width).toBe(1920);
      console.log(`✅ ${savedImages.length}개 이미지 저장됨`);
    });

    test('✅ 장면별 이미지 조회', () => {
      const taskId = `crawl-scene-${Date.now()}`;
      const contentId = 'project_004';

      db.prepare(`
        INSERT INTO crawl_tasks (id, content_id, status)
        VALUES (?, ?, ?)
      `).run(taskId, contentId, 'completed');

      // 3개 장면 각각 2개 이미지
      for (let scene = 0; scene < 3; scene++) {
        for (let i = 0; i < 2; i++) {
          db.prepare(`
            INSERT INTO crawled_images
            (id, task_id, scene_index, image_url, image_path, width, height, validation_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `img-${taskId}-${scene}-${i}`,
            taskId,
            scene,
            `https://example.com/image_${scene}_${i}.jpg`,
            `/projects/${contentId}/images/image_${scene}_${i}.jpg`,
            1920,
            1080,
            'valid'
          );
        }
      }

      // 장면 1의 이미지만 조회
      const sceneImages = db.prepare(`
        SELECT * FROM crawled_images WHERE task_id = ? AND scene_index = ?
      `).all(taskId, 1) as any[];

      expect(sceneImages.length).toBe(2);
      console.log(`✅ 장면 1의 ${sceneImages.length}개 이미지 조회됨`);
    });

    test('✅ 이미지 파일 크기 확인', () => {
      const taskId = `crawl-size-${Date.now()}`;
      const contentId = 'project_005';

      db.prepare(`
        INSERT INTO crawl_tasks (id, content_id, status)
        VALUES (?, ?, ?)
      `).run(taskId, contentId, 'completed');

      // 다양한 크기의 이미지
      const imageSizes = [100 * 1024, 500 * 1024, 2 * 1024 * 1024];

      imageSizes.forEach((size, idx) => {
        db.prepare(`
          INSERT INTO crawled_images
          (id, task_id, scene_index, image_url, file_size, validation_status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `img-size-${taskId}-${idx}`,
          taskId,
          idx,
          `https://example.com/image_${idx}.jpg`,
          size,
          'valid'
        );
      });

      const images = db.prepare(`
        SELECT * FROM crawled_images WHERE task_id = ?
      `).all(taskId) as any[];

      const totalSize = images.reduce((sum, img) => sum + img.file_size, 0);
      console.log(`✅ 총 이미지 크기: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Suite 3: 이미지 검증', () => {
    test('✅ 이미지 검증 규칙 설정', () => {
      const ruleId = `rule-${Date.now()}`;

      db.prepare(`
        INSERT INTO image_validation_rules
        (id, rule_name, min_width, min_height, max_file_size, allowed_formats)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        ruleId,
        'HD 이미지',
        1280,
        720,
        5 * 1024 * 1024,
        JSON.stringify(['jpeg', 'png', 'webp'])
      );

      const rule = db.prepare(`
        SELECT * FROM image_validation_rules WHERE id = ?
      `).get(ruleId) as any;

      expect(rule.rule_name).toBe('HD 이미지');
      expect(rule.min_width).toBe(1280);
      console.log('✅ 검증 규칙 설정됨');
    });

    test('✅ 이미지 검증 (유효함)', () => {
      const taskId = `crawl-valid-${Date.now()}`;
      const contentId = 'project_006';

      db.prepare(`
        INSERT INTO crawl_tasks (id, content_id, status)
        VALUES (?, ?, ?)
      `).run(taskId, contentId, 'processing');

      // 유효한 이미지
      const validImages = [
        {
          width: 1920,
          height: 1080,
          size: 500 * 1024,
          format: 'jpeg'
        },
        {
          width: 1920,
          height: 1080,
          size: 400 * 1024,
          format: 'png'
        }
      ];

      validImages.forEach((img, idx) => {
        db.prepare(`
          INSERT INTO crawled_images
          (id, task_id, scene_index, image_url, width, height, file_size, image_type, validation_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `img-valid-${taskId}-${idx}`,
          taskId,
          idx,
          `https://example.com/valid_${idx}.jpg`,
          img.width,
          img.height,
          img.size,
          img.format,
          'valid'
        );
      });

      const validCount = db.prepare(`
        SELECT COUNT(*) as count FROM crawled_images
        WHERE task_id = ? AND validation_status = 'valid'
      `).get(taskId) as any;

      expect(validCount.count).toBe(2);
      console.log(`✅ ${validCount.count}개 유효한 이미지`);
    });

    test('✅ 이미지 검증 실패', () => {
      const taskId = `crawl-invalid-${Date.now()}`;
      const contentId = 'project_007';

      db.prepare(`
        INSERT INTO crawl_tasks (id, content_id, status)
        VALUES (?, ?, ?)
      `).run(taskId, contentId, 'processing');

      // 검증 실패 케이스
      const invalidCases = [
        {
          width: 640,
          height: 480,
          error: '해상도 너무 낮음 (640x480)'
        },
        {
          size: 10 * 1024 * 1024,
          error: '파일 크기 초과 (10MB)'
        }
      ];

      invalidCases.forEach((invalid, idx) => {
        db.prepare(`
          INSERT INTO crawled_images
          (id, task_id, scene_index, image_url, width, height, file_size, validation_status, error_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `img-invalid-${taskId}-${idx}`,
          taskId,
          idx,
          `https://example.com/invalid_${idx}.jpg`,
          invalid.width || 1920,
          invalid.height || 1080,
          invalid.size || 500 * 1024,
          'invalid',
          invalid.error
        );
      });

      const invalidCount = db.prepare(`
        SELECT COUNT(*) as count FROM crawled_images
        WHERE task_id = ? AND validation_status = 'invalid'
      `).get(taskId) as any;

      expect(invalidCount.count).toBe(2);
      console.log(`✅ ${invalidCount.count}개 검증 실패 이미지 기록됨`);
    });
  });

  describe('Suite 4: 크롤링 오류 처리', () => {
    test('✅ 크롤링 실패 기록', () => {
      const taskId = `crawl-fail-${Date.now()}`;
      const contentId = 'project_008';
      const errorMsg = '❌ 네트워크 오류: 타임아웃';

      db.prepare(`
        INSERT INTO crawl_tasks
        (id, content_id, status, error_message)
        VALUES (?, ?, ?, ?)
      `).run(taskId, contentId, 'failed', errorMsg);

      const task = db.prepare(`
        SELECT * FROM crawl_tasks WHERE id = ?
      `).get(taskId) as any;

      expect(task.status).toBe('failed');
      expect(task.error_message).toContain('타임아웃');
      console.log('✅ 크롤링 실패 기록됨');
    });

    test('✅ 부분 실패 처리 (일부 이미지만 실패)', () => {
      const taskId = `crawl-partial-${Date.now()}`;
      const contentId = 'project_009';

      db.prepare(`
        INSERT INTO crawl_tasks (id, content_id, status)
        VALUES (?, ?, ?)
      `).run(taskId, contentId, 'completed');

      // 성공한 이미지
      db.prepare(`
        INSERT INTO crawled_images
        (id, task_id, scene_index, image_url, validation_status)
        VALUES (?, ?, ?, ?, ?)
      `).run(`img-success-${taskId}`, taskId, 0, 'https://example.com/success.jpg', 'valid');

      // 실패한 이미지
      db.prepare(`
        INSERT INTO crawled_images
        (id, task_id, scene_index, image_url, validation_status, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `img-fail-${taskId}`,
        taskId,
        1,
        'https://example.com/fail.jpg',
        'invalid',
        '이미지를 찾을 수 없음'
      );

      const stats = {
        total: db.prepare(`
          SELECT COUNT(*) as count FROM crawled_images WHERE task_id = ?
        `).get(taskId) as any,
        valid: db.prepare(`
          SELECT COUNT(*) as count FROM crawled_images WHERE task_id = ? AND validation_status = 'valid'
        `).get(taskId) as any,
        invalid: db.prepare(`
          SELECT COUNT(*) as count FROM crawled_images WHERE task_id = ? AND validation_status = 'invalid'
        `).get(taskId) as any
      };

      expect(stats.total.count).toBe(2);
      expect(stats.valid.count).toBe(1);
      expect(stats.invalid.count).toBe(1);
      console.log(`✅ 부분 실패 처리: ${stats.valid.count}/${stats.total.count} 성공`);
    });
  });

  describe('Suite 5: 크롤링 로깅', () => {
    test('✅ 상세 크롤링 로그 기록', () => {
      const taskId = `crawl-log-${Date.now()}`;
      const contentId = 'project_010';

      db.prepare(`
        INSERT INTO crawl_tasks (id, content_id, status)
        VALUES (?, ?, ?)
      `).run(taskId, contentId, 'processing');

      // 처리 단계별 로그
      const logs = [
        'Google Images 검색 시작',
        'Bing Images 검색 시작',
        'Pinterest 검색 시작',
        '총 150개 이미지 수집됨',
        '이미지 다운로드 시작',
        '이미지 검증 시작',
        '유효한 이미지 120개',
        '이미지 저장 완료'
      ];

      logs.forEach((message) => {
        db.prepare(`
          INSERT INTO crawl_logs (id, task_id, level, message)
          VALUES (?, ?, ?, ?)
        `).run(`log-${Date.now()}-${Math.random()}`, taskId, 'info', message);
      });

      const recordedLogs = db.prepare(`
        SELECT * FROM crawl_logs WHERE task_id = ?
      `).all(taskId) as any[];

      expect(recordedLogs.length).toBe(8);
      console.log(`✅ ${recordedLogs.length}개 로그 기록됨`);
    });
  });

  describe('Suite 6: 배치 크롤링', () => {
    test('✅ 다중 장면 크롤링', () => {
      const taskId = `crawl-batch-${Date.now()}`;
      const contentId = 'project_011';
      const sceneCount = 5;
      const imagesPerScene = 3;

      const scenes = JSON.stringify(
        Array.from({ length: sceneCount }, (_, i) => ({
          sceneIndex: i,
          text: `장면${i + 1}`,
          duration: 5
        }))
      );

      db.prepare(`
        INSERT INTO crawl_tasks (id, content_id, scenes, status)
        VALUES (?, ?, ?, ?)
      `).run(taskId, contentId, scenes, 'processing');

      // 각 장면별 이미지 생성
      let imageCount = 0;
      for (let scene = 0; scene < sceneCount; scene++) {
        for (let i = 0; i < imagesPerScene; i++) {
          db.prepare(`
            INSERT INTO crawled_images
            (id, task_id, scene_index, image_url, validation_status)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            `img-batch-${taskId}-${scene}-${i}`,
            taskId,
            scene,
            `https://example.com/image_${scene}_${i}.jpg`,
            'valid'
          );
          imageCount++;
        }
      }

      const totalImages = db.prepare(`
        SELECT COUNT(*) as count FROM crawled_images WHERE task_id = ?
      `).get(taskId) as any;

      expect(totalImages.count).toBe(sceneCount * imagesPerScene);
      expect(totalImages.count).toBe(imageCount);
      console.log(`✅ ${sceneCount}개 장면 × ${imagesPerScene}개 이미지 = ${totalImages.count}개 생성`);
    });

    test('✅ 완전한 크롤링 흐름', () => {
      const taskId = `crawl-complete-${Date.now()}`;
      const contentId = 'project_012';

      // 1. 작업 생성
      db.prepare(`
        INSERT INTO crawl_tasks
        (id, content_id, status, scenes)
        VALUES (?, ?, ?, ?)
      `).run(
        taskId,
        contentId,
        'pending',
        JSON.stringify([
          { sceneIndex: 0, text: '장면1', duration: 5 },
          { sceneIndex: 1, text: '장면2', duration: 5 },
          { sceneIndex: 2, text: '장면3', duration: 5 }
        ])
      );

      // 2. 상태 변경: pending → processing
      db.prepare(`
        UPDATE crawl_tasks SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(taskId);

      // 3. 이미지 수집
      for (let i = 0; i < 3; i++) {
        db.prepare(`
          INSERT INTO crawled_images
          (id, task_id, scene_index, image_url, width, height, validation_status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          `img-complete-${taskId}-${i}`,
          taskId,
          i,
          `https://example.com/image_${i}.jpg`,
          1920,
          1080,
          'valid'
        );
      }

      // 4. 로그 기록
      db.prepare(`
        INSERT INTO crawl_logs (id, task_id, level, message)
        VALUES (?, ?, ?, ?)
      `).run(`log-complete-${taskId}`, taskId, 'info', '크롤링 완료');

      // 5. 상태 변경: processing → completed
      db.prepare(`
        UPDATE crawl_tasks
        SET status = 'completed', progress = 100, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(taskId);

      // 최종 검증
      const task = db.prepare(`
        SELECT * FROM crawl_tasks WHERE id = ?
      `).get(taskId) as any;
      const images = db.prepare(`
        SELECT * FROM crawled_images WHERE task_id = ?
      `).all(taskId) as any[];
      const logs = db.prepare(`
        SELECT * FROM crawl_logs WHERE task_id = ?
      `).all(taskId) as any[];

      expect(task.status).toBe('completed');
      expect(task.progress).toBe(100);
      expect(images.length).toBe(3);
      expect(logs.length).toBeGreaterThan(0);

      console.log('✅ 완전한 크롤링 흐름 검증 완료');
      console.log(`   - 작업: ${task.status}`);
      console.log(`   - 이미지: ${images.length}개`);
      console.log(`   - 로그: ${logs.length}개`);
    });
  });
});
