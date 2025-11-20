/**
 * Global Queue Management System
 *
 * 서버 전체의 리소스를 관리하는 큐 시스템.
 * 각 작업 타입(script, image, video)별로 1개씩만 동시 실행.
 *
 * @module queue-manager
 */

import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

export type TaskType = 'script' | 'image' | 'video';
export type TaskStatus = 'waiting' | 'processing' | 'completed' | 'failed';

export interface QueueTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  userId: string;
  projectId: string;
  metadata: Record<string, any>;
  logs: string[];
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface QueueSummary {
  script: { waiting: number; processing: number; completed: number; failed: number };
  image: { waiting: number; processing: number; completed: number; failed: number };
  video: { waiting: number; processing: number; completed: number; failed: number };
}

export class QueueManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    // 기본 경로: data/queue.sqlite
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'queue.sqlite');
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase() {
    // 큐 작업 테이블
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('script', 'image', 'video')),
        status TEXT NOT NULL CHECK(status IN ('waiting', 'processing', 'completed', 'failed')),
        priority INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        metadata TEXT,
        logs TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3
      );

      CREATE INDEX IF NOT EXISTS idx_type_status_priority
        ON queue_tasks(type, status, priority DESC, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_user_status
        ON queue_tasks(user_id, status);

      CREATE INDEX IF NOT EXISTS idx_completed_at
        ON queue_tasks(completed_at)
        WHERE status IN ('completed', 'failed');
    `);

    // 락 테이블 (각 타입별 1개만 processing 보장)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_locks (
        task_type TEXT PRIMARY KEY CHECK(task_type IN ('script', 'image', 'video')),
        locked_by TEXT,
        locked_at TEXT,
        worker_pid INTEGER
      );

      INSERT OR IGNORE INTO queue_locks (task_type, locked_by, locked_at, worker_pid)
      VALUES
        ('script', NULL, NULL, NULL),
        ('image', NULL, NULL, NULL),
        ('video', NULL, NULL, NULL);
    `);

    console.log('✅ Queue database initialized:', this.dbPath);
  }

  /**
   * 작업을 큐에 추가
   */
  async enqueue(task: Omit<QueueTask, 'id' | 'status' | 'createdAt'>): Promise<QueueTask> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const newTask: QueueTask = {
      id,
      status: 'waiting',
      createdAt,
      ...task
    };

    const stmt = this.db.prepare(`
      INSERT INTO queue_tasks (
        id, type, status, priority, created_at, user_id, project_id,
        metadata, logs, retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      newTask.id,
      newTask.type,
      newTask.status,
      newTask.priority,
      newTask.createdAt,
      newTask.userId,
      newTask.projectId,
      JSON.stringify(newTask.metadata),
      JSON.stringify(newTask.logs),
      newTask.retryCount,
      newTask.maxRetries
    );

    console.log(`✅ Task enqueued: ${newTask.id} (${newTask.type})`);
    return newTask;
  }

  /**
   * 큐에서 다음 작업 가져오기 (워커용)
   * 해당 타입의 락을 획득하고 작업을 processing 상태로 변경
   */
  async dequeue(type: TaskType): Promise<QueueTask | null> {
    // 트랜잭션 시작
    const transaction = this.db.transaction(() => {
      // 1. 해당 타입의 락 확인
      const lock = this.db.prepare(`
        SELECT locked_by FROM queue_locks WHERE task_type = ?
      `).get(type) as { locked_by: string | null } | undefined;

      if (lock?.locked_by !== null) {
        // 이미 다른 작업이 처리 중
        return null;
      }

      // 2. 다음 작업 선택 (우선순위 높은 순, 생성 시간 오래된 순)
      const nextTask = this.db.prepare(`
        SELECT * FROM queue_tasks
        WHERE type = ? AND status = 'waiting'
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `).get(type) as any;

      if (!nextTask) {
        return null;
      }

      // 3. 작업 상태 업데이트: processing
      const startedAt = new Date().toISOString();
      this.db.prepare(`
        UPDATE queue_tasks
        SET status = 'processing', started_at = ?
        WHERE id = ?
      `).run(startedAt, nextTask.id);

      // 4. 락 획득
      this.db.prepare(`
        UPDATE queue_locks
        SET locked_by = ?, locked_at = ?, worker_pid = ?
        WHERE task_type = ?
      `).run(nextTask.id, startedAt, process.pid, type);

      // 5. 업데이트된 작업 반환
      return this.db.prepare('SELECT * FROM queue_tasks WHERE id = ?').get(nextTask.id) as any;
    });

    const task = transaction();

    if (task) {
      console.log(`▶️  Dequeued task: ${task.id} (${type})`);
      return this.rowToTask(task);
    }

    return null;
  }

  /**
   * 작업 완료 시 락 해제
   */
  async releaseTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    this.db.prepare(`
      UPDATE queue_locks
      SET locked_by = NULL, locked_at = NULL, worker_pid = NULL
      WHERE task_type = ? AND locked_by = ?
    `).run(task.type, taskId);

    console.log(`🔓 Lock released: ${taskId} (${task.type})`);
  }

  /**
   * 작업 취소 (waiting 상태만 가능)
   */
  async cancel(taskId: string): Promise<boolean> {
    const result = this.db.prepare(`
      UPDATE queue_tasks
      SET status = 'failed', error = 'Cancelled by user', completed_at = ?
      WHERE id = ? AND status = 'waiting'
    `).run(new Date().toISOString(), taskId);

    if (result.changes > 0) {
      console.log(`❌ Task cancelled: ${taskId}`);
      return true;
    }

    return false;
  }

  /**
   * 큐 조회 (필터링 가능)
   */
  async getQueue(options?: {
    type?: TaskType;
    status?: TaskStatus;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<QueueTask[]> {
    let query = 'SELECT * FROM queue_tasks WHERE 1=1';
    const params: any[] = [];

    if (options?.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    if (options?.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    if (options?.userId) {
      query += ' AND user_id = ?';
      params.push(options.userId);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);

      if (options?.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  /**
   * 특정 작업 조회
   */
  async getTask(taskId: string): Promise<QueueTask | null> {
    const row = this.db.prepare('SELECT * FROM queue_tasks WHERE id = ?').get(taskId) as any;
    return row ? this.rowToTask(row) : null;
  }

  /**
   * 작업 상태 업데이트
   */
  async updateTask(taskId: string, updates: Partial<QueueTask>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.startedAt !== undefined) {
      fields.push('started_at = ?');
      values.push(updates.startedAt);
    }

    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt);
    }

    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }

    if (updates.retryCount !== undefined) {
      fields.push('retry_count = ?');
      values.push(updates.retryCount);
    }

    if (updates.logs !== undefined) {
      fields.push('logs = ?');
      values.push(JSON.stringify(updates.logs));
    }

    if (fields.length === 0) {
      return;
    }

    values.push(taskId);

    this.db.prepare(`
      UPDATE queue_tasks
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    // 완료/실패 시 락 해제
    if (updates.status === 'completed' || updates.status === 'failed') {
      await this.releaseTask(taskId);
    }
  }

  /**
   * 로그 추가
   */
  async appendLog(taskId: string, log: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updatedLogs = [...task.logs, log];

    this.db.prepare(`
      UPDATE queue_tasks
      SET logs = ?
      WHERE id = ?
    `).run(JSON.stringify(updatedLogs), taskId);
  }

  /**
   * 큐 요약 정보
   */
  async getSummary(): Promise<QueueSummary> {
    const summary = {
      script: { waiting: 0, processing: 0, completed: 0, failed: 0 },
      image: { waiting: 0, processing: 0, completed: 0, failed: 0 },
      video: { waiting: 0, processing: 0, completed: 0, failed: 0 }
    };

    const rows = this.db.prepare(`
      SELECT type, status, COUNT(*) as count
      FROM queue_tasks
      GROUP BY type, status
    `).all() as Array<{ type: TaskType; status: TaskStatus; count: number }>;

    for (const row of rows) {
      summary[row.type][row.status] = row.count;
    }

    return summary;
  }

  /**
   * 큐 내 위치 계산
   */
  async getPosition(taskId: string): Promise<number | null> {
    const task = await this.getTask(taskId);
    if (!task || task.status !== 'waiting') {
      return null;
    }

    const result = this.db.prepare(`
      SELECT COUNT(*) as position
      FROM queue_tasks
      WHERE type = ?
        AND status = 'waiting'
        AND (priority > ? OR (priority = ? AND created_at < ?))
    `).get(task.type, task.priority, task.priority, task.createdAt) as { position: number };

    return result.position;
  }

  /**
   * 오래된 완료/실패 작업 정리
   */
  async cleanup(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = this.db.prepare(`
      DELETE FROM queue_tasks
      WHERE status IN ('completed', 'failed')
        AND completed_at < ?
    `).run(cutoffDate.toISOString());

    console.log(`🗑️  Cleaned up ${result.changes} old tasks (older than ${daysOld} days)`);
    return result.changes;
  }

  /**
   * 헬스 체크: stuck tasks 감지
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    stuckTasks: Array<{ id: string; type: TaskType; startedAt: string }>;
  }> {
    const tenMinutesAgo = new Date();
    tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

    const stuckTasksRaw = this.db.prepare(`
      SELECT id, type, started_at
      FROM queue_tasks
      WHERE status = 'processing'
        AND started_at < ?
    `).all(tenMinutesAgo.toISOString()) as Array<{ id: string; type: TaskType; started_at: string }>;

    const stuckTasks = stuckTasksRaw.map(task => ({
      id: task.id,
      type: task.type,
      startedAt: task.started_at
    }));

    return {
      healthy: stuckTasks.length === 0,
      stuckTasks
    };
  }

  /**
   * DB row를 QueueTask 객체로 변환
   */
  private rowToTask(row: any): QueueTask {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      userId: row.user_id,
      projectId: row.project_id,
      metadata: JSON.parse(row.metadata || '{}'),
      logs: JSON.parse(row.logs || '[]'),
      error: row.error || undefined,
      retryCount: row.retry_count,
      maxRetries: row.max_retries
    };
  }

  /**
   * 연결 종료
   */
  close() {
    this.db.close();
  }
}
