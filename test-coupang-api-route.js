// 쿠팡 API 라우트 회귀 테스트
// API 라우트의 핵심 로직을 직접 테스트

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 설정 파일 읽기 (API 라우트와 동일한 방식)
const DATA_DIR = path.join(__dirname, 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

function loadSettings() {
  try {
    const data = fs.readFileSync(COUPANG_SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ 설정 파일 읽기 실패:', error.message);
    return {};
  }
}

async function testCoupangAPIRoute() {
  console.log('🧪 쿠팡 API 라우트 회귀 테스트 시작\n');

  // 1. 설정 파일 로드 (API 라우트와 동일)
  const allSettings = loadSettings();
  const userId = 'b5d1f064-60b9-45ab-9bcd-d36948196459';
  const userSettings = allSettings[userId];

  if (!userSettings || !userSettings.accessKey || !userSettings.secretKey) {
    console.error('❌ 저장된 API 키 없음');
    process.exit(1);
  }

  const { accessKey, secretKey } = userSettings;

  console.log('✅ 1. 설정 파일 로드 성공');
  console.log('   accessKey:', accessKey.substring(0, 10) + '...');
  console.log('   secretKey: provided\n');

  // 2. HMAC 서명 생성 (API 라우트와 동일)
  const REQUEST_METHOD = 'GET';
  const DOMAIN = 'https://api-gateway.coupang.com';
  const URL = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1001';

  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  const message = datetime + REQUEST_METHOD + URL;

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');

  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  console.log('✅ 2. HMAC 서명 생성 완료');
  console.log('   datetime:', datetime);
  console.log('   message:', message);
  console.log('   signature:', signature.substring(0, 20) + '...\n');

  // 3. 쿠팡 API 호출 (API 라우트와 동일)
  console.log('🌐 3. 쿠팡 API 호출 중...');
  console.log('   URL:', DOMAIN + URL);

  try {
    const response = await fetch(DOMAIN + URL, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 응답 상태:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ 4. 쿠팡 API 호출 성공!\n');
      console.log('📦 결과:');
      console.log('   rCode:', data.rCode);
      console.log('   상품 수:', data.data?.length || 0);
      console.log('\n🎉 회귀 테스트 성공! API 라우트가 정상 작동합니다.\n');
      process.exit(0);
    } else {
      const errorText = await response.text();
      console.error('❌ 4. 쿠팡 API 호출 실패\n');
      console.error('응답:', errorText);
      console.error('\n💥 회귀 테스트 실패! API 라우트 수정이 필요합니다.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 4. API 호출 에러:', error.message);
    console.error('\n💥 회귀 테스트 실패!\n');
    process.exit(1);
  }
}

// 테스트 실행
testCoupangAPIRoute();
