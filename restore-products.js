const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

try {
  // published 상태인 상품을 active로 복구
  const result = db.prepare('UPDATE coupang_products SET status = ? WHERE status = ?').run('active', 'published');
  console.log('✅ 복구된 상품 수:', result.changes);

  // 전체 상품 확인
  const products = db.prepare('SELECT id, title, status FROM coupang_products').all();
  console.log('\n📦 전체 상품 목록:');
  products.forEach(p => {
    console.log(`  - ${p.title} (${p.status})`);
  });

  console.log('\n✅ 모든 상품 복구 완료!');
} catch (error) {
  console.error('❌ 복구 실패:', error);
} finally {
  db.close();
}
