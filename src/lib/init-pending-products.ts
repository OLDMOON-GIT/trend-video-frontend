import db from './sqlite';

/**
 * 대기 목록 테이블 생성
 * - 외부 사이트에서 크롤링한 상품들의 대기 목록
 * - 나중에 영상이 준비되면 coupang_products로 이동
 */
export function initPendingProductsTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_products (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        product_url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        image_url TEXT,
        original_price INTEGER,
        discount_price INTEGER,
        category TEXT,
        status TEXT DEFAULT 'pending',
        crawl_status TEXT DEFAULT 'not_crawled',
        notes TEXT,
        video_ready BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // crawl_status 필드가 없는 경우 추가 (기존 테이블 업데이트)
    try {
      db.exec(`ALTER TABLE pending_products ADD COLUMN crawl_status TEXT DEFAULT 'not_crawled'`);
      console.log('✅ crawl_status 필드 추가 완료');
    } catch (alterError) {
      // 이미 존재하면 무시
    }

    // 인덱스 생성
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pending_products_user_id ON pending_products(user_id);
      CREATE INDEX IF NOT EXISTS idx_pending_products_status ON pending_products(status);
      CREATE INDEX IF NOT EXISTS idx_pending_products_crawl_status ON pending_products(crawl_status);
      CREATE INDEX IF NOT EXISTS idx_pending_products_video_ready ON pending_products(video_ready);
    `);

    console.log('✅ pending_products 테이블 생성 완료');
  } catch (error) {
    console.error('❌ pending_products 테이블 생성 실패:', error);
    throw error;
  }
}

// 앱 시작 시 자동 실행
if (require.main === module) {
  initPendingProductsTable();
}
