// 쿠팡 API 테스트 - 쿼리 파라미터 제외 버전
const crypto = require('crypto');

const accessKey = '8943cf3b-80ce-4a66-ad3a-fb6e1c017061';
const secretKey = '6dca670b914c80257e796f8f5c25ebcfb833089a';

const REQUEST_METHOD = 'GET';
const DOMAIN = 'https://api-gateway.coupang.com';
const PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1001';
const QUERY = '?limit=20';
const FULL_URL = PATH + QUERY;

// Datetime format: yymmddTHHMMSSZ
const now = new Date();
const year = String(now.getUTCFullYear()).slice(-2);
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const day = String(now.getUTCDate()).padStart(2, '0');
const hours = String(now.getUTCHours()).padStart(2, '0');
const minutes = String(now.getUTCMinutes()).padStart(2, '0');
const seconds = String(now.getUTCSeconds()).padStart(2, '0');
const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

// Message: datetime + method + PATH (쿼리 파라미터 제외!)
const message = datetime + REQUEST_METHOD + PATH;

const signature = crypto
  .createHmac('sha256', secretKey)
  .update(message)
  .digest('hex');

const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

console.log('🔐 인증 정보:');
console.log('   datetime:', datetime);
console.log('   PATH (서명용):', PATH);
console.log('   FULL_URL (요청용):', FULL_URL);
console.log('   message:', message);
console.log('   signature:', signature);
console.log('');

// API 호출
console.log('🌐 쿠팡 API 호출 시작:', DOMAIN + FULL_URL);

fetch(DOMAIN + FULL_URL, {
  method: REQUEST_METHOD,
  headers: {
    'Authorization': authorization,
    'Content-Type': 'application/json'
  }
})
  .then(response => {
    console.log('📡 응답 상태:', response.status);
    return response.text().then(text => ({ status: response.status, text, ok: response.ok }));
  })
  .then(({ status, text, ok }) => {
    if (ok) {
      console.log('✅ 성공!');
      try {
        const data = JSON.parse(text);
        console.log('📦 데이터 수:', data.data?.length || 0, '개 상품');
      } catch (e) {
        console.log('📦 응답:', text.substring(0, 200));
      }
    } else {
      console.error('❌ 실패:', status);
      console.error('📦 응답:', text);
    }
  })
  .catch(error => {
    console.error('❌ 에러:', error.message);
  });
