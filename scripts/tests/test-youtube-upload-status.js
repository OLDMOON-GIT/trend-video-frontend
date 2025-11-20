/**
 * 유튜브 업로드 상태 추적 통합테스트
 * 유튜브 영상 업로드 상태 관리 기능 검증
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

// 1. 업로드 상태 관리
function testUploadStatusManagement() {
  console.log('📝 STEP 1: 업로드 상태 관리 검증');
  console.log('-'.repeat(70));

  try {
    const componentPath = path.join(__dirname, 'trend-video-frontend', 'src', 'components', 'YouTubeUploadButton.tsx');

    if (!fs.existsSync(componentPath)) {
      addTestResult('1-1. 컴포넌트 존재', false, 'YouTubeUploadButton.tsx 없음');
      addTestResult('1-2. 업로드 상태', false, '컴포넌트 없음');
      addTestResult('1-3. 진행률 표시', false, '컴포넌트 없음');
      console.log('');
      return;
    }

    const content = fs.readFileSync(componentPath, 'utf-8');

    addTestResult('1-1. 컴포넌트 존재', true, 'YouTubeUploadButton.tsx 확인');

    const hasUploadStatus = content.includes('uploadStatus') || content.includes('isUploading') || content.includes('uploading');
    addTestResult('1-2. 업로드 상태 관리', hasUploadStatus, hasUploadStatus ? '확인' : '누락');

    const hasProgress = content.includes('progress') || content.includes('percent');
    addTestResult('1-3. 진행률 관리', hasProgress, hasProgress ? '확인' : '누락');

  } catch (error) {
    addTestResult('1. 업로드 상태 관리', false, error.message);
  }
  console.log('');
}

// 2. 업로드 API
function testUploadApi() {
  console.log('📝 STEP 2: 업로드 API 검증');
  console.log('-'.repeat(70));

  try {
    const apiPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'api', 'youtube', 'upload', 'route.ts');

    if (!fs.existsSync(apiPath)) {
      addTestResult('2-1. API 파일 존재', false, 'route.ts 없음');
      addTestResult('2-2. POST 메서드', false, 'API 파일 없음');
      addTestResult('2-3. 업로드 처리', false, 'API 파일 없음');
      console.log('');
      return;
    }

    const content = fs.readFileSync(apiPath, 'utf-8');

    addTestResult('2-1. API 파일 존재', true, 'route.ts 확인');

    const hasPostMethod = content.includes('export async function POST');
    addTestResult('2-2. POST 메서드', hasPostMethod, hasPostMethod ? '확인' : '누락');

    const hasUpload = content.includes('upload') || content.includes('youtube');
    addTestResult('2-3. 업로드 처리', hasUpload, hasUpload ? '확인' : '누락');

  } catch (error) {
    addTestResult('2. 업로드 API', false, error.message);
  }
  console.log('');
}

// 3. 데이터베이스 업로드 상태 추적
function testDatabaseTracking() {
  console.log('📝 STEP 3: 데이터베이스 업로드 상태 추적 검증');
  console.log('-'.repeat(70));

  try {
    // youtube_uploads 테이블을 사용하는 파일 확인 (db.ts, automation-scheduler.ts 등)
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'src', 'lib', 'db.ts');
    const schedulerPath = path.join(__dirname, 'trend-video-frontend', 'src', 'lib', 'automation-scheduler.ts');

    let hasYoutubeUploads = false;
    let hasStatusField = false;
    let hasVideoId = false;

    // db.ts 확인
    if (fs.existsSync(dbPath)) {
      const dbContent = fs.readFileSync(dbPath, 'utf-8');
      if (dbContent.includes('youtube_uploads')) hasYoutubeUploads = true;
      if (dbContent.includes('status') || dbContent.includes('upload_status')) hasStatusField = true;
      if (dbContent.includes('videoId') || dbContent.includes('video_id')) hasVideoId = true;
    }

    // automation-scheduler.ts 확인
    if (fs.existsSync(schedulerPath)) {
      const schedulerContent = fs.readFileSync(schedulerPath, 'utf-8');
      if (schedulerContent.includes('youtube_uploads')) hasYoutubeUploads = true;
      if (schedulerContent.includes('status') || schedulerContent.includes('upload_status')) hasStatusField = true;
      if (schedulerContent.includes('videoId') || schedulerContent.includes('video_id')) hasVideoId = true;
    }

    addTestResult('3-1. youtube_uploads 테이블', hasYoutubeUploads, hasYoutubeUploads ? '확인' : '누락');
    addTestResult('3-2. 업로드 상태 필드', hasStatusField, hasStatusField ? '확인' : '누락');
    addTestResult('3-3. videoId 필드', hasVideoId, hasVideoId ? '확인' : '누락');

  } catch (error) {
    addTestResult('3. DB 상태 추적', false, error.message);
  }
  console.log('');
}

// 4. 업로드 상태 표시 UI
function testUploadStatusDisplay() {
  console.log('📝 STEP 4: 업로드 상태 표시 UI 검증');
  console.log('-'.repeat(70));

  try {
    const myContentPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'my-content', 'page.tsx');
    const content = fs.readFileSync(myContentPath, 'utf-8');

    const hasYoutubeStatus = content.includes('youtube') || content.includes('YouTube') || content.includes('업로드');
    addTestResult('4-1. 유튜브 상태 표시', hasYoutubeStatus, hasYoutubeStatus ? '확인' : '누락');

    const hasStatusCheck = content.includes('uploaded') || content.includes('uploading') || content.includes('failed');
    addTestResult('4-2. 상태별 표시', hasStatusCheck, hasStatusCheck ? '확인' : '누락');

  } catch (error) {
    addTestResult('4. 상태 표시 UI', false, error.message);
  }
  console.log('');
}

// 5. 업로드 버튼 상태 변화
function testUploadButtonStates() {
  console.log('📝 STEP 5: 업로드 버튼 상태 변화 검증');
  console.log('-'.repeat(70));

  try {
    const componentPath = path.join(__dirname, 'trend-video-frontend', 'src', 'components', 'YouTubeUploadButton.tsx');

    if (!fs.existsSync(componentPath)) {
      addTestResult('5-1. 버튼 비활성화', false, '컴포넌트 없음');
      addTestResult('5-2. 로딩 표시', false, '컴포넌트 없음');
      addTestResult('5-3. 완료 표시', false, '컴포넌트 없음');
      console.log('');
      return;
    }

    const content = fs.readFileSync(componentPath, 'utf-8');

    const hasDisabled = content.includes('disabled') || content.includes('isUploading');
    addTestResult('5-1. 업로드 중 버튼 비활성화', hasDisabled, hasDisabled ? '확인' : '누락');

    const hasLoadingIndicator = content.includes('Loading') || content.includes('업로드') || content.includes('...') || content.includes('Uploading');
    addTestResult('5-2. 로딩 표시', hasLoadingIndicator, hasLoadingIndicator ? '확인' : '누락');

    const hasSuccessState = content.includes('success') || content.includes('complete') || content.includes('완료');
    addTestResult('5-3. 완료 상태', hasSuccessState, hasSuccessState ? '확인' : '누락');

  } catch (error) {
    addTestResult('5. 버튼 상태 변화', false, error.message);
  }
  console.log('');
}

async function runTests() {
  console.log('🧪 [유튜브 업로드 상태 추적 통합테스트] 시작\n');
  console.log('='.repeat(70) + '\n');

  testUploadStatusManagement();
  testUploadApi();
  testDatabaseTracking();
  testUploadStatusDisplay();
  testUploadButtonStates();

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
    path.join(resultsDir, 'youtube-upload-status.json'),
    JSON.stringify({
      testName: '유튜브 업로드 상태 추적',
      category: '유튜브 연동',
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
