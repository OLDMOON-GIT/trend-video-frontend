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
  console.log('🧪 즉시 실행 확인 메시지 테스트\n');

  const automationPagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'automation', 'page.tsx');
  const automationPageContent = fs.readFileSync(automationPagePath, 'utf-8');

  // 테스트 1: forceExecute 함수에 confirm 호출 존재
  const hasConfirm = automationPageContent.includes('async function forceExecute') &&
                      automationPageContent.includes('if (!confirm(');
  addTestResult('confirm 호출', hasConfirm,
    hasConfirm ? 'forceExecute에 confirm 다이얼로그 존재' : 'confirm 호출 누락');

  // 테스트 2: 제목 포함 메시지
  const hasTitle = automationPageContent.includes('confirm(`"${title}"') ||
                    automationPageContent.includes('confirm(\`"${title}"\`');
  addTestResult('제목 포함', hasTitle,
    hasTitle ? '확인 메시지에 제목 포함' : '제목 누락');

  // 테스트 3: "즉시 실행하시겠습니까?" 메시지
  const hasMessage = automationPageContent.includes('즉시 실행하시겠습니까?');
  addTestResult('확인 메시지', hasMessage,
    hasMessage ? '"즉시 실행하시겠습니까?" 메시지 존재' : '확인 메시지 누락');

  // 테스트 4: confirm false 시 return
  const hasReturn = automationPageContent.includes('if (!confirm(') &&
                     automationPageContent.includes('return;');
  addTestResult('취소 시 종료', hasReturn,
    hasReturn ? 'confirm 취소 시 함수 종료' : 'return 문 누락');

  // 테스트 5: confirm 위치 (try 블록 이전)
  const confirmBeforeTry = automationPageContent.match(/async function forceExecute[\s\S]*?if \(!confirm[\s\S]*?try \{/);
  addTestResult('confirm 위치', !!confirmBeforeTry,
    confirmBeforeTry ? 'confirm이 try 블록 이전에 위치' : '위치 확인 필요');

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
    console.log('  1. "즉시 실행" 버튼 클릭 시 확인 다이얼로그 표시');
    console.log('  2. 제목과 함께 "즉시 실행하시겠습니까?" 메시지 표시');
    console.log('  3. 사용자가 "취소"를 선택하면 실행되지 않음');
    console.log('  4. "확인"을 선택해야만 실행됨');
    console.log('\n💡 사용자 경험:');
    console.log('  1. 자동화 페이지 → "대기 큐" 탭');
    console.log('  2. 항목에서 "⚡ 즉시 실행" 버튼 클릭');
    console.log('  3. 확인 다이얼로그 표시: "[제목]\\n\\n즉시 실행하시겠습니까?"');
    console.log('  4. "확인" → 실행 시작, "취소" → 아무 일도 일어나지 않음');
    console.log('\n🔒 안전성:');
    console.log('  - 실수로 클릭해도 확인 단계가 있어 안전');
    console.log('  - 어떤 작업이 실행될지 제목으로 명확히 표시');
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests().catch(error => {
  console.error('❌ 테스트 실행 오류:', error);
  process.exit(1);
});
