/**
 * 롱폼/숏폼/SORA2 사연 생성 테스트 스크립트
 *
 * 용도:
 * - 훅 + CTA 구조가 제대로 적용되는지 테스트
 * - 롱폼, 숏폼, SORA2 모두 테스트
 *
 * 실행:
 * node test-story-generation.js
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

async function runTests() {
  console.log('🧪 롱폼/숏폼/SORA2 사연 생성 테스트 시작\n');

  // 테스트 1: 프롬프트 템플릿 파일 존재 확인
  console.log('📁 [1/5] 프롬프트 템플릿 파일 확인...\n');

  const promptFiles = [
    'trend-video-backend/src/prompts/long_form_prompt.txt',
    'trend-video-backend/src/prompts/short_story_system.txt',
    'trend-video-backend/src/prompts/short_story_user.txt',
    'trend-video-frontend/prompts/prompt_sora2.txt',
    'trend-video-frontend/prompts/sora2_prompt.txt'
  ];

  for (const file of promptFiles) {
    const exists = fs.existsSync(file);
    addTestResult(
      `프롬프트 파일: ${path.basename(file)}`,
      exists,
      exists ? '존재함' : '파일 없음'
    );

    if (exists) {
      const content = fs.readFileSync(file, 'utf-8');
      const hasCTA = content.includes('구독') && content.includes('좋아요');
      addTestResult(
        `  ㄴ CTA 멘트 포함 확인`,
        hasCTA,
        hasCTA ? 'CTA 포함됨' : 'CTA 없음'
      );
    }
  }

  // 테스트 2: 롱폼 프롬프트 구조 검증
  console.log('\n📖 [2/5] 롱폼 프롬프트 구조 검증...\n');

  const longFormPrompt = fs.readFileSync('trend-video-backend/src/prompts/long_form_prompt.txt', 'utf-8');

  const longFormChecks = [
    { name: '훅 섹션', pattern: /훅.*Hook/i },
    { name: 'CTA 필수 포함', pattern: /사연 시작 전에 무료로 할 수 있는 구독과 좋아요/ },
    { name: '구조 순서 정의', pattern: /1\).*훅.*2\).*3\).*CTA/s },
    { name: 'scene_1 특별 처리', pattern: /scene_1|첫 번째 씬/ },
    { name: '예시 포함', pattern: /예시|Example/i }
  ];

  for (const check of longFormChecks) {
    const passed = check.pattern.test(longFormPrompt);
    addTestResult(
      `롱폼: ${check.name}`,
      passed,
      passed ? '확인됨' : '누락됨'
    );
  }

  // 테스트 3: 숏폼 프롬프트 구조 검증
  console.log('\n🎬 [3/5] 숏폼 프롬프트 구조 검증...\n');

  const shortSystemPrompt = fs.readFileSync('trend-video-backend/src/prompts/short_story_system.txt', 'utf-8');
  const shortUserPrompt = fs.readFileSync('trend-video-backend/src/prompts/short_story_user.txt', 'utf-8');

  const shortFormChecks = [
    { name: '훅 섹션 (5-10초)', pattern: /훅.*5-10초/i, content: shortSystemPrompt },
    { name: 'CTA 필수 포함', pattern: /구독과 좋아요 부탁드립니다/, content: shortSystemPrompt },
    { name: '3단계 구조', pattern: /1단계.*2단계.*3단계/s, content: shortUserPrompt },
    { name: '분량 기준 명시', pattern: /150-200자|target_chars/, content: shortSystemPrompt },
    { name: 'CTA 생략 금지', pattern: /CTA.*생략.*금지/i, content: shortUserPrompt }
  ];

  for (const check of shortFormChecks) {
    const passed = check.pattern.test(check.content);
    addTestResult(
      `숏폼: ${check.name}`,
      passed,
      passed ? '확인됨' : '누락됨'
    );
  }

  // 테스트 4: SORA2 프롬프트 구조 검증
  console.log('\n🎥 [4/5] SORA2 프롬프트 구조 검증...\n');

  const sora2Prompt1 = fs.readFileSync('trend-video-frontend/prompts/prompt_sora2.txt', 'utf-8');
  const sora2Prompt2 = fs.readFileSync('trend-video-frontend/prompts/sora2_prompt.txt', 'utf-8');

  const sora2Checks = [
    { name: 'CTA + 몰입 씬 구조', pattern: /씬 1.*CTA.*몰입/i, content: sora2Prompt1 },
    { name: 'CTA 필수 규칙', pattern: /필수.*구독과 좋아요 부탁드립니다/i, content: sora2Prompt1 },
    { name: 'CTA 생략 금지', pattern: /생략.*금지/i, content: sora2Prompt1 },
    { name: 'scene_01 CTA 포함', pattern: /scene_name.*CTA.*몰입/i, content: sora2Prompt2 },
    { name: 'narration에 CTA 예시', pattern: /narration.*구독과 좋아요/i, content: sora2Prompt2 }
  ];

  for (const check of sora2Checks) {
    const passed = check.pattern.test(check.content);
    addTestResult(
      `SORA2: ${check.name}`,
      passed,
      passed ? '확인됨' : '누락됨'
    );
  }

  // 테스트 5: 코드 수정 확인
  console.log('\n💻 [5/5] 코드 수정 사항 확인...\n');

  const longFormCreatorPath = 'trend-video-backend/src/video_generator/long_form_creator.py';
  if (fs.existsSync(longFormCreatorPath)) {
    const codeContent = fs.readFileSync(longFormCreatorPath, 'utf-8');

    const codeChecks = [
      { name: '_load_prompt_template 메서드', pattern: /def _load_prompt_template/ },
      { name: 'long_form_prompt.txt 로드', pattern: /long_form_prompt\.txt/ },
      { name: 'scene_1 특수 처리', pattern: /if scene_num == 1:|scene_num이 1/ },
      { name: 'CTA 필수 포함 프롬프트', pattern: /구독.*좋아요.*CTA.*필수/ }
    ];

    for (const check of codeChecks) {
      const passed = check.pattern.test(codeContent);
      addTestResult(
        `코드: ${check.name}`,
        passed,
        passed ? '적용됨' : '미적용'
      );
    }
  } else {
    addTestResult('코드 파일 존재', false, '파일 없음');
  }

  // 최종 결과
  console.log('\n' + '='.repeat(60));
  console.log(`📊 테스트 결과: ${testResults.passed}/${testResults.tests.length} 통과`);
  console.log('='.repeat(60));

  if (testResults.failed > 0) {
    console.log('\n❌ 실패한 테스트:');
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => console.log(`   - ${t.name}: ${t.message}`));
  } else {
    console.log('\n🎉 모든 테스트 통과!');
    console.log('\n다음 단계:');
    console.log('1. 롱폼 생성 테스트:');
    console.log('   - 프론트엔드에서 롱폼 사연 생성 요청');
    console.log('   - scene_1에 훅 + CTA가 포함되는지 확인');
    console.log('');
    console.log('2. 숏폼 생성 테스트:');
    console.log('   - 프론트엔드에서 숏폼 생성 요청');
    console.log('   - CTA가 자동으로 포함되는지 확인');
    console.log('');
    console.log('3. SORA2 생성 테스트:');
    console.log('   - 프론트엔드에서 SORA2 영상 생성 요청');
    console.log('   - scene_1 narration에 "구독과 좋아요 부탁드립니다." 포함 확인');
    console.log('');
    console.log('4. 생성된 스크립트 확인:');
    console.log('   - 구독/좋아요 멘트 위치 확인');
    console.log('   - 자연스러운 흐름 확인');
  }

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests().catch(err => {
  console.error('테스트 실행 중 오류:', err);
  process.exit(1);
});
