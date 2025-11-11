-- 쿠팡 상품 크롤링 큐 테이블
CREATE TABLE IF NOT EXISTS coupang_crawl_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, processing, done, failed
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 60,  -- 첫 시도는 60초
  error_message TEXT,
  product_info TEXT,  -- JSON 형태로 크롤링된 정보 저장
  custom_category TEXT,  -- 사용자 지정 카테고리
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,  -- 처리 완료 시간
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coupang_crawl_queue_user_id ON coupang_crawl_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_coupang_crawl_queue_status ON coupang_crawl_queue(status);
CREATE INDEX IF NOT EXISTS idx_coupang_crawl_queue_created_at ON coupang_crawl_queue(created_at);
