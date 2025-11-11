// contents 테이블에 'product' 포맷 추가 마이그레이션
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(DB_PATH);

console.log('🔄 contents 테이블 마이그레이션 시작...');

try {
  // 현재 테이블 구조 확인
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='contents'").get();

  if (!tableInfo) {
    console.log('❌ contents 테이블을 찾을 수 없습니다.');
    process.exit(1);
  }

  console.log('📋 현재 테이블 구조:');
  console.log(tableInfo.sql);

  if (tableInfo.sql.includes("'product'")) {
    console.log('✅ 이미 product 포맷이 추가되어 있습니다.');
    process.exit(0);
  }

  // 트랜잭션 시작
  db.exec('BEGIN TRANSACTION');

  console.log('📦 1. 기존 데이터 백업 중...');
  db.exec('CREATE TABLE contents_backup AS SELECT * FROM contents');

  console.log('🗑️ 2. 기존 테이블 삭제 중...');
  db.exec('DROP TABLE contents');

  console.log('🔨 3. 새 스키마로 테이블 재생성 중...');
  db.exec(`
    CREATE TABLE contents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('script', 'video')),
      format TEXT CHECK(format IN ('longform', 'shortform', 'sora2', 'product')),
      title TEXT NOT NULL,
      original_title TEXT,
      content TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
      progress INTEGER DEFAULT 0,
      error TEXT,
      pid INTEGER,
      video_path TEXT,
      thumbnail_path TEXT,
      published INTEGER DEFAULT 0,
      published_at TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      use_claude_local INTEGER DEFAULT 0,
      source_content_id TEXT,
      conversion_type TEXT,
      is_regenerated INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('📥 4. 데이터 복원 중...');
  db.exec('INSERT INTO contents SELECT * FROM contents_backup');

  console.log('🗑️ 5. 백업 테이블 삭제 중...');
  db.exec('DROP TABLE contents_backup');

  console.log('🔍 6. 인덱스 재생성 중...');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contents_user_id ON contents(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contents_format ON contents(format)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_contents_published ON contents(published)');

  // 트랜잭션 커밋
  db.exec('COMMIT');

  console.log('✅ 마이그레이션 완료!');

  // 결과 확인
  const newTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='contents'").get();
  console.log('\n📋 새 테이블 구조:');
  console.log(newTableInfo.sql);

} catch (error) {
  console.error('❌ 마이그레이션 실패:', error.message);
  try {
    db.exec('ROLLBACK');
    console.log('🔄 롤백 완료');
  } catch (e) {
    console.error('❌ 롤백 실패:', e.message);
  }
  process.exit(1);
} finally {
  db.close();
}
