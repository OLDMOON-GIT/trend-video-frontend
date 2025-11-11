/**
 * Product Info DB 반정규화 Regression Test
 *
 * 테스트 항목:
 * 1. contents 테이블에 product_info 컬럼 존재 확인
 * 2. scripts 테이블에 product_info 컬럼 존재 확인
 * 3. product_info JSON 저장/파싱 테스트
 * 4. 상품 대본 생성 및 조회 테스트
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(color, msg) {
  console.log(`${c[color]}${msg}${c.reset}`);
}

function assertExists(value, name) {
  if (!value) {
    throw new Error(`❌ ${name} does not exist`);
  }
  log('green', `✅ ${name} exists`);
}

function assertEqual(actual, expected, name) {
  if (actual !== expected) {
    throw new Error(`❌ ${name} mismatch: expected ${expected}, got ${actual}`);
  }
  log('green', `✅ ${name} matches: ${actual}`);
}

async function runTest() {
  log('cyan', '\n' + '='.repeat(60));
  log('cyan', '  Product Info DB 반정규화 Regression Test');
  log('cyan', '='.repeat(60) + '\n');

  const dbPath = path.join(__dirname, 'data', 'database.sqlite');
  const db = new Database(dbPath);

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // ============================================================
    // Test 1: contents 테이블 product_info 컬럼 확인
    // ============================================================
    log('blue', '\n[Test 1] contents 테이블 스키마 확인\n');

    const contentsColumns = db.prepare(`PRAGMA table_info(contents)`).all();
    const productInfoColumn = contentsColumns.find(col => col.name === 'product_info');

    assertExists(productInfoColumn, 'contents.product_info 컬럼');
    assertEqual(productInfoColumn.type, 'TEXT', 'product_info 컬럼 타입');
    testsPassed++;

    // ============================================================
    // Test 2: scripts 테이블 product_info 컬럼 확인
    // ============================================================
    log('blue', '\n[Test 2] scripts 테이블 스키마 확인\n');

    const scriptsColumns = db.prepare(`PRAGMA table_info(scripts)`).all();
    const scriptsProductInfoColumn = scriptsColumns.find(col => col.name === 'product_info');

    assertExists(scriptsProductInfoColumn, 'scripts.product_info 컬럼');
    assertEqual(scriptsProductInfoColumn.type, 'TEXT', 'scripts product_info 컬럼 타입');
    testsPassed++;

    // ============================================================
    // Test 3: product_info JSON 저장 테스트
    // ============================================================
    log('blue', '\n[Test 3] product_info JSON 저장 테스트\n');

    // 실제 사용자 ID 가져오기 (Foreign key constraint 때문에)
    const realUser = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!realUser) {
      throw new Error('테스트를 위한 사용자가 없습니다');
    }

    const testUserId = realUser.id;
    const testContentId = 'test-content-' + crypto.randomUUID();
    const testProductInfo = {
      thumbnail: 'https://example.com/image.jpg',
      product_link: 'https://coupang.com/product/123',
      description: '테스트 상품 설명'
    };

    log('yellow', `  👤 테스트 사용자: ${testUserId}`);

    // Insert test content with product_info
    db.prepare(`
      INSERT INTO contents (
        id, user_id, type, format, title, product_info, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      testContentId,
      testUserId,
      'script',
      'product',
      'Test Product Script',
      JSON.stringify(testProductInfo)
    );

    log('yellow', '  📝 테스트 데이터 삽입 완료');

    // ============================================================
    // Test 4: product_info 조회 및 파싱 테스트
    // ============================================================
    log('blue', '\n[Test 4] product_info 조회 및 파싱 테스트\n');

    const retrievedContent = db.prepare(`
      SELECT id, format, title, product_info
      FROM contents
      WHERE id = ?
    `).get(testContentId);

    assertExists(retrievedContent, '테스트 컨텐츠');
    assertExists(retrievedContent.product_info, 'product_info 필드');

    const parsedProductInfo = JSON.parse(retrievedContent.product_info);
    assertEqual(parsedProductInfo.thumbnail, testProductInfo.thumbnail, 'thumbnail 값');
    assertEqual(parsedProductInfo.product_link, testProductInfo.product_link, 'product_link 값');
    assertEqual(parsedProductInfo.description, testProductInfo.description, 'description 값');

    log('yellow', '  📦 product_info JSON 파싱 성공');
    log('yellow', `     thumbnail: ${parsedProductInfo.thumbnail}`);
    log('yellow', `     product_link: ${parsedProductInfo.product_link}`);
    log('yellow', `     description: ${parsedProductInfo.description}`);
    testsPassed++;

    // ============================================================
    // Test 5: 실제 상품 대본 확인 (있는 경우)
    // ============================================================
    log('blue', '\n[Test 5] 실제 상품 대본 확인\n');

    const productScripts = db.prepare(`
      SELECT id, format, title, product_info, created_at
      FROM contents
      WHERE type = 'script' AND (format = 'product' OR format = 'product-info')
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    if (productScripts.length === 0) {
      log('yellow', '  ⚠️ 상품 대본이 아직 없습니다 (정상)');
    } else {
      log('yellow', `  📋 상품 대본 ${productScripts.length}개 발견\n`);

      for (const script of productScripts) {
        console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`  🆔 ${script.id}`);
        console.log(`  📝 ${script.title}`);
        console.log(`  🏷️  ${script.format}`);

        if (script.product_info) {
          try {
            const info = JSON.parse(script.product_info);
            log('green', '  ✅ product_info 파싱 성공');
            console.log(`     🔗 링크: ${info.product_link || '(없음)'}`);
            console.log(`     📸 썸네일: ${info.thumbnail ? '있음' : '없음'}`);
            console.log(`     📄 설명: ${info.description ? info.description.substring(0, 50) + '...' : '없음'}`);
          } catch (error) {
            log('red', `  ❌ product_info 파싱 실패: ${error.message}`);
            testsFailed++;
          }
        } else {
          log('yellow', '  ⚠️ product_info가 NULL');
        }
        console.log('');
      }
    }
    testsPassed++;

    // ============================================================
    // Test 6: 테스트 데이터 정리
    // ============================================================
    log('blue', '\n[Test 6] 테스트 데이터 정리\n');

    db.prepare('DELETE FROM contents WHERE id = ?').run(testContentId);
    log('yellow', '  🧹 테스트 데이터 삭제 완료');
    testsPassed++;

    // ============================================================
    // 테스트 결과 요약
    // ============================================================
    log('cyan', '\n' + '='.repeat(60));
    log('cyan', '  테스트 결과');
    log('cyan', '='.repeat(60) + '\n');

    log('green', `✅ 성공: ${testsPassed}개`);
    if (testsFailed > 0) {
      log('red', `❌ 실패: ${testsFailed}개`);
    }

    const totalTests = testsPassed + testsFailed;
    const successRate = ((testsPassed / totalTests) * 100).toFixed(1);

    if (testsFailed === 0) {
      log('green', `\n🎉 모든 테스트 통과! (${successRate}%)\n`);
    } else {
      log('red', `\n⚠️ 일부 테스트 실패 (성공률: ${successRate}%)\n`);
      process.exit(1);
    }

  } catch (error) {
    log('red', `\n❌ 테스트 실패: ${error.message}\n`);
    console.error(error);

    // 테스트 데이터 정리 시도
    try {
      db.prepare('DELETE FROM contents WHERE id LIKE ?').run('test-content-%');
      log('yellow', '🧹 테스트 데이터 정리 완료');
    } catch (cleanupError) {
      log('red', '⚠️ 정리 중 오류 발생');
    }

    process.exit(1);
  } finally {
    db.close();
  }
}

runTest();
