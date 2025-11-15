// 쿠팡 API 테스트 - 쿼리 파라미터 없음
const crypto = require('crypto');

const accessKey = '8943cf3b-80ce-4a66-ad3a-fb6e1c017061';
const secretKey = '6dca670b914c80257e796f8f5c25ebcfb833089a';

const REQUEST_METHOD = 'GET';
const DOMAIN = 'https://api-gateway.coupang.com';
const URL = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1001';

// Datetime format: yymmddTHHMMSSZ
const now = new Date();
const year = String(now.getUTCFullYear()).slice(-2);
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const day = String(now.getUTCDate()).padStart(2, '0');
const hours = String(now.getUTCHours()).padStart(2, '0');
const minutes = String(now.getUTCMinutes()).padStart(2, '0');
const seconds = String(now.getUTCSeconds()).padStart(2, '0');
const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

// Message: datetime + method + URL (쿼리 없음!)
const message = datetime + REQUEST_METHOD + URL;

const signature = crypto
  .createHmac('sha256', secretKey)
  .update(message)
  .digest('hex');

const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

console.log('🔐 쿼리 파라미터 없음 테스트');
console.log('   message:', message);
console.log('');

// API 호출 (쿼리 없음)
console.log('🌐 호출:', DOMAIN + URL);

fetch(DOMAIN + URL, {
  method: REQUEST_METHOD,
  headers: {
    'Authorization': authorization,
    'Content-Type': 'application/json'
  }
})
  .then(response => {
    console.log('📡 응답:', response.status);
    return response.text().then(text => ({ status: response.status, text, ok: response.ok }));
  })
  .then(({ status, text, ok }) => {
    if (ok) {
      console.log('✅ 성공!');
      const data = JSON.parse(text);
      console.log('📦 상품 수:', data.data?.length);
    } else {
      console.error('❌ 실패:', status);
      console.error(text.substring(0, 200));
    }
  })
  .catch(error => {
    console.error('❌ 에러:', error.message);
  });
