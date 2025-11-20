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
  console.log('🧪 YouTube 채널 업로드 수정 테스트 시작\n');

  // 테스트 1: YouTube upload route 수정 확인
  const uploadRoutePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'api', 'youtube', 'upload', 'route.ts');
  const uploadRouteContent = fs.readFileSync(uploadRoutePath, 'utf-8');

  const hasChannelIdFallback = uploadRouteContent.includes('YouTube 실제 channelId로 재조회');
  addTestResult('YouTube upload route 수정', hasChannelIdFallback, hasChannelIdFallback ? 'channelId 폴백 로직 추가됨' : 'channelId 폴백 로직 없음');

  const hasGetUserYouTubeChannels = uploadRouteContent.includes('getUserYouTubeChannels');
  addTestResult('getUserYouTubeChannels import', hasGetUserYouTubeChannels, hasGetUserYouTubeChannels ? 'import 확인' : 'import 누락');

  const hasUploadIdReturn = uploadRouteContent.includes('uploadId: uploadRecordId');
  addTestResult('uploadId 반환', hasUploadIdReturn, hasUploadIdReturn ? 'uploadId 응답에 포함' : 'uploadId 응답 누락');

  // 테스트 2: automation-scheduler 수정 확인
  const schedulerPath = path.join(__dirname, 'trend-video-frontend', 'src', 'lib', 'automation-scheduler.ts');
  const schedulerContent = fs.readFileSync(schedulerPath, 'utf-8');

  const hasRemovedDuplicateInsert = !schedulerContent.includes('INSERT INTO youtube_uploads');
  addTestResult('중복 저장 제거', hasRemovedDuplicateInsert, hasRemovedDuplicateInsert ? '중복 INSERT 제거됨' : '중복 INSERT 남아있음');

  const hasUploadIdCheck = schedulerContent.includes('if (uploadData.uploadId)');
  addTestResult('uploadId 체크 로직', hasUploadIdCheck, hasUploadIdCheck ? 'uploadId 체크 추가됨' : 'uploadId 체크 없음');

  // 테스트 3: 서버 로그 확인
  const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');
  if (fs.existsSync(logPath)) {
    const logContent = fs.readFileSync(logPath, 'utf-8');
    const recentLogs = logContent.split('\n').slice(-100).join('\n');

    // 최근 로그에서 에러 체크
    const hasChannelError = recentLogs.includes('NOT NULL constraint failed: youtube_uploads.channel_id');
    addTestResult('서버 로그 - channel_id 에러', !hasChannelError, hasChannelError ? 'channel_id NULL 에러 발견' : '에러 없음');

    const hasChannelMismatch = recentLogs.includes('채널 소유자 불일치') || recentLogs.includes('채널을 찾을 수 없음');
    addTestResult('서버 로그 - 채널 조회 에러', !hasChannelMismatch, hasChannelMismatch ? '채널 조회 에러 발견' : '에러 없음');
  } else {
    addTestResult('서버 로그 존재', false, '로그 파일이 없습니다');
  }

  // 결과 출력
  console.log(`\n📊 테스트 결과 요약:`);
  console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);

  if (testResults.failed > 0) {
    console.log('\n⚠️ 실패한 테스트:');
    testResults.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.message}`);
    });
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests();
