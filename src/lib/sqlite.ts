import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 데이터 디렉토리 경로
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

// 데이터 디렉토리 생성
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// SQLite 데이터베이스 연결
const db = new Database(DB_PATH);

// WAL 모드 활성화 (더 나은 동시성)
db.pragma('journal_mode = WAL');

// 외래 키 제약 조건 활성화
db.pragma('foreign_keys = ON');

// 스키마 초기화
function initializeSchema() {
  const schemaPath = path.join(process.cwd(), 'schema-sqlite.sql');

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('✅ SQLite 데이터베이스 초기화 완료');
  } else {
    console.warn('⚠️  schema-sqlite.sql 파일을 찾을 수 없습니다.');
  }
}

// 마이그레이션 실행
function runMigrations() {
  // jobs 테이블에 type 컬럼 추가 (기존 테이블에 없을 경우)
  try {
    db.exec(`ALTER TABLE jobs ADD COLUMN type TEXT`);
    console.log('✅ jobs.type 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ jobs.type 컬럼 추가 실패:', e.message);
    }
  }
}

// 초기화 실행
try {
  initializeSchema();
  runMigrations();
} catch (error: any) {
  console.error('❌ SQLite 초기화 오류:', error.message);
}

export default db;
