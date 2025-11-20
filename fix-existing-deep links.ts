/**
 * 기존 DB의 잘못된 deep_link를 모두 수정하는 스크립트
 *
 * 사용법:
 * npx tsx fix-existing-deeplinks.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import { generateDeeplink, loadUserSettings } from './src/lib/coupang-deeplink';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

async function fixAllDeepLinks() {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  console.log('🔍 잘못된 딥링크를 가진 상품 검색 중...\n');

  // 긴 affiliate 링크를 deep_link로 가지고 있는 상품들 찾기
  const products = db.prepare(`
    SELECT id, user_id, product_url, deep_link, title
    FROM coupang_products
    WHERE deep_link LIKE '%link.coupang.com/re/%'
       OR deep_link LIKE '%?lptag=%'
       OR deep_link LIKE '%&pageKey=%'
    ORDER BY created_at DESC
  `).all() as any[];

  console.log(`📊 총 ${products.length}개 상품의 딥링크를 수정해야 합니다.\n`);

  if (products.length === 0) {
    console.log('✅ 수정할 상품이 없습니다!');
    db.close();
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const progress = `[${i + 1}/${products.length}]`;

    console.log(`${progress} 처리 중: ${product.title.substring(0, 50)}...`);
    console.log(`  현재 딥링크: ${product.deep_link.substring(0, 80)}...`);

    try {
      // 사용자 설정 로드
      const settings = await loadUserSettings(product.user_id);

      if (!settings || !settings.accessKey || !settings.secretKey) {
        console.log(`  ⏭️  스킵: 사용자 API 키 없음`);
        skipCount++;
        continue;
      }

      // 딥링크 재생성
      const newDeepLink = await generateDeeplink(
        product.product_url,
        settings.accessKey,
        settings.secretKey
      );

      // DB 업데이트
      db.prepare(`
        UPDATE coupang_products
        SET deep_link = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newDeepLink, product.id);

      console.log(`  ✅ 성공: ${newDeepLink}`);
      successCount++;

    } catch (error: any) {
      console.log(`  ❌ 실패: ${error.message}`);
      failCount++;
    }

    console.log('');

    // API 요청 제한 방지를 위해 0.5초 대기
    if (i < products.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  db.close();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 최종 결과:');
  console.log(`  ✅ 성공: ${successCount}개`);
  console.log(`  ❌ 실패: ${failCount}개`);
  console.log(`  ⏭️  스킵: ${skipCount}개`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (successCount > 0) {
    console.log('✅ 딥링크 수정 완료! 이제 자동화에서 올바른 짧은 링크가 사용됩니다.');
  }
}

// 스크립트 실행
fixAllDeepLinks().catch(error => {
  console.error('❌ 스크립트 실행 실패:', error);
  process.exit(1);
});
