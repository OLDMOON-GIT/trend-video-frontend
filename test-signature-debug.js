// 서버와 동일한 datetime으로 서명 생성 테스트
const crypto = require('crypto');

const accessKey = '8943cf3b-80ce-4a66-ad3a-fb6e1c017061';
const secretKey = '6dca670b914c80257e796f8f5c25ebcfb833089a';

const REQUEST_METHOD = 'GET';
const URL = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1001';

// 서버 로그의 datetime 사용
const datetime = '251114T081902Z';

// Message: datetime + method + URL
const message = datetime + REQUEST_METHOD + URL;

const signature = crypto
  .createHmac('sha256', secretKey)
  .update(message)
  .digest('hex');

console.log('🔍 서버 로그 재현 테스트');
console.log('   datetime:', datetime);
console.log('   message:', message);
console.log('   signature:', signature);
console.log('');
console.log('📊 서버 로그와 비교:');
console.log('   서버 signature: 5e512fbfe3466d9d8ecb484884fca42654d9f53e4331cc8763fc5edc69010427');
console.log('   생성 signature:', signature);
console.log('   일치 여부:', signature === '5e512fbfe3466d9d8ecb484884fca42654d9f53e4331cc8763fc5edc69010427');
