import db from './sqlite';

export interface Job {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step?: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  videoUrl?: string;
  error?: string;
  logs?: string[];
  type?: 'longform' | 'shortform' | 'sora2';
}

// type 컬럼 추가 (기존 테이블에 컬럼이 없을 경우)
try {
  db.exec(`ALTER TABLE jobs ADD COLUMN type TEXT`);
} catch (e: any) {
  if (!e.message.includes('duplicate column')) {
    console.error('jobs type 컬럼 추가 실패:', e);
  }
}

// 작업 생성
export function createJob(userId: string, jobId: string, title?: string, type?: 'longform' | 'shortform' | 'sora2'): Job {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO jobs (id, user_id, status, progress, created_at, updated_at, title, type)
    VALUES (?, ?, 'pending', 0, ?, ?, ?, ?)
  `);

  stmt.run(jobId, userId, now, now, title || null, type || null);

  return {
    id: jobId,
    userId,
    status: 'pending',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    title,
    type
  };
}

// 작업 조회
export function findJobById(jobId: string): Job | null {
  const stmt = db.prepare(`
    SELECT
      j.*,
      GROUP_CONCAT(jl.log_message, '\n') as logs
    FROM jobs j
    LEFT JOIN job_logs jl ON j.id = jl.job_id
    WHERE j.id = ?
    GROUP BY j.id
  `);

  const row = stmt.get(jobId) as any;

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    step: row.step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    videoUrl: row.video_url,
    error: row.error,
    logs: row.logs ? row.logs.split('\n') : [],
    type: row.type
  };
}

// 작업 업데이트
export function updateJob(jobId: string, updates: Partial<Job>): Job | null {
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    values.push(updates.progress);
  }
  if (updates.step !== undefined) {
    fields.push('step = ?');
    values.push(updates.step);
  }
  if (updates.videoUrl !== undefined) {
    fields.push('video_url = ?');
    values.push(updates.videoUrl);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }

  fields.push('updated_at = ?');
  values.push(now);

  values.push(jobId);

  const stmt = db.prepare(`
    UPDATE jobs
    SET ${fields.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...values);

  return findJobById(jobId);
}

// 로그 추가
export function addJobLog(jobId: string, logMessage: string): void {
  const stmt = db.prepare(`
    INSERT INTO job_logs (job_id, log_message)
    VALUES (?, ?)
  `);

  stmt.run(jobId, logMessage);
}

// 로그 일괄 추가
export function addJobLogs(jobId: string, logs: string[]): void {
  const stmt = db.prepare(`
    INSERT INTO job_logs (job_id, log_message)
    VALUES (?, ?)
  `);

  const insertMany = db.transaction((logs: string[]) => {
    for (const log of logs) {
      stmt.run(jobId, log);
    }
  });

  insertMany(logs);
}

// 사용자별 작업 목록 조회
export function getJobsByUserId(userId: string, limit: number = 10, offset: number = 0): Job[] {
  const stmt = db.prepare(`
    SELECT
      j.*,
      (SELECT GROUP_CONCAT(jl.log_message, '\n')
       FROM job_logs jl
       WHERE jl.job_id = j.id) as logs
    FROM jobs j
    WHERE j.user_id = ?
    ORDER BY j.created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(userId, limit, offset) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    step: row.step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    videoUrl: row.video_url,
    error: row.error,
    logs: row.logs ? row.logs.split('\n') : [],
    type: row.type
  }));
}

// 작업 삭제
export function deleteJob(jobId: string): boolean {
  const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
  const result = stmt.run(jobId);
  return result.changes > 0;
}
