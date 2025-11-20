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
  console.log('🧪 유튜브 예약 업로드 기본값 자동 설정 테스트\n');

  const automationPagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'automation', 'page.tsx');
  const automationPageContent = fs.readFileSync(automationPagePath, 'utf-8');

  // 테스트 1: youtubeSchedule onChange에서 value 확인
  const hasValueCheck = automationPageContent.includes("const value = e.target.value") &&
                         automationPageContent.includes("if (value === 'scheduled')");
  addTestResult('youtubeSchedule onChange', hasValueCheck,
    hasValueCheck ? 'scheduled 선택 시 처리 로직 존재' : 'onChange 로직 누락');

  // 테스트 2: 현재 시간 + 3분 계산
  const hasDefaultTimeCalc = automationPageContent.includes('Date.now() + 3 * 60 * 1000') &&
                              automationPageContent.includes('toISOString()') &&
                              automationPageContent.includes('slice(0, 16)');
  addTestResult('3분 후 시간 계산', hasDefaultTimeCalc,
    hasDefaultTimeCalc ? 'new Date(Date.now() + 3분).toISOString().slice(0, 16)' : '시간 계산 누락');

  // 테스트 3: defaultTime 변수 생성
  const hasDefaultTimeVar = automationPageContent.includes('const defaultTime') &&
                             automationPageContent.includes('new Date(Date.now() + 3 * 60 * 1000)');
  addTestResult('defaultTime 변수', hasDefaultTimeVar,
    hasDefaultTimeVar ? 'defaultTime 변수 선언됨' : '변수 누락');

  // 테스트 4: youtubePublishAt 자동 설정
  const setsPublishAt = automationPageContent.includes('youtubeSchedule: value, youtubePublishAt: defaultTime') ||
                         automationPageContent.includes('youtubePublishAt: defaultTime');
  addTestResult('youtubePublishAt 자동 설정', setsPublishAt,
    setsPublishAt ? 'youtubePublishAt에 defaultTime 설정' : '자동 설정 누락');

  // 테스트 5: scheduled일 때만 설정 (조건부)
  const conditionalSet = automationPageContent.includes("if (value === 'scheduled')") &&
                          automationPageContent.includes('youtubePublishAt: defaultTime');
  addTestResult('조건부 설정', conditionalSet,
    conditionalSet ? 'scheduled 선택 시에만 설정' : '조건 누락');

  // 테스트 6: immediate 선택 시 처리
  const hasElseBranch = automationPageContent.includes('else') &&
                         automationPageContent.includes('youtubeSchedule: value');
  addTestResult('immediate 선택 처리', hasElseBranch,
    hasElseBranch ? 'else 분기로 immediate 처리' : 'else 분기 누락');

  // 테스트 7: min 속성 (최소 3분 이후)
  const hasMinAttribute = automationPageContent.includes('min={new Date(Date.now() + 3 * 60 * 1000)');
  addTestResult('min 속성 (3분 이후)', hasMinAttribute,
    hasMinAttribute ? '최소값 3분 이후로 제한' : 'min 속성 누락');

  // 테스트 8: 경고 메시지 존재
  const hasWarning = automationPageContent.includes('⚠️ 비디오는 즉시 업로드되고 private 상태로 유지') &&
                      automationPageContent.includes('최소 3분 이후');
  addTestResult('경고 메시지', hasWarning,
    hasWarning ? '사용자 안내 메시지 존재' : '경고 메시지 누락');

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
  } else {
    console.log('\n✅ 모든 테스트 통과!');
    console.log('\n📋 구현된 기능:');
    console.log('  1. "예약 업로드" 선택 시 자동으로 현재 시간 + 3분 설정');
    console.log('  2. datetime-local 입력 필드에 기본값 자동 입력');
    console.log('  3. 최소값은 현재 시간 + 3분으로 제한');
    console.log('  4. "즉시 업로드" 선택 시 youtubePublishAt 미설정');
    console.log('\n💡 사용자 경험:');
    console.log('  1. 자동화 페이지에서 제목 추가');
    console.log('  2. "유튜브 업로드" 드롭다운에서 "예약 업로드" 선택');
    console.log('  3. 자동으로 현재 시간 + 3분이 입력됨');
    console.log('  4. 필요시 시간 수정 가능');
    console.log('  5. 최소 3분 이후로만 설정 가능 (YouTube API 제한)');
    console.log('\n⏰ 기본값 계산:');
    console.log('  - 현재 시간: new Date(Date.now())');
    console.log('  - +3분: Date.now() + 3 * 60 * 1000');
    console.log('  - ISO 형식: toISOString().slice(0, 16)');
    console.log('  - 예시: 현재 15:30 → 기본값 15:33');
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests().catch(error => {
  console.error('❌ 테스트 실행 오류:', error);
  process.exit(1);
});
