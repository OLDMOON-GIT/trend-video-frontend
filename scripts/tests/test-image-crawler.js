/**
 * 이미지 크롤링 자동화 테스트
 *
 * 테스트 내용:
 * 1. image_crawler.py 파일 존재 확인
 * 2. 새로운 함수들 존재 확인
 * 3. main() 함수의 워크플로우 로직 확인
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
  console.log('🧪 이미지 크롤링 자동화 업데이트 테스트 시작\n');

  // 테스트 1: 파일 존재 확인
  const crawlerPath = path.join(__dirname, 'trend-video-backend', 'src', 'image_crawler', 'image_crawler.py');
  const fileExists = fs.existsSync(crawlerPath);
  addTestResult(
    '파일 존재 확인',
    fileExists,
    fileExists ? 'image_crawler.py 파일 발견' : 'image_crawler.py 파일 없음'
  );

  if (!fileExists) {
    console.log(`\n❌ 통과: ${testResults.passed}/${testResults.tests.length}`);
    process.exit(1);
  }

  // 테스트 2: 파일 내용 읽기
  const content = fs.readFileSync(crawlerPath, 'utf-8');

  // 테스트 3: process_first_scene_with_imagefx 함수 존재 확인
  const hasImageFxFunction = content.includes('def process_first_scene_with_imagefx');
  addTestResult(
    'Image-FX 함수 존재',
    hasImageFxFunction,
    hasImageFxFunction ? 'process_first_scene_with_imagefx 함수 발견' : '함수 없음'
  );

  // 테스트 4: upload_subject_to_whisk 함수 존재 확인
  const hasUploadFunction = content.includes('def upload_subject_to_whisk');
  addTestResult(
    'Whisk 업로드 함수 존재',
    hasUploadFunction,
    hasUploadFunction ? 'upload_subject_to_whisk 함수 발견' : '함수 없음'
  );

  // 테스트 5: main() 함수에 새로운 워크플로우 적용 확인
  const hasNewWorkflow = content.includes('새로운 워크플로우');
  addTestResult(
    '새로운 워크플로우 적용',
    hasNewWorkflow,
    hasNewWorkflow ? 'main() 함수에 새 워크플로우 발견' : '워크플로우 업데이트 안됨'
  );

  // 테스트 6: Image-FX URL 확인
  const hasImageFxUrl = content.includes('labs.google/fx/tools/image-fx');
  addTestResult(
    'Image-FX URL 확인',
    hasImageFxUrl,
    hasImageFxUrl ? 'Image-FX URL 발견' : 'URL 없음'
  );

  // 테스트 7: 다운로드 로직 확인
  const hasDownloadLogic = content.includes('download_dir') && content.includes('Downloads');
  addTestResult(
    '다운로드 로직 확인',
    hasDownloadLogic,
    hasDownloadLogic ? '다운로드 폴더 로직 발견' : '다운로드 로직 없음'
  );

  // 테스트 8: 파일 업로드 로직 확인
  const hasFileUpload = content.includes('file_input.send_keys');
  addTestResult(
    '파일 업로드 로직 확인',
    hasFileUpload,
    hasFileUpload ? '파일 업로드 로직 발견' : '업로드 로직 없음'
  );

  // 테스트 9: 업로드 완료 대기 로직 확인
  const hasWaitLogic = content.includes('progressbar') || content.includes('is_loading');
  addTestResult(
    '업로드 대기 로직 확인',
    hasWaitLogic,
    hasWaitLogic ? '업로드 완료 대기 로직 발견' : '대기 로직 없음'
  );

  // 테스트 10: 4단계 워크플로우 확인
  const hasStage1 = content.includes('1단계: Image-FX에서 첫 번째 씬 처리');
  const hasStage2 = content.includes('2단계: Whisk 페이지로 이동');
  const hasStage3 = content.includes('3단계: 첫 번째 이미지를 Whisk에 인물로 업로드');
  const hasStage4 = content.includes('4단계: Whisk에서 나머지 씬 처리');
  const hasAllStages = hasStage1 && hasStage2 && hasStage3 && hasStage4;
  addTestResult(
    '4단계 워크플로우 확인',
    hasAllStages,
    hasAllStages ? '모든 단계 로직 발견' : `단계 누락 (1:${hasStage1}, 2:${hasStage2}, 3:${hasStage3}, 4:${hasStage4})`
  );

  // 결과 출력
  console.log(`\n${'='.repeat(80)}`);
  console.log(`테스트 결과: ✅ 통과 ${testResults.passed}/${testResults.tests.length}`);
  console.log(`${'='.repeat(80)}`);

  if (testResults.failed > 0) {
    console.log('\n⚠️ 일부 테스트 실패');
    process.exit(1);
  } else {
    console.log('\n✅ 모든 테스트 통과!');
    console.log('\n📝 다음 단계:');
    console.log('   1. Chrome을 디버깅 모드로 실행 (또는 스크립트가 자동 실행)');
    console.log('   2. Google Labs에 로그인');
    console.log('   3. 테스트 scenes JSON 파일 생성');
    console.log('   4. python image_crawler.py <scenes.json> 실행');
    console.log('   5. 자동화 프로세스 관찰');
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('❌ 테스트 실행 오류:', error);
  process.exit(1);
});
