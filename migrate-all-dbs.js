// 모든 database.sqlite 파일에 'product' 포맷 추가
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPaths = [
  path.join(__dirname, 'data', 'database.sqlite'),
  path.join(__dirname, 'database.sqlite')
];

function migrateDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`⏭️ 건너뜀: ${dbPath} (파일 없음)`);
    return;
  }

  console.log(`\n🔄 마이그레이션 시작: ${dbPath}`);
  const db = new Database(dbPath);

  try {
    // 현재 테이블 구조 확인
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='contents'").get();

    if (!tableInfo) {
      console.log('  ⏭️ contents 테이블 없음');
      db.close();
      return;
    }

    if (tableInfo.sql.includes("'product'")) {
      console.log('  ✅ 이미 product 포맷 있음');
      db.close();
      return;
    }

    // 트랜잭션 시작
    db.exec('BEGIN TRANSACTION');

    console.log('  📦 백업 중...');
    db.exec('CREATE TABLE contents_backup AS SELECT * FROM contents');

    console.log('  🗑️ 삭제 중...');
    db.exec('DROP TABLE contents');

    console.log('  🔨 재생성 중...');
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

    console.log('  📥 복원 중...');
    db.exec('INSERT INTO contents SELECT * FROM contents_backup');

    console.log('  🗑️ 백업 삭제 중...');
    db.exec('DROP TABLE contents_backup');

    console.log('  🔍 인덱스 재생성 중...');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_user_id ON contents(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_format ON contents(format)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_published ON contents(published)');

    db.exec('COMMIT');
    console.log('  ✅ 완료!');

  } catch (error) {
    console.error('  ❌ 실패:', error.message);
    try {
      db.exec('ROLLBACK');
    } catch (e) {}
  } finally {
    db.close();
  }
}

console.log('🚀 모든 DB 마이그레이션 시작...\n');

dbPaths.forEach(migrateDb);

console.log('\n✅ 전체 마이그레이션 완료!');
