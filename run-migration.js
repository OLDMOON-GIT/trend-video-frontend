/**
 * 마이그레이션 실행 스크립트
 * 사용법: node run-migration.js migrations/001_create_coupang_crawl_queue.sql
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

// 커맨드라인 인자에서 마이그레이션 파일 경로 가져오기
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('❌ 마이그레이션 파일을 지정해주세요.');
  console.log('사용법: node run-migration.js migrations/001_create_coupang_crawl_queue.sql');
  process.exit(1);
}

const migrationPath = path.join(__dirname, migrationFile);

if (!fs.existsSync(migrationPath)) {
  console.error('❌ 마이그레이션 파일을 찾을 수 없습니다:', migrationPath);
  process.exit(1);
}

console.log('🔄 마이그레이션 실행:', migrationFile);

try {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // SQL 문장을 세미콜론으로 분리하여 실행
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  db.transaction(() => {
    for (const statement of statements) {
      console.log('📝 실행:', statement.substring(0, 100) + '...');
      db.exec(statement);
    }
  })();

  console.log('✅ 마이그레이션 완료!');

  // 테이블 목록 확인
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `).all();

  console.log('\n📋 현재 테이블 목록:');
  tables.forEach(t => console.log('  -', t.name));

} catch (error) {
  console.error('❌ 마이그레이션 실패:', error);
  process.exit(1);
} finally {
  db.close();
}
