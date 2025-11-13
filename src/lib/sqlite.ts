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

// ⛔ CRITICAL: DB 마이그레이션 - 위험한 작업 금지!
// 버그 이력: 2025-01-12 - DROP TABLE로 데이터 완전 손실 (207 jobs, 333 contents 날아감)
//
// ❌ 절대 금지:
//   - DROP TABLE (데이터 손실!)
//   - DELETE FROM ... (대량 삭제)
//   - TRUNCATE (데이터 삭제)
//
// ✅ 허용:
//   - ALTER TABLE ... ADD COLUMN (컬럼 추가)
//   - CREATE TABLE IF NOT EXISTS (새 테이블)
//   - UPDATE (조건부 수정)
//
// 관련 문서: CRITICAL_FEATURES.md
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

  // jobs 테이블에 source_content_id 컬럼 추가
  try {
    db.exec(`ALTER TABLE jobs ADD COLUMN source_content_id TEXT`);
    console.log('✅ jobs.source_content_id 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ jobs.source_content_id 컬럼 추가 실패:', e.message);
    }
  }

  // jobs 테이블에 tts_voice 컬럼 추가
  try {
    db.exec(`ALTER TABLE jobs ADD COLUMN tts_voice TEXT`);
    console.log('✅ jobs.tts_voice 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ jobs.tts_voice 컬럼 추가 실패:', e.message);
    }
  }

  // jobs 테이블에 video_path 컬럼 추가
  try {
    db.exec(`ALTER TABLE jobs ADD COLUMN video_path TEXT`);
    console.log('✅ jobs.video_path 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ jobs.video_path 컬럼 추가 실패:', e.message);
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

  // contents 테이블 생성 (통합된 대본/영상 테이블)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('script', 'video')),
        format TEXT CHECK(format IN ('longform', 'shortform', 'sora2', 'product', 'product-info')),
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
        model TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_user_id ON contents(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_format ON contents(format)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contents_published ON contents(published)`);
    console.log('✅ contents 테이블 생성 완료');
  } catch (e: any) {
    if (!e.message.includes('already exists')) {
      console.error('❌ contents 테이블 생성 실패:', e.message);
    }
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

  // users 테이블에 google_sites_edit_url 컬럼 추가 (편집용 URL)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN google_sites_edit_url TEXT`);
    console.log('✅ users.google_sites_edit_url 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ users.google_sites_edit_url 컬럼 추가 실패:', e.message);
    }
  }

  // users 테이블에 google_sites_home_url 컬럼 추가 (실제 사이트 홈 URL)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN google_sites_home_url TEXT`);
    console.log('✅ users.google_sites_home_url 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ users.google_sites_home_url 컬럼 추가 실패:', e.message);
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

  // ⚠️ 위험한 DROP TABLE 마이그레이션 제거됨
  // contents 테이블 스키마는 schema-sqlite.sql에서 관리
  // CHECK constraint 변경이 필요하면 ALTER TABLE 사용 (DROP TABLE 금지)

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

  // coupang_products 테이블에 is_favorite 컬럼 추가 (즐겨찾기)
  try {
    db.exec(`ALTER TABLE coupang_products ADD COLUMN is_favorite INTEGER DEFAULT 0`);
    console.log('✅ coupang_products.is_favorite 컬럼 추가 완료');
  } catch (e: any) {
    if (!e.message.includes('duplicate column')) {
      console.error('❌ coupang_products.is_favorite 컬럼 추가 실패:', e.message);
    }
  }

  // social_media_accounts 테이블 생성 (TikTok, Instagram, Facebook 계정 관리)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS social_media_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('tiktok', 'instagram', 'facebook')),
        account_id TEXT NOT NULL,
        username TEXT,
        display_name TEXT,
        profile_picture TEXT,
        follower_count INTEGER DEFAULT 0,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expires_at TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, platform, account_id)
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_social_media_accounts_user_id ON social_media_accounts(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_social_media_accounts_platform ON social_media_accounts(platform)`);
    console.log('✅ social_media_accounts 테이블 생성 완료');
  } catch (e: any) {
    console.error('❌ social_media_accounts 테이블 생성 실패:', e.message);
  }

  // social_media_uploads 테이블 생성 (소셜미디어 업로드 기록)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS social_media_uploads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        job_id TEXT,
        platform TEXT NOT NULL CHECK(platform IN ('tiktok', 'instagram', 'facebook')),
        post_id TEXT NOT NULL,
        post_url TEXT,
        title TEXT,
        description TEXT,
        thumbnail_url TEXT,
        account_id TEXT NOT NULL,
        account_username TEXT,
        privacy_status TEXT,
        published_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES social_media_accounts(id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_social_media_uploads_user_id ON social_media_uploads(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_social_media_uploads_platform ON social_media_uploads(platform)`);
    console.log('✅ social_media_uploads 테이블 생성 완료');
  } catch (e: any) {
    console.error('❌ social_media_uploads 테이블 생성 실패:', e.message);
  }

  // scripts 테이블 데이터를 contents 테이블로 마이그레이션
  try {
    const scriptsCount = db.prepare('SELECT COUNT(*) as count FROM scripts').get() as { count: number };
    const contentsScriptsCount = db.prepare("SELECT COUNT(*) as count FROM contents WHERE type = 'script'").get() as { count: number };

    if (scriptsCount.count > 0 && contentsScriptsCount.count === 0) {
      const scripts = db.prepare('SELECT * FROM scripts').all();
      const insertStmt = db.prepare(`
        INSERT INTO contents (
          id, user_id, type, title, content, status, created_at, updated_at,
          input_tokens, output_tokens, format
        ) VALUES (?, ?, 'script', ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const script of scripts as any[]) {
        insertStmt.run(
          script.id,
          script.user_id,
          script.title,
          script.content,
          script.status || 'completed',
          script.created_at,
          script.updated_at,
          script.input_tokens || null,
          script.output_tokens || null,
          script.type || 'longform'
        );
      }

      console.log(`✅ scripts 테이블에서 ${scriptsCount.count}개 대본을 contents로 마이그레이션 완료`);
    }
  } catch (e: any) {
    console.error('❌ scripts → contents 마이그레이션 실패:', e.message);
  }

  // jobs 테이블 데이터를 contents 테이블로 마이그레이션
  try {
    const jobsCount = db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number };
    const contentsVideosCount = db.prepare("SELECT COUNT(*) as count FROM contents WHERE type = 'video'").get() as { count: number };

    if (jobsCount.count > 0 && contentsVideosCount.count === 0) {
      const jobs = db.prepare('SELECT * FROM jobs').all();
      const insertStmt = db.prepare(`
        INSERT INTO contents (
          id, user_id, type, title, status, progress, created_at, updated_at,
          video_path, thumbnail_path, format, error
        ) VALUES (?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const job of jobs as any[]) {
        insertStmt.run(
          job.id,
          job.user_id,
          job.title || '제목 없음',
          job.status || 'pending',
          job.progress || 0,
          job.created_at,
          job.updated_at,
          job.video_path || job.video_url || null,
          job.thumbnail_path || null,
          job.type || 'longform',
          job.error || null
        );
      }

      console.log(`✅ jobs 테이블에서 ${jobsCount.count}개 영상을 contents로 마이그레이션 완료`);
    }
  } catch (e: any) {
    console.error('❌ jobs → contents 마이그레이션 실패:', e.message);
  }
}

// 초기화 실행
try {
  initializeSchema();
  runMigrations();
} catch (error: any) {
  console.error('❌ SQLite 초기화 오류:', error.message);
}

// getDb 함수 export (named export)
export const getDb = () => db;

export default db;
