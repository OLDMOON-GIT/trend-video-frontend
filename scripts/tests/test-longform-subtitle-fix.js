/**
 * 롱폼 자막 .ass 파일 생성 통합 테스트
 *
 * 테스트 목표:
 * 1. scene_01부터 모든 씬에 .ass 파일이 생성되는지 확인
 * 2. .ass 파일이 올바른 형식인지 검증
 * 3. 모든 씬의 타임스탬프가 정확히 맞는지 확인
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEST_PROJECT_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\test_longform_subtitle';
const BACKEND_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend';

console.log('🧪 롱폼 자막 .ass 파일 생성 통합 테스트 시작\n');
console.log('='.repeat(60));

// 테스트용 story.json 생성
const testStory = {
  "title": "테스트_롱폼_자막_검증",
  "version": "10.0",
  "metadata": {
    "genre": "테스트",
    "category": "test",
    "scriptId": "test-subtitle-fix"
  },
  "scenes": [
    {
      "scene_id": "scene_00_bomb",
      "scene_name": "3초 폭탄",
      "duration_seconds": 3,
      "narration": "이것은 첫 번째 테스트 씬입니다. 자막 파일이 생성되어야 합니다.",
      "scene_number": 1,
      "image_prompt": "test scene 1"
    },
    {
      "scene_id": "scene_01_main",
      "scene_name": "메인 씬 1",
      "duration_seconds": 10,
      "narration": "두 번째 씬입니다. 이 씬도 자막 파일이 생성되어야 합니다. 문장이 여러 개 있으면 더 좋습니다.",
      "scene_number": 2,
      "image_prompt": "test scene 2"
    },
    {
      "scene_id": "scene_02_main",
      "scene_name": "메인 씬 2",
      "duration_seconds": 10,
      "narration": "세 번째 씬입니다. 모든 씬의 자막 타이밍이 정확해야 합니다. 병합 시 문제가 없어야 합니다.",
      "scene_number": 3,
      "image_prompt": "test scene 3"
    }
  ]
};

// 테스트 프로젝트 폴더 생성
if (!fs.existsSync(TEST_PROJECT_DIR)) {
  fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
}

// story.json 저장
const storyPath = path.join(TEST_PROJECT_DIR, 'story.json');
fs.writeFileSync(storyPath, JSON.stringify(testStory, null, 2), 'utf-8');
console.log(`✅ 테스트 story.json 생성: ${storyPath}\n`);

// Python 스크립트 실행 (롱폼 비디오 생성)
console.log('🎬 롱폼 비디오 생성 시작...');
console.log('='.repeat(60));

try {
  // LongFormStoryCreator의 create_from_json 메서드 호출
  const pythonScript = `
import sys
sys.path.insert(0, r'${BACKEND_DIR}')

from pathlib import Path
import json
from src.video_generator.long_form_creator import LongFormStoryCreator

# 설정 로드
config_path = Path(r'${BACKEND_DIR}') / 'config' / 'default_config.yaml'
creator = LongFormStoryCreator(str(config_path))

# story.json 로드
story_path = Path(r'${storyPath}')
with open(story_path, 'r', encoding='utf-8') as f:
    story_data = json.load(f)

# 비디오 생성 (간단한 이미지 생성 모드)
output_dir = Path(r'${TEST_PROJECT_DIR}')
result = creator.create_from_json(
    story_data=story_data,
    output_dir=output_dir.parent,
    aspect_ratio='16:9'
)

print(f"✅ 비디오 생성 완료: {result['project_dir']}")
`;

  const tempPyFile = path.join(BACKEND_DIR, 'temp_test_longform.py');
  fs.writeFileSync(tempPyFile, pythonScript, 'utf-8');

  execSync(`python "${tempPyFile}"`, {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    timeout: 600000 // 10분 타임아웃
  });

  // 임시 파일 삭제
  fs.unlinkSync(tempPyFile);

} catch (error) {
  console.error('❌ 비디오 생성 실패:', error.message);
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('🔍 생성된 파일 검증 시작\n');

// 생성된 프로젝트 폴더 찾기
const inputDir = path.join(BACKEND_DIR, 'input');
const projectDirs = fs.readdirSync(inputDir)
  .filter(name => name.includes('테스트_롱폼_자막_검증'))
  .map(name => path.join(inputDir, name))
  .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);

if (projectDirs.length === 0) {
  console.error('❌ 생성된 프로젝트 폴더를 찾을 수 없습니다');
  process.exit(1);
}

const projectDir = projectDirs[0];
const generatedVideosDir = path.join(projectDir, 'generated_videos');

console.log(`📁 프로젝트 폴더: ${projectDir}`);
console.log(`📁 비디오 폴더: ${generatedVideosDir}\n`);

// 테스트 결과 저장
const testResults = {
  pass: [],
  fail: [],
  warnings: []
};

// 1. 모든 씬에 .ass 파일이 있는지 확인
console.log('테스트 1: 모든 씬의 .ass 파일 존재 여부');
console.log('-'.repeat(60));

const expectedScenes = testStory.scenes.length;
for (let i = 1; i <= expectedScenes; i++) {
  const sceneNum = i.toString().padStart(2, '0');
  const assFile = path.join(generatedVideosDir, `scene_${sceneNum}_audio.ass`);

  if (fs.existsSync(assFile)) {
    console.log(`✅ scene_${sceneNum}_audio.ass 존재`);
    testResults.pass.push(`scene_${sceneNum} ASS 파일 존재`);
  } else {
    console.log(`❌ scene_${sceneNum}_audio.ass 없음 - 이것이 문제!`);
    testResults.fail.push(`scene_${sceneNum} ASS 파일 없음`);
  }
}

console.log('');

// 2. .ass 파일 형식 검증
console.log('테스트 2: .ass 파일 형식 검증');
console.log('-'.repeat(60));

for (let i = 1; i <= expectedScenes; i++) {
  const sceneNum = i.toString().padStart(2, '0');
  const assFile = path.join(generatedVideosDir, `scene_${sceneNum}_audio.ass`);

  if (!fs.existsSync(assFile)) continue;

  const content = fs.readFileSync(assFile, 'utf-8');

  // 필수 섹션 확인
  const hasScriptInfo = content.includes('[Script Info]');
  const hasStyles = content.includes('[V4+ Styles]');
  const hasEvents = content.includes('[Events]');
  const hasDialogue = content.includes('Dialogue:');

  if (hasScriptInfo && hasStyles && hasEvents && hasDialogue) {
    console.log(`✅ scene_${sceneNum}: 올바른 ASS 형식`);
    testResults.pass.push(`scene_${sceneNum} ASS 형식 올바름`);

    // 자막 개수 확인
    const dialogueCount = (content.match(/Dialogue:/g) || []).length;
    console.log(`   - 자막 라인 수: ${dialogueCount}`);

  } else {
    console.log(`❌ scene_${sceneNum}: ASS 형식 오류`);
    testResults.fail.push(`scene_${sceneNum} ASS 형식 오류`);

    if (!hasScriptInfo) console.log('   - [Script Info] 섹션 없음');
    if (!hasStyles) console.log('   - [V4+ Styles] 섹션 없음');
    if (!hasEvents) console.log('   - [Events] 섹션 없음');
    if (!hasDialogue) console.log('   - Dialogue 라인 없음');
  }
}

console.log('');

// 3. 타임스탬프 검증
console.log('테스트 3: 자막 타임스탬프 검증');
console.log('-'.repeat(60));

for (let i = 1; i <= expectedScenes; i++) {
  const sceneNum = i.toString().padStart(2, '0');
  const assFile = path.join(generatedVideosDir, `scene_${sceneNum}_audio.ass`);

  if (!fs.existsSync(assFile)) continue;

  const content = fs.readFileSync(assFile, 'utf-8');
  const dialogueLines = content.split('\n').filter(line => line.startsWith('Dialogue:'));

  if (dialogueLines.length === 0) {
    console.log(`⚠️  scene_${sceneNum}: 자막 라인이 없음`);
    testResults.warnings.push(`scene_${sceneNum} 자막 없음`);
    continue;
  }

  let timestampValid = true;
  let prevEndTime = 0;

  for (const line of dialogueLines) {
    // Dialogue: 0,0:00:00.05,0:00:04.98,Default,,0,0,0,,텍스트
    const match = line.match(/Dialogue: \d+,(\d+):(\d+):(\d+)\.(\d+),(\d+):(\d+):(\d+)\.(\d+),/);

    if (!match) {
      timestampValid = false;
      break;
    }

    const startH = parseInt(match[1]);
    const startM = parseInt(match[2]);
    const startS = parseInt(match[3]);
    const startCs = parseInt(match[4]);
    const endH = parseInt(match[5]);
    const endM = parseInt(match[6]);
    const endS = parseInt(match[7]);
    const endCs = parseInt(match[8]);

    const startTime = startH * 3600 + startM * 60 + startS + startCs / 100;
    const endTime = endH * 3600 + endM * 60 + endS + endCs / 100;

    // 시작 시간이 이전 끝 시간보다 작으면 오류
    if (startTime < prevEndTime - 0.1) { // 0.1초 여유
      timestampValid = false;
      console.log(`   ⚠️  타임스탬프 오버랩: ${prevEndTime.toFixed(2)}s -> ${startTime.toFixed(2)}s`);
    }

    prevEndTime = endTime;
  }

  if (timestampValid) {
    console.log(`✅ scene_${sceneNum}: 타임스탬프 정상 (${dialogueLines.length}개 라인)`);
    testResults.pass.push(`scene_${sceneNum} 타임스탬프 정상`);
  } else {
    console.log(`❌ scene_${sceneNum}: 타임스탬프 오류`);
    testResults.fail.push(`scene_${sceneNum} 타임스탬프 오류`);
  }
}

console.log('');

// 4. 최종 병합 비디오 확인
console.log('테스트 4: 최종 병합 비디오 확인');
console.log('-'.repeat(60));

const finalVideoPath = path.join(projectDir, testStory.title + '.mp4');
if (fs.existsSync(finalVideoPath)) {
  const stats = fs.statSync(finalVideoPath);
  console.log(`✅ 최종 비디오 생성됨: ${finalVideoPath}`);
  console.log(`   - 파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  testResults.pass.push('최종 비디오 생성');
} else {
  console.log(`❌ 최종 비디오 없음: ${finalVideoPath}`);
  testResults.fail.push('최종 비디오 없음');
}

console.log('');

// 테스트 결과 요약
console.log('='.repeat(60));
console.log('📊 테스트 결과 요약\n');

console.log(`✅ 성공: ${testResults.pass.length}개`);
testResults.pass.forEach(msg => console.log(`   - ${msg}`));

if (testResults.warnings.length > 0) {
  console.log(`\n⚠️  경고: ${testResults.warnings.length}개`);
  testResults.warnings.forEach(msg => console.log(`   - ${msg}`));
}

if (testResults.fail.length > 0) {
  console.log(`\n❌ 실패: ${testResults.fail.length}개`);
  testResults.fail.forEach(msg => console.log(`   - ${msg}`));
  console.log('\n테스트 실패!');
  process.exit(1);
} else {
  console.log('\n🎉 모든 테스트 통과!');
  console.log('\n핵심 확인 사항:');
  console.log('  ✅ scene_01부터 모든 씬에 .ass 파일 생성됨');
  console.log('  ✅ ASS 파일 형식이 올바름');
  console.log('  ✅ 자막 타임스탬프가 정확함');
  console.log('  ✅ 최종 비디오 병합 성공');
}
