const fs = require('fs');
const path = require('path');

let testResults = { passed: 0, failed: 0, tests: [] };

function addTestResult(name, passed, message) {
  testResults.tests.push({ name, passed, message });
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}: ${message}`);
  } else {
    testResults.failed++;
    console.error(`❌ ${name}: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 상품관리 → 메인 페이지 상품 정보 표시 테스트\n');

  // 테스트 1: 상품관리 페이지에 대본작성 버튼 코드 존재 확인
  const coupangProductsPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'admin', 'coupang-products', 'page.tsx');
  const coupangProductsContent = fs.readFileSync(coupangProductsPath, 'utf-8');

  const hasScriptButton = coupangProductsContent.includes("localStorage.setItem('product_video_info'") &&
                          coupangProductsContent.includes("router.push('/?promptType=product')");
  addTestResult('상품관리 대본작성 버튼', hasScriptButton, hasScriptButton ? '코드 존재' : '코드 누락');

  // 테스트 2: 메인 페이지 promptType=product 감지 코드 확인
  const mainPagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
  const mainPageContent = fs.readFileSync(mainPagePath, 'utf-8');

  const hasPromptTypeDetection = mainPageContent.includes("if (promptType === 'product')") &&
                                  mainPageContent.includes("setPromptFormat('product')");
  addTestResult('promptType 감지', hasPromptTypeDetection, hasPromptTypeDetection ? '코드 존재' : '코드 누락');

  // 테스트 3: localStorage에서 product_video_info 로드 코드 확인
  const hasProductInfoLoad = mainPageContent.includes("localStorage.getItem('product_video_info')") &&
                             mainPageContent.includes("setProductInfo(loadedProductInfo)");
  addTestResult('상품 정보 로드', hasProductInfoLoad, hasProductInfoLoad ? '코드 존재' : '코드 누락');

  // 테스트 4: showTitleInput true 설정 확인
  const hasShowTitleInput = mainPageContent.includes("setShowTitleInput(true)");
  addTestResult('대본 생성 섹션 열기', hasShowTitleInput, hasShowTitleInput ? '코드 존재' : '코드 누락');

  // 테스트 5: 상품 정보 UI 렌더링 코드 확인
  const hasProductInfoUI = mainPageContent.includes("data-product-info-section") &&
                           mainPageContent.includes("promptFormat === 'product'") &&
                           mainPageContent.includes("productInfo &&");
  addTestResult('상품 정보 UI', hasProductInfoUI, hasProductInfoUI ? '렌더링 코드 존재' : '렌더링 코드 누락');

  // 테스트 6: 상품 정보 UI가 showTitleInput 블록 내부에 있는지 확인
  const showTitleInputIndex = mainPageContent.indexOf('{showTitleInput && (');
  const productInfoUIIndex = mainPageContent.indexOf('data-product-info-section');

  // showTitleInput 블록의 닫는 위치 찾기
  let closingSectionIndex = -1;
  const sectionMatch = mainPageContent.substring(showTitleInputIndex).match(/<section[^>]*>/);
  if (sectionMatch) {
    const sectionStart = showTitleInputIndex + sectionMatch.index;
    const closingTag = '</section>';
    closingSectionIndex = mainPageContent.indexOf(closingTag, sectionStart);
  }

  const isInsideBlock = productInfoUIIndex > showTitleInputIndex &&
                        productInfoUIIndex < closingSectionIndex;
  addTestResult('UI 위치', isInsideBlock, isInsideBlock ? 'showTitleInput 블록 내부에 존재' : 'showTitleInput 블록 외부에 존재 (문제!)');

  // 테스트 7: useEffect dependency array 확인 (mount 시 한 번만 실행되는지)
  // promptType 감지 useEffect를 찾아서 dependency 확인
  const promptTypeEffectMatch = mainPageContent.match(/\/\/\s*상품 프롬프트 타입 감지[\s\S]*?useEffect\(\(\) => \{[\s\S]*?\}, \[(.*?)\]\)/);
  const hasDependency = promptTypeEffectMatch && promptTypeEffectMatch[1].trim() === '';
  addTestResult('useEffect dependency', hasDependency, hasDependency ? '빈 배열 (mount 시 실행)' : 'dependency 있음');

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);
  console.log('='.repeat(60));

  if (testResults.failed > 0) {
    console.log('\n🔍 문제점:');
    testResults.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.message}`);
    });
  }

  console.log('\n💡 권장 조치:');
  if (!isInsideBlock) {
    console.log('  - 상품 정보 UI가 showTitleInput 블록 외부에 있어서 항상 보이지 않습니다.');
    console.log('  - data-product-info-section을 showTitleInput && ( ... ) 블록 내부로 이동시켜야 합니다.');
  }
  if (testResults.failed === 0) {
    console.log('  - 코드상 문제는 없습니다. 실제 동작을 확인하려면 브라우저 개발자 도구에서:');
    console.log('    1. 상품관리에서 대본작성 클릭');
    console.log('    2. 콘솔에서 "🛍️ 상품 모드 강제 설정" 로그 확인');
    console.log('    3. 콘솔에서 "🛍️ 상품 정보 로드 완료" 로그 확인');
    console.log('    4. React DevTools로 promptFormat과 productInfo 상태 확인');
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests().catch(error => {
  console.error('❌ 테스트 실행 오류:', error);
  process.exit(1);
});
