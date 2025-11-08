-- coupang_products 테이블에 queue_id 컬럼 추가
ALTER TABLE coupang_products ADD COLUMN queue_id TEXT;

CREATE INDEX IF NOT EXISTS idx_coupang_products_queue_id ON coupang_products(queue_id);
