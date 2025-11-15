/**
 * 쿠팡 상품 검색 API 테스트
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 설정 로드
const settingsPath = path.join(__dirname, 'data', 'coupang-settings.json');
const allSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const userId = 'b5d1f064-60b9-45ab-9bcd-d36948196459';
const userSettings = allSettings[userId];

if (!userSettings) {
  console.error('❌ 사용자 설정을 찾을 수 없습니다.');
  process.exit(1);
}

const { accessKey, secretKey } = userSettings;

console.log('🔐 API 키 확인:');
console.log('   accessKey:', accessKey.substring(0, 8) + '...');
console.log('   secretKey:', secretKey.substring(0, 16) + '...');

// HMAC 서명 생성
function generateCoupangSignature(method, path, accessKey, secretKey) {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  const message = datetime + method + path;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  return { datetime, signature, authorization };
}

// 검색 테스트
async function testSearch(keyword) {
  console.log(`\n🔍 검색 테스트: "${keyword}"`);

  const REQUEST_METHOD = 'GET';
  const DOMAIN = 'https://api-gateway.coupang.com';
  const PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
  const QUERY = `?keyword=${encodeURIComponent(keyword)}&limit=10`;
  const FULL_URL = PATH + QUERY;

  const { datetime, signature, authorization } = generateCoupangSignature(REQUEST_METHOD, PATH, accessKey, secretKey);

  console.log('   datetime:', datetime);
  console.log('   message:', datetime + REQUEST_METHOD + PATH);
  console.log('   signature:', signature);

  try {
    const response = await fetch(DOMAIN + FULL_URL, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      }
    });

    console.log('   응답 상태:', response.status);

    if (response.ok) {
      const data = await response.json();
      if (data.rCode === '0' && data.data) {
        const products = data.data.productData || [];
        console.log(`   ✅ 성공: ${products.length}개 상품 발견`);
        if (products.length > 0) {
          console.log('   첫 번째 상품:', products[0].productName);
        }
        return true;
      } else {
        console.log('   ❌ 실패:', data.message || '검색 결과 없음');
        return false;
      }
    } else {
      const errorText = await response.text();
      console.log('   ❌ API 오류:', errorText);
      return false;
    }
  } catch (error) {
    console.error('   ❌ 예외 발생:', error.message);
    return false;
  }
}

// 테스트 실행
(async () => {
  console.log('='.repeat(60));
  console.log('쿠팡 상품 검색 API 테스트');
  console.log('='.repeat(60));

  const testKeywords = ['노트북', '무선이어폰', '텀블러'];
  let passCount = 0;

  for (const keyword of testKeywords) {
    const result = await testSearch(keyword);
    if (result) passCount++;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`테스트 결과: ${passCount}/${testKeywords.length} 통과`);
  console.log('='.repeat(60));

  process.exit(passCount === testKeywords.length ? 0 : 1);
})();
