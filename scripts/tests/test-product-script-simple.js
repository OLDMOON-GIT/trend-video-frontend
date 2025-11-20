const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testProductScriptFlow() {
  console.log('🧪 실제 브라우저 테스트: 상품 정보 → 메인 페이지 대본 생성 UI\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300  // 동작을 천천히 해서 확인 가능하도록
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // 콘솔 로그 캡처
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('🛍️') || text.includes('상품') || text.includes('product')) {
      console.log(`  [브라우저 콘솔] ${text}`);
    }
  });

  try {
    // 1. 메인 페이지 먼저 접속 (세션 확보)
    console.log('1️⃣ 메인 페이지 접속...');
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // 2. 가상의 상품 정보를 localStorage에 저장 (상품관리 페이지에서 대본작성 버튼 클릭한 것과 동일)
    console.log('2️⃣ localStorage에 상품 정보 설정 (대본작성 버튼 클릭 시뮬레이션)...');
    const productInfo = {
      title: '테스트 상품 - 고급 무선 이어폰',
      thumbnail: 'https://example.com/image.jpg',
      product_link: 'https://example.com/product/12345',
      description: '최고의 음질을 자랑하는 프리미엄 무선 이어폰입니다.'
    };

    await page.evaluate((info) => {
      localStorage.setItem('product_video_info', JSON.stringify(info));
      console.log('✅ localStorage에 product_video_info 저장 완료');
    }, productInfo);

    console.log('   ✅ 상품 정보 저장 완료:', productInfo.title);

    // 3. promptType=product 파라미터와 함께 메인 페이지로 이동
    console.log('3️⃣ promptType=product 파라미터와 함께 메인 페이지 이동...');
    await page.goto('http://localhost:3000/?promptType=product');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // useEffect 실행 대기

    console.log(`   ✅ 현재 URL: ${page.url()}`);

    // 4. localStorage 확인
    console.log('4️⃣ localStorage 확인...');
    const storageData = await page.evaluate(() => {
      return {
        product_video_info: localStorage.getItem('product_video_info'),
        current_product_info: localStorage.getItem('current_product_info')
      };
    });
    console.log('   product_video_info:', storageData.product_video_info ? '존재 (사용 후 삭제되어야 함)' : '✅ 삭제됨');
    console.log('   current_product_info:', storageData.current_product_info ? '✅ 존재' : '없음');

    // 5. 콘솔 로그에서 상품 모드 설정 확인
    console.log('5️⃣ 콘솔 로그 확인...');
    const hasProductMode = consoleLogs.some(log => log.includes('🛍️ 상품 모드 강제 설정'));
    const hasProductInfoLoad = consoleLogs.some(log => log.includes('🛍️ 상품 정보 로드 완료'));
    const hasProductTitle = consoleLogs.some(log => log.includes(productInfo.title));

    console.log(`   ${hasProductMode ? '✅' : '❌'} "🛍️ 상품 모드 강제 설정" 로그`);
    console.log(`   ${hasProductInfoLoad ? '✅' : '❌'} "🛍️ 상품 정보 로드 완료" 로그`);
    console.log(`   ${hasProductTitle ? '✅' : '❌'} 상품 제목 로드 로그`);

    // 6. AI 대본 생성 섹션 표시 확인
    console.log('6️⃣ AI 대본 생성 섹션 표시 확인...');
    await page.waitForTimeout(500);
    const aiScriptSection = await page.locator('h2:has-text("🤖 AI 대본 생성")').count();
    console.log(`   ${aiScriptSection > 0 ? '✅' : '❌'} AI 대본 생성 섹션: ${aiScriptSection}개`);

    // 7. 상품 정보 UI 표시 확인
    console.log('7️⃣ 상품 정보 UI 표시 확인...');
    const productInfoSection = await page.locator('[data-product-info-section]').count();
    console.log(`   ${productInfoSection > 0 ? '✅' : '❌'} 상품 정보 섹션 (data-product-info-section): ${productInfoSection}개`);

    if (productInfoSection > 0) {
      const thumbnail = await page.locator('[data-product-info-section] img').count();
      const productLink = await page.locator('[data-product-info-section] a').count();
      const description = await page.locator('[data-product-info-section] p').count();

      console.log(`   ${thumbnail > 0 ? '✅' : '❌'} 썸네일 이미지: ${thumbnail}개`);
      console.log(`   ${productLink > 0 ? '✅' : '❌'} 상품 링크: ${productLink}개`);
      console.log(`   ${description > 0 ? '✅' : '❌'} 상품 설명: ${description}개`);

      // 실제 내용도 확인
      if (productLink > 0) {
        const linkText = await page.locator('[data-product-info-section] a').first().textContent();
        console.log(`   📎 링크 텍스트: ${linkText?.substring(0, 50)}...`);
      }
    } else {
      console.log('\n⚠️ 상품 정보 섹션이 표시되지 않았습니다!');

      // promptFormat state 확인
      console.log('   🔍 디버깅: React 상태 확인...');

      // showTitleInput 확인
      const titleInputVisible = aiScriptSection > 0;
      console.log(`   showTitleInput (AI 섹션 표시 여부): ${titleInputVisible ? 'true ✅' : 'false ❌'}`);

      // 조건 확인
      console.log('   🔍 상품 정보 섹션 표시 조건:');
      console.log('      1. (promptFormat === "product" || promptFormat === "product-info")');
      console.log('      2. productInfo !== null');
      console.log('      → 둘 다 true여야 상품 정보 UI가 표시됩니다');
    }

    // 8. promptFormat 선택 UI 확인
    console.log('8️⃣ promptFormat 선택 UI 확인...');
    const formatSelectVisible = await page.locator('label:has-text("포맷 유형")').count();
    if (formatSelectVisible > 0) {
      const selectedOption = await page.locator('select[name="promptFormat"], select').first().inputValue();
      console.log(`   현재 선택된 포맷: ${selectedOption}`);
    }

    // 9. 스크린샷 저장
    console.log('9️⃣ 스크린샷 저장...');
    const screenshotDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    await page.screenshot({
      path: path.join(screenshotDir, 'product-script-test.png'),
      fullPage: true
    });
    console.log('   ✅ 스크린샷: test-results/product-script-test.png');

    // 결과 요약
    console.log('\n' + '='.repeat(60));
    console.log('📊 테스트 결과 요약');
    console.log('='.repeat(60));
    console.log(`✅ URL 파라미터: ${page.url().includes('promptType=product') ? 'promptType=product 포함' : '❌ 누락'}`);
    console.log(`${hasProductMode ? '✅' : '❌'} 상품 모드 설정 로그`);
    console.log(`${hasProductInfoLoad ? '✅' : '❌'} 상품 정보 로드 로그`);
    console.log(`${aiScriptSection > 0 ? '✅' : '❌'} AI 대본 생성 섹션 표시`);
    console.log(`${productInfoSection > 0 ? '✅' : '❌'} 상품 정보 UI 표시`);
    console.log('='.repeat(60));

    // 최종 판정
    const isSuccess = hasProductMode && hasProductInfoLoad && aiScriptSection > 0 && productInfoSection > 0;
    if (isSuccess) {
      console.log('\n✅✅✅ 테스트 성공! 모든 기능이 정상 동작합니다. ✅✅✅');
    } else {
      console.log('\n❌❌❌ 테스트 실패! 일부 기능이 동작하지 않습니다. ❌❌❌');

      // 실패 원인 분석
      console.log('\n🔍 실패 원인 분석:');
      if (!hasProductMode || !hasProductInfoLoad) {
        console.log('   ❌ useEffect가 실행되지 않았습니다.');
        console.log('   → searchParams dependency가 제대로 작동하지 않을 수 있습니다.');
      }
      if (aiScriptSection === 0) {
        console.log('   ❌ showTitleInput이 true로 설정되지 않았습니다.');
      }
      if (productInfoSection === 0) {
        console.log('   ❌ 상품 정보 UI 조건이 충족되지 않았습니다.');
        console.log('   → promptFormat이 "product"로 설정되지 않았거나');
        console.log('   → productInfo state가 null일 수 있습니다.');
      }

      console.log('\n📋 캡처된 관련 콘솔 로그:');
      consoleLogs.filter(log =>
        log.includes('🛍️') ||
        log.includes('상품') ||
        log.includes('product') ||
        log.includes('prompt')
      ).forEach(log => console.log(`   ${log}`));
    }

    // 브라우저 유지 (수동 확인용)
    console.log('\n⏸️  브라우저를 15초간 유지합니다 (수동 확인용)...');
    console.log('   💡 브라우저에서 직접 확인해보세요!');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('\n❌ 테스트 오류:', error.message);
    console.error(error.stack);

    // 오류 스크린샷
    const errorDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir, { recursive: true });
    }
    await page.screenshot({
      path: path.join(errorDir, 'error-screenshot.png'),
      fullPage: true
    });
    console.log('   📸 오류 스크린샷: test-results/error-screenshot.png');

  } finally {
    await browser.close();
    console.log('\n🏁 테스트 종료');
  }
}

// 테스트 실행
testProductScriptFlow().catch(error => {
  console.error('테스트 실패:', error);
  process.exit(1);
});
