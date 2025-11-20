/**
 * 상품정보 플레이스홀더 치환 직접 테스트
 * 스케줄러 대기 없이 직접 API 호출
 */

const path = require('path');
const { randomUUID } = require('crypto');
const Database = require(path.join(__dirname, 'trend-video-frontend', 'node_modules', 'better-sqlite3'));

const BASE_URL = 'http://localhost:3000';
const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');

// 테스트용 상품 데이터
const TEST_PRODUCT_DATA = {
  title: '카시오 MQ-24-7B 시계',
  thumbnail: 'https://example.com/thumbnail.jpg',
  product_link: 'https://www.coupang.com/vp/products/12345',
  description: '클래식한 디자인의 카시오 시계입니다.'
};

// 색상 출력
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 사용자 ID 가져오기
function getUserId() {
  const db = new Database(dbPath);
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  db.close();

  if (!user) {
    throw new Error('사용자가 없습니다. 먼저 로그인해주세요.');
  }

  return user.id;
}

// 대본 생성 API 직접 호출
async function generateScript(userId) {
  log('blue', '\n🔄 Step 1: 대본 생성 API 호출');

  const response = await fetch(`${BASE_URL}/api/scripts/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Request': 'test-script'
    },
    body: JSON.stringify({
      title: '[테스트] 상품정보 플레이스홀더 치환 테스트',
      type: 'product-info',
      productInfo: TEST_PRODUCT_DATA,
      model: 'chatgpt',
      useClaudeLocal: false,
      userId: userId,
      category: '상품정보'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 호출 실패: ${response.status} - ${error}`);
  }

  const data = await response.json();
  log('green', `✅ API 호출 성공! Task ID: ${data.taskId}`);

  return data.taskId;
}

// 대본 상태 체크
async function waitForCompletion(taskId) {
  log('blue', '\n🔄 Step 2: 대본 생성 완료 대기 (최대 2분)');

  const maxWaitTime = 120 * 1000; // 2분
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    await sleep(3000); // 3초마다 체크

    const response = await fetch(`${BASE_URL}/api/scripts/status/${taskId}`);

    if (!response.ok) {
      log('yellow', `⚠️ 상태 확인 실패: ${response.status}`);
      continue;
    }

    const status = await response.json();
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    if (status.status === 'completed') {
      log('green', `✅ 대본 생성 완료! (${elapsed}초 소요)`);

      // DB에서 대본 내용 가져오기
      const db = new Database(dbPath);
      const script = db.prepare('SELECT content FROM contents WHERE id = ?').get(taskId);
      db.close();

      if (!script) {
        throw new Error('❌ 대본을 찾을 수 없습니다.');
      }

      return script.content;
    }

    if (status.status === 'failed') {
      throw new Error(`❌ 대본 생성 실패: ${status.error}`);
    }

    log('yellow', `⏳ 대기 중... (${elapsed}초 경과, 진행률: ${status.progress || 0}%)`);
  }

  throw new Error('❌ 타임아웃: 2분 내에 대본이 생성되지 않았습니다.');
}

// 플레이스홀더 치환 확인
function verifyPlaceholderReplacement(content) {
  log('blue', '\n🔍 Step 3: 플레이스홀더 치환 확인');

  const hasPlaceholder = {
    thumbnail: content.includes('{thumbnail}'),
    product_link: content.includes('{product_link}'),
    product_description: content.includes('{product_description}')
  };

  const hasRealValue = {
    thumbnail: content.includes(TEST_PRODUCT_DATA.thumbnail),
    product_link: content.includes(TEST_PRODUCT_DATA.product_link),
    description: content.includes(TEST_PRODUCT_DATA.description)
  };

  log('cyan', '\n📄 대본 내용 (첫 800자):');
  console.log(content.substring(0, 800));
  console.log('...\n');

  let allPassed = true;
  const issues = [];

  // 플레이스홀더가 남아있는지 확인
  if (hasPlaceholder.thumbnail) {
    log('red', '❌ {thumbnail} 플레이스홀더가 치환되지 않았습니다!');
    allPassed = false;
    issues.push('thumbnail 플레이스홀더 미치환');
  } else {
    log('green', '✅ {thumbnail} 플레이스홀더 치환됨');
  }

  if (hasPlaceholder.product_link) {
    log('red', '❌ {product_link} 플레이스홀더가 치환되지 않았습니다!');
    allPassed = false;
    issues.push('product_link 플레이스홀더 미치환');
  } else {
    log('green', '✅ {product_link} 플레이스홀더 치환됨');
  }

  if (hasPlaceholder.product_description) {
    log('red', '❌ {product_description} 플레이스홀더가 치환되지 않았습니다!');
    allPassed = false;
    issues.push('product_description 플레이스홀더 미치환');
  } else {
    log('green', '✅ {product_description} 플레이스홀더 치환됨');
  }

  // 실제 값이 포함되어 있는지 확인
  if (hasRealValue.thumbnail) {
    log('green', '✅ 실제 썸네일 URL 포함됨');
  } else {
    log('yellow', '⚠️ 실제 썸네일 URL이 포함되지 않았습니다.');
  }

  if (hasRealValue.product_link) {
    log('green', '✅ 실제 상품 링크 포함됨');
  } else {
    log('yellow', '⚠️ 실제 상품 링크가 포함되지 않았습니다.');
  }

  if (hasRealValue.description) {
    log('green', '✅ 실제 상품 설명 포함됨');
  } else {
    log('yellow', '⚠️ 실제 상품 설명이 포함되지 않았습니다.');
  }

  return { passed: allPassed, issues };
}

// 정리
function cleanup(taskId) {
  if (!taskId) return;

  log('blue', '\n🧹 Step 4: 테스트 데이터 정리');

  const db = new Database(dbPath);

  try {
    db.prepare('DELETE FROM contents WHERE id = ?').run(taskId);
    log('green', '✅ Contents 삭제');
  } catch (error) {
    log('yellow', `⚠️ 정리 중 오류: ${error.message}`);
  } finally {
    db.close();
  }
}

// 메인 테스트 실행
async function runDirectTest() {
  log('magenta', '\n' + '='.repeat(80));
  log('magenta', '🧪 상품정보 플레이스홀더 치환 직접 테스트');
  log('magenta', '='.repeat(80));

  let taskId = null;

  try {
    // 1. 사용자 ID 가져오기
    const userId = getUserId();
    log('green', `✅ 사용자 ID: ${userId}`);

    // 2. 대본 생성 API 호출
    taskId = await generateScript(userId);

    // 3. 완료 대기
    const content = await waitForCompletion(taskId);

    // 4. 플레이스홀더 치환 확인
    const result = verifyPlaceholderReplacement(content);

    // 5. 결과 출력
    log('magenta', '\n' + '='.repeat(80));
    if (result.passed) {
      log('green', '✅✅✅ 테스트 성공! ✅✅✅');
      log('green', '모든 플레이스홀더가 정상적으로 치환되었습니다.');
    } else {
      log('red', '❌❌❌ 테스트 실패! ❌❌❌');
      log('red', `문제: ${result.issues.join(', ')}`);
    }
    log('magenta', '='.repeat(80) + '\n');

    return result.passed;

  } catch (error) {
    log('red', '\n❌ 테스트 실행 중 오류 발생:');
    log('red', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;

  } finally {
    // 정리
    cleanup(taskId);
  }
}

// 실행
runDirectTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log('red', `Fatal error: ${error.message}`);
    process.exit(1);
  });
