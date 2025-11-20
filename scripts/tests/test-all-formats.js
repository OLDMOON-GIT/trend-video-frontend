const fs = require('fs');
const path = require('path');

// .env.local 파일 로드
function loadEnv() {
  const envPath = path.join(__dirname, 'trend-video-frontend/.env.local');
  if (!fs.existsSync(envPath)) {
    console.log('⚠️ .env.local 파일이 없습니다.');
    return {};
  }
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  return env;
}

const env = loadEnv();

if (!env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY가 .env.local에 없습니다.');
  process.exit(1);
}

// 공통 API 호출 함수
async function callOpenAI(prompt, model = 'gpt-4o') {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 오류: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// 숏폼 테스트
async function testShortform() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 숏폼 테스트 (8개 씬, 2분)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const promptPath = path.join(__dirname, 'trend-video-frontend/prompts/prompt_shortform.txt');
  const promptTemplate = fs.readFileSync(promptPath, 'utf-8');
  const testTitle = "며느리가 시어머니에게 준 찬밥, 친정에 전화한통으로 사색이 된 며느리";
  const prompt = promptTemplate.replace('{title}', testTitle);

  console.log('제목:', testTitle);
  console.log('생성 중...\n');

  const content = await callOpenAI(prompt);
  const result = JSON.parse(content);

  // 검증
  console.log(`✅ 버전: ${result.version}`);
  console.log(`✅ 씬 개수: ${result.scenes?.length}개`);
  console.log(`✅ 총 길이: ${result.metadata?.estimated_duration_seconds}초`);
  console.log(`✅ 총 글자수: ${result.metadata?.total_word_count}자`);

  // CTA 확인
  const lastScene = result.scenes[result.scenes.length - 1];
  const hasCTA = lastScene?.narration?.includes('구독') && lastScene?.narration?.includes('좋아요');
  console.log(hasCTA ? '✅ CTA 포함' : '❌ CTA 없음');

  // 감정 체크
  const fullStory = result.scenes.map(s => s.narration).join(' ');
  const hasDialogue = fullStory.includes('"') || fullStory.includes("'");
  console.log(hasDialogue ? '✅ 대화 포함' : '⚠️ 대화 없음');

  // 각 씬 출력
  console.log('\n【스토리 내용】');
  result.scenes.forEach((scene, idx) => {
    console.log(`\n씬 ${idx} (${scene.duration_seconds}초, ${scene.narration?.length}자):`);
    console.log(scene.narration);
  });

  // 파일 저장
  fs.writeFileSync(path.join(__dirname, 'test-output-shortform.json'), JSON.stringify(result, null, 2));
  console.log('\n✅ 저장: test-output-shortform.json');

  return result;
}

// 롱폼 테스트
async function testLongform() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📺 롱폼 테스트');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const promptPath = path.join(__dirname, 'trend-video-frontend/prompts/prompt_longform.txt');
  if (!fs.existsSync(promptPath)) {
    console.log('⚠️ prompt_longform.txt 파일이 없습니다. 스킵합니다.');
    return null;
  }

  const promptTemplate = fs.readFileSync(promptPath, 'utf-8');
  const testTitle = "가난한 청년이 재벌 회장을 구했다, 1년 후 그 청년에게 찾아온 놀라운 보답";
  const prompt = promptTemplate.replace('{title}', testTitle);

  console.log('제목:', testTitle);
  console.log('생성 중...\n');

  const content = await callOpenAI(prompt);
  const result = JSON.parse(content);

  console.log(`✅ 버전: ${result.version}`);
  console.log(`✅ 씬 개수: ${result.scenes?.length}개`);

  // CTA 확인 (Scene 1에 있어야 함)
  const scene1 = result.scenes[1];
  const hasCTA = scene1?.narration?.includes('구독') && scene1?.narration?.includes('좋아요');
  console.log(hasCTA ? '✅ Scene 1에 CTA 포함' : '❌ Scene 1에 CTA 없음');

  fs.writeFileSync(path.join(__dirname, 'test-output-longform.json'), JSON.stringify(result, null, 2));
  console.log('✅ 저장: test-output-longform.json');

  return result;
}

// SORA2 테스트
async function testSora2() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎬 SORA2 테스트 (4개 씬, 30초)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const promptPath = path.join(__dirname, 'trend-video-frontend/prompts/prompt_sora2.txt');
  const promptTemplate = fs.readFileSync(promptPath, 'utf-8');
  const testTitle = "산 정상에서 펼쳐지는 경이로운 일출 풍경";
  const prompt = promptTemplate.replace('{title}', testTitle);

  console.log('제목:', testTitle);
  console.log('생성 중...\n');

  const content = await callOpenAI(prompt);
  const result = JSON.parse(content);

  console.log(`✅ 버전: ${result.version}`);
  console.log(`✅ 씬 개수: ${result.scenes?.length}개`);
  console.log(`✅ 총 길이: ${result.metadata?.total_duration_seconds}초`);

  // CTA 확인 (Scene 3에 있어야 함)
  const scene3 = result.scenes[3];
  const hasCTA = scene3?.narration?.includes('구독') && scene3?.narration?.includes('좋아요');
  console.log(hasCTA ? '✅ Scene 3에 CTA 포함' : '❌ Scene 3에 CTA 없음');

  // Vertical 포맷 확인
  const allVertical = result.scenes.every(s => s.sora_prompt?.includes('Vertical 9:16'));
  console.log(allVertical ? '✅ 모든 씬 Vertical 9:16' : '❌ Vertical 포맷 누락');

  // 씬별 내용
  console.log('\n【씬별 내용】');
  result.scenes.forEach((scene, idx) => {
    console.log(`\n씬 ${idx} (${scene.duration_seconds}초):`);
    console.log(`📝 ${scene.narration}`);
  });

  fs.writeFileSync(path.join(__dirname, 'test-output-sora2.json'), JSON.stringify(result, null, 2));
  console.log('\n✅ 저장: test-output-sora2.json');

  return result;
}

// 전체 테스트 실행
async function runAllTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 전체 포맷 테스트 시작');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    await testShortform();
    await testLongform();
    await testSora2();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 모든 테스트 완료!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runAllTests();
