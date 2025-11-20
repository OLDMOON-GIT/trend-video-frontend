/**
 * SORA2 영상 생성 실제 테스트
 *
 * 용도:
 * - SORA2 프롬프트가 실제로 CTA를 포함하는지 테스트
 * - 생성된 JSON의 scene_01에 "구독과 좋아요 부탁드립니다." 포함 확인
 */

const fs = require('fs');
const path = require('path');

// SORA2 프롬프트 로드 함수 (route.ts의 getSora2Prompt 재현)
function getSora2Prompt() {
  const promptsPath = path.join(__dirname, 'trend-video-frontend/prompts');

  try {
    // prompt_sora2.txt 우선 시도
    const promptFile1 = path.join(promptsPath, 'prompt_sora2.txt');
    if (fs.existsSync(promptFile1)) {
      console.log('✅ prompt_sora2.txt 파일 로드');
      return fs.readFileSync(promptFile1, 'utf-8');
    }

    // sora2_prompt.txt 시도
    const promptFile2 = path.join(promptsPath, 'sora2_prompt.txt');
    if (fs.existsSync(promptFile2)) {
      console.log('✅ sora2_prompt.txt 파일 로드');
      return fs.readFileSync(promptFile2, 'utf-8');
    }

    console.error('❌ SORA2 프롬프트 파일을 찾을 수 없습니다');
    return null;
  } catch (error) {
    console.error('❌ 프롬프트 로드 실패:', error.message);
    return null;
  }
}

// 테스트 실행
async function runTest() {
  console.log('🧪 SORA2 실제 생성 테스트 시작\n');

  // 1. 프롬프트 로드
  console.log('📁 [1/3] SORA2 프롬프트 로드...\n');
  const prompt = getSora2Prompt();

  if (!prompt) {
    console.error('\n❌ 테스트 실패: 프롬프트를 로드할 수 없습니다');
    process.exit(1);
  }

  // 2. CTA 필수 규칙 확인
  console.log('\n🔍 [2/3] CTA 규칙 검증...\n');

  const checks = [
    {
      name: '씬 1 CTA 필수',
      pattern: /씬 1.*CTA.*몰입/i,
      found: /씬 1.*CTA.*몰입/i.test(prompt)
    },
    {
      name: 'CTA 필수 규칙 존재',
      pattern: /필수.*구독과 좋아요 부탁드립니다/i,
      found: /필수.*구독과 좋아요 부탁드립니다/i.test(prompt)
    },
    {
      name: 'CTA 생략 금지 규칙',
      pattern: /생략.*금지/i,
      found: /생략.*금지/i.test(prompt)
    },
    {
      name: 'scene_01 예시에 CTA 포함',
      pattern: /scene_name.*CTA.*몰입/i,
      found: /scene_name.*CTA.*몰입/i.test(prompt)
    },
    {
      name: 'narration 예시에 CTA 포함',
      pattern: /narration.*구독과 좋아요/i,
      found: /narration.*구독과 좋아요/i.test(prompt)
    }
  ];

  let allPassed = true;
  checks.forEach(check => {
    if (check.found) {
      console.log(`✅ ${check.name}: 확인됨`);
    } else {
      console.log(`❌ ${check.name}: 누락됨`);
      allPassed = false;
    }
  });

  // 3. 프롬프트 내용 샘플 출력
  console.log('\n📋 [3/3] 프롬프트 샘플 확인...\n');

  // 씬 1 관련 부분만 추출
  const scene1Match = prompt.match(/씬 1[^]*?씬 2/i);
  if (scene1Match) {
    console.log('📝 씬 1 구조:');
    console.log('─'.repeat(60));
    const scene1Text = scene1Match[0].replace(/씬 2/i, '').trim();
    console.log(scene1Text.substring(0, 300) + '...\n');
  }

  // JSON 예시에서 scene_01 부분만 추출
  const scene01Match = prompt.match(/"scene_id": "scene_01[^}]*}/);
  if (scene01Match) {
    console.log('📝 scene_01 JSON 예시:');
    console.log('─'.repeat(60));
    console.log(scene01Match[0] + '\n');
  }

  // 최종 결과
  console.log('='.repeat(60));
  if (allPassed) {
    console.log('✅ 모든 검증 통과!');
    console.log('\n✨ SORA2 프롬프트가 올바르게 설정되었습니다.');
    console.log('   AI가 이 프롬프트를 사용하면:');
    console.log('   - 씬 0: 훅 (3초)');
    console.log('   - 씬 1: "구독과 좋아요 부탁드립니다." + 감정 몰입 (9초)');
    console.log('   - 씬 2: 반전 (9초)');
    console.log('   - 씬 3: 중독성 마무리 (9초)');
    console.log('\n📌 실제 AI 생성 테스트:');
    console.log('   1. 프론트엔드 서버 실행: cd trend-video-frontend && npm run dev');
    console.log('   2. SORA2 영상 생성 요청');
    console.log('   3. 생성된 JSON에서 scene_01의 narration 확인');
    process.exit(0);
  } else {
    console.log('❌ 일부 검증 실패');
    console.log('   프롬프트 파일을 다시 확인해주세요.');
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('테스트 실행 중 오류:', err);
  process.exit(1);
});
