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

  // chinese_converter_jobs 테이블에 title 컬럼 추가
  try {
    db.exec(`ALTER TABLE chinese_converter_jobs ADD COLUMN title TEXT`);
    console.log('✅ chinese_converter_jobs.title 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ chinese_converter_jobs.title 컬럼 추가 실패:', e.message);
    }
  }

  // wordpress_settings 테이블 생성
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS wordpress_settings (
        user_id TEXT PRIMARY KEY,
        site_url TEXT NOT NULL,
        username TEXT NOT NULL,
        app_password TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    // 로그 제거 (IF NOT EXISTS이므로 매번 실행되지만 실제 생성은 최초 1회만)
  } catch (e: any) {
    console.error('❌ wordpress_settings 테이블 생성 실패:', e.message);
  }

  // wordpress_oauth_tokens 테이블 생성
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS wordpress_oauth_tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        blog_id TEXT NOT NULL,
        blog_url TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    // 로그 제거
  } catch (e: any) {
    console.error('❌ wordpress_oauth_tokens 테이블 생성 실패:', e.message);
  }

  // coupang_products 테이블 생성 (쿠팡 쇼핑몰 상품)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS coupang_products (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_url TEXT NOT NULL,
        deep_link TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        original_price REAL,
        discount_price REAL,
        image_url TEXT,
        status TEXT DEFAULT 'active',
        view_count INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    // 로그 제거
  } catch (e: any) {
    console.error('❌ coupang_products 테이블 생성 실패:', e.message);
  }

  // 카테고리별 인덱스 생성 (빠른 검색)
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_coupang_products_category ON coupang_products(category)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_coupang_products_status ON coupang_products(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_coupang_products_user_id ON coupang_products(user_id)`);
    // 로그 제거
  } catch (e: any) {
    console.error('❌ coupang_products 인덱스 생성 실패:', e.message);
  }

  // users 테이블에 google_sites_url 컬럼 추가
  try {
    db.exec(`ALTER TABLE users ADD COLUMN google_sites_url TEXT`);
    console.log('✅ users.google_sites_url 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ users.google_sites_url 컬럼 추가 실패:', e.message);
    }
  }

  // users 테이블에 nickname 컬럼 추가
  try {
    db.exec(`ALTER TABLE users ADD COLUMN nickname TEXT`);
    console.log('✅ users.nickname 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ users.nickname 컬럼 추가 실패:', e.message);
    }
  }

  // crawled_product_links 테이블 생성 (크롤링된 상품 대기 목록)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crawled_product_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_url TEXT NOT NULL,
        source_url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        category TEXT,
        image_url TEXT,
        original_price REAL,
        discount_price REAL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    // 로그 제거
  } catch (e: any) {
    console.error('❌ crawled_product_links 테이블 생성 실패:', e.message);
  }

  // crawled_product_links 테이블에 가격 컬럼 추가 (기존 DB 대응)
  try {
    db.exec(`ALTER TABLE crawled_product_links ADD COLUMN original_price REAL`);
    console.log('✅ crawled_product_links.original_price 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ crawled_product_links.original_price 컬럼 추가 실패:', e.message);
    }
  }

  try {
    db.exec(`ALTER TABLE crawled_product_links ADD COLUMN discount_price REAL`);
    console.log('✅ crawled_product_links.discount_price 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ crawled_product_links.discount_price 컬럼 추가 실패:', e.message);
    }
  }

  // 링크 모음 크롤링 히스토리 테이블
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_link_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        hostname TEXT,
        last_result_count INTEGER DEFAULT 0,
        last_duplicate_count INTEGER DEFAULT 0,
        last_error_count INTEGER DEFAULT 0,
        last_total_links INTEGER DEFAULT 0,
        last_status TEXT DEFAULT 'pending',
        last_message TEXT,
        last_job_id TEXT,
        last_crawled_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_link_history_user_source ON crawl_link_history(user_id, source_url)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_crawl_link_history_last_crawled ON crawl_link_history(last_crawled_at)`);
    // 로그 제거
  } catch (e: any) {
    console.error('❌ crawl_link_history 테이블 생성 실패:', e.message);
  }

  // 쇼핑몰 배포 버전 기록 테이블
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_versions (
        id TEXT PRIMARY KEY,
        version_number INTEGER,
        name TEXT,
        description TEXT,
        data TEXT NOT NULL,
        total_products INTEGER DEFAULT 0,
        is_published INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        published_at TEXT
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_versions_created_at ON shop_versions(created_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_versions_published ON shop_versions(is_published, published_at)`);
    // 로그 제거
  } catch (e: any) {
    console.error('❌ shop_versions 테이블 생성 실패:', e.message);
  }

  // shop_versions 테이블에 git_commit_hash 컬럼 추가
  try {
    db.exec(`ALTER TABLE shop_versions ADD COLUMN git_commit_hash TEXT`);
    console.log('✅ shop_versions.git_commit_hash 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ shop_versions.git_commit_hash 컬럼 추가 실패:', e.message);
    }
  }

  // contents 테이블에 'product' 포맷 추가 (CHECK constraint 업데이트)
  try {
    // CHECK constraint 확인
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='contents'").get() as any;

    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'product'")) {
      console.log('🔄 contents 테이블에 product 포맷 추가 중...');

      // 백업 테이블 생성
      db.exec(`
        CREATE TABLE IF NOT EXISTS contents_backup AS SELECT * FROM contents;
      `);

      // 기존 테이블 삭제
      db.exec(`DROP TABLE IF EXISTS contents;`);

      // 새 스키마로 테이블 재생성
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
        );
      `);

      // 데이터 복원
      db.exec(`
        INSERT INTO contents SELECT * FROM contents_backup;
      `);

      // 백업 테이블 삭제
      db.exec(`DROP TABLE contents_backup;`);

      // 인덱스 재생성
      db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_user_id ON contents(user_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_format ON contents(format)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_published ON contents(published)`);

      console.log('✅ contents 테이블에 product 포맷 추가 완료');
    }
  } catch (e: any) {
    console.error('❌ contents 테이블 마이그레이션 실패:', e.message);
  }

  // coupang_crawl_queue 테이블에 destination 컬럼 추가
  try {
    db.exec(`ALTER TABLE coupang_crawl_queue ADD COLUMN destination TEXT DEFAULT 'my_list'`);
    console.log('✅ coupang_crawl_queue.destination 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ coupang_crawl_queue.destination 컬럼 추가 실패:', e.message);
    }
  }

  // coupang_crawl_queue 테이블에 source_url 컬럼 추가 (링크 모음 출처)
  try {
    db.exec(`ALTER TABLE coupang_crawl_queue ADD COLUMN source_url TEXT`);
    console.log('✅ coupang_crawl_queue.source_url 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ coupang_crawl_queue.source_url 컬럼 추가 실패:', e.message);
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
