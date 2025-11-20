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
  console.log('🧪 [ImageFX UI 통합 테스트] 시작\n');

  // 테스트 1: my-content/page.tsx 수정 확인
  const myContentPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'my-content', 'page.tsx');
  const myContentContent = fs.readFileSync(myContentPath, 'utf-8');

  // handleImageCrawling 함수 시그니처 확인
  const hasUseImageFXParam = myContentContent.match(/const handleImageCrawling.*useImageFX.*boolean/);
  addTestResult('함수 시그니처', !!hasUseImageFXParam, 'useImageFX 파라미터 추가');

  // API 호출 시 useImageFX 전달 확인
  const hasUseImageFXInBody = myContentContent.includes('useImageFX') &&
                               myContentContent.match(/body:.*JSON\.stringify\([^)]*useImageFX/s);
  addTestResult('API 전달', !!hasUseImageFXInBody, 'API 호출 시 useImageFX 전달');

  // confirm 대화상자 확인
  const hasConfirmDialog = myContentContent.includes('window.confirm') &&
                           myContentContent.includes('ImageFX + Whisk');
  addTestResult('confirm 대화상자', hasConfirmDialog, 'ImageFX 선택 대화상자 존재');

  // 두 개의 버튼 모두 수정되었는지 확인
  const confirmMatches = myContentContent.match(/window\.confirm\(/g);
  const confirmCount = confirmMatches ? confirmMatches.length : 0;
  addTestResult('버튼 수정 개수', confirmCount >= 2, `${confirmCount}개 버튼 수정 (최소 2개 필요)`);

  // 모드 표시 메시지 확인
  const hasModeMessage = myContentContent.includes('ImageFX + Whisk') &&
                         myContentContent.includes('Whisk') &&
                         myContentContent.match(/const mode = useImageFX/);
  addTestResult('모드 메시지', hasModeMessage, 'toast에 선택된 모드 표시');

  // 테스트 2: 메시지 내용 확인
  const hasImageFXDescription = myContentContent.includes('첫 이미지를 ImageFX로 생성');
  addTestResult('설명 메시지', hasImageFXDescription, 'ImageFX 설명 포함');

  const hasWhiskDefault = myContentContent.includes('Whisk만 사용') &&
                          myContentContent.includes('기본');
  addTestResult('기본값 안내', hasWhiskDefault, 'Whisk 기본값 안내 포함');

  const hasBenefit = myContentContent.includes('일관된 인물');
  addTestResult('장점 설명', hasBenefit, 'ImageFX 장점 설명 포함');

  // 결과 출력
  console.log(`\n${'='.repeat(50)}`);
  console.log(`테스트 결과: ${testResults.passed}/${testResults.tests.length} 통과`);
  console.log(`${'='.repeat(50)}\n`);

  if (testResults.failed > 0) {
    console.log('❌ 실패한 테스트:');
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => console.log(`  - ${t.name}: ${t.message}`));
    console.log('');
  }

  // 사용법 안내
  console.log('📋 ImageFX 선택 UI 사용법:\n');
  console.log('1. 내콘텐츠 페이지에서 대본 카드의 "🎨 이미지크롤링" 버튼 클릭');
  console.log('2. 대화상자에서 선택:');
  console.log('   ┌─────────────────────────────────────┐');
  console.log('   │ 🎨 이미지 생성 방식을 선택하세요:   │');
  console.log('   │                                     │');
  console.log('   │ ✅ 확인 = ImageFX + Whisk           │');
  console.log('   │    (첫 이미지를 ImageFX로 생성)     │');
  console.log('   │                                     │');
  console.log('   │ ❌ 취소 = Whisk만 사용 (기본)       │');
  console.log('   │                                     │');
  console.log('   │ ※ ImageFX 사용 시 일관된            │');
  console.log('   │    인물 이미지를 생성할 수 있습니다 │');
  console.log('   └─────────────────────────────────────┘\n');
  console.log('3. 선택에 따라 자동화 시작:');
  console.log('   - ✅ 확인: ImageFX + Whisk 모드');
  console.log('   - ❌ 취소: Whisk만 사용 모드\n');

  console.log('💡 Toast 메시지:');
  console.log('   - "🤖 자동 이미지 생성 시작 (ImageFX + Whisk)..." (확인 선택 시)');
  console.log('   - "🤖 자동 이미지 생성 시작 (Whisk)..." (취소 선택 시)\n');

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests();
