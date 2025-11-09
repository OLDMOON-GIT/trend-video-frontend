import db from './sqlite';

export interface ChineseConverterJob {
  id: string;
  userId: string;
  title?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoPath?: string;
  outputPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  logs?: Array<{ timestamp: string; message: string }>;
}

// 작업 생성
export function createChineseConverterJob(
  userId: string,
  jobId: string,
  videoPath: string,
  title?: string
): ChineseConverterJob {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO chinese_converter_jobs (id, user_id, title, status, progress, video_path, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)
  `);

  stmt.run(jobId, userId, title || null, videoPath, now, now);

  console.log('✅ [중국영상변환 DB] 작업 생성:', jobId, title ? `제목: ${title}` : '');

  return {
    id: jobId,
    userId,
    title,
    status: 'pending',
    progress: 0,
    videoPath,
    createdAt: now,
    updatedAt: now,
    logs: []
  };
}

// 작업 조회
export function findChineseConverterJobById(jobId: string): ChineseConverterJob | null {
  const stmt = db.prepare(`
    SELECT
      j.*,
      GROUP_CONCAT(jl.log_message, '|||') as log_messages,
      GROUP_CONCAT(jl.created_at, '|||') as log_timestamps
    FROM chinese_converter_jobs j
    LEFT JOIN chinese_converter_job_logs jl ON j.id = jl.job_id
    WHERE j.id = ?
    GROUP BY j.id
  `);

  const row = stmt.get(jobId) as any;

  if (!row) {
    console.log('❌ [중국영상변환 DB] 작업 없음:', jobId);
    return null;
  }

  const logs: Array<{ timestamp: string; message: string }> = [];
  if (row.log_messages && row.log_timestamps) {
    const messages = row.log_messages.split('|||');
    const timestamps = row.log_timestamps.split('|||');
    for (let i = 0; i < messages.length; i++) {
      logs.push({
        timestamp: timestamps[i],
        message: messages[i]
      });
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    progress: row.progress,
    videoPath: row.video_path,
    outputPath: row.output_path,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    logs
  };
}

// 작업 업데이트
export function updateChineseConverterJob(
  jobId: string,
  updates: Partial<ChineseConverterJob>
): ChineseConverterJob | null {
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
  if (updates.outputPath !== undefined) {
    fields.push('output_path = ?');
    values.push(updates.outputPath);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }

  fields.push('updated_at = ?');
  values.push(now);

  values.push(jobId);

  const stmt = db.prepare(`
    UPDATE chinese_converter_jobs
    SET ${fields.join(', ')}
    WHERE id = ?
  `);

  const result = stmt.run(...values);

  if (result.changes > 0) {
    console.log('✅ [중국영상변환 DB] 작업 업데이트:', jobId, updates);
  }

  return findChineseConverterJobById(jobId);
}

// 로그 추가
export function addChineseConverterJobLog(jobId: string, logMessage: string): void {
  const stmt = db.prepare(`
    INSERT INTO chinese_converter_job_logs (job_id, log_message)
    VALUES (?, ?)
  `);

  stmt.run(jobId, logMessage);
  console.log(`📝 [중국영상변환 DB] 로그 추가 [${jobId}]: ${logMessage}`);
}

// 사용자별 작업 목록 조회
export function getChineseConverterJobsByUserId(userId: string): ChineseConverterJob[] {
  const stmt = db.prepare(`
    SELECT
      j.*,
      (SELECT GROUP_CONCAT(jl.log_message, '|||')
       FROM chinese_converter_job_logs jl
       WHERE jl.job_id = j.id) as log_messages,
      (SELECT GROUP_CONCAT(jl.created_at, '|||')
       FROM chinese_converter_job_logs jl
       WHERE jl.job_id = j.id) as log_timestamps
    FROM chinese_converter_jobs j
    WHERE j.user_id = ?
    ORDER BY j.created_at DESC
  `);

  const rows = stmt.all(userId) as any[];

  console.log('📊 [중국영상변환 DB] 작업 목록 조회:', userId, '- 총', rows.length, '개');

  return rows.map(row => {
    const logs: Array<{ timestamp: string; message: string }> = [];
    if (row.log_messages && row.log_timestamps) {
      const messages = row.log_messages.split('|||');
      const timestamps = row.log_timestamps.split('|||');
      for (let i = 0; i < messages.length; i++) {
        logs.push({
          timestamp: timestamps[i],
          message: messages[i]
        });
      }
    }

    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      status: row.status,
      progress: row.progress,
      videoPath: row.video_path,
      outputPath: row.output_path,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      logs
    };
  });
}

// 작업 삭제
export function deleteChineseConverterJob(jobId: string): boolean {
  const stmt = db.prepare('DELETE FROM chinese_converter_jobs WHERE id = ?');
  const result = stmt.run(jobId);
  console.log('🗑️ [중국영상변환 DB] 작업 삭제:', jobId, '- 성공:', result.changes > 0);
  return result.changes > 0;
}
