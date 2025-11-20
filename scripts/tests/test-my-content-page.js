/**
 * 내 콘텐츠 페이지 통합테스트
 * /my-content 페이지의 주요 기능 검증
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

// 1. 작업 목록 조회
function testJobList() {
  console.log('📝 STEP 1: 작업 목록 조회 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'my-content', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasJobsState = content.includes('jobs') || content.includes('setJobs');
    addTestResult('1-1. 작업 목록 상태', hasJobsState, hasJobsState ? '확인' : '누락');

    const hasFetchJobs = content.includes('fetchJobs') || content.includes('/api/jobs');
    addTestResult('1-2. 작업 조회 API', hasFetchJobs, hasFetchJobs ? '확인' : '누락');

    const hasUseEffect = content.includes('useEffect');
    addTestResult('1-3. 자동 로딩', hasUseEffect, hasUseEffect ? '확인' : '누락');

  } catch (error) {
    addTestResult('1. 작업 목록 조회', false, error.message);
  }
  console.log('');
}

// 2. 작업 상태 표시
function testStatusDisplay() {
  console.log('📝 STEP 2: 작업 상태 표시 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'my-content', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasStatusDisplay = content.includes('status') && (content.includes('processing') || content.includes('completed'));
    addTestResult('2-1. 상태 표시', hasStatusDisplay, hasStatusDisplay ? '확인' : '누락');

    const hasProgress = content.includes('progress') || content.includes('진행');
    addTestResult('2-2. 진행률 표시', hasProgress, hasProgress ? '확인' : '누락');

    const hasPolling = content.includes('setInterval') || content.includes('폴링');
    addTestResult('2-3. 자동 새로고침', hasPolling, hasPolling ? '확인' : '누락');

  } catch (error) {
    addTestResult('2. 작업 상태 표시', false, error.message);
  }
  console.log('');
}

// 3. 폴더 열기
function testOpenFolder() {
  console.log('📝 STEP 3: 폴더 열기 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'my-content', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasFolderButton = content.includes('📁') || content.includes('폴더');
    addTestResult('3-1. 폴더 열기 버튼', hasFolderButton, hasFolderButton ? '확인' : '누락');

    const hasOpenFolder = content.includes('handleOpenFolder') || content.includes('/api/open-folder');
    addTestResult('3-2. 폴더 열기 함수', hasOpenFolder, hasOpenFolder ? '확인' : '누락');

  } catch (error) {
    addTestResult('3. 폴더 열기', false, error.message);
  }
  console.log('');
}

// 4. 삭제 기능
function testDelete() {
  console.log('📝 STEP 4: 삭제 기능 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'my-content', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasDeleteButton = content.includes('삭제') || content.includes('delete');
    addTestResult('4-1. 삭제 버튼', hasDeleteButton, hasDeleteButton ? '확인' : '누락');

    const hasDeleteHandler = content.includes('handleDelete') || content.includes('DELETE');
    addTestResult('4-2. 삭제 핸들러', hasDeleteHandler, hasDeleteHandler ? '확인' : '누락');

    const hasConfirm = content.includes('confirm') || content.includes('확인');
    addTestResult('4-3. 삭제 확인', hasConfirm, hasConfirm ? '확인' : '누락');

  } catch (error) {
    addTestResult('4. 삭제 기능', false, error.message);
  }
  console.log('');
}

// 5. 타입별 필터링
function testFiltering() {
  console.log('📝 STEP 5: 타입별 필터링 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'my-content', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasFilter = content.includes('filter') || content.includes('selectedType');
    addTestResult('5-1. 필터 상태', hasFilter, hasFilter ? '확인' : '누락');

    const hasTypeButtons = content.includes('전체') || content.includes('All');
    addTestResult('5-2. 타입 버튼', hasTypeButtons, hasTypeButtons ? '확인' : '누락');

    const hasFiltering = content.includes('.filter(') && content.includes('type');
    addTestResult('5-3. 필터링 로직', hasFiltering, hasFiltering ? '확인' : '누락');

  } catch (error) {
    addTestResult('5. 필터링', false, error.message);
  }
  console.log('');
}

async function runTests() {
  console.log('🧪 [내 콘텐츠 페이지 통합테스트] 시작\n');
  console.log('='.repeat(70) + '\n');

  testJobList();
  testStatusDisplay();
  testOpenFolder();
  testDelete();
  testFiltering();

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
    path.join(resultsDir, 'my-content-page.json'),
    JSON.stringify({
      testName: '내 콘텐츠 페이지',
      category: '내 콘텐츠 페이지',
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
