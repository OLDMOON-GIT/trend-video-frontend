/**
 * @jest-environment node
 *
 * 자동화 상품 정보 플레이스홀더 치환 통합 테스트
 *
 * 실제 DB, 실제 파일을 사용하여 자동화 시스템의 상품 정보 플레이스홀더 치환을 검증합니다.
 *
 * 테스트 흐름:
 * 1. 테스트 사용자 생성 (google_sites_home_url, nickname 설정)
 * 2. 프롬프트 파일 읽기
 * 3. 플레이스홀더 치환 로직 테스트
 * 4. 모든 플레이스홀더가 치환되었는지 검증
 *
 * 실행: npm test -- automation-product-placeholder.integration
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const promptPath = path.join(process.cwd(), 'prompts', 'prompt_product_info.txt');
const TEST_USER_ID = 'test_user_automation_product';
const TEST_HOME_URL = 'https://sites.google.com/view/test-automation';
const TEST_NICKNAME = '테스트채널';

describe('[통합] 자동화 상품 정보 플레이스홀더 치환', () => {
  let db: Database.Database;
  let promptTemplate: string;

  beforeAll(() => {
    db = new Database(dbPath);

    // 기존 테스트 데이터 정리
    db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);

    // 테스트 사용자 생성 (관리자, google_sites_home_url, nickname 설정)
    db.prepare(`
      INSERT INTO users (id, email, password, is_admin, credits, google_sites_home_url, nickname)
      VALUES (?, ?, ?, 1, 10000, ?, ?)
    `).run(TEST_USER_ID, 'test@automation.com', 'test_password_hash', TEST_HOME_URL, TEST_NICKNAME);

    // 프롬프트 파일 읽기
    promptTemplate = fs.readFileSync(promptPath, 'utf-8');

    console.log('✅ 테스트 환경 준비 완료');
  });

  afterAll(() => {
    // 테스트 데이터 정리
    db.prepare('DELETE FROM users WHERE id = ?').run(TEST_USER_ID);

    db.close();
    console.log('✅ 테스트 데이터 정리 완료');
  });

  it('프롬프트 파일에 모든 필수 플레이스홀더가 있어야 함', () => {
    console.log('\n📋 1단계: 프롬프트 파일 플레이스홀더 검증');

    // 필수 플레이스홀더 확인
    expect(promptTemplate).toContain('{title}');
    expect(promptTemplate).toContain('{thumbnail}');
    expect(promptTemplate).toContain('{product_link}');
    expect(promptTemplate).toContain('{product_description}');
    expect(promptTemplate).toContain('{home_url}');
    // Note: {별명} placeholder is not used in product prompt

    console.log('✅ 모든 플레이스홀더가 프롬프트 파일에 존재함');
  });

  it('상품 정보로 플레이스홀더를 치환하면 모든 값이 대체되어야 함', () => {
    console.log('\n📋 2단계: 플레이스홀더 치환 검증');

    // 상품 정보 준비
    const productData = {
      title: '테스트 상품 제목',
      thumbnail: 'https://example.com/test-thumbnail.jpg',
      product_link: 'https://link.coupang.com/a/test123?subid=test&itemId=12345&vendorItemId=67890&partner=test',
      description: '이것은 테스트 상품입니다. 매우 유용한 상품입니다.'
    };

    console.log('상품 정보:', productData);

    // DB에서 사용자 설정 가져오기
    const userSettings = db.prepare('SELECT google_sites_home_url, nickname FROM users WHERE id = ?').get(TEST_USER_ID) as { google_sites_home_url: string; nickname: string };
    const homeUrl = userSettings?.google_sites_home_url || '';
    const nickname = userSettings?.nickname || '';

    console.log('사용자 설정:', { homeUrl, nickname });

    // 플레이스홀더 치환 (실제 API 로직과 동일)
    let replacedPrompt = promptTemplate
      .replace(/{title}/g, productData.title) // ⭐ title 플레이스홀더 치환
      .replace(/{thumbnail}/g, productData.thumbnail)
      .replace(/{product_link}/g, productData.product_link)
      .replace(/{product_description}/g, productData.description)
      .replace(/{home_url}/g, homeUrl);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('치환된 프롬프트 (처음 500자):');
    console.log(replacedPrompt.substring(0, 500));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 플레이스홀더가 남아있으면 안 됨
    expect(replacedPrompt).not.toContain('{title}');
    expect(replacedPrompt).not.toContain('{thumbnail}');
    expect(replacedPrompt).not.toContain('{product_link}');
    expect(replacedPrompt).not.toContain('{product_description}');
    expect(replacedPrompt).not.toContain('{home_url}');
    // Note: {별명} is not used in product prompt

    console.log('✅ 모든 플레이스홀더가 치환됨');

    // 실제 값이 포함되어야 함
    expect(replacedPrompt).toContain(productData.title);
    expect(replacedPrompt).toContain(productData.thumbnail);
    expect(replacedPrompt).toContain(productData.product_link);
    expect(replacedPrompt).toContain(productData.description);
    expect(replacedPrompt).toContain(homeUrl);
    // Note: nickname is not used in product prompt

    console.log('✅ 모든 실제 값이 포함됨');
    console.log('  - title:', productData.title);
    console.log('  - thumbnail:', productData.thumbnail);
    console.log('  - product_link:', productData.product_link);
    console.log('  - description:', productData.description);
    console.log('  - home_url:', homeUrl);

    console.log('\n🎉 테스트 통과!');
  });

  it('크롤링된 데이터(deepLink 포함) 형식으로 플레이스홀더를 치환하면 deepLink가 우선되어야 함', () => {
    console.log('\n📋 3단계: 크롤링된 데이터 형식 + deepLink 우선순위 검증');

    // 크롤링된 데이터 형식 (productName, productImage, productUrl, deepLink)
    const crawledProductData = {
      productName: '삭스판다 여성용 도톰한 겨울 방한 파일 반장 니삭스 3켤레 세트',
      productImage: 'https://img1c.coupangcdn.com/image/retail/images/123.jpg',
      productUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF5835292&pageKey=8391263121&itemId=24256199224&vendorItemId=82735828304&traceid=V0-113-99f0d74009d4b0be',
      deepLink: 'https://link.coupang.com/a/c6NssG', // ⭐ 짧은 딥링크 (이게 사용되어야 함!)
      productPrice: '9,900원',
      productId: '24256199224'
    };

    console.log('크롤링된 상품 정보:', crawledProductData);
    console.log('⚠️ productUrl과 deepLink가 모두 존재 - deepLink가 우선되어야 함!');

    // DB에서 사용자 설정 가져오기
    const userSettings = db.prepare('SELECT google_sites_home_url, nickname FROM users WHERE id = ?').get(TEST_USER_ID) as { google_sites_home_url: string; nickname: string };
    const homeUrl = userSettings?.google_sites_home_url || '';
    const nickname = userSettings?.nickname || '';

    // API 로직과 동일한 fallback 패턴 적용
    const productTitle = crawledProductData.productName || '';
    const productThumbnail = crawledProductData.productImage || '';
    const productLink = crawledProductData.deepLink || crawledProductData.productUrl || ''; // ⭐ deepLink 우선!
    const productDescription = '';

    console.log('\n변환된 값:');
    console.log('  - productTitle:', productTitle);
    console.log('  - productThumbnail:', productThumbnail);
    console.log('  - productLink (deepLink 우선!):', productLink);

    // 플레이스홀더 치환
    let replacedPrompt = promptTemplate
      .replace(/{title}/g, productTitle)
      .replace(/{thumbnail}/g, productThumbnail)
      .replace(/{product_link}/g, productLink)
      .replace(/{product_description}/g, productDescription)
      .replace(/{home_url}/g, homeUrl);

    // deepLink가 사용되었는지 확인
    expect(replacedPrompt).toContain(crawledProductData.deepLink);
    console.log('✅ deepLink가 프롬프트에 포함됨:', crawledProductData.deepLink);

    // productUrl(긴 추적 URL)은 사용되지 않아야 함
    expect(replacedPrompt).not.toContain(crawledProductData.productUrl);
    console.log('✅ productUrl(긴 추적 URL)은 사용되지 않음');

    // 다른 값들도 정상 치환 확인
    expect(replacedPrompt).toContain(productTitle);
    expect(replacedPrompt).toContain(productThumbnail);
    expect(replacedPrompt).toContain(homeUrl);

    console.log('✅ 모든 값이 올바르게 치환됨');
    console.log('\n🎉 deepLink 우선순위 테스트 통과!');
  });

  it('/api/scripts/generate에서 플레이스홀더 치환 로직이 존재해야 함', () => {
    console.log('\n📋 4단계: API 코드 검증');

    const routeFilePath = path.join(process.cwd(), 'src', 'app', 'api', 'scripts', 'generate', 'route.ts');

    expect(fs.existsSync(routeFilePath)).toBeTruthy();

    const routeContent = fs.readFileSync(routeFilePath, 'utf-8');

    // 플레이스홀더 치환 로직 확인
    expect(routeContent).toContain('replace(/{thumbnail}/g');
    expect(routeContent).toContain('replace(/{product_link}/g');
    expect(routeContent).toContain('replace(/{product_description}/g');
    expect(routeContent).toContain('replace(/{home_url}/g');
    expect(routeContent).toContain('replace(/{별명}/g');

    console.log('✅ API에 플레이스홀더 치환 로직이 존재함');

    // deepLink 우선순위 로직 확인
    expect(routeContent).toContain('productInfo.deepLink || productInfo.productUrl');
    console.log('✅ API에 deepLink 우선순위 로직이 존재함');

    // google_sites_home_url과 nickname을 DB에서 가져오는 로직 확인
    expect(routeContent).toContain('google_sites_home_url');
    expect(routeContent).toContain('nickname');
    expect(routeContent).toContain('FROM users WHERE id');

    console.log('✅ 사용자 설정을 DB에서 가져오는 로직이 존재함');
  });
});

/**
 * 테스트 실행 방법:
 *
 * npm test -- automation-product-placeholder.integration
 *
 * 주의사항:
 * - 실제 DB와 실제 파일을 사용합니다
 * - 테스트 후 자동으로 데이터를 정리합니다
 * - 프롬프트 파일(prompts/prompt_product_info.txt)이 필요합니다
 *
 * 테스트 검증 내용:
 * 1. 프롬프트 파일에 필수 플레이스홀더가 모두 존재하는지 확인
 * 2. 플레이스홀더 치환 후 모든 플레이스홀더가 제거되고 실제 값으로 대체되는지 확인
 * 3. API 코드에 플레이스홀더 치환 로직과 DB 조회 로직이 존재하는지 확인
 */
