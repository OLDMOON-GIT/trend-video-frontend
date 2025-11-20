/**
 * 영상 제작 페이지 통합테스트
 * / 페이지 (page.tsx)의 영상 제작 기능 검증
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

// 1. JSON 업로드 기능
function testJsonUpload() {
  console.log('📝 STEP 1: JSON 업로드 기능 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasJsonUpload = content.includes('uploadedJson') || content.includes('setUploadedJson');
    addTestResult('1-1. JSON 상태 관리', hasJsonUpload, hasJsonUpload ? '확인' : '누락');

    const hasFileInput = content.includes('application/json') || content.includes('.json');
    addTestResult('1-2. JSON 파일 입력', hasFileInput, hasFileInput ? '확인' : '누락');

    const hasDragDrop = content.includes('onDrop') && content.includes('jsonFile');
    addTestResult('1-3. 드래그 앤 드롭', hasDragDrop, hasDragDrop ? '확인' : '누락');

  } catch (error) {
    addTestResult('1. JSON 업로드', false, error.message);
  }
  console.log('');
}

// 2. 이미지 업로드 기능
function testImageUpload() {
  console.log('📝 STEP 2: 이미지 업로드 기능 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasImageState = content.includes('uploadedImages') || content.includes('setUploadedImages');
    addTestResult('2-1. 이미지 상태 관리', hasImageState, hasImageState ? '확인' : '누락');

    const hasImageDrop = content.includes("f.type.startsWith('image/')");
    addTestResult('2-2. 이미지 타입 필터링', hasImageDrop, hasImageDrop ? '확인' : '누락');

    const hasImageLimit = content.includes('slice(0, 50)') || content.includes('최대');
    addTestResult('2-3. 이미지 개수 제한', hasImageLimit, hasImageLimit ? '확인' : '누락');

  } catch (error) {
    addTestResult('2. 이미지 업로드', false, error.message);
  }
  console.log('');
}

// 3. 이미지 순서 정렬
function testImageSorting() {
  console.log('📝 STEP 3: 이미지 순서 정렬 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasSortBySequence = content.includes('sortBySequence') || content.includes('순번순');
    addTestResult('3-1. 순번순 정렬 버튼', hasSortBySequence, hasSortBySequence ? '확인' : '누락');

    const hasSortByTimestamp = content.includes('sortByTimestamp') || content.includes('시간순');
    addTestResult('3-2. 시간순 정렬 버튼', hasSortByTimestamp, hasSortByTimestamp ? '확인' : '누락');

    const hasExtractSequence = content.includes('extractSequenceNumber');
    addTestResult('3-3. 시퀀스 번호 추출', hasExtractSequence, hasExtractSequence ? '확인' : '누락');

  } catch (error) {
    addTestResult('3. 이미지 순서 정렬', false, error.message);
  }
  console.log('');
}

// 4. 드래그 앤 드롭 재정렬
function testDragReorder() {
  console.log('📝 STEP 4: 드래그 앤 드롭 재정렬 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasDraggingState = content.includes('draggingCardIndex');
    addTestResult('4-1. 드래그 상태 관리', hasDraggingState, hasDraggingState ? '확인' : '누락');

    const hasManualSort = content.includes('isManualSort') && content.includes('setIsManualSort');
    addTestResult('4-2. 수동 정렬 모드', hasManualSort, hasManualSort ? '확인' : '누락');

    const hasManuallyOrdered = content.includes('manuallyOrderedMedia');
    addTestResult('4-3. 수동 정렬 배열', hasManuallyOrdered, hasManuallyOrdered ? '확인' : '누락');

  } catch (error) {
    addTestResult('4. 드래그 재정렬', false, error.message);
  }
  console.log('');
}

// 5. 쇼츠/롱폼 포맷 선택
function testFormatSelection() {
  console.log('📝 STEP 5: 쇼츠/롱폼 포맷 선택 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasVideoFormat = content.includes('videoFormat') || content.includes('shortform') || content.includes('longform');
    addTestResult('5-1. 포맷 상태 관리', hasVideoFormat, hasVideoFormat ? '확인' : '누락');

    const hasFormatButton = content.includes('🎬') || content.includes('🎞️');
    addTestResult('5-2. 포맷 선택 버튼', hasFormatButton, hasFormatButton ? '확인' : '누락');

  } catch (error) {
    addTestResult('5. 포맷 선택', false, error.message);
  }
  console.log('');
}

// 6. TTS 음성 선택
function testTtsVoice() {
  console.log('📝 STEP 6: TTS 음성 선택 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasTtsVoice = content.includes('ttsVoice') || content.includes('setTtsVoice');
    addTestResult('6-1. TTS 음성 상태', hasTtsVoice, hasTtsVoice ? '확인' : '누락');

    const hasVoiceSelect = content.includes('ko-KR') || content.includes('Neural');
    addTestResult('6-2. 음성 선택 옵션', hasVoiceSelect, hasVoiceSelect ? '확인' : '누락');

  } catch (error) {
    addTestResult('6. TTS 음성', false, error.message);
  }
  console.log('');
}

// 7. 이미지 모델 선택
function testImageModel() {
  console.log('📝 STEP 7: 이미지 모델 선택 검증');
  console.log('-'.repeat(70));

  try {
    const pagePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    const hasImageModel = content.includes('imageModel') || content.includes('setImageModel');
    addTestResult('7-1. 이미지 모델 상태', hasImageModel, hasImageModel ? '확인' : '누락');

    const hasModelOptions = content.includes('dalle') || content.includes('imagen');
    addTestResult('7-2. 모델 선택 옵션', hasModelOptions, hasModelOptions ? '확인' : '누락');

  } catch (error) {
    addTestResult('7. 이미지 모델', false, error.message);
  }
  console.log('');
}

async function runTests() {
  console.log('🧪 [영상 제작 페이지 통합테스트] 시작\n');
  console.log('='.repeat(70) + '\n');

  testJsonUpload();
  testImageUpload();
  testImageSorting();
  testDragReorder();
  testFormatSelection();
  testTtsVoice();
  testImageModel();

  console.log('='.repeat(70));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(70));
  console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
  console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);
  console.log(`📈 커버리지: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));

  // 결과 저장
  const resultsDir = path.join(__dirname, 'test-results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  fs.writeFileSync(
    path.join(resultsDir, 'video-creation-page.json'),
    JSON.stringify({
      testName: '영상 제작 페이지',
      category: '영상 제작 페이지',
      timestamp: new Date().toISOString(),
      passed: testResults.failed === 0,
      summary: {
        total: testResults.tests.length,
        passed: testResults.passed,
        failed: testResults.failed,
        percentage: parseFloat(((testResults.passed / testResults.tests.length) * 100).toFixed(1))
      },
      tests: testResults.tests
    }, null, 2)
  );

  process.exit(testResults.failed === 0 ? 0 : 1);
}

runTests();
