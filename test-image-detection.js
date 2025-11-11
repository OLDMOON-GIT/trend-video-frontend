/**
 * 이미지 감지 로직 Unit Test
 * 실제 convert-to-shorts API의 이미지 복사 로직을 시뮬레이션
 */

const path = require('path');
const fs = require('fs').promises;

// 테스트 설정
const TEST_FOLDER = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\uploads\\uploaded_upload_1762841000063_fydihfdwq';
const SHORTS_IMAGES_FOLDER = path.join(TEST_FOLDER, 'shorts_images');
const TEST_OUTPUT = path.join(__dirname, 'test-output');

// 색상
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, msg) {
  console.log(`${c[color]}${msg}${c.reset}`);
}

/**
 * 실제 API 로직을 그대로 복제
 */
async function testImageDetection() {
  log('cyan', '\n========== 이미지 감지 로직 테스트 ==========\n');

  const folderPath = TEST_FOLDER;
  console.log('📂 원본 폴더:', folderPath);

  try {
    // 1. 메인 폴더 읽기
    let files = [];
    try {
      files = await fs.readdir(folderPath);
      log('green', `✅ 메인 폴더 읽기 성공 (${files.length}개 파일)`);
    } catch (err) {
      log('red', `❌ 메인 폴더 읽기 실패: ${err.message}`);
      throw err;
    }

    // 2. shorts_images 서브폴더 확인
    const shortsImagesFolder = path.join(folderPath, 'shorts_images');
    console.log('\n🔍 shorts_images 폴더:', shortsImagesFolder);

    let hasShortsFolder = false;
    try {
      await fs.access(shortsImagesFolder);
      hasShortsFolder = true;
      log('green', '✅ shorts_images 폴더 발견!');

      const shortsFiles = await fs.readdir(shortsImagesFolder);
      log('blue', `📁 shorts_images 폴더 내 파일 (${shortsFiles.length}개):`);
      shortsFiles.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));

      // ⭐ 중요: shorts_images 폴더의 파일을 우선 사용
      files = shortsFiles.map(f => path.join('shorts_images', f));
      log('yellow', '\n   변환된 상대 경로:');
      files.forEach(f => console.log(`   - ${f}`));

    } catch (err) {
      log('yellow', `ℹ️ shorts_images 폴더 없음: ${err.message}`);
    }

    // 3. 이미지 파일 필터링
    const imageFiles = files.filter(f => {
      const basename = path.basename(f);
      return /\.(jpg|jpeg|png)$/i.test(basename) && !basename.includes('thumbnail');
    });

    log('blue', `\n🔍 이미지 파일 (${imageFiles.length}개):`);
    imageFiles.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));

    // 4. image-size로 크기 확인
    log('cyan', '\n========== 이미지 크기 분석 ==========\n');

    // ⭐ 중요: API와 동일하게 dynamic import 사용
    const imageSizeModule = await import('image-size');
    const sizeOf = imageSizeModule.default;

    const targetRatio = 9 / 16;
    const tolerance = 0.05;
    const verticalImages = [];

    for (const file of imageFiles) {
      try {
        const imagePath = path.join(folderPath, file);
        const basename = path.basename(file);

        console.log(`📷 ${basename}`);
        console.log(`   경로: ${imagePath}`);

        // 파일 존재 확인
        try {
          await fs.access(imagePath);
          console.log(`   ✅ 파일 접근 가능`);
        } catch (accessErr) {
          log('red', `   ❌ 파일 접근 불가: ${accessErr.message}`);
          continue;
        }

        // 크기 읽기 (Buffer 사용)
        let dimensions;
        try {
          const buffer = await fs.readFile(imagePath);
          dimensions = sizeOf(buffer);
          console.log(`   🔍 크기: ${dimensions.width}x${dimensions.height}`);
        } catch (sizeErr) {
          log('red', `   ❌ 크기 읽기 실패: ${sizeErr.message}`);
          continue;
        }

        if (dimensions && dimensions.width && dimensions.height) {
          const ratio = dimensions.width / dimensions.height;
          const isVertical = Math.abs(ratio - targetRatio) < tolerance;

          console.log(`   📐 비율: ${ratio.toFixed(3)} (9:16 = ${targetRatio.toFixed(3)})`);
          console.log(`   ${isVertical ? '✅ 9:16 OK' : '❌ 9:16 아님'}`);

          if (isVertical) {
            // 시퀀스 번호 추출 (엄격한 패턴만 인식)
            const baseName = path.basename(file, path.extname(file));
            let seq = null;

            // 명확한 시퀀스 패턴만 인식:
            // - scene_01, image_01, img_1 형식
            // - 파일명 끝에 _01 또는 _1 형식
            // - 해시값 내부의 숫자는 무시
            const seqPatterns = [
              /(?:scene|image|img)_(\d{1,3})$/i,  // scene_01, image_1 등
              /_(\d{1,3})$/,                       // 끝에 _01, _1 등
              /^(\d{1,3})_/,                       // 시작에 01_, 1_ 등
            ];

            for (const pattern of seqPatterns) {
              const match = baseName.match(pattern);
              if (match) {
                seq = parseInt(match[1]);
                console.log(`   🔢 시퀀스 추출: ${match[0]} → ${seq}`);
                break;
              }
            }

            if (seq === null) {
              console.log(`   ℹ️ 시퀀스 없음 (오래된 순으로 정렬됨)`);
            }

            const stat = await fs.stat(imagePath);
            verticalImages.push({
              file: basename,
              path: imagePath,
              dimensions,
              seq,
              mtime: stat.mtimeMs
            });
          }
        }

        console.log('');
      } catch (err) {
        log('red', `   ⚠️ 처리 실패: ${err.message}\n`);
      }
    }

    // 5. 정렬
    verticalImages.sort((a, b) => {
      if (a.seq !== null && b.seq !== null) {
        return a.seq - b.seq;
      } else if (a.seq !== null) {
        return -1;
      } else if (b.seq !== null) {
        return 1;
      } else {
        return a.mtime - b.mtime;
      }
    });

    log('cyan', '\n========== 정렬 결과 ==========\n');
    log('blue', `총 ${verticalImages.length}개의 9:16 이미지 발견:`);
    verticalImages.forEach((img, idx) => {
      console.log(`   ${idx + 1}. ${img.file}`);
      console.log(`      크기: ${img.dimensions.width}x${img.dimensions.height}`);
      console.log(`      시퀀스: ${img.seq !== null ? img.seq : 'none'}`);
      console.log(`      수정시간: ${new Date(img.mtime).toLocaleString()}`);
      console.log('');
    });

    // 6. 복사 시뮬레이션
    log('cyan', '\n========== 복사 시뮬레이션 ==========\n');

    // 테스트 출력 폴더 생성
    await fs.mkdir(TEST_OUTPUT, { recursive: true });

    let copiedCount = 0;
    for (const img of verticalImages) {
      copiedCount++;
      const targetFileName = `scene_${copiedCount.toString().padStart(2, '0')}_image${path.extname(img.file)}`;
      const targetPath = path.join(TEST_OUTPUT, targetFileName);

      try {
        await fs.copyFile(img.path, targetPath);
        log('green', `✅ 복사 성공: ${img.file} → ${targetFileName}`);
      } catch (copyErr) {
        log('red', `❌ 복사 실패: ${copyErr.message}`);
      }
    }

    log('cyan', '\n========== 테스트 결과 ==========\n');
    if (copiedCount > 0) {
      log('green', `✅ 성공: ${copiedCount}개 이미지 복사 완료`);
      log('blue', `📂 출력 폴더: ${TEST_OUTPUT}`);
    } else {
      log('red', `❌ 실패: 이미지를 찾지 못했습니다`);
    }

  } catch (error) {
    log('red', `\n❌ 테스트 실패: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// 실행
testImageDetection().catch(err => {
  log('red', `\n❌ 치명적 오류: ${err.message}`);
  console.error(err);
  process.exit(1);
});
