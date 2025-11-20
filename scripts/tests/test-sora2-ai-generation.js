/**
 * SORA2 AI 실제 생성 테스트
 *
 * OpenAI API를 호출해서 실제로 SORA2 JSON을 생성하고
 * scene_01에 CTA가 포함되는지 확인
 */

const fs = require('fs');
const path = require('path');

// .env 파일 직접 파싱
function loadEnv() {
  const envPath = path.join(__dirname, 'trend-video-frontend/.env.local');
  if (!fs.existsSync(envPath)) {
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

// SORA2 프롬프트 로드
function getSora2Prompt() {
  const promptsPath = path.join(__dirname, 'trend-video-frontend/prompts');
  const promptFile = path.join(promptsPath, 'prompt_sora2.txt');

  if (fs.existsSync(promptFile)) {
    return fs.readFileSync(promptFile, 'utf-8');
  }

  throw new Error('SORA2 프롬프트 파일을 찾을 수 없습니다');
}

// AI 호출 함수 (fetch 사용)
async function generateSora2Script(title) {
  const prompt = getSora2Prompt();
  const finalPrompt = prompt.replace('{title}', title);

  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다 (.env.local 파일 확인)');
  }

  console.log('🤖 OpenAI API 호출 중...\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: finalPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 호출 실패: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// JSON 검증
function validateSora2JSON(jsonString) {
  try {
    // JSON 파싱
    const data = JSON.parse(jsonString);

    console.log('✅ JSON 파싱 성공\n');

    // 필수 필드 확인
    const checks = [
      { name: 'scenes 배열 존재', pass: Array.isArray(data.scenes) },
      { name: 'scenes 개수 = 4', pass: data.scenes?.length === 4 },
      { name: 'scene_01 존재', pass: data.scenes?.some(s => s.scene_id === 'scene_01_immersion') }
    ];

    checks.forEach(check => {
      console.log(check.pass ? `✅ ${check.name}` : `❌ ${check.name}`);
    });

    // scene_01의 narration 확인
    const scene01 = data.scenes?.find(s => s.scene_id === 'scene_01_immersion');

    if (scene01) {
      console.log('\n📋 scene_01 정보:');
      console.log('─'.repeat(60));
      console.log(`scene_name: ${scene01.scene_name}`);
      console.log(`narration: ${scene01.narration}`);
      console.log('─'.repeat(60));

      // CTA 포함 여부 확인
      const hasCTA = scene01.narration?.includes('구독') && scene01.narration?.includes('좋아요');

      console.log('\n🎯 핵심 검증: CTA 포함 여부');
      if (hasCTA) {
        console.log('✅ scene_01의 narration에 "구독과 좋아요" 포함됨!');
        return true;
      } else {
        console.log('❌ scene_01의 narration에 "구독과 좋아요" 없음');
        return false;
      }
    } else {
      console.log('\n❌ scene_01을 찾을 수 없습니다');
      return false;
    }

  } catch (error) {
    console.error('❌ JSON 파싱 실패:', error.message);
    console.log('\n생성된 내용:');
    console.log(jsonString.substring(0, 500) + '...');
    return false;
  }
}

// 메인 테스트 함수
async function runTest() {
  console.log('🧪 SORA2 AI 생성 테스트 시작\n');
  console.log('='.repeat(60));

  try {
    // 테스트 제목
    const testTitle = '10년간 기다린 사랑의 기적';
    console.log(`📝 테스트 제목: "${testTitle}"\n`);

    // AI 생성
    const result = await generateSora2Script(testTitle);

    console.log('✅ AI 응답 받음\n');

    // JSON 검증
    console.log('='.repeat(60));
    console.log('📊 결과 검증\n');

    const isValid = validateSora2JSON(result);

    console.log('\n' + '='.repeat(60));
    if (isValid) {
      console.log('🎉 테스트 성공!');
      console.log('   SORA2 프롬프트가 정상적으로 작동합니다.');
      console.log('   AI가 자동으로 scene_01에 CTA를 포함시킵니다.');

      // 전체 결과 저장
      const outputPath = path.join(__dirname, 'test-sora2-output.json');
      fs.writeFileSync(outputPath, result, 'utf-8');
      console.log(`\n📁 전체 결과 저장: ${outputPath}`);

      process.exit(0);
    } else {
      console.log('❌ 테스트 실패!');
      console.log('   프롬프트를 더 강화해야 합니다.');

      // 실패 결과도 저장
      const outputPath = path.join(__dirname, 'test-sora2-output-failed.json');
      fs.writeFileSync(outputPath, result, 'utf-8');
      console.log(`\n📁 결과 저장 (실패): ${outputPath}`);

      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ 테스트 실행 중 오류:', error.message);
    process.exit(1);
  }
}

// 테스트 실행
runTest();
