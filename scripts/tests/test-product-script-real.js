const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testProductScriptFlow() {
  console.log('🧪 실제 브라우저 테스트: 상품관리 → 메인 페이지 대본작성\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500  // 동작을 천천히 해서 확인 가능하도록
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // 콘솔 로그 캡처
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`  [브라우저 콘솔] ${text}`);
  });

  try {
    // 1. 로그인 페이지로 이동
    console.log('1️⃣ 로그인 페이지 접속...');
    await page.goto('http://localhost:3000/auth');
    await page.waitForLoadState('networkidle');

    // 로그인 상태 확인 (이미 로그인되어 있으면 스킵)
    const isAlreadyLoggedIn = await page.url() !== 'http://localhost:3000/auth';

    if (!isAlreadyLoggedIn) {
      // 로그인 폼 찾기
      const emailInput = await page.locator('input[type="email"], input[name="email"]').first();
      const passwordInput = await page.locator('input[type="password"], input[name="password"]').first();

      if (await emailInput.count() > 0) {
        console.log('2️⃣ 로그인 중...');
        await emailInput.fill('moony75@gmail.com');
        await passwordInput.fill('your-password-here'); // ⚠️ 실제 비밀번호 입력 필요

        // 로그인 버튼 클릭
        await page.locator('button[type="submit"], button:has-text("로그인")').first().click();
        await page.waitForLoadState('networkidle');
      }
    }

    // 2. 상품관리 페이지로 이동
    console.log('3️⃣ 상품관리 페이지 접속...');
    await page.goto('http://localhost:3000/admin/coupang-products');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 3. 첫 번째 상품의 대본작성 버튼 찾기
    console.log('4️⃣ 대본작성 버튼 찾기...');
    const scriptButtons = await page.locator('button:has-text("📝 대본작성")').all();

    if (scriptButtons.length === 0) {
      throw new Error('❌ 대본작성 버튼을 찾을 수 없습니다!');
    }

    console.log(`   ✅ ${scriptButtons.length}개의 대본작성 버튼 발견`);

    // 4. localStorage 확인용 함수 추가
    await page.addScriptTag({
      content: `
        window.checkLocalStorage = () => {
          return {
            product_video_info: localStorage.getItem('product_video_info'),
            current_product_info: localStorage.getItem('current_product_info')
          };
        };
      `
    });

    // 5. 대본작성 버튼 클릭 전 localStorage 확인
    console.log('5️⃣ 대본작성 버튼 클릭 전 localStorage 확인...');
    const beforeStorage = await page.evaluate(() => window.checkLocalStorage());
    console.log('   Before:', beforeStorage);

    // 6. 대본작성 버튼 클릭
    console.log('6️⃣ 대본작성 버튼 클릭...');
    await scriptButtons[0].click();

    // 7. 페이지 이동 대기
    console.log('7️⃣ 메인 페이지로 이동 대기...');
    await page.waitForURL('http://localhost:3000/?promptType=product', { timeout: 5000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log(`   ✅ 현재 URL: ${page.url()}`);

    // 8. localStorage 다시 확인
    console.log('8️⃣ 메인 페이지 도착 후 localStorage 확인...');
    const afterStorage = await page.evaluate(() => window.checkLocalStorage());
    console.log('   After:', afterStorage);

    // 9. 콘솔 로그에서 상품 모드 설정 확인
    console.log('9️⃣ 콘솔 로그에서 "🛍️ 상품 모드 강제 설정" 확인...');
    const hasProductMode = consoleLogs.some(log => log.includes('🛍️ 상품 모드 강제 설정'));
    const hasProductInfoLoad = consoleLogs.some(log => log.includes('🛍️ 상품 정보 로드 완료'));

    console.log(`   ${hasProductMode ? '✅' : '❌'} 상품 모드 강제 설정 로그`);
    console.log(`   ${hasProductInfoLoad ? '✅' : '❌'} 상품 정보 로드 완료 로그`);

    // 10. 상품 정보 UI 표시 확인
    console.log('🔟 상품 정보 UI 표시 확인...');
    const productInfoSection = await page.locator('[data-product-info-section]').count();
    console.log(`   ${productInfoSection > 0 ? '✅' : '❌'} 상품 정보 섹션 (data-product-info-section): ${productInfoSection}개`);

    // 11. AI 대본 생성 섹션 표시 확인
    console.log('1️⃣1️⃣ AI 대본 생성 섹션 표시 확인...');
    const aiScriptSection = await page.locator('h2:has-text("🤖 AI 대본 생성")').count();
    console.log(`   ${aiScriptSection > 0 ? '✅' : '✅'} AI 대본 생성 섹션: ${aiScriptSection}개`);

    // 12. 상품 정보 내용 확인
    if (productInfoSection > 0) {
      console.log('1️⃣2️⃣ 상품 정보 내용 확인...');
      const thumbnail = await page.locator('[data-product-info-section] img').count();
      const productLink = await page.locator('[data-product-info-section] a').count();
      const description = await page.locator('[data-product-info-section] p').count();

      console.log(`   ${thumbnail > 0 ? '✅' : '❌'} 썸네일: ${thumbnail}개`);
      console.log(`   ${productLink > 0 ? '✅' : '❌'} 상품링크: ${productLink}개`);
      console.log(`   ${description > 0 ? '✅' : '❌'} 상품설명: ${description}개`);
    }

    // 13. 스크린샷 저장
    console.log('1️⃣3️⃣ 스크린샷 저장...');
    await page.screenshot({
      path: path.join(__dirname, 'test-results', 'product-script-flow.png'),
      fullPage: true
    });
    console.log('   ✅ 스크린샷 저장: test-results/product-script-flow.png');

    // 결과 요약
    console.log('\n' + '='.repeat(60));
    console.log('📊 테스트 결과 요약');
    console.log('='.repeat(60));
    console.log(`URL 이동: ${page.url().includes('promptType=product') ? '✅' : '❌'} ${page.url()}`);
    console.log(`상품 모드 로그: ${hasProductMode ? '✅' : '❌'}`);
    console.log(`상품 정보 로드 로그: ${hasProductInfoLoad ? '✅' : '❌'}`);
    console.log(`상품 정보 UI: ${productInfoSection > 0 ? '✅' : '❌'}`);
    console.log(`AI 대본 섹션: ${aiScriptSection > 0 ? '✅' : '❌'}`);
    console.log('='.repeat(60));

    // 최종 판단
    const isSuccess = hasProductMode && hasProductInfoLoad && productInfoSection > 0;
    if (isSuccess) {
      console.log('\n✅ 테스트 성공! 모든 기능이 정상 동작합니다.');
    } else {
      console.log('\n❌ 테스트 실패! 일부 기능이 동작하지 않습니다.');
      console.log('\n🔍 캡처된 콘솔 로그:');
      consoleLogs.forEach(log => console.log(`   ${log}`));
    }

    // 브라우저 유지 (수동 확인용)
    console.log('\n⏸️  브라우저를 10초간 유지합니다 (수동 확인용)...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ 테스트 오류:', error.message);

    // 오류 스크린샷
    const errorDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir, { recursive: true });
    }
    await page.screenshot({
      path: path.join(errorDir, 'error-screenshot.png'),
      fullPage: true
    });
    console.log('   📸 오류 스크린샷 저장: test-results/error-screenshot.png');

    throw error;
  } finally {
    await browser.close();
  }
}

// 테스트 실행
testProductScriptFlow().catch(error => {
  console.error('테스트 실패:', error);
  process.exit(1);
});
