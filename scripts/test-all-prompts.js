const { execSync } = require('child_process');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     프롬프트 버전 관리 시스템 전체 테스트 스위트         ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

let allTestsPassed = true;

// ============================================
// 1. 리그레션 테스트
// ============================================
console.log('🔍 1단계: 리그레션 테스트 (DB, 파일, 성능)');
console.log('─'.repeat(60));
try {
  execSync('node scripts/test-prompt-versioning.js', {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  console.log('\n✅ 리그레션 테스트 통과\n');
} catch (error) {
  console.log('\n❌ 리그레션 테스트 실패\n');
  allTestsPassed = false;
}

// ============================================
// 2. 통합 테스트
// ============================================
console.log('🔗 2단계: 통합 테스트 (실제 사용 시나리오)');
console.log('─'.repeat(60));
try {
  execSync('node scripts/test-prompt-integration.js', {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  console.log('\n✅ 통합 테스트 통과\n');
} catch (error) {
  console.log('\n❌ 통합 테스트 실패\n');
  allTestsPassed = false;
}

// ============================================
// 최종 결과
// ============================================
console.log('╔════════════════════════════════════════════════════════════╗');
if (allTestsPassed) {
  console.log('║                    🎉 전체 테스트 통과                    ║');
  console.log('║                                                            ║');
  console.log('║  프롬프트 버전 관리 시스템이 모든 테스트를 통과했습니다. ║');
  console.log('║  프로덕션 환경에 배포할 준비가 되었습니다.               ║');
} else {
  console.log('║                   ⚠️  테스트 실패                         ║');
  console.log('║                                                            ║');
  console.log('║  일부 테스트가 실패했습니다.                              ║');
  console.log('║  위의 실패 항목을 확인하고 수정해주세요.                  ║');
}
console.log('╚════════════════════════════════════════════════════════════╝');

process.exit(allTestsPassed ? 0 : 1);
