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
  console.log('🧪 상품관리 → 메인 페이지 상품 정보 표시 수정 검증\n');

  const mainPagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
  const mainPageContent = fs.readFileSync(mainPagePath, 'utf-8');

  // 테스트 1: 첫 번째 useEffect (상품 프롬프트 타입 감지) dependency 확인
  const productPromptEffect = mainPageContent.match(/\/\/\s*상품 프롬프트 타입 감지[\s\S]*?useEffect\(\(\) => \{[\s\S]*?\}, \[(.*?)\]\);/);
  if (productPromptEffect) {
    const dependency1 = productPromptEffect[1].trim();
    const hasSearchParams1 = dependency1 === 'searchParams';
    addTestResult('상품 프롬프트 감지 useEffect', hasSearchParams1,
      hasSearchParams1 ? 'searchParams dependency 추가됨 ✅' : `dependency: [${dependency1}] (빈 배열이면 안됨!)`);
  } else {
    addTestResult('상품 프롬프트 감지 useEffect', false, 'useEffect를 찾을 수 없음');
  }

  // 테스트 2: 두 번째 useEffect (상품정보 대본 생성) dependency 확인
  const productInfoEffect = mainPageContent.match(/\/\/\s*상품정보 대본 생성 파라미터 감지[\s\S]*?useEffect\(\(\) => \{[\s\S]*?\}, \[(.*?)\]\);/);
  if (productInfoEffect) {
    const dependency2 = productInfoEffect[1].trim();
    const hasSearchParams2 = dependency2 === 'searchParams';
    addTestResult('상품정보 대본 감지 useEffect', hasSearchParams2,
      hasSearchParams2 ? 'searchParams dependency 추가됨 ✅' : `dependency: [${dependency2}] (빈 배열이면 안됨!)`);
  } else {
    addTestResult('상품정보 대본 감지 useEffect', false, 'useEffect를 찾을 수 없음');
  }

  // 테스트 3: searchParams import 확인
  const hasSearchParamsImport = mainPageContent.includes("useSearchParams") &&
                                 mainPageContent.includes("from \"next/navigation\"");
  addTestResult('useSearchParams import', hasSearchParamsImport,
    hasSearchParamsImport ? 'next/navigation에서 import됨' : 'import 누락');

  // 테스트 4: searchParams 변수 선언 확인
  const hasSearchParamsDeclaration = mainPageContent.match(/const\s+searchParams\s*=\s*useSearchParams\(\)/);
  addTestResult('searchParams 선언', !!hasSearchParamsDeclaration,
    hasSearchParamsDeclaration ? 'const searchParams = useSearchParams() 존재' : '선언 누락');

  // 테스트 5: 상품 정보 UI 렌더링 조건 확인
  const hasProductInfoUICondition = mainPageContent.includes("(promptFormat === 'product' || promptFormat === 'product-info') && productInfo &&");
  addTestResult('상품 정보 UI 조건', hasProductInfoUICondition,
    hasProductInfoUICondition ? '조건문 존재' : '조건문 누락');

  // 테스트 6: data-product-info-section 속성 확인
  const hasDataAttribute = mainPageContent.includes('data-product-info-section');
  addTestResult('상품 정보 섹션 속성', hasDataAttribute,
    hasDataAttribute ? 'data-product-info-section 존재' : '속성 누락');

  // 결과 요약
  console.log('\n' + '='.repeat(60));
  console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);
  console.log('='.repeat(60));

  if (testResults.failed > 0) {
    console.log('\n🔍 실패한 테스트:');
    testResults.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.message}`);
    });
    console.log('\n⚠️ 수정이 필요합니다!');
  } else {
    console.log('\n✅ 모든 테스트 통과!');
    console.log('\n📋 수정 내용 요약:');
    console.log('  1. 상품 프롬프트 감지 useEffect: dependency array에 searchParams 추가');
    console.log('  2. 상품정보 대본 감지 useEffect: dependency array에 searchParams 추가');
    console.log('\n💡 이제 다음과 같이 동작합니다:');
    console.log('  1. 상품관리에서 "대본작성" 버튼 클릭');
    console.log('  2. localStorage에 product_video_info 저장');
    console.log('  3. router.push("/?promptType=product")로 메인 페이지 이동');
    console.log('  4. URL 파라미터 변경으로 useEffect 재실행 (searchParams dependency)');
    console.log('  5. promptType=product 감지 및 상품 정보 로드');
    console.log('  6. 상품 정보 UI 표시 및 대본 생성 섹션 열기');
    console.log('\n🧪 실제 테스트 방법:');
    console.log('  1. 개발 서버 실행: cd trend-video-frontend && npm run dev');
    console.log('  2. 브라우저에서 상품관리 페이지 접속');
    console.log('  3. 상품 카드에서 "대본작성" 버튼 클릭');
    console.log('  4. 메인 페이지로 이동하면서 상품 정보와 대본 생성 UI 표시 확인');
    console.log('  5. 콘솔에서 "🛍️ 상품 모드 강제 설정" 로그 확인');
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests().catch(error => {
  console.error('❌ 테스트 실행 오류:', error);
  process.exit(1);
});
