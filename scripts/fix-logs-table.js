const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('🔧 Fixing automation_logs table...');

// 백업 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS automation_logs_backup AS
  SELECT * FROM automation_logs;
`);

console.log('✅ Backup created');

// 기존 테이블 삭제
db.exec(`DROP TABLE IF EXISTS automation_logs;`);

console.log('✅ Old table dropped');

// 새 테이블 생성 (old_message nullable)
db.exec(`
  CREATE TABLE automation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id TEXT NOT NULL,
    log_level TEXT NOT NULL CHECK(log_level IN ('info', 'warn', 'error', 'debug')),
    message TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    title_id TEXT,
    level TEXT DEFAULT 'info',
    details TEXT
  );
`);

console.log('✅ New table created');

// 데이터 복원 시도
try {
  db.exec(`
    INSERT INTO automation_logs (id, pipeline_id, log_level, message, metadata, created_at, title_id, level, details)
    SELECT id, pipeline_id, log_level,
           COALESCE(message, old_message) as message,
           metadata, created_at, title_id, level, details
    FROM automation_logs_backup;
  `);
  console.log('✅ Data restored');
} catch (error) {
  console.log('ℹ️ No data to restore (table was empty)');
}

// 백업 테이블 삭제
db.exec(`DROP TABLE IF EXISTS automation_logs_backup;`);

console.log('✅ Backup table removed');
console.log('🎉 automation_logs table fixed successfully!');

db.close();
