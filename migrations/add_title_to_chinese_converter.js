/**
 * Migration: chinese_converter_jobs 테이블에 title 컬럼 추가
 * Date: 2025-01-20
 */

const Database = require('better-sqlite3');
const path = require('path');

// 실제 사용하는 DB 경로 (data/database.sqlite)
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('📂 DB 경로:', dbPath);

try {
  console.log('🔄 Migration 시작: chinese_converter_jobs 테이블 생성 및 title 컬럼 확인');

  // 테이블이 존재하는지 확인
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='chinese_converter_jobs'
  `).get();

  if (!tableExists) {
    console.log('📋 테이블이 없습니다. 테이블을 생성합니다...');

    // 테이블 생성
    db.prepare(`
      CREATE TABLE chinese_converter_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        video_path TEXT,
        output_path TEXT,
        error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    console.log('✅ chinese_converter_jobs 테이블 생성 완료 (title 포함)');

    // 인덱스 생성
    db.prepare('CREATE INDEX IF NOT EXISTS idx_chinese_converter_jobs_user_id ON chinese_converter_jobs(user_id)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_chinese_converter_jobs_status ON chinese_converter_jobs(status)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_chinese_converter_jobs_created_at ON chinese_converter_jobs(created_at)').run();

    console.log('✅ 인덱스 생성 완료');

    // 로그 테이블도 생성
    const logTableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='chinese_converter_job_logs'
    `).get();

    if (!logTableExists) {
      db.prepare(`
        CREATE TABLE chinese_converter_job_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT NOT NULL,
          log_message TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (job_id) REFERENCES chinese_converter_jobs(id) ON DELETE CASCADE
        )
      `).run();

      db.prepare('CREATE INDEX IF NOT EXISTS idx_chinese_converter_job_logs_job_id ON chinese_converter_job_logs(job_id)').run();

      console.log('✅ chinese_converter_job_logs 테이블 생성 완료');
    }
  } else {
    console.log('✅ 테이블이 존재합니다. title 컬럼 확인 중...');

    // title 컬럼이 이미 존재하는지 확인
    const tableInfo = db.prepare("PRAGMA table_info(chinese_converter_jobs)").all();
    const titleExists = tableInfo.some(col => col.name === 'title');

    if (titleExists) {
      console.log('✅ title 컬럼이 이미 존재합니다.');
    } else {
      // title 컬럼 추가
      db.prepare('ALTER TABLE chinese_converter_jobs ADD COLUMN title TEXT').run();
      console.log('✅ title 컬럼 추가 완료');
    }
  }

  console.log('✅ Migration 완료');
} catch (error) {
  console.error('❌ Migration 실패:', error);
  process.exit(1);
} finally {
  db.close();
}
