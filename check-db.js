const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('📊 DB 확인 중...\n');

// 1. contents 테이블 스키마 확인
console.log('1️⃣ contents 테이블 스키마:');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='contents'").get();
console.log(schema?.sql || '테이블 없음');
console.log('\n');

// 2. 데이터 개수 확인
console.log('2️⃣ 데이터 개수:');
const counts = db.prepare(`
  SELECT
    COUNT(*) as total,
    type,
    format,
    status
  FROM contents
  GROUP BY type, format, status
`).all();
console.table(counts);
console.log('\n');

// 3. 최근 5개 항목 확인
console.log('3️⃣ 최근 5개 항목:');
const recent = db.prepare(`
  SELECT id, type, format, title, status, created_at
  FROM contents
  ORDER BY created_at DESC
  LIMIT 5
`).all();
console.table(recent);
console.log('\n');

// 4. contents_backup 테이블 확인
console.log('4️⃣ contents_backup 테이블 확인:');
try {
  const backupCount = db.prepare("SELECT COUNT(*) as count FROM contents_backup").get();
  console.log('백업 테이블 존재! 데이터 개수:', backupCount.count);

  const backupData = db.prepare("SELECT * FROM contents_backup LIMIT 3").all();
  console.table(backupData);
} catch (e) {
  console.log('백업 테이블 없음 (정상)');
}

db.close();
