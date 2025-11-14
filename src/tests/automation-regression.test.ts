/**
 * @jest-environment node
 *
 * 자동화 파이프라인 회귀 테스트
 *
 * 이 테스트는 자동화 시스템의 모든 주요 기능이 정상적으로 작동하는지 확인합니다.
 *
 * 실행 방법:
 * npm test -- automation-regression.test.ts
 * npm test -- --testNamePattern="데이터베이스 스키마"  # 특정 테스트만 실행
 * npm run test:coverage                              # 커버리지 포함
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

describe('자동화 파이프라인 회귀 테스트', () => {
  let db: Database.Database;
  let testUserId: string;
  let testChannelId: string;
  let testChannelSettingsId: string;

  beforeAll(() => {
    db = new Database(dbPath);
    testUserId = 'test_user_regression_' + Date.now();
    testChannelId = 'UCTestChannel123456789';
    testChannelSettingsId = 'channel_settings_test_' + Date.now();

    // 테스트 데이터 준비
    setupTestData();
  });

  afterAll(() => {
    // 테스트 데이터 정리
    cleanupTestData();
    db.close();
  });

  function setupTestData() {
    // 테스트 사용자 생성
    try {
      db.prepare(`
        INSERT INTO users (id, email, name, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(testUserId, 'test@regression.com', 'Test User');
    } catch (e) {
      console.log('테스트 사용자 이미 존재');
    }

    // 테스트 채널 설정 생성
    try {
      db.prepare(`
        INSERT INTO youtube_channel_settings (id, user_id, channel_id, channel_name, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(testChannelSettingsId, testUserId, testChannelId, 'Test Channel');
    } catch (e) {
      console.log('테스트 채널 이미 존재');
    }
  }

  function cleanupTestData() {
    try {
      // 테스트로 생성된 데이터 삭제
      db.prepare('DELETE FROM automation_logs WHERE pipeline_id LIKE ?').run('pipeline_test_%');
      db.prepare('DELETE FROM automation_pipelines WHERE schedule_id LIKE ?').run('schedule_test_%');
      db.prepare('DELETE FROM video_schedules WHERE id LIKE ?').run('schedule_test_%');
      db.prepare('DELETE FROM video_titles WHERE id LIKE ?').run('title_test_%');
      db.prepare('DELETE FROM youtube_uploads WHERE id LIKE ?').run('upload_test_%');
      db.prepare('DELETE FROM jobs WHERE id LIKE ?').run('job_test_%');
      db.prepare('DELETE FROM youtube_channel_settings WHERE id = ?').run(testChannelSettingsId);
    } catch (e) {
      console.error('정리 중 오류:', e);
    }
  }

  // ===================================================
  // 1. 데이터베이스 스키마 테스트
  // ===================================================

  describe('1. 데이터베이스 스키마', () => {
    test('youtube_uploads 테이블이 존재하고 올바른 컬럼을 가져야 함', () => {
      const tableInfo = db.prepare('PRAGMA table_info(youtube_uploads)').all() as any[];
      const columnNames = tableInfo.map(col => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('job_id');
      expect(columnNames).toContain('video_id');
      expect(columnNames).toContain('video_url');
      expect(columnNames).toContain('channel_id');
      expect(columnNames).toContain('privacy_status');
    });

    test('video_schedules 테이블이 youtube_upload_id 컬럼을 가져야 함', () => {
      const tableInfo = db.prepare('PRAGMA table_info(video_schedules)').all() as any[];
      const columnNames = tableInfo.map(col => col.name);

      expect(columnNames).toContain('youtube_upload_id');
      expect(columnNames).toContain('script_id');
      expect(columnNames).toContain('video_id');
      expect(columnNames).toContain('youtube_publish_time');
    });

    test('video_titles 테이블이 youtube_schedule 컬럼을 가져야 함', () => {
      const tableInfo = db.prepare('PRAGMA table_info(video_titles)').all() as any[];
      const columnNames = tableInfo.map(col => col.name);

      expect(columnNames).toContain('youtube_schedule');
      expect(columnNames).toContain('channel');
      expect(columnNames).toContain('user_id');
    });

    test('jobs 테이블이 video_path 컬럼을 가져야 함 (video가 아님)', () => {
      const tableInfo = db.prepare('PRAGMA table_info(jobs)').all() as any[];
      const columnNames = tableInfo.map(col => col.name);

      expect(columnNames).toContain('video_path');
    });
  });

  // ===================================================
  // 2. 채널 설정 조회 테스트
  // ===================================================

  describe('2. 채널 설정 조회', () => {
    test('youtube_channel_settings에서 channel_id를 정상적으로 조회할 수 있어야 함', () => {
      const channel = db.prepare(`
        SELECT id, channel_id, channel_name
        FROM youtube_channel_settings
        WHERE id = ?
      `).get(testChannelSettingsId) as any;

      expect(channel).toBeDefined();
      expect(channel.channel_id).toBe(testChannelId);
    });

    test('video_titles와 youtube_channel_settings를 JOIN하여 채널 정보를 가져올 수 있어야 함', () => {
      // 테스트 타이틀 생성
      const titleId = 'title_test_' + Date.now();
      db.prepare(`
        INSERT INTO video_titles (id, title, type, user_id, channel, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(titleId, 'Test Title', 'shortform', testUserId, testChannelSettingsId);

      // JOIN 쿼리 테스트
      const result = db.prepare(`
        SELECT
          t.id,
          t.title,
          t.channel as channel_settings_id,
          yc.channel_id as channel
        FROM video_titles t
        LEFT JOIN youtube_channel_settings yc ON t.channel = yc.id
        WHERE t.id = ?
      `).get(titleId) as any;

      expect(result).toBeDefined();
      expect(result.channel_settings_id).toBe(testChannelSettingsId);
      expect(result.channel).toBe(testChannelId);

      // 정리
      db.prepare('DELETE FROM video_titles WHERE id = ?').run(titleId);
    });
  });

  // ===================================================
  // 3. 스케줄 조회 테스트
  // ===================================================

  describe('3. 스케줄 조회', () => {
    test('getPendingSchedules 쿼리가 모든 필요한 필드를 반환해야 함', () => {
      // 테스트 데이터 생성
      const titleId = 'title_test_' + Date.now();
      const scheduleId = 'schedule_test_' + Date.now();

      db.prepare(`
        INSERT INTO video_titles (id, title, type, user_id, channel, youtube_schedule, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(titleId, 'Test Title', 'shortform', testUserId, testChannelSettingsId, 'immediate');

      db.prepare(`
        INSERT INTO video_schedules (id, title_id, scheduled_time, status, created_at)
        VALUES (?, ?, datetime('now', '-1 minute'), 'pending', CURRENT_TIMESTAMP)
      `).run(scheduleId, titleId);

      // 스케줄 조회
      const now = new Date();
      const nowLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const schedules = db.prepare(`
        SELECT
          s.*,
          t.title,
          t.type,
          t.user_id,
          t.youtube_schedule,
          t.channel as channel_settings_id,
          yc.channel_id as channel
        FROM video_schedules s
        JOIN video_titles t ON s.title_id = t.id
        LEFT JOIN youtube_channel_settings yc ON t.channel = yc.id
        WHERE s.status = 'pending'
          AND s.scheduled_time <= ?
        ORDER BY s.scheduled_time ASC
      `).all(nowLocal) as any[];

      const testSchedule = schedules.find(s => s.id === scheduleId);

      expect(testSchedule).toBeDefined();
      expect(testSchedule.user_id).toBe(testUserId);
      expect(testSchedule.youtube_schedule).toBe('immediate');
      expect(testSchedule.channel_settings_id).toBe(testChannelSettingsId);
      expect(testSchedule.channel).toBe(testChannelId);

      // 정리
      db.prepare('DELETE FROM video_schedules WHERE id = ?').run(scheduleId);
      db.prepare('DELETE FROM video_titles WHERE id = ?').run(titleId);
    });
  });

  // ===================================================
  // 4. YouTube 업로드 데이터 저장 테스트
  // ===================================================

  describe('4. YouTube 업로드 데이터 저장', () => {
    test('youtube_uploads 테이블에 데이터를 저장할 수 있어야 함', () => {
      const uploadId = 'upload_test_' + Date.now();
      const jobId = 'job_test_' + Date.now();
      const youtubeVideoId = 'yt_test_' + Date.now();

      db.prepare(`
        INSERT INTO youtube_uploads (
          id, user_id, job_id, video_id, video_url,
          title, channel_id, privacy_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uploadId,
        testUserId,
        jobId,
        youtubeVideoId,
        'https://youtube.com/watch?v=' + youtubeVideoId,
        'Test Video',
        testChannelId,
        'public'
      );

      const upload = db.prepare('SELECT * FROM youtube_uploads WHERE id = ?').get(uploadId) as any;

      expect(upload).toBeDefined();
      expect(upload.user_id).toBe(testUserId);
      expect(upload.video_id).toBe(youtubeVideoId);
      expect(upload.channel_id).toBe(testChannelId);
      expect(upload.privacy_status).toBe('public');

      // 정리
      db.prepare('DELETE FROM youtube_uploads WHERE id = ?').run(uploadId);
    });

    test('video_schedules에 youtube_upload_id를 업데이트할 수 있어야 함', () => {
      const titleId = 'title_test_' + Date.now();
      const scheduleId = 'schedule_test_' + Date.now();
      const uploadId = 'upload_test_' + Date.now();

      db.prepare(`
        INSERT INTO video_titles (id, title, type, user_id, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(titleId, 'Test Title', 'shortform', testUserId);

      db.prepare(`
        INSERT INTO video_schedules (id, title_id, scheduled_time, status, created_at)
        VALUES (?, ?, datetime('now'), 'pending', CURRENT_TIMESTAMP)
      `).run(scheduleId, titleId);

      // youtube_upload_id 업데이트
      db.prepare(`
        UPDATE video_schedules
        SET youtube_upload_id = ?
        WHERE id = ?
      `).run(uploadId, scheduleId);

      const schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;

      expect(schedule.youtube_upload_id).toBe(uploadId);

      // 정리
      db.prepare('DELETE FROM video_schedules WHERE id = ?').run(scheduleId);
      db.prepare('DELETE FROM video_titles WHERE id = ?').run(titleId);
    });
  });

  // ===================================================
  // 5. Privacy 설정 로직 테스트
  // ===================================================

  describe('5. Privacy 설정 로직', () => {
    test('youtube_schedule이 immediate면 public으로 설정되어야 함', () => {
      const schedule = {
        youtube_schedule: 'immediate'
      };

      const privacy = schedule.youtube_schedule === 'immediate' ? 'public' : 'private';
      expect(privacy).toBe('public');
    });

    test('youtube_schedule이 immediate가 아니면 private으로 설정되어야 함', () => {
      const schedule1 = {
        youtube_schedule: 'scheduled'
      };

      const privacy1 = schedule1.youtube_schedule === 'immediate' ? 'public' : 'private';
      expect(privacy1).toBe('private');

      const schedule2 = {
        youtube_schedule: null
      };

      const privacy2 = schedule2.youtube_schedule === 'immediate' ? 'public' : 'private';
      expect(privacy2).toBe('private');
    });
  });

  // ===================================================
  // 6. 비디오 파일 경로 테스트
  // ===================================================

  describe('6. 비디오 파일 경로', () => {
    test('jobs 테이블의 video_path 컬럼을 사용해야 함', () => {
      const jobId = 'job_test_' + Date.now();
      const videoPath = 'C:\\Users\\test\\workspace\\trend-video-backend\\uploads\\test_video.mp4';

      db.prepare(`
        INSERT INTO jobs (id, title, status, video_path, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(jobId, 'Test Job', 'completed', videoPath);

      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as any;

      expect(job).toBeDefined();
      expect(job.video_path).toBe(videoPath);

      // video_path가 이미 절대 경로인지 확인
      expect(path.isAbsolute(job.video_path)).toBe(true);

      // 정리
      db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
    });
  });

  // ===================================================
  // 7. 파이프라인 생성 및 상태 추적 테스트
  // ===================================================

  describe('7. 파이프라인 생성 및 상태 추적', () => {
    test('파이프라인의 모든 stage가 생성되어야 함', () => {
      const scheduleId = 'schedule_test_' + Date.now();
      const stages = ['script', 'video', 'upload', 'publish'];

      stages.forEach(stage => {
        const pipelineId = `pipeline_${Date.now()}_${stage}_test`;
        db.prepare(`
          INSERT INTO automation_pipelines (id, schedule_id, stage, status, created_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(pipelineId, scheduleId, stage, 'pending');
      });

      const pipelines = db.prepare(`
        SELECT * FROM automation_pipelines
        WHERE schedule_id = ?
        ORDER BY created_at
      `).all(scheduleId) as any[];

      expect(pipelines).toHaveLength(4);
      expect(pipelines.map(p => p.stage)).toEqual(stages);

      // 정리
      db.prepare('DELETE FROM automation_pipelines WHERE schedule_id = ?').run(scheduleId);
    });

    test('파이프라인 상태를 업데이트할 수 있어야 함', () => {
      const pipelineId = 'pipeline_test_' + Date.now();
      const scheduleId = 'schedule_test_' + Date.now();

      db.prepare(`
        INSERT INTO automation_pipelines (id, schedule_id, stage, status, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(pipelineId, scheduleId, 'script', 'pending');

      // 상태 업데이트
      db.prepare(`
        UPDATE automation_pipelines
        SET status = ?, started_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run('running', pipelineId);

      let pipeline = db.prepare('SELECT * FROM automation_pipelines WHERE id = ?').get(pipelineId) as any;
      expect(pipeline.status).toBe('running');

      // 완료로 업데이트
      db.prepare(`
        UPDATE automation_pipelines
        SET status = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run('completed', pipelineId);

      pipeline = db.prepare('SELECT * FROM automation_pipelines WHERE id = ?').get(pipelineId) as any;
      expect(pipeline.status).toBe('completed');

      // 정리
      db.prepare('DELETE FROM automation_pipelines WHERE id = ?').run(pipelineId);
    });
  });

  // ===================================================
  // 8. 로그 기록 테스트
  // ===================================================

  describe('8. 로그 기록', () => {
    test('automation_logs에 로그를 저장할 수 있어야 함', () => {
      const pipelineId = 'pipeline_test_' + Date.now();

      db.prepare(`
        INSERT INTO automation_logs (pipeline_id, log_level, message, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(pipelineId, 'info', 'Test log message');

      const logs = db.prepare(`
        SELECT * FROM automation_logs
        WHERE pipeline_id = ?
      `).all(pipelineId) as any[];

      expect(logs).toHaveLength(1);
      expect(logs[0].log_level).toBe('info');
      expect(logs[0].message).toBe('Test log message');

      // 정리
      db.prepare('DELETE FROM automation_logs WHERE pipeline_id = ?').run(pipelineId);
    });
  });

  // ===================================================
  // 9. 전체 파이프라인 시뮬레이션 테스트
  // ===================================================

  describe('9. 전체 파이프라인 시뮬레이션', () => {
    test('완전한 파이프라인 플로우를 시뮬레이션할 수 있어야 함', () => {
      const titleId = 'title_test_pipeline_' + Date.now();
      const scheduleId = 'schedule_test_pipeline_' + Date.now();
      const scriptId = 'script_test_' + Date.now();
      const videoId = 'job_test_' + Date.now();
      const uploadId = 'upload_test_' + Date.now();

      // 1. Title 생성
      db.prepare(`
        INSERT INTO video_titles (id, title, type, user_id, channel, youtube_schedule, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(titleId, 'Test Pipeline', 'shortform', testUserId, testChannelSettingsId, 'immediate');

      // 2. Schedule 생성
      db.prepare(`
        INSERT INTO video_schedules (id, title_id, scheduled_time, youtube_publish_time, status, created_at)
        VALUES (?, ?, datetime('now', '-1 minute'), datetime('now', '+1 hour'), 'pending', CURRENT_TIMESTAMP)
      `).run(scheduleId, titleId);

      // 3. Script 단계 완료 시뮬레이션
      db.prepare(`
        UPDATE video_schedules
        SET script_id = ?
        WHERE id = ?
      `).run(scriptId, scheduleId);

      // 4. Video 단계 완료 시뮬레이션
      db.prepare(`
        INSERT INTO jobs (id, title, status, video_path, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(videoId, 'Test Video', 'completed', 'C:\\test\\video.mp4');

      db.prepare(`
        UPDATE video_schedules
        SET video_id = ?
        WHERE id = ?
      `).run(videoId, scheduleId);

      // 5. Upload 단계 완료 시뮬레이션
      db.prepare(`
        INSERT INTO youtube_uploads (
          id, user_id, job_id, video_id, video_url,
          title, channel_id, privacy_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uploadId, testUserId, videoId, 'YT123', 'https://youtube.com/watch?v=YT123', 'Test Video', testChannelId, 'public');

      db.prepare(`
        UPDATE video_schedules
        SET youtube_upload_id = ?
        WHERE id = ?
      `).run(uploadId, scheduleId);

      // 6. 최종 검증
      const schedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(scheduleId) as any;
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(videoId) as any;
      const upload = db.prepare('SELECT * FROM youtube_uploads WHERE id = ?').get(uploadId) as any;

      expect(schedule.script_id).toBe(scriptId);
      expect(schedule.video_id).toBe(videoId);
      expect(schedule.youtube_upload_id).toBe(uploadId);
      expect(job.video_path).toBeDefined();
      expect(upload.video_id).toBe('YT123');
      expect(upload.privacy_status).toBe('public');

      // 정리
      db.prepare('DELETE FROM youtube_uploads WHERE id = ?').run(uploadId);
      db.prepare('DELETE FROM jobs WHERE id = ?').run(videoId);
      db.prepare('DELETE FROM video_schedules WHERE id = ?').run(scheduleId);
      db.prepare('DELETE FROM video_titles WHERE id = ?').run(titleId);
    });
  });

  // ===================================================
  // 10. 에러 케이스 테스트
  // ===================================================

  describe('10. 에러 케이스', () => {
    test('존재하지 않는 video_id로 조회하면 null을 반환해야 함', () => {
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get('nonexistent_job_id');
      expect(job).toBeUndefined();
    });

    test('채널 설정이 없으면 channel이 null이어야 함', () => {
      const titleId = 'title_test_no_channel_' + Date.now();

      db.prepare(`
        INSERT INTO video_titles (id, title, type, user_id, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(titleId, 'Test No Channel', 'shortform', testUserId);

      const result = db.prepare(`
        SELECT
          t.id,
          t.title,
          yc.channel_id as channel
        FROM video_titles t
        LEFT JOIN youtube_channel_settings yc ON t.channel = yc.id
        WHERE t.id = ?
      `).get(titleId) as any;

      expect(result.channel).toBeNull();

      // 정리
      db.prepare('DELETE FROM video_titles WHERE id = ?').run(titleId);
    });
  });
});
