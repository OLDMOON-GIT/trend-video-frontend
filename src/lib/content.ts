// 통합 Content 관리 (scripts + jobs 통합)
import crypto from 'crypto';
import db from './sqlite';

try {
  db.exec(`ALTER TABLE contents ADD COLUMN model TEXT`);
} catch (error: any) {
  if (!error?.message?.includes('duplicate column')) {
    console.error('Failed to ensure contents.model column:', error);
  }
}

// 통합 Content 타입
export interface Content {
  id: string;
  userId: string;

  // 타입 구분
  type: 'script' | 'video';  // 컨텐츠 타입
  format?: 'longform' | 'shortform' | 'sora2' | 'product';  // 포맷

  // 내용
  title: string;
  originalTitle?: string;  // 사용자 입력 원본 제목
  content?: string;  // 대본 내용 (type='script'일 때)

  // 변환/재생성 정보
  sourceContentId?: string;  // 원본 컨텐츠 ID (변환/재생성인 경우)
  conversionType?: string;   // 변환 타입 (예: 'longform-to-shortform', 'longform-to-sora2')
  isRegenerated?: boolean;   // 재생성 여부

  // 상태
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;  // 0-100
  error?: string;

  // 프로세스 관리
  pid?: number;  // 프로세스 ID (취소용)

  // 영상 관련 (type='video'일 때)
  videoPath?: string;
  thumbnailPath?: string;
  published?: boolean;  // 유튜브 업로드 여부
  publishedAt?: string;

  // AI 사용량
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
  useClaudeLocal?: boolean;  // 로컬 Claude 사용 여부
  model?: string;

  // 로그
  logs?: string[];

  // 시간
  createdAt: string;
  updatedAt: string;
}

// ==================== Content 생성 ====================

export function createContent(
  userId: string,
  type: 'script' | 'video',
  title: string,
  options?: {
    format?: 'longform' | 'shortform' | 'sora2' | 'product';
    originalTitle?: string;
    content?: string;
    tokenUsage?: { input_tokens: number; output_tokens: number };
    useClaudeLocal?: boolean;
    sourceContentId?: string;  // 원본 컨텐츠 ID
    conversionType?: string;   // 변환 타입
    isRegenerated?: boolean;   // 재생성 여부
    model?: string;
  }
): Content {
  const contentId = crypto.randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO contents (
      id, user_id, type, format, title, original_title, content,
      status, progress, input_tokens, output_tokens, use_claude_local, model,
      source_content_id, conversion_type, is_regenerated,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    contentId,
    userId,
    type,
    options?.format || null,
    title,
    options?.originalTitle || null,
    options?.content || null,
    options?.content ? 'completed' : 'pending',
    options?.content ? 100 : 0,
    options?.tokenUsage?.input_tokens || null,
    options?.tokenUsage?.output_tokens || null,
    options?.useClaudeLocal ? 1 : 0,
    options?.model || null,
    options?.sourceContentId || null,
    options?.conversionType || null,
    options?.isRegenerated ? 1 : 0,
    now,
    now
  );

  return {
    id: contentId,
    userId,
    type,
    format: options?.format,
    title,
    originalTitle: options?.originalTitle,
    content: options?.content,
    status: options?.content ? 'completed' : 'pending',
    progress: options?.content ? 100 : 0,
    tokenUsage: options?.tokenUsage,
    useClaudeLocal: options?.useClaudeLocal,
    model: options?.model,
    sourceContentId: options?.sourceContentId,
    conversionType: options?.conversionType,
    isRegenerated: options?.isRegenerated,
    createdAt: now,
    updatedAt: now
  };
}

// ==================== Content 조회 ====================

export function findContentById(contentId: string): Content | null {
  const stmt = db.prepare(`
    SELECT * FROM contents WHERE id = ?
  `);

  const row = stmt.get(contentId) as any;
  if (!row) return null;

  return rowToContent(row);
}

export function getContentsByUserId(
  userId: string,
  options?: {
    type?: 'script' | 'video';
    format?: 'longform' | 'shortform' | 'sora2';
    status?: string;
    limit?: number;
    offset?: number;
  }
): Content[] {
  let query = 'SELECT * FROM contents WHERE user_id = ?';
  const params: any[] = [userId];

  if (options?.type) {
    query += ' AND type = ?';
    params.push(options.type);
  }

  if (options?.format) {
    query += ' AND format = ?';
    params.push(options.format);
  }

  if (options?.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY created_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  if (options?.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as any[];

  return rows.map(row => {
    const content = rowToContent(row);

    // 로그 가져오기
    const logsStmt = db.prepare(
      'SELECT log_message FROM content_logs WHERE content_id = ? ORDER BY created_at'
    );
    const logRows = logsStmt.all(row.id) as any[];
    content.logs = logRows.map(l => l.log_message);

    return content;
  });
}

// 진행 중인 작업 조회
export function getActiveContentsByUserId(userId: string): Content[] {
  return getContentsByUserId(userId, {
    status: 'pending,processing'
  });
}

// ==================== Content 업데이트 ====================

export function updateContent(
  contentId: string,
  updates: Partial<Pick<Content,
    'status' | 'progress' | 'error' | 'content' | 'videoPath' |
    'thumbnailPath' | 'pid' | 'published' | 'publishedAt' | 'tokenUsage' | 'model'
  >>
): Content | null {
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
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }
  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.videoPath !== undefined) {
    fields.push('video_path = ?');
    values.push(updates.videoPath);
  }
  if (updates.thumbnailPath !== undefined) {
    fields.push('thumbnail_path = ?');
    values.push(updates.thumbnailPath);
  }
  if (updates.pid !== undefined) {
    fields.push('pid = ?');
    values.push(updates.pid);
  }
  if (updates.published !== undefined) {
    fields.push('published = ?');
    values.push(updates.published ? 1 : 0);
    if (updates.published) {
      fields.push('published_at = ?');
      values.push(now);
    }
  }
  if (updates.tokenUsage) {
    if (updates.tokenUsage.input_tokens !== undefined) {
      fields.push('input_tokens = ?');
      values.push(updates.tokenUsage.input_tokens);
    }
    if (updates.tokenUsage.output_tokens !== undefined) {
      fields.push('output_tokens = ?');
      values.push(updates.tokenUsage.output_tokens);
    }
  }
  if (updates.model !== undefined) {
    fields.push('model = ?');
    values.push(updates.model);
  }

  fields.push('updated_at = ?');
  values.push(now);

  values.push(contentId);

  if (fields.length > 0) {
    const stmt = db.prepare(`
      UPDATE contents
      SET ${fields.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...values);
  }

  return findContentById(contentId);
}

// ==================== Content 삭제 ====================

// ID와 userId로 삭제 (소유자 확인)
export function updateContentStatus(
  contentId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  progress?: number
): Content | null {
  return updateContent(contentId, {
    status,
    progress: progress !== undefined ? progress : (status === 'completed' ? 100 : undefined)
  });
}

export function deleteContent(contentId: string, userId?: string): boolean {
  let stmt;
  let result;

  if (userId) {
    // 소유자 확인하면서 삭제
    stmt = db.prepare('DELETE FROM contents WHERE id = ? AND user_id = ?');
    result = stmt.run(contentId, userId);
  } else {
    // 소유자 확인 없이 삭제
    stmt = db.prepare('DELETE FROM contents WHERE id = ?');
    result = stmt.run(contentId);
  }

  return result.changes > 0;
}

// ==================== 로그 관리 ====================

export function addContentLog(contentId: string, logMessage: string): void {
  const stmt = db.prepare(`
    INSERT INTO content_logs (content_id, log_message)
    VALUES (?, ?)
  `);
  stmt.run(contentId, logMessage);
}

export function addContentLogs(contentId: string, logs: string[]): void {
  const stmt = db.prepare(`
    INSERT INTO content_logs (content_id, log_message)
    VALUES (?, ?)
  `);

  const insertMany = db.transaction((logs: string[]) => {
    for (const log of logs) {
      stmt.run(contentId, log);
    }
  });

  insertMany(logs);
}

export function getContentLogs(contentId: string): string[] {
  const stmt = db.prepare(`
    SELECT log_message FROM content_logs
    WHERE content_id = ?
    ORDER BY created_at
  `);

  const rows = stmt.all(contentId) as any[];
  return rows.map(row => row.log_message);
}

// ==================== 유틸리티 ====================

function rowToContent(row: any): Content {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    format: row.format,
    title: row.title,
    originalTitle: row.original_title,
    content: row.content,
    status: row.status,
    progress: row.progress,
    error: row.error,
    pid: row.pid,
    videoPath: row.video_path,
    thumbnailPath: row.thumbnail_path,
    published: row.published === 1,
    publishedAt: row.published_at,
    tokenUsage: row.input_tokens || row.output_tokens ? {
      input_tokens: row.input_tokens || 0,
      output_tokens: row.output_tokens || 0
    } : undefined,
    useClaudeLocal: row.use_claude_local === 1,
    model: row.model || undefined,
    sourceContentId: row.source_content_id,
    conversionType: row.conversion_type,
    isRegenerated: row.is_regenerated === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
