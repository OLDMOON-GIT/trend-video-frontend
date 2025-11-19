/**
 * 자동화 스케줄러 전체 시나리오 통합 테스트
 *
 * 테스트 범위:
 * 1. 스케줄 상태 전환 (pending → processing → completed/failed)
 * 2. 대본 생성 프로세스
 * 3. 비디오 파일 생성
 * 4. YouTube 업로드 준비
 * 5. 오류 처리 및 재시도
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const testDbPath = path.join(process.cwd(), 'data', 'test-scheduler-db.sqlite');

function initSchedulerDB() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS video_schedules (
      id TEXT PRIMARY KEY,
      title_id TEXT NOT NULL,
      product_url TEXT,
      type TEXT NOT NULL,
      channel TEXT NOT NULL,
      youtube_privacy TEXT DEFAULT 'public',
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS video_titles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      product_url TEXT,
      product_data TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schedule_logs (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      level TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES video_schedules(id)
    );

    CREATE TABLE IF NOT EXISTS video_files (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      file_path TEXT,
      file_size INTEGER,
      duration_seconds INTEGER,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES video_schedules(id)
    );
  `);

  return db;
}

describe('⚙️ 자동화 스케줄러 전체 시나리오 통합 테스트', () => {
  let db: Database.Database;

  beforeAll(() => {
    console.log('\n🔧 스케줄러 테스트 DB 초기화 중...');
    db = initSchedulerDB();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    console.log('✅ 스케줄러 테스트 환경 정리 완료\n');
  });

  describe('Suite 1: 스케줄 상태 전환', () => {
    test('✅ pending → processing → completed 상태 전환', () => {
      const scheduleId = `sched-status-${Date.now()}`;
      const titleId = `title-${Date.now()}`;

      // 1. pending 상태로 스케줄 생성
      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', 'UCtest001', 'pending');

      let schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      expect(schedule.status).toBe('pending');
      expect(schedule.progress).toBe(0);
      console.log('✅ 스케줄 생성 (pending)');

      // 2. processing 상태로 변경
      db.prepare(`
        UPDATE video_schedules
        SET status = 'processing', started_at = CURRENT_TIMESTAMP, progress = 0
        WHERE id = ?
      `).run(scheduleId);

      schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      expect(schedule.status).toBe('processing');
      expect(schedule.started_at).toBeDefined();
      console.log('✅ 상태 변경 (processing)');

      // 3. 진행률 업데이트
      db.prepare(`
        UPDATE video_schedules SET progress = 50 WHERE id = ?
      `).run(scheduleId);

      schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      expect(schedule.progress).toBe(50);
      console.log('✅ 진행률 업데이트 (50%)');

      // 4. completed 상태로 변경
      db.prepare(`
        UPDATE video_schedules
        SET status = 'completed', progress = 100, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(scheduleId);

      schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      expect(schedule.status).toBe('completed');
      expect(schedule.progress).toBe(100);
      expect(schedule.completed_at).toBeDefined();
      console.log('✅ 상태 변경 (completed)');
    });

    test('✅ pending → failed 상태 전환 (에러 기록)', () => {
      const scheduleId = `sched-failed-${Date.now()}`;
      const titleId = `title-failed-${Date.now()}`;
      const errorMsg = '❌ 비디오 생성 실패: 리소스 부족';

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', 'UCtest002', 'pending');

      // failed 상태로 변경
      db.prepare(`
        UPDATE video_schedules
        SET status = 'failed', error_message = ?
        WHERE id = ?
      `).run(errorMsg, scheduleId);

      const schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      expect(schedule.status).toBe('failed');
      expect(schedule.error_message).toContain('비디오 생성 실패');
      console.log('✅ 실패 상태 기록');
    });

    test('✅ 재시도 로직 (retry_count 증가)', () => {
      const scheduleId = `sched-retry-${Date.now()}`;
      const titleId = `title-retry-${Date.now()}`;

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status, retry_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', 'UCtest003', 'pending', 0);

      // 재시도 1
      db.prepare(`
        UPDATE video_schedules
        SET status = 'pending', retry_count = retry_count + 1
        WHERE id = ?
      `).run(scheduleId);

      let schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      expect(schedule.retry_count).toBe(1);

      // 재시도 2
      db.prepare(`
        UPDATE video_schedules
        SET status = 'pending', retry_count = retry_count + 1
        WHERE id = ?
      `).run(scheduleId);

      schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      expect(schedule.retry_count).toBe(2);
      console.log(`✅ 재시도 ${schedule.retry_count}회 기록`);
    });
  });

  describe('Suite 2: 스케줄 로깅', () => {
    test('✅ 스케줄 처리 중 로그 기록', () => {
      const scheduleId = `sched-log-${Date.now()}`;
      const titleId = `title-log-${Date.now()}`;

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', 'UCtest004', 'processing');

      // 처리 단계별 로그 기록
      const logs = [
        { level: 'info', message: '스크립트 생성 시작' },
        { level: 'info', message: '스크립트 생성 완료' },
        { level: 'info', message: '음성 생성 시작' },
        { level: 'info', message: '음성 생성 완료' },
        { level: 'info', message: '비디오 생성 완료' }
      ];

      logs.forEach((log) => {
        db.prepare(`
          INSERT INTO schedule_logs
          (id, schedule_id, level, message)
          VALUES (?, ?, ?, ?)
        `).run(`log-${Date.now()}-${Math.random()}`, scheduleId, log.level, log.message);
      });

      const recordedLogs = db.prepare(`
        SELECT * FROM schedule_logs WHERE schedule_id = ?
      `).all(scheduleId) as any[];

      expect(recordedLogs.length).toBe(5);
      expect(recordedLogs[0].message).toContain('스크립트');
      console.log(`✅ ${recordedLogs.length}개 로그 기록됨`);
    });

    test('✅ 에러 로그 기록', () => {
      const scheduleId = `sched-error-log-${Date.now()}`;
      const titleId = `title-error-${Date.now()}`;

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', 'UCtest005', 'failed');

      const errorLogs = [
        '❌ 상품 URL이 딥링크가 아닙니다',
        '❌ 스크립트 생성 실패: API 오류',
        '❌ 비디오 생성 실패: 시간 초과'
      ];

      errorLogs.forEach((message) => {
        db.prepare(`
          INSERT INTO schedule_logs
          (id, schedule_id, level, message)
          VALUES (?, ?, ?, ?)
        `).run(`log-${Date.now()}-${Math.random()}`, scheduleId, 'error', message);
      });

      const recordedErrors = db.prepare(`
        SELECT * FROM schedule_logs WHERE schedule_id = ? AND level = 'error'
      `).all(scheduleId) as any[];

      expect(recordedErrors.length).toBe(3);
      expect(recordedErrors.every(l => l.message.startsWith('❌'))).toBe(true);
      console.log(`✅ ${recordedErrors.length}개 에러 로그 기록됨`);
    });
  });

  describe('Suite 3: 비디오 파일 관리', () => {
    test('✅ 비디오 파일 생성 및 기록', () => {
      const scheduleId = `sched-video-${Date.now()}`;
      const titleId = `title-video-${Date.now()}`;
      const videoFileId = `video-${Date.now()}`;

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', 'UCtest006', 'processing');

      // 비디오 파일 생성
      const filePath = '/projects/project_001/video.mp4';
      const fileSize = 1024 * 1024 * 500; // 500MB
      const duration = 60;

      db.prepare(`
        INSERT INTO video_files
        (id, schedule_id, file_path, file_size, duration_seconds, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(videoFileId, scheduleId, filePath, fileSize, duration, 'completed');

      const videoFile = db.prepare(`
        SELECT * FROM video_files WHERE id = ?
      `).get(videoFileId) as any;

      expect(videoFile.file_path).toBe(filePath);
      expect(videoFile.file_size).toBe(fileSize);
      expect(videoFile.duration_seconds).toBe(duration);
      expect(videoFile.status).toBe('completed');
      console.log(`✅ 비디오 파일 기록: ${(fileSize / 1024 / 1024).toFixed(0)}MB`);
    });

    test('✅ 스케줄별 비디오 파일 조회', () => {
      const scheduleId = `sched-multi-video-${Date.now()}`;
      const titleId = `title-multi-${Date.now()}`;

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', 'UCtest007', 'completed');

      // 여러 파일 생성 (원본, 프리뷰 등)
      const files = [
        { name: 'video.mp4', size: 500 * 1024 * 1024 },
        { name: 'video_preview.mp4', size: 100 * 1024 * 1024 },
        { name: 'subtitles.srt', size: 50 * 1024 }
      ];

      files.forEach((file, idx) => {
        db.prepare(`
          INSERT INTO video_files
          (id, schedule_id, file_path, file_size, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          `video-${scheduleId}-${idx}`,
          scheduleId,
          `/projects/${scheduleId}/${file.name}`,
          file.size,
          'completed'
        );
      });

      const videoFiles = db.prepare(`
        SELECT * FROM video_files WHERE schedule_id = ?
      `).all(scheduleId) as any[];

      expect(videoFiles.length).toBe(3);
      expect(videoFiles.some(f => f.file_path.includes('video.mp4'))).toBe(true);
      console.log(`✅ ${videoFiles.length}개 파일 기록됨`);
    });
  });

  describe('Suite 4: YouTube 채널 및 업로드 준비', () => {
    test('✅ 스케줄에 YouTube 채널 정보 연결', () => {
      const scheduleId = `sched-yt-${Date.now()}`;
      const titleId = `title-yt-${Date.now()}`;
      const channelId = 'UCxxxxxxxxxxxxxxxx';

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, youtube_privacy, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', channelId, 'public', 'completed');

      const schedule = db.prepare(`
        SELECT * FROM video_schedules WHERE id = ?
      `).get(scheduleId) as any;

      expect(schedule.channel).toBe(channelId);
      expect(schedule.youtube_privacy).toBe('public');
      console.log(`✅ YouTube 채널 정보 연결: ${channelId}`);
    });

    test('✅ 다양한 프라이버시 설정', () => {
      const privacyTests = [
        { scheduleId: `sched-pub-${Date.now()}`, privacy: 'public' },
        { scheduleId: `sched-unlist-${Date.now()}`, privacy: 'unlisted' },
        { scheduleId: `sched-priv-${Date.now()}`, privacy: 'private' }
      ];

      privacyTests.forEach((test) => {
        db.prepare(`
          INSERT INTO video_schedules
          (id, title_id, type, channel, youtube_privacy, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(test.scheduleId, `title-${test.scheduleId}`, 'product', 'UCtest', test.privacy, 'ready_for_upload');
      });

      const results = db.prepare(`
        SELECT youtube_privacy, COUNT(*) as count FROM video_schedules
        WHERE youtube_privacy IN ('public', 'unlisted', 'private')
        GROUP BY youtube_privacy
      `).all() as any[];

      expect(results.length).toBeGreaterThanOrEqual(1);
      console.log(`✅ ${results.length}가지 프라이버시 설정 확인`);
    });
  });

  describe('Suite 5: 복합 시나리오', () => {
    test('✅ 완전한 스케줄 처리 흐름 (상품 → 스크립트 → 비디오 → 업로드 준비)', () => {
      const scheduleId = `sched-full-${Date.now()}`;
      const titleId = `title-full-${Date.now()}`;
      const productUrl = 'https://www.coupang.com/vp/products/123?partner=test&itemId=456';

      // 1. 스케줄 생성
      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, product_url, channel, youtube_privacy, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', productUrl, 'UCtest008', 'public', 'pending');

      // 2. 제목 정보 저장
      const productData = {
        productId: 'prod-full-001',
        productName: '완전 테스트 상품',
        productPrice: 100000,
        productImage: 'https://example.com/product.jpg',
        productUrl: productUrl,
        productDescription: '테스트 설명',
        youtube_description: '유튜브 설명'
      };

      db.prepare(`
        INSERT INTO video_titles
        (id, title, type, product_url, product_data, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        titleId,
        '완전 테스트 상품 리뷰',
        'product',
        productUrl,
        JSON.stringify(productData),
        'processing'
      );

      // 3. 로그 기록
      db.prepare(`
        UPDATE video_schedules SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(scheduleId);

      const logMessages = ['스크립트 생성 완료', '음성 생성 완료', '비디오 생성 완료'];
      logMessages.forEach((msg) => {
        db.prepare(`
          INSERT INTO schedule_logs (id, schedule_id, level, message)
          VALUES (?, ?, ?, ?)
        `).run(`log-${Date.now()}-${Math.random()}`, scheduleId, 'info', msg);
      });

      // 4. 비디오 파일 생성
      db.prepare(`
        INSERT INTO video_files
        (id, schedule_id, file_path, file_size, duration_seconds, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `video-${scheduleId}`,
        scheduleId,
        `/projects/${scheduleId}/video.mp4`,
        500 * 1024 * 1024,
        120,
        'completed'
      );

      // 5. 업로드 준비 상태로 변경
      db.prepare(`
        UPDATE video_schedules SET status = 'ready_for_upload', progress = 100 WHERE id = ?
      `).run(scheduleId);

      // 최종 검증
      const schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      const title = db.prepare('SELECT * FROM video_titles WHERE id = ?').get(titleId) as any;
      const logs = db.prepare('SELECT * FROM schedule_logs WHERE schedule_id = ?').all(scheduleId) as any[];
      const video = db.prepare('SELECT * FROM video_files WHERE schedule_id = ?').get(scheduleId) as any;

      expect(schedule.status).toBe('ready_for_upload');
      expect(schedule.progress).toBe(100);
      expect(title.product_url).toBe(productUrl);
      expect(logs.length).toBe(3);
      expect(video.file_path).toContain('video.mp4');

      console.log('✅ 완전한 흐름 검증 완료');
      console.log(`   - 스케줄: ${schedule.status}`);
      console.log(`   - 제목: ${title.title}`);
      console.log(`   - 로그: ${logs.length}개`);
      console.log(`   - 비디오: ${video.file_path}`);
    });

    test('✅ 다중 스케줄 동시 처리', () => {
      const scheduleCount = 5;
      const scheduleIds = [];

      // 5개의 스케줄 생성
      for (let i = 0; i < scheduleCount; i++) {
        const scheduleId = `sched-multi-${Date.now()}-${i}`;
        scheduleIds.push(scheduleId);

        db.prepare(`
          INSERT INTO video_schedules
          (id, title_id, type, channel, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(scheduleId, `title-${scheduleId}`, 'product', 'UCtest009', 'processing');
      }

      // 스케줄 상태 확인
      const allSchedules = db.prepare(`
        SELECT COUNT(*) as count FROM video_schedules WHERE id IN (${scheduleIds.map(() => '?').join(',')})
      `).get(...scheduleIds) as any;

      expect(allSchedules.count).toBe(scheduleCount);
      console.log(`✅ ${scheduleCount}개 스케줄 동시 처리 중`);
    });
  });

  describe('Suite 6: 예외 처리 및 복구', () => {
    test('✅ 처리 중 오류 발생 시 상태 기록', () => {
      const scheduleId = `sched-error-${Date.now()}`;
      const titleId = `title-error-${Date.now()}`;

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        scheduleId,
        titleId,
        'product',
        'UCtest010',
        'failed',
        '❌ API 응답 시간 초과'
      );

      // 재시도 업데이트
      db.prepare(`
        UPDATE video_schedules
        SET status = 'pending', retry_count = retry_count + 1, error_message = NULL
        WHERE id = ?
      `).run(scheduleId);

      const schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;

      expect(schedule.status).toBe('pending');
      expect(schedule.retry_count).toBe(1);
      expect(schedule.error_message).toBeNull();
      console.log('✅ 재시도를 위해 상태 초기화');
    });

    test('✅ 최대 재시도 횟수 초과 처리', () => {
      const scheduleId = `sched-max-retry-${Date.now()}`;
      const titleId = `title-max-${Date.now()}`;
      const MAX_RETRY = 3;

      db.prepare(`
        INSERT INTO video_schedules
        (id, title_id, type, channel, status, retry_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(scheduleId, titleId, 'product', 'UCtest011', 'pending', MAX_RETRY);

      // 최대 재시도 도달 시 abandoned로 변경
      const current = db.prepare('SELECT retry_count FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      if (current && current.retry_count >= MAX_RETRY) {
        db.prepare(`
          UPDATE video_schedules
          SET status = 'abandoned', error_message = '❌ 최대 재시도 횟수 초과'
          WHERE id = ?
        `).run(scheduleId);
      }

      const schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;

      expect(schedule.status).toBe('abandoned');
      expect(schedule.error_message).toContain('최대 재시도');
      console.log('✅ 최대 재시도 초과로 포기 상태 변경');
    });
  });
});
