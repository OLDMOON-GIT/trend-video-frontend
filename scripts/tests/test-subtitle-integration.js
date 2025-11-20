/**
 * 롱폼 자막 .ass 파일 생성 통합 테스트
 * 실제 생성된 프로젝트로 검증
 */

const fs = require('fs');
const path = require('path');

// 테스트할 프로젝트 경로
const PROJECT_DIR = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\project_197951ed-d849-4c50-97c5-2282bb8e7b56';
const VIDEOS_DIR = path.join(PROJECT_DIR, 'generated_videos');

console.log('\n🧪 롱폼 자막 .ass 파일 통합 테스트');
console.log('='.repeat(70));
console.log(`프로젝트: ${PROJECT_DIR}`);
console.log(`비디오 폴더: ${VIDEOS_DIR}\n`);

// 테스트 결과
const results = {
  totalTests: 0,
  passed: 0,
  failed: 0,
  details: []
};

function test(name, condition, details = '') {
  results.totalTests++;
  if (condition) {
    results.passed++;
    console.log(`✅ PASS: ${name}`);
    if (details) console.log(`   ${details}`);
  } else {
    results.failed++;
    console.log(`❌ FAIL: ${name}`);
    if (details) console.log(`   ${details}`);
  }
  results.details.push({ name, passed: condition, details });
}

// 폴더 존재 확인
if (!fs.existsSync(VIDEOS_DIR)) {
  console.error(`❌ 비디오 폴더가 없습니다: ${VIDEOS_DIR}`);
  process.exit(1);
}

// story.json 로드
const storyPath = path.join(PROJECT_DIR, 'story.json');
let story = null;
if (fs.existsSync(storyPath)) {
  story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
  console.log(`📄 Story: ${story.title}`);
  console.log(`📊 총 씬 개수: ${story.scenes.length}\n`);
}

// 모든 scene 파일 찾기
const files = fs.readdirSync(VIDEOS_DIR);
const sceneFiles = files.filter(f => f.match(/scene_\d+\.mp4$/));
const sceneNumbers = sceneFiles.map(f => {
  const match = f.match(/scene_(\d+)\.mp4/);
  return parseInt(match[1]);
}).sort((a, b) => a - b);

console.log('='.repeat(70));
console.log('테스트 1: 모든 씬에 .ass 파일 존재 여부\n');

sceneNumbers.forEach(num => {
  const sceneNum = num.toString().padStart(2, '0');
  const assFile = path.join(VIDEOS_DIR, `scene_${sceneNum}_audio.ass`);
  const mp3File = path.join(VIDEOS_DIR, `scene_${sceneNum}_audio.mp3`);

  const hasAss = fs.existsSync(assFile);
  const hasMp3 = fs.existsSync(mp3File);

  if (hasMp3) {
    // MP3가 있으면 ASS도 있어야 함
    test(
      `Scene ${sceneNum} - ASS 파일 존재`,
      hasAss,
      hasAss ? `파일: scene_${sceneNum}_audio.ass` : `❌ scene_${sceneNum}_audio.ass 없음 (MP3는 있음)`
    );
  }
});

console.log('\n' + '='.repeat(70));
console.log('테스트 2: ASS 파일 형식 검증\n');

sceneNumbers.forEach(num => {
  const sceneNum = num.toString().padStart(2, '0');
  const assFile = path.join(VIDEOS_DIR, `scene_${sceneNum}_audio.ass`);

  if (!fs.existsSync(assFile)) return;

  const content = fs.readFileSync(assFile, 'utf-8');

  // 필수 섹션 확인
  const hasScriptInfo = content.includes('[Script Info]');
  const hasStyles = content.includes('[V4+ Styles]');
  const hasEvents = content.includes('[Events]');
  const hasDialogue = content.includes('Dialogue:');

  const allSectionsPresent = hasScriptInfo && hasStyles && hasEvents && hasDialogue;

  test(
    `Scene ${sceneNum} - ASS 형식 유효성`,
    allSectionsPresent,
    allSectionsPresent ? '모든 필수 섹션 존재' :
      `누락: ${!hasScriptInfo ? '[Script Info] ' : ''}${!hasStyles ? '[V4+ Styles] ' : ''}${!hasEvents ? '[Events] ' : ''}${!hasDialogue ? 'Dialogue ' : ''}`
  );

  if (hasDialogue) {
    const dialogueCount = (content.match(/Dialogue:/g) || []).length;
    console.log(`   📝 자막 라인 수: ${dialogueCount}개`);
  }
});

console.log('\n' + '='.repeat(70));
console.log('테스트 3: 타임스탬프 검증\n');

sceneNumbers.forEach(num => {
  const sceneNum = num.toString().padStart(2, '0');
  const assFile = path.join(VIDEOS_DIR, `scene_${sceneNum}_audio.ass`);

  if (!fs.existsSync(assFile)) return;

  const content = fs.readFileSync(assFile, 'utf-8');
  const dialogueLines = content.split('\n').filter(line => line.startsWith('Dialogue:'));

  if (dialogueLines.length === 0) return;

  let validTimestamps = true;
  let prevEndTime = -1;
  let invalidReason = '';

  for (let i = 0; i < dialogueLines.length; i++) {
    const line = dialogueLines[i];
    // Dialogue: 0,0:00:00.05,0:00:04.98,Default,,0,0,0,,텍스트
    const match = line.match(/Dialogue: \d+,(\d+):(\d+):(\d+)\.(\d+),(\d+):(\d+):(\d+)\.(\d+),/);

    if (!match) {
      validTimestamps = false;
      invalidReason = `라인 ${i+1}: 타임스탬프 형식 오류`;
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

    // 시작 < 끝
    if (startTime >= endTime) {
      validTimestamps = false;
      invalidReason = `라인 ${i+1}: 시작(${startTime.toFixed(2)}) >= 끝(${endTime.toFixed(2)})`;
      break;
    }

    // 순차적 (이전 끝 <= 현재 시작)
    if (prevEndTime > startTime + 0.1) {
      validTimestamps = false;
      invalidReason = `라인 ${i+1}: 타임스탬프 역순 (이전 끝: ${prevEndTime.toFixed(2)}, 현재 시작: ${startTime.toFixed(2)})`;
      break;
    }

    prevEndTime = endTime;
  }

  test(
    `Scene ${sceneNum} - 타임스탬프 유효성`,
    validTimestamps,
    validTimestamps ? `${dialogueLines.length}개 라인 모두 정상` : invalidReason
  );
});

console.log('\n' + '='.repeat(70));
console.log('테스트 4: Scene 01 특별 검증 (핵심 테스트)\n');

const scene01AssFile = path.join(VIDEOS_DIR, 'scene_01_audio.ass');
const scene01Mp3File = path.join(VIDEOS_DIR, 'scene_01_audio.mp3');
const scene01Mp4File = path.join(VIDEOS_DIR, 'scene_01.mp4');

const hasScene01Ass = fs.existsSync(scene01AssFile);
const hasScene01Mp3 = fs.existsSync(scene01Mp3File);
const hasScene01Mp4 = fs.existsSync(scene01Mp4File);

test(
  'Scene 01 - ASS 파일 생성 (핵심 수정 사항)',
  hasScene01Ass && hasScene01Mp3,
  hasScene01Ass ?
    `✅ scene_01_audio.ass 생성됨 - 수정 성공!` :
    `❌ scene_01_audio.ass 없음 - MP3: ${hasScene01Mp3 ? '있음' : '없음'}, MP4: ${hasScene01Mp4 ? '있음' : '없음'}`
);

if (hasScene01Ass) {
  const content = fs.readFileSync(scene01AssFile, 'utf-8');
  const dialogueCount = (content.match(/Dialogue:/g) || []).length;
  console.log(`   🎉 Scene 01 자막 라인: ${dialogueCount}개`);
  console.log(`   📏 파일 크기: ${fs.statSync(scene01AssFile).size} bytes`);
}

console.log('\n' + '='.repeat(70));
console.log('테스트 5: 최종 병합 비디오 확인\n');

const finalVideoFile = fs.readdirSync(PROJECT_DIR).find(f => f.endsWith('.mp4') && !f.startsWith('scene_'));
if (finalVideoFile) {
  const finalPath = path.join(PROJECT_DIR, finalVideoFile);
  const stats = fs.statSync(finalPath);
  test(
    '최종 병합 비디오 생성',
    stats.size > 0,
    `${finalVideoFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
  );
} else {
  test('최종 병합 비디오 생성', false, '최종 MP4 파일 없음');
}

// 최종 결과
console.log('\n' + '='.repeat(70));
console.log('📊 테스트 결과 요약\n');

console.log(`총 테스트: ${results.totalTests}개`);
console.log(`✅ 성공: ${results.passed}개`);
console.log(`❌ 실패: ${results.failed}개`);
console.log(`성공률: ${((results.passed / results.totalTests) * 100).toFixed(1)}%`);

console.log('\n' + '='.repeat(70));

if (results.failed === 0) {
  console.log('🎉 모든 테스트 통과!\n');
  console.log('✅ 핵심 확인 사항:');
  console.log('  • scene_01부터 모든 씬에 .ass 파일 생성됨');
  console.log('  • ASS 파일 형식이 올바름');
  console.log('  • 자막 타임스탬프가 정확함');
  console.log('  • 최종 비디오 병합 성공');
  console.log('\n💡 수정 사항이 정상적으로 작동합니다!');
  process.exit(0);
} else {
  console.log('❌ 일부 테스트 실패\n');
  console.log('실패한 테스트:');
  results.details
    .filter(d => !d.passed)
    .forEach(d => console.log(`  • ${d.name}: ${d.details}`));
  process.exit(1);
}
