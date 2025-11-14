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
    db.exec(`ALTER TABLE video_titles ADD COLUMN media_mode TEXT DEFAULT 'dalle3';`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // youtube_schedule 컬럼 추가 (immediate: 즉시, scheduled: 예약)
  try {
    db.exec(`ALTER TABLE video_titles ADD COLUMN youtube_schedule TEXT DEFAULT 'immediate';`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // user_id 컬럼 추가
  try {
    db.exec(`ALTER TABLE video_titles ADD COLUMN user_id TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // model 컬럼 추가 (LLM 제공자: chatgpt, gemini, claude, groq)
  try {
    db.exec(`ALTER TABLE video_titles ADD COLUMN model TEXT DEFAULT 'claude';`);
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

  // title_id 컬럼 추가 (제목별 로그 조회용)
  try {
    db.exec(`ALTER TABLE automation_logs ADD COLUMN title_id TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // level 컬럼 추가 (간편한 레벨 표시용)
  try {
    db.exec(`ALTER TABLE automation_logs ADD COLUMN level TEXT DEFAULT 'info';`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // details 컬럼 추가 (JSON 데이터용)
  try {
    db.exec(`ALTER TABLE automation_logs ADD COLUMN details TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // message TEXT로 변경
  try {
    db.exec(`ALTER TABLE automation_logs RENAME COLUMN message TO old_message;`);
    db.exec(`ALTER TABLE automation_logs ADD COLUMN message TEXT;`);
  } catch (e) {
    // 이미 존재하면 무시
  }

  // 4-2. 제목별 로그 테이블 (간단한 로그용)
  db.exec(`
    CREATE TABLE IF NOT EXISTS title_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_id TEXT NOT NULL,
      level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error', 'debug')),
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (title_id) REFERENCES video_titles(id) ON DELETE CASCADE
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

  // 6. 채널별 색상 및 주기 설정 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_channel_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      posting_mode TEXT DEFAULT 'fixed_interval' CHECK(posting_mode IN ('fixed_interval', 'weekday_time')),
      interval_value INTEGER,
      interval_unit TEXT CHECK(interval_unit IN ('hours', 'days')),
      weekdays TEXT,
      posting_time TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, channel_id)
    );
  `);

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
  youtubeSchedule?: string;
  model?: string;
  userId: string;
}) {
  const db = new Database(dbPath);
  const id = `title_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO video_titles (id, title, type, category, tags, priority, product_url, channel, script_mode, media_mode, youtube_schedule, model, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    data.mediaMode || 'imagen3',
    data.youtubeSchedule || 'immediate',
    data.model || 'claude',
    data.userId
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

  // 제목 상태를 'scheduled'로 변경
  db.prepare(`
    UPDATE video_titles
    SET status = 'scheduled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(data.titleId);

  db.close();
  return id;
}

// 예약된 스케줄 가져오기
export function getPendingSchedules() {
  const db = new Database(dbPath);

  // 로컬 시간을 ISO 형식으로 변환 (YYYY-MM-DDTHH:mm:ss)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  const nowLocal = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

  console.log(`[Scheduler] Checking for schedules before: ${nowLocal}`);

  const schedules = db.prepare(`
    SELECT
      s.*,
      t.title,
      t.type,
      t.category,
      t.tags,
      t.user_id,
      t.product_url,
      t.script_mode,
      t.media_mode,
      t.model,
      t.youtube_schedule,
      t.channel as channel_settings_id,
      yc.channel_id as channel
    FROM video_schedules s
    JOIN video_titles t ON s.title_id = t.id
    LEFT JOIN youtube_channel_settings yc ON t.channel = yc.id
    WHERE s.status = 'pending'
      AND s.scheduled_time <= ?
    ORDER BY s.scheduled_time ASC
  `).all(nowLocal);

  console.log(`[Scheduler] Found ${schedules.length} pending schedules`);

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
  try {
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO automation_logs (pipeline_id, log_level, message)
      VALUES (?, ?, ?)
    `).run(pipelineId, level, message);
    db.close();
  } catch (error) {
    console.error('Failed to add pipeline log:', error);
  }
}

// 제목 로그 추가 (실시간 진행 상황용)
export function addTitleLog(
  titleId: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string
) {
  try {
    const db = new Database(dbPath);
    db.prepare(`
      INSERT INTO title_logs (title_id, level, message, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(titleId, level, message);
    db.close();
  } catch (error) {
    console.error('Failed to add title log:', error);
  }
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

// 모든 제목 가져오기 (스케줄 정보 포함)
export function getAllVideoTitles() {
  const db = new Database(dbPath);

  // video_titles와 최신 schedule을 JOIN하여 script_id, video_id 정보도 가져오기
  const titles = db.prepare(`
    SELECT
      t.*,
      s.id as schedule_id,
      s.script_id,
      s.video_id,
      s.youtube_upload_id,
      s.scheduled_time,
      s.youtube_publish_time
    FROM video_titles t
    LEFT JOIN (
      SELECT title_id, id, script_id, video_id, youtube_upload_id, scheduled_time, youtube_publish_time,
             ROW_NUMBER() OVER (PARTITION BY title_id ORDER BY created_at DESC) as rn
      FROM video_schedules
    ) s ON t.id = s.title_id AND s.rn = 1
    ORDER BY t.priority DESC, t.created_at DESC
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

// ========== 채널 설정 관리 함수 ==========

// 채널 설정 추가 또는 업데이트
export function upsertChannelSettings(data: {
  userId: string;
  channelId: string;
  channelName: string;
  color?: string;
  postingMode?: 'fixed_interval' | 'weekday_time';
  intervalValue?: number;
  intervalUnit?: 'hours' | 'days';
  weekdays?: number[]; // [0-6], 0=일요일, 6=토요일
  postingTime?: string; // HH:mm 형식
  isActive?: boolean;
}) {
  const db = new Database(dbPath);
  const id = `channel_settings_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // weekdays를 JSON 문자열로 변환
  const weekdaysJson = data.weekdays ? JSON.stringify(data.weekdays) : null;

  try {
    db.prepare(`
      INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, color, posting_mode,
         interval_value, interval_unit, weekdays, posting_time, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, channel_id) DO UPDATE SET
        channel_name = excluded.channel_name,
        color = excluded.color,
        posting_mode = excluded.posting_mode,
        interval_value = excluded.interval_value,
        interval_unit = excluded.interval_unit,
        weekdays = excluded.weekdays,
        posting_time = excluded.posting_time,
        is_active = excluded.is_active,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      id,
      data.userId,
      data.channelId,
      data.channelName,
      data.color || '#3b82f6',
      data.postingMode || 'fixed_interval',
      data.intervalValue || null,
      data.intervalUnit || null,
      weekdaysJson,
      data.postingTime || null,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1
    );
  } catch (error) {
    db.close();
    throw error;
  }

  db.close();
  return id;
}

// 사용자의 모든 채널 설정 조회
export function getChannelSettings(userId: string) {
  const db = new Database(dbPath);
  const settings = db.prepare(`
    SELECT * FROM youtube_channel_settings
    WHERE user_id = ? AND is_active = 1
    ORDER BY created_at DESC
  `).all(userId);

  db.close();

  // weekdays JSON 파싱
  return settings.map((setting: any) => ({
    ...setting,
    weekdays: setting.weekdays ? JSON.parse(setting.weekdays) : null,
    isActive: setting.is_active === 1
  }));
}

// 특정 채널 설정 조회
export function getChannelSetting(userId: string, channelId: string) {
  const db = new Database(dbPath);
  const setting = db.prepare(`
    SELECT * FROM youtube_channel_settings
    WHERE user_id = ? AND channel_id = ?
  `).get(userId, channelId) as any;

  db.close();

  if (!setting) return null;

  return {
    ...setting,
    weekdays: setting.weekdays ? JSON.parse(setting.weekdays) : null,
    isActive: setting.is_active === 1
  };
}

// 채널 설정 업데이트
export function updateChannelSettings(
  userId: string,
  channelId: string,
  updates: {
    color?: string;
    postingMode?: 'fixed_interval' | 'weekday_time';
    intervalValue?: number;
    intervalUnit?: 'hours' | 'days';
    weekdays?: number[];
    postingTime?: string;
    isActive?: boolean;
  }
) {
  const db = new Database(dbPath);

  const fields: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];

  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color);
  }
  if (updates.postingMode !== undefined) {
    fields.push('posting_mode = ?');
    values.push(updates.postingMode);
  }
  if (updates.intervalValue !== undefined) {
    fields.push('interval_value = ?');
    values.push(updates.intervalValue);
  }
  if (updates.intervalUnit !== undefined) {
    fields.push('interval_unit = ?');
    values.push(updates.intervalUnit);
  }
  if (updates.weekdays !== undefined) {
    fields.push('weekdays = ?');
    values.push(JSON.stringify(updates.weekdays));
  }
  if (updates.postingTime !== undefined) {
    fields.push('posting_time = ?');
    values.push(updates.postingTime);
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }

  values.push(userId, channelId);

  db.prepare(`
    UPDATE youtube_channel_settings
    SET ${fields.join(', ')}
    WHERE user_id = ? AND channel_id = ?
  `).run(...values);

  db.close();
}

// 채널 설정 삭제 (soft delete)
export function deleteChannelSettings(userId: string, channelId: string) {
  const db = new Database(dbPath);
  db.prepare(`
    UPDATE youtube_channel_settings
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND channel_id = ?
  `).run(userId, channelId);
  db.close();
}

// 다음 스케줄 시간 계산 (채널 설정 기반)
export function calculateNextScheduleTime(
  userId: string,
  channelId: string,
  fromDate?: Date
): Date | null {
  const setting = getChannelSetting(userId, channelId);
  if (!setting || !setting.isActive) return null;

  const now = fromDate || new Date();

  if (setting.posting_mode === 'fixed_interval') {
    // 고정 주기 모드
    if (!setting.interval_value || !setting.interval_unit) return null;

    const nextDate = new Date(now);
    if (setting.interval_unit === 'hours') {
      nextDate.setHours(nextDate.getHours() + setting.interval_value);
    } else if (setting.interval_unit === 'days') {
      nextDate.setDate(nextDate.getDate() + setting.interval_value);
    }

    return nextDate;
  } else if (setting.posting_mode === 'weekday_time') {
    // 요일/시간 지정 모드
    if (!setting.weekdays || !setting.posting_time) return null;

    const weekdays = setting.weekdays;
    const [hours, minutes] = setting.posting_time.split(':').map(Number);

    // 다음 가능한 날짜 찾기
    const nextDate = new Date(now);
    nextDate.setHours(hours, minutes, 0, 0);

    // 현재 시간이 오늘의 설정 시간을 지났으면 다음날부터 시작
    if (nextDate <= now) {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    // 최대 7일 검색
    for (let i = 0; i < 7; i++) {
      const dayOfWeek = nextDate.getDay();
      if (weekdays.includes(dayOfWeek)) {
        return nextDate;
      }
      nextDate.setDate(nextDate.getDate() + 1);
    }

    return null;
  }

  return null;
}
