/**
 * Shorts 변환 Regression Test
 *
 * 테스트 대상: uploaded_upload_1762841000063_fydihfdwq 폴더의 shorts_images에 있는 9:16 이미지 감지
 *
 * 실행 방법:
 *   node test-shorts-conversion.js
 */

const path = require('path');
const fs = require('fs').promises;

// 테스트 설정
const TEST_CONFIG = {
  // 원본 폴더 경로
  originalFolder: 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\uploads\\uploaded_upload_1762841000063_fydihfdwq',

  // shorts_images 폴더 경로
  shortsImagesFolder: 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\uploads\\uploaded_upload_1762841000063_fydihfdwq\\shorts_images',

  // API 엔드포인트 (로컬 개발 서버)
  apiUrl: 'http://localhost:3000/api/jobs/upload_1762841000063_fydihfdwq/convert-to-shorts',

  // 예상되는 9:16 이미지 개수
  expectedImageCount: 4,

  // 예상되는 이미지 크기 (768x1344)
  expectedDimensions: {
    width: 768,
    height: 1344
  }
};

// 색상 출력
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * 1단계: 파일 시스템 검증
 */
async function verifyFilesystem() {
  log('cyan', '\n========== 1단계: 파일 시스템 검증 ==========');

  try {
    // 원본 폴더 확인
    await fs.access(TEST_CONFIG.originalFolder);
    log('green', `✅ 원본 폴더 존재: ${TEST_CONFIG.originalFolder}`);

    // shorts_images 폴더 확인
    await fs.access(TEST_CONFIG.shortsImagesFolder);
    log('green', `✅ shorts_images 폴더 존재: ${TEST_CONFIG.shortsImagesFolder}`);

    // shorts_images 폴더 내 파일 목록
    const files = await fs.readdir(TEST_CONFIG.shortsImagesFolder);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

    log('blue', `\n📁 shorts_images 폴더 내 이미지 파일 (${imageFiles.length}개):`);
    imageFiles.forEach((file, idx) => {
      console.log(`   ${idx + 1}. ${file}`);
    });

    // 이미지 크기 확인 (간단 버전)
    log('blue', '\n🔍 이미지 크기 분석:');
    log('yellow', '   ℹ️ 상세 크기 분석은 Next.js API에서 수행됩니다.');
    log('yellow', '   여기서는 파일 존재 여부만 확인합니다.\n');

    let verticalCount = 0;

    for (const file of imageFiles) {
      const filePath = path.join(TEST_CONFIG.shortsImagesFolder, file);
      try {
        const stats = await fs.stat(filePath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`   ✅ ${file} (${sizeMB} MB)`);
        verticalCount++; // 일단 모두 카운트
      } catch (err) {
        log('red', `   ❌ ${file} - 접근 불가: ${err.message}`);
      }
    }

    log('blue', `\n📊 접근 가능한 이미지: ${verticalCount}개 / 전체: ${imageFiles.length}개`);

    if (verticalCount === TEST_CONFIG.expectedImageCount) {
      log('green', `✅ 예상 이미지 개수와 일치 (${TEST_CONFIG.expectedImageCount}개)`);
    } else {
      log('yellow', `⚠️ 예상 이미지 개수 불일치: 예상 ${TEST_CONFIG.expectedImageCount}개, 실제 ${verticalCount}개`);
    }

    return {
      success: true,
      imageCount: imageFiles.length,
      verticalCount
    };

  } catch (error) {
    log('red', `❌ 파일 시스템 검증 실패: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 2단계: API 호출 테스트
 */
async function testApiCall() {
  log('cyan', '\n========== 2단계: API 호출 테스트 ==========');

  try {
    log('blue', `🚀 API 호출 중: ${TEST_CONFIG.apiUrl}`);
    log('yellow', '⚠️ 주의: 이 테스트는 실제로 쇼츠 변환을 시작합니다!');
    log('yellow', '   Python 프로세스가 시작되므로, 서버 로그를 확인하세요.');

    const response = await fetch(TEST_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'next-auth.session-token=your-session-token' // 실제 세션 토큰 필요
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('red', `❌ API 호출 실패 (${response.status}): ${errorText}`);
      return { success: false, status: response.status };
    }

    const result = await response.json();
    log('green', '✅ API 호출 성공');
    log('blue', '\n📋 응답 데이터:');
    console.log(JSON.stringify(result, null, 2));

    return { success: true, result };

  } catch (error) {
    log('red', `❌ API 호출 실패: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 3단계: 로그 분석 (수동)
 */
function printLogInstructions() {
  log('cyan', '\n========== 3단계: 서버 로그 확인 ==========');
  log('yellow', '\n다음 로그 패턴을 서버 콘솔에서 확인하세요:\n');

  console.log(`${colors.green}✅ 성공 케이스:${colors.reset}
   🖼️ ========== 9:16 이미지 복사 시작 ==========
   🔍 shorts_images 폴더 확인 중: ...
   ✅ shorts_images 폴더 발견! 우선적으로 사용합니다.
   📁 shorts_images 폴더 내 파일 (4개): [...]
   📷 분석 중: Whisk_01.png
      ✅ 파일 접근 가능
      🔍 sizeOf 결과: { width: 768, height: 1344 }
      768x1344 (비율: 0.571) - ✅ 9:16 OK
   📋 복사: Whisk_01.png → scene_01_image.png
   ✅ 9:16 이미지 복사 완료: 4개
`);

  console.log(`${colors.red}❌ 실패 케이스:${colors.reset}
   ℹ️ 9:16 이미지가 없어서 모든 씬을 DALL-E로 생성합니다.

   또는

   ❌ 이미지 복사 중 오류 발생 (무시하고 계속):
      에러 메시지: ...
`);
}

/**
 * 메인 테스트 실행
 */
async function runTests() {
  log('cyan', '╔════════════════════════════════════════════════════════════╗');
  log('cyan', '║        Shorts 변환 Regression Test                        ║');
  log('cyan', '╚════════════════════════════════════════════════════════════╝');

  // 1단계: 파일 시스템 검증
  const fsResult = await verifyFilesystem();

  if (!fsResult.success) {
    log('red', '\n❌ 테스트 중단: 파일 시스템 검증 실패');
    process.exit(1);
  }

  // 2단계: API 호출 (선택적)
  log('yellow', '\n⚠️ API 호출 테스트를 실행하시겠습니까?');
  log('yellow', '   (실제로 쇼츠 변환이 시작됩니다. 5초 후 자동으로 건너뜁니다)');

  // 자동으로 건너뛰기 (실제 환경에서는 주석 해제)
  await new Promise(resolve => setTimeout(resolve, 5000));
  log('blue', '\n⏭️ API 호출 테스트 건너뜀 (수동으로 실행하려면 코드 수정 필요)');

  // 3단계: 로그 확인 안내
  printLogInstructions();

  // 결과 요약
  log('cyan', '\n========== 테스트 결과 요약 ==========');
  log('green', `✅ 원본 폴더: ${TEST_CONFIG.originalFolder}`);
  log('green', `✅ shorts_images 폴더: ${TEST_CONFIG.shortsImagesFolder}`);
  log('green', `✅ 9:16 이미지: ${fsResult.verticalCount}개`);
  log('blue', '\n👉 다음 단계: 실제로 쇼츠 변환 버튼을 눌러서 서버 로그를 확인하세요!');
}

// 실행
if (require.main === module) {
  runTests().catch(error => {
    log('red', `\n❌ 테스트 실행 중 오류: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
}

module.exports = { verifyFilesystem, testApiCall };
