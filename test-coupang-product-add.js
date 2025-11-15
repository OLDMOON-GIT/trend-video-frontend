/**
 * 쿠팡 상품 등록 API 테스트
 */
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const userId = 'b5d1f064-60b9-45ab-9bcd-d36948196459';

console.log('='.repeat(60));
console.log('쿠팡 상품 등록 API 로직 테스트');
console.log('='.repeat(60));

// 테스트 상품 데이터
const testProducts = [
  {
    productId: 'TEST_001',
    productName: '테스트 상품 1',
    productPrice: 10000,
    productImage: 'https://example.com/image1.jpg',
    productUrl: 'https://link.coupang.com/test1',
    categoryName: '테스트 카테고리',
    isRocket: true
  },
  {
    productId: 'TEST_002',
    productName: '테스트 상품 2',
    productPrice: 20000,
    productImage: 'https://example.com/image2.jpg',
    productUrl: 'https://link.coupang.com/test2',
    categoryName: '테스트 카테고리',
    isRocket: false
  }
];

console.log(`\n📦 테스트 상품: ${testProducts.length}개`);

try {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  console.log('\n✅ 데이터베이스 연결 성공');

  // 스키마 확인
  console.log('\n📋 테이블 스키마 확인:');
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='coupang_products'").get();
  if (schema) {
    console.log('   ✅ coupang_products 테이블 존재');
  } else {
    console.log('   ❌ coupang_products 테이블 없음');
    db.close();
    process.exit(1);
  }

  let addedCount = 0;
  let skippedCount = 0;

  for (const product of testProducts) {
    // 중복 체크
    const existing = db.prepare(`
      SELECT id FROM coupang_products
      WHERE product_url = ? AND user_id = ?
    `).get(product.productUrl, userId);

    if (existing) {
      console.log(`   ⏭️  중복: ${product.productName}`);
      skippedCount++;
      continue;
    }

    // 고유 ID 생성
    const productId = `coupang_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    // 상품 등록
    try {
      db.prepare(`
        INSERT INTO coupang_products (
          id,
          user_id,
          product_url,
          deep_link,
          title,
          description,
          category,
          original_price,
          discount_price,
          image_url,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        productId,
        userId,
        product.productUrl,
        product.productUrl,
        product.productName,
        `${product.productName} - ${product.categoryName}`,
        product.categoryName || '기타',
        product.productPrice,
        product.productPrice,
        product.productImage,
        'active'
      );

      console.log(`   ✅ 등록: ${product.productName}`);
      addedCount++;
    } catch (insertError) {
      console.error(`   ❌ 등록 실패: ${product.productName}`, insertError.message);
    }
  }

  // 결과 확인
  const totalProducts = db.prepare(`
    SELECT COUNT(*) as count FROM coupang_products WHERE user_id = ?
  `).get(userId);

  console.log('\n' + '='.repeat(60));
  console.log(`테스트 결과:`);
  console.log(`   추가됨: ${addedCount}개`);
  console.log(`   중복: ${skippedCount}개`);
  console.log(`   총 상품: ${totalProducts.count}개`);
  console.log('='.repeat(60));

  // 테스트 데이터 정리 (선택사항)
  console.log('\n🧹 테스트 데이터 정리 중...');
  const deleted = db.prepare(`
    DELETE FROM coupang_products
    WHERE product_url LIKE 'https://link.coupang.com/test%' AND user_id = ?
  `).run(userId);
  console.log(`   ✅ ${deleted.changes}개 테스트 상품 삭제됨`);

  db.close();
  console.log('\n✅ 테스트 완료!\n');
  process.exit(0);

} catch (error) {
  console.error('\n❌ 테스트 실패:', error.message);
  console.error(error.stack);
  process.exit(1);
}
