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
  console.log('🧪 [ImageFX + Whisk 통합 테스트] 시작\n');

  // 테스트 1: image_crawler.py 백업 확인
  const backupPath = path.join(__dirname, 'trend-video-backend', 'src', 'image_crawler', 'image_crawler.backup.py');
  const hasBackup = fs.existsSync(backupPath);
  addTestResult('백업 파일', hasBackup, hasBackup ? '백업 존재' : '백업 없음');

  // 테스트 2: image_crawler.py 파일 확인
  const crawlerPath = path.join(__dirname, 'trend-video-backend', 'src', 'image_crawler', 'image_crawler.py');
  const crawlerContent = fs.readFileSync(crawlerPath, 'utf-8');

  // argparse 추가 확인
  const hasArgparse = crawlerContent.includes('import argparse');
  addTestResult('argparse import', hasArgparse, 'argparse 모듈 확인');

  // ImageFX 함수 확인
  const hasImageFXFunction = crawlerContent.includes('def generate_image_with_imagefx');
  addTestResult('ImageFX 함수', hasImageFXFunction, 'generate_image_with_imagefx() 함수 존재');

  // 업로드 함수 확인
  const hasUploadFunction = crawlerContent.includes('def upload_image_to_whisk');
  addTestResult('업로드 함수', hasUploadFunction, 'upload_image_to_whisk() 함수 존재');

  // --use-imagefx 옵션 확인
  const hasImageFXOption = crawlerContent.includes('--use-imagefx');
  addTestResult('ImageFX 옵션', hasImageFXOption, '--use-imagefx 플래그 존재');

  // main 함수 파라미터 확인
  const hasMainParam = crawlerContent.match(/def main\([^)]*use_imagefx/);
  addTestResult('main 함수', !!hasMainParam, 'use_imagefx 파라미터 존재');

  // 비대화형 모드 확인 (input() 제거)
  const hasInputCall = crawlerContent.match(/input\s*\(/);
  addTestResult('비대화형 모드', !hasInputCall, hasInputCall ? 'input() 호출 발견 (제거 필요)' : 'input() 호출 없음');

  // 테스트 3: API 수정 확인
  const apiPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'api', 'images', 'crawl', 'route.ts');
  const apiContent = fs.readFileSync(apiPath, 'utf-8');

  // useImageFX 파라미터 확인
  const hasUseImageFXParam = apiContent.includes('useImageFX');
  addTestResult('API: useImageFX 파라미터', hasUseImageFXParam, 'useImageFX 변수 확인');

  // --use-imagefx 플래그 전달 확인
  const hasImageFXFlag = apiContent.includes("'--use-imagefx'");
  addTestResult('API: ImageFX 플래그 전달', hasImageFXFlag, 'Python 스크립트에 플래그 전달');

  // 조건부 메시지 확인
  const hasConditionalMessage = apiContent.includes('ImageFX + Whisk');
  addTestResult('API: 조건부 메시지', hasConditionalMessage, '사용 모드에 따른 메시지');

  // 테스트 4: 코드 구조 검증
  const functions = [
    'setup_chrome_driver',
    'generate_image_with_imagefx',
    'upload_image_to_whisk',
    'input_prompt_to_whisk',
    'main'
  ];

  let allFunctionsExist = true;
  for (const funcName of functions) {
    if (!crawlerContent.includes(`def ${funcName}`)) {
      allFunctionsExist = false;
      break;
    }
  }
  addTestResult('필수 함수', allFunctionsExist, allFunctionsExist ? '모든 함수 존재' : '일부 함수 누락');

  // 테스트 5: ImageFX 워크플로우 순서 확인
  const hasImageFXWorkflow =
    crawlerContent.indexOf('generate_image_with_imagefx') < crawlerContent.indexOf('upload_image_to_whisk') &&
    crawlerContent.indexOf('upload_image_to_whisk') < crawlerContent.indexOf('input_prompt_to_whisk');
  addTestResult('워크플로우 순서', hasImageFXWorkflow, 'ImageFX → 업로드 → 프롬프트 입력 순서 확인');

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
  console.log('📋 ImageFX + Whisk 통합 사용법:\n');
  console.log('1. Whisk만 사용 (기본):');
  console.log('   python image_crawler.py scenes.json\n');
  console.log('2. ImageFX + Whisk 사용:');
  console.log('   python image_crawler.py scenes.json --use-imagefx\n');
  console.log('워크플로우:');
  console.log('   ┌─────────────────────────────────────┐');
  console.log('   │ ImageFX 사용 시:                   │');
  console.log('   │ 1. ImageFX에서 첫 이미지 생성       │');
  console.log('   │ 2. 이미지 자동 다운로드             │');
  console.log('   │ 3. Whisk에 인물로 업로드            │');
  console.log('   │ 4. 모든 씬 프롬프트 입력            │');
  console.log('   └─────────────────────────────────────┘\n');
  console.log('   ┌─────────────────────────────────────┐');
  console.log('   │ Whisk만 사용 시:                   │');
  console.log('   │ 1. Whisk 페이지 열기                │');
  console.log('   │ 2. 모든 씬 프롬프트 입력            │');
  console.log('   └─────────────────────────────────────┘\n');

  console.log('🌐 API 사용법:');
  console.log('   POST /api/images/crawl');
  console.log('   {');
  console.log('     "scenes": [...],');
  console.log('     "useImageFX": true  // ImageFX 사용 시');
  console.log('   }\n');

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests();
