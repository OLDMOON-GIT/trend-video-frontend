/**
 * 완전 자동화 시스템
 * 제목 리스트 → 대본 생성 → 영상 생성 → 유튜브 업로드
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// DB 초기화 및 테이블 생성
export function initAutomationTables() {
  const db = new Database(dbPath);

  // 1. 제목 리스트 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_titles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('shortform', 'longform', 'product')),
      category TEXT,
      tags TEXT,
      product_url TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'scheduled', 'processing', 'completed', 'failed')),
      priority INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // product_url 컬럼 추가 (기존 테이블에 없을 경우)
  try {
    db.exec(`ALTER TABLE video_titles ADD COLUMN product_url TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // channel 컬럼 추가 (기존 테이블에 없을 경우)
  try {
    db.exec(`ALTER TABLE video_titles ADD COLUMN channel TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // script_mode 컬럼 추가 (기존 테이블에 없을 경우)
  try {
    db.exec(`ALTER TABLE video_titles ADD COLUMN script_mode TEXT DEFAULT 'chrome';`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // media_mode 컬럼 추가 (기존 테이블에 없을 경우)
  try {
    db.exec(`ALTER TABLE video_titles ADD COLUMN media_mode TEXT DEFAULT 'upload';`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // 2. 스케줄 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_schedules (
      id TEXT PRIMARY KEY,
      title_id TEXT NOT NULL,
      scheduled_time DATETIME NOT NULL,
      youtube_publish_time DATETIME,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
      script_id TEXT,
      video_id TEXT,
      youtube_upload_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (title_id) REFERENCES video_titles(id) ON DELETE CASCADE
    );
  `);

  // 3. 파이프라인 실행 기록 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_pipelines (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('script', 'video', 'upload', 'publish')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES video_schedules(id) ON DELETE CASCADE
    );
  `);

  // 4. 파이프라인 로그 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id TEXT NOT NULL,
      log_level TEXT NOT NULL CHECK(log_level IN ('info', 'warn', 'error', 'debug')),
      message TEXT NOT NULL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pipeline_id) REFERENCES automation_pipelines(id) ON DELETE CASCADE
    );
  `);

  // 5. 자동화 설정 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 기본 설정 삽입
  db.prepare(`
    INSERT OR IGNORE INTO automation_settings (key, value, description)
    VALUES
      ('enabled', 'false', '자동화 시스템 활성화 여부'),
      ('check_interval', '60', '스케줄 체크 간격 (초)'),
      ('max_retry', '3', '실패 시 최대 재시도 횟수'),
      ('alert_email', 'moony75@gmail.com', '알림 받을 이메일'),
      ('default_youtube_privacy', 'private', '유튜브 기본 공개 설정'),
      ('script_generation_mode', 'chrome', '대본 생성 방식 (api 또는 chrome)'),
      ('media_generation_mode', 'upload', '미디어 생성 방식 (upload, dalle, imagen3, sora2)')
  `).run();

  db.close();
  console.log('✅ Automation tables initialized');
}

// 제목 추가
export function addVideoTitle(data: {
  title: string;
  type: 'shortform' | 'longform' | 'product';
  category?: string;
  tags?: string;
  priority?: number;
  productUrl?: string;
  channel?: string;
  scriptMode?: string;
  mediaMode?: string;
}) {
  const db = new Database(dbPath);
  const id = `title_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO video_titles (id, title, type, category, tags, priority, product_url, channel, script_mode, media_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.type,
    data.category || null,
    data.tags || null,
    data.priority || 0,
    data.productUrl || null,
    data.channel || null,
    data.scriptMode || 'chrome',
    data.mediaMode || 'upload'
  );

  db.close();
  return id;
}

// 스케줄 추가
export function addSchedule(data: {
  titleId: string;
  scheduledTime: string; // ISO 8601 format
  youtubePublishTime?: string;
}) {
  const db = new Database(dbPath);
  const id = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO video_schedules (id, title_id, scheduled_time, youtube_publish_time)
    VALUES (?, ?, ?, ?)
  `).run(id, data.titleId, data.scheduledTime, data.youtubePublishTime || null);

  db.close();
  return id;
}

// 예약된 스케줄 가져오기
export function getPendingSchedules() {
  const db = new Database(dbPath);
  const now = new Date().toISOString();

  const schedules = db.prepare(`
    SELECT
      s.*,
      t.title,
      t.type,
      t.category,
      t.tags
    FROM video_schedules s
    JOIN video_titles t ON s.title_id = t.id
    WHERE s.status = 'pending'
      AND s.scheduled_time <= ?
    ORDER BY s.scheduled_time ASC
  `).all(now);

  db.close();
  return schedules;
}

// 파이프라인 생성
export function createPipeline(scheduleId: string) {
  const db = new Database(dbPath);
  const stages = ['script', 'video', 'upload', 'publish'];
  const pipelineIds: string[] = [];

  for (const stage of stages) {
    const id = `pipeline_${Date.now()}_${stage}_${Math.random().toString(36).substr(2, 9)}`;
    db.prepare(`
      INSERT INTO automation_pipelines (id, schedule_id, stage, status)
      VALUES (?, ?, ?, 'pending')
    `).run(id, scheduleId, stage);
    pipelineIds.push(id);
  }

  db.close();
  return pipelineIds;
}

// 파이프라인 상태 업데이트
export function updatePipelineStatus(
  pipelineId: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  errorMessage?: string
) {
  const db = new Database(dbPath);

  if (status === 'running') {
    db.prepare(`
      UPDATE automation_pipelines
      SET status = ?, started_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, pipelineId);
  } else if (status === 'completed') {
    db.prepare(`
      UPDATE automation_pipelines
      SET status = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, pipelineId);
  } else if (status === 'failed') {
    db.prepare(`
      UPDATE automation_pipelines
      SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1
      WHERE id = ?
    `).run(status, errorMessage || null, pipelineId);
  }

  db.close();
}

// 파이프라인 로그 추가
export function addPipelineLog(
  pipelineId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  metadata?: any
) {
  const db = new Database(dbPath);

  db.prepare(`
    INSERT INTO automation_logs (pipeline_id, log_level, message, metadata)
    VALUES (?, ?, ?, ?)
  `).run(pipelineId, level, message, metadata ? JSON.stringify(metadata) : null);

  db.close();
}

// 스케줄 상태 업데이트
export function updateScheduleStatus(
  scheduleId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled',
  updates?: {
    scriptId?: string;
    videoId?: string;
    youtubeUploadId?: string;
  }
) {
  const db = new Database(dbPath);

  const fields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [status];

  if (updates?.scriptId) {
    fields.push('script_id = ?');
    values.push(updates.scriptId);
  }
  if (updates?.videoId) {
    fields.push('video_id = ?');
    values.push(updates.videoId);
  }
  if (updates?.youtubeUploadId) {
    fields.push('youtube_upload_id = ?');
    values.push(updates.youtubeUploadId);
  }

  values.push(scheduleId);

  db.prepare(`
    UPDATE video_schedules
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values);

  db.close();
}

// 설정 가져오기
export function getAutomationSettings() {
  const db = new Database(dbPath);
  const settings = db.prepare('SELECT key, value FROM automation_settings').all() as { key: string; value: string }[];
  db.close();

  return settings.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
}

// 설정 업데이트
export function updateAutomationSetting(key: string, value: string) {
  const db = new Database(dbPath);
  db.prepare(`
    UPDATE automation_settings
    SET value = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = ?
  `).run(value, key);
  db.close();
}

// 모든 제목 가져오기
export function getAllVideoTitles() {
  const db = new Database(dbPath);
  const titles = db.prepare(`
    SELECT * FROM video_titles
    ORDER BY priority DESC, created_at DESC
  `).all();
  db.close();
  return titles;
}

// 모든 스케줄 가져오기
export function getAllSchedules() {
  const db = new Database(dbPath);
  const schedules = db.prepare(`
    SELECT
      s.*,
      t.title,
      t.type
    FROM video_schedules s
    JOIN video_titles t ON s.title_id = t.id
    ORDER BY s.scheduled_time ASC
  `).all();
  db.close();
  return schedules;
}

// 파이프라인 상세 정보 가져오기
export function getPipelineDetails(scheduleId: string) {
  const db = new Database(dbPath);

  const pipelines = db.prepare(`
    SELECT * FROM automation_pipelines
    WHERE schedule_id = ?
    ORDER BY
      CASE stage
        WHEN 'script' THEN 1
        WHEN 'video' THEN 2
        WHEN 'upload' THEN 3
        WHEN 'publish' THEN 4
      END
  `).all(scheduleId);

  const logs = db.prepare(`
    SELECT l.*
    FROM automation_logs l
    JOIN automation_pipelines p ON l.pipeline_id = p.id
    WHERE p.schedule_id = ?
    ORDER BY l.created_at DESC
  `).all(scheduleId);

  db.close();
  return { pipelines, logs };
}
