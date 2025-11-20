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
  console.log('🧪 완료 큐 대본/영상 버튼 → 내 콘텐츠 탭 이동 테스트\n');

  const automationPagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'automation', 'page.tsx');
  const automationPageContent = fs.readFileSync(automationPagePath, 'utf-8');

  // 테스트 1: 대본 보기 버튼 존재
  const hasScriptButton = automationPageContent.includes('📝 대본') &&
                           automationPageContent.includes("title.status === 'completed'") &&
                           automationPageContent.includes('script_id');
  addTestResult('대본 보기 버튼', hasScriptButton,
    hasScriptButton ? '완료 큐에 대본 보기 버튼 존재' : '대본 보기 버튼 누락');

  // 테스트 2: 영상 보기 버튼 존재
  const hasVideoButton = automationPageContent.includes('🎬 영상') &&
                          automationPageContent.includes("title.status === 'completed'") &&
                          automationPageContent.includes('video_id');
  addTestResult('영상 보기 버튼', hasVideoButton,
    hasVideoButton ? '완료 큐에 영상 보기 버튼 존재' : '영상 보기 버튼 누락');

  // 테스트 3: 대본 버튼 클릭 시 /my-content?tab=scripts로 이동
  const scriptButtonNavigation = automationPageContent.includes("window.location.href = '/my-content?tab=scripts'") ||
                                   automationPageContent.includes('window.location.href = "/my-content?tab=scripts"');
  addTestResult('대본 버튼 네비게이션', scriptButtonNavigation,
    scriptButtonNavigation ? '/my-content?tab=scripts로 이동' : '네비게이션 누락');

  // 테스트 4: 영상 버튼 클릭 시 /my-content?tab=videos로 이동
  const videoButtonNavigation = automationPageContent.includes("window.location.href = '/my-content?tab=videos'") ||
                                  automationPageContent.includes('window.location.href = "/my-content?tab=videos"');
  addTestResult('영상 버튼 네비게이션', videoButtonNavigation,
    videoButtonNavigation ? '/my-content?tab=videos로 이동' : '네비게이션 누락');

  // 테스트 5: 대본 버튼은 completed 상태에서만 표시
  const scriptButtonCondition = automationPageContent.match(/title\.status === 'completed'.*script_id/s) ||
                                  automationPageContent.match(/script_id.*title\.status === 'completed'/s);
  addTestResult('대본 버튼 조건', !!scriptButtonCondition,
    scriptButtonCondition ? 'completed 상태 + script_id 조건' : '조건 확인 필요');

  // 테스트 6: 영상 버튼은 completed 상태에서만 표시
  const videoButtonCondition = automationPageContent.match(/title\.status === 'completed'.*video_id/s) ||
                                automationPageContent.match(/video_id.*title\.status === 'completed'/s);
  addTestResult('영상 버튼 조건', !!videoButtonCondition,
    videoButtonCondition ? 'completed 상태 + video_id 조건' : '조건 확인 필요');

  // 테스트 7: 대본 보기 버튼 스타일 (cyan)
  const scriptButtonStyle = automationPageContent.includes('bg-cyan-600') &&
                             automationPageContent.includes('내 콘텐츠에서 대본 보기');
  addTestResult('대본 버튼 스타일', scriptButtonStyle,
    scriptButtonStyle ? 'cyan 색상 + title 속성' : '스타일 누락');

  // 테스트 8: 영상 보기 버튼 스타일 (indigo)
  const videoButtonStyle = automationPageContent.includes('bg-indigo-600') &&
                            automationPageContent.includes('내 콘텐츠에서 영상 보기');
  addTestResult('영상 버튼 스타일', videoButtonStyle,
    videoButtonStyle ? 'indigo 색상 + title 속성' : '스타일 누락');

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
    console.log('  1. 완료 큐에 "📝 대본" 버튼 추가');
    console.log('  2. 완료 큐에 "🎬 영상" 버튼 추가');
    console.log('  3. 대본 버튼 클릭 → /my-content?tab=scripts 이동');
    console.log('  4. 영상 버튼 클릭 → /my-content?tab=videos 이동');
    console.log('  5. completed 상태에서만 버튼 표시');
    console.log('  6. script_id 또는 video_id가 있을 때만 표시');
    console.log('\n💡 사용 방법:');
    console.log('  1. 자동화 페이지 → "완료 큐" 탭 클릭');
    console.log('  2. 완료된 항목에서 "📝 대본" 또는 "🎬 영상" 버튼 클릭');
    console.log('  3. "내 콘텐츠" 페이지의 해당 탭으로 자동 이동');
    console.log('\n🎨 버튼 스타일:');
    console.log('  - 대본: cyan 색상 (📝 대본)');
    console.log('  - 영상: indigo 색상 (🎬 영상)');
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests().catch(error => {
  console.error('❌ 테스트 실행 오류:', error);
  process.exit(1);
});
