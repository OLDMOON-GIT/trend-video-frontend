const fs = require('fs');
const path = require('path');

console.log('🧪 [이미지크롤링 버튼 테스트]\n');

const myContentPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'my-content', 'page.tsx');
const content = fs.readFileSync(myContentPath, 'utf-8');

// 버튼 존재 확인
const hasButton = content.includes('🎨 이미지크롤링');
console.log(`✅ 버튼 텍스트: ${hasButton ? '존재' : '없음'}`);

// confirm 대화상자 확인
const hasConfirm = content.includes('window.confirm');
console.log(`✅ confirm 대화상자: ${hasConfirm ? '존재' : '없음'}`);

// handleImageCrawling 호출 확인
const hasCall = content.includes('handleImageCrawling(item.data.id');
console.log(`✅ 함수 호출: ${hasCall ? '존재' : '없음'}`);

// 조건부 렌더링 확인
const hasAdminCheck = content.match(/user\?\.isAdmin.*이미지크롤링/s);
console.log(`✅ 관리자 체크: ${hasAdminCheck ? '존재 (관리자만 보임)' : '없음'}`);

const hasMobileCheck = content.match(/!isMobile.*이미지크롤링/s);
console.log(`✅ 모바일 체크: ${hasMobileCheck ? '존재 (PC만 보임)' : '없음'}`);

console.log('\n📋 문제 해결 방법:\n');
console.log('1. 버튼이 안 보이면:');
console.log('   - 관리자 계정으로 로그인 확인');
console.log('   - PC 브라우저에서 접속 (모바일 X)\n');

console.log('2. 버튼은 보이는데 클릭이 안 되면:');
console.log('   - 브라우저 콘솔(F12) 열고 에러 확인');
console.log('   - Network 탭에서 API 호출 확인\n');

console.log('3. API 호출 실패하면:');
console.log('   - 백엔드 서버 실행 중인지 확인');
console.log('   - Python 및 Selenium 설치 확인\n');
