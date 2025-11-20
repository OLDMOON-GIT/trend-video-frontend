/**
 * 버그 수정 검증 통합테스트
 * 최근 수정된 버그들이 제대로 수정되었는지 검증
 */

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

// 1. 무한 루프 버그 (대본 진행률 100%)
function testInfiniteLoopFix() {
  console.log('📝 STEP 1: 무한 루프 버그 수정 검증');
  console.log('-'.repeat(70));

  try {
    const apiPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'api', 'scripts', 'status', '[id]', 'route.ts');
    const content = fs.readFileSync(apiPath, 'utf-8');

    // Invalid JSON 처리 시 failed로 변경하는지
    const hasFailedStatus = content.includes("actualStatus = 'failed'");
    addTestResult('1-1. Invalid JSON → failed', hasFailedStatus, hasFailedStatus ? '확인' : '누락');

    // DB 업데이트도 있는지
    const hasDbUpdate = content.includes("SET status = 'failed'");
    addTestResult('1-2. DB status 업데이트', hasDbUpdate, hasDbUpdate ? '확인' : '누락');

    // scenes 검증
    const hasScenesCheck = content.includes('parsedContent.scenes') && content.includes('scenes.length === 0');
    addTestResult('1-3. scenes 빈 배열 검증', hasScenesCheck, hasScenesCheck ? '확인' : '누락');

    // processing으로 반환하지 않는지 (무한 루프 원인)
    const catchBlocks = content.match(/catch\s*\([^)]*\)\s*{[^}]*}/g) || [];
    const noProcessingInCatch = catchBlocks.every(block => !block.includes("actualStatus = 'processing'"));
    addTestResult('1-4. catch에서 processing 반환 안함', noProcessingInCatch, noProcessingInCatch ? '확인' : '위험!');

  } catch (error) {
    addTestResult('1. 무한 루프 버그', false, error.message);
  }
  console.log('');
}

// 2. 폴더 열기 포그라운드
function testFolderForeground() {
  console.log('📝 STEP 2: 폴더 열기 포그라운드 수정 검증');
  console.log('-'.repeat(70));

  try {
    const apiPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'api', 'open-folder', 'route.ts');
    const content = fs.readFileSync(apiPath, 'utf-8');

    // explorer.exe 직접 실행
    const hasExplorerExe = content.includes('explorer.exe');
    addTestResult('2-1. explorer.exe 사용', hasExplorerExe, hasExplorerExe ? '확인' : '누락');

    // spawn 사용
    const hasSpawn = content.includes('spawn');
    addTestResult('2-2. spawn 사용', hasSpawn, hasSpawn ? '확인' : '누락');

    // detached, stdio ignore
    const hasDetached = content.includes('detached: true');
    addTestResult('2-3. detached 옵션', hasDetached, hasDetached ? '확인' : '누락');

    const hasUnref = content.includes('.unref()');
    addTestResult('2-4. unref 호출', hasUnref, hasUnref ? '확인' : '누락');

    // PowerShell -WindowStyle Hidden 사용 안하는지 (문제 원인)
    const noHiddenPowershell = !content.includes('-WindowStyle Hidden');
    addTestResult('2-5. PowerShell Hidden 미사용', noHiddenPowershell, noHiddenPowershell ? '확인' : '문제 있음');

  } catch (error) {
    addTestResult('2. 폴더 포그라운드', false, error.message);
  }
  console.log('');
}

// 3. script_id NULL 버튼 에러
function testScriptIdNull() {
  console.log('📝 STEP 3: script_id NULL 버튼 에러 수정 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'automation', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    // 조건부 렌더링 확인
    const hasConditionalRender = content.includes('script_id || video_id') ||
                                 content.includes('schedule.script_id') ||
                                 content.includes('schedule.video_id');
    addTestResult('3-1. 조건부 버튼 렌더링', hasConditionalRender, hasConditionalRender ? '확인' : '누락');

    // script_id 체크
    const hasScriptIdCheck = content.includes('script_id') && content.includes('?');
    addTestResult('3-2. script_id 존재 여부 체크', hasScriptIdCheck, hasScriptIdCheck ? '확인' : '누락');

  } catch (error) {
    addTestResult('3. script_id NULL', false, error.message);
  }
  console.log('');
}

// 4. 이미지 순서 역순 버그 (이미 테스트됨)
function testImageOrderBug() {
  console.log('📝 STEP 4: 이미지 순서 역순 버그 수정 검증');
  console.log('-'.repeat(70));

  try {
    const componentPath = path.join(__dirname, 'trend-video-frontend', 'src', 'components', 'MediaUploadBox.tsx');
    const content = fs.readFileSync(componentPath, 'utf-8');

    // 정렬 후 부모에 전달
    const hasCallback = content.includes('onImagesChange(sortedImages)') &&
                       content.includes('onVideosChange(sortedVideos)');
    addTestResult('4-1. 정렬 결과 부모 전달', hasCallback, hasCallback ? '확인' : '누락');

    // 순서 변경 감지
    const hasOrderCheck = content.includes('isOrderChanged');
    addTestResult('4-2. 순서 변경 감지', hasOrderCheck, hasOrderCheck ? '확인' : '누락');

  } catch (error) {
    addTestResult('4. 이미지 순서 버그', false, error.message);
  }
  console.log('');
}

async function runTests() {
  console.log('🧪 [버그 수정 검증 통합테스트] 시작\n');
  console.log('='.repeat(70) + '\n');

  testInfiniteLoopFix();
  testFolderForeground();
  testScriptIdNull();
  testImageOrderBug();

  console.log('='.repeat(70));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(70));
  console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);
  console.log(`📈 커버리지: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));

  // 결과 저장
  const resultsDir = path.join(__dirname, 'test-results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  fs.writeFileSync(
    path.join(resultsDir, 'bug-fixes.json'),
    JSON.stringify({
      testName: '버그 수정 검증',
      category: '버그 수정 검증',
      timestamp: new Date().toISOString(),
      passed: testResults.failed === 0,
      summary: {
        total: testResults.tests.length,
        passed: testResults.passed,
        failed: testResults.failed,
        percentage: parseFloat(((testResults.passed / testResults.tests.length) * 100).toFixed(1))
      },
      tests: testResults.tests
    }, null, 2)
  );

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests();
