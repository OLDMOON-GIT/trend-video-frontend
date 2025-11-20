/**
 * 🧪 open-folder API 상세 테스트
 *
 * 문제 분석:
 * - 서버 로그: 200 OK 응답
 * - 클라이언트: 404 Not Found 에러
 * 이는 응답이 성공했지만 클라이언트에서 JSON 파싱 실패를 의미할 수 있음
 */

const fs = require('fs');
const path = require('path');

let testCount = 0;
let passCount = 0;

function test(name, condition, details = '') {
  testCount++;
  const result = condition ? '✅' : '❌';
  console.log(`${result} [${testCount}] ${name}`);
  if (condition) passCount++;
  if (details && !condition) console.log(`   → ${details}`);
}

console.log('🧪 open-folder API 상세 테스트\n');

// 1. API 응답 구조 확인
console.log('📋 1. API 응답 구조 분석\n');

const apiContent = fs.readFileSync(
  path.join(__dirname, 'trend-video-frontend/src/app/api/open-folder/route.ts'),
  'utf-8'
);

// 1-1. 응답 형식 확인
test('응답이 JSON 형식인가?',
  apiContent.includes('NextResponse.json'),
  'NextResponse.json 사용 확인'
);

// 1-2. 에러 응답 형식 확인
test('에러도 JSON인가?',
  apiContent.match(/NextResponse\.json\(\s*\{[^}]*error/),
  '에러도 JSON으로 반환 확인'
);

// 1-3. 성공 응답 형식 확인
const successResponse = apiContent.includes('success: true');
test('성공 응답에 success 필드가 있는가?',
  successResponse,
  'success: true 필드 확인'
);

// 1-4. jobId 처리 로직
console.log('\n📋 2. jobId 처리 로직\n');

const hasJobIdExtract = apiContent.includes("const jobId = searchParams.get('jobId')");
test('jobId 파라미터 추출',
  hasJobIdExtract
);

const hasJobIdCheck = apiContent.includes('if (!jobId)');
test('jobId 존재 여부 확인',
  hasJobIdCheck
);

const hasJobFound = apiContent.includes('const job = await findJobById(jobId)');
test('jobId로 job 조회',
  hasJobFound
);

// 1-5. 폴더 경로 추정 로직
console.log('\n📋 3. 폴더 경로 추정 로직\n');

const hasUploadsFolder = apiContent.includes("'uploads'");
test('uploads 폴더 경로 처리',
  hasUploadsFolder
);

const hasInputFolder = apiContent.includes("'input'");
test('input 폴더 경로 처리',
  hasInputFolder
);

const hasOutputFolder = apiContent.includes("'output'");
test('output 폴더 경로 처리',
  hasOutputFolder
);

const hasUploadedPrefix = apiContent.includes('uploaded_');
test('uploaded_ 접두사 사용',
  hasUploadedPrefix
);

// 1-6. 실제 경로 조합 로직
console.log('\n📋 4. 경로 조합 로직\n');

const pathResolveMatch = apiContent.match(/path\.resolve|path\.join/g);
test(`경로 조합 함수 사용 (${pathResolveMatch ? pathResolveMatch.length : 0}회)`,
  pathResolveMatch && pathResolveMatch.length >= 3
);

const hasBackendPath = apiContent.includes("process.cwd(), '..'");
test('백엔드 경로 계산 (부모 디렉토리)',
  hasBackendPath
);

// 1-7. 폴더 존재 여부 확인
console.log('\n📋 5. 폴더 존재 여부 확인\n');

const hasExistsCheck = apiContent.includes('fs.existsSync');
test('폴더 존재 여부 확인 (fs.existsSync)',
  hasExistsCheck
);

const has404Error = apiContent.includes('status: 404');
test('폴더 미존재 시 404 응답',
  has404Error
);

// 1-8. 실제 폴더 열기
console.log('\n📋 6. 실제 폴더 열기\n');

const hasExplorer = apiContent.includes('explorer.exe');
test('Windows explorer 실행',
  hasExplorer
);

const hasSpawn = apiContent.includes('spawn(');
test('spawn을 통한 프로세스 실행',
  hasSpawn
);

// 2. 로그 분석
console.log('\n📋 7. 서버 로그 분석\n');

const logPath = path.join(__dirname, 'trend-video-frontend/logs/server.log');
const logContent = fs.readFileSync(logPath, 'utf-8');
const recentLogs = logContent.split('\n').slice(-300);

// 2-1. 최근 404 에러
const recent404 = recentLogs.find(line => line.includes('404'));
test('최근 404 에러 확인',
  recent404 !== undefined,
  recent404 || '404 에러 없음'
);

// 2-2. open-folder API 호출
const openFolderCalls = recentLogs.filter(line => line.includes('/api/open-folder'));
test(`open-folder API 호출 (${openFolderCalls.length}회)`,
  openFolderCalls.length > 0,
  `최근 ${openFolderCalls.length}회 호출 확인`
);

if (openFolderCalls.length > 0) {
  console.log('\n📝 최근 open-folder 호출:');
  openFolderCalls.slice(-3).forEach((line, i) => {
    console.log(`   ${i + 1}. ${line.trim()}`);
  });
}

// 2-3. 성공 응답 확인
const successLogs = recentLogs.filter(line =>
  line.includes('explorer 프로세스') && line.includes('시작됨')
);
test(`explorer 프로세스 시작 (${successLogs.length}회)`,
  successLogs.length > 0,
  `${successLogs.length}회 성공 확인`
);

// 2-4. 폴더 경로 관련 로그
const folderLogs = recentLogs.filter(line =>
  line.includes('📁') || line.includes('📂')
);
test(`폴더 관련 로그 (${folderLogs.length}개)`,
  folderLogs.length > 0,
  `${folderLogs.length}개 폴더 로그 확인`
);

// 3. 클라이언트 코드 분석
console.log('\n📋 8. 클라이언트 코드 분석\n');

const pageContent = fs.readFileSync(
  path.join(__dirname, 'trend-video-frontend/src/app/automation/page.tsx'),
  'utf-8'
);

const hasErrorHandling = pageContent.includes('!response.ok');
test('응답 상태 체크',
  hasErrorHandling
);

const hasJsonParse = pageContent.includes('response.json()');
test('JSON 파싱',
  hasJsonParse
);

const hasConsoleError = pageContent.includes('console.error');
test('에러 로깅',
  hasConsoleError
);

// 4. 데이터베이스 확인
console.log('\n📋 9. 데이터베이스 테스트\n');

try {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'trend-video-frontend/data/database.sqlite');
  const db = new Database(dbPath, { readonly: true });

  // 최근 video_id 조회
  const recentSchedule = db.prepare(`
    SELECT id, title_id, video_id, script_id, status
    FROM video_schedules
    WHERE video_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `).get();

  test('video_id 데이터 존재',
    recentSchedule && recentSchedule.video_id !== null,
    recentSchedule
      ? `ID: ${recentSchedule.video_id}`
      : 'video_id 없음'
  );

  if (recentSchedule) {
    console.log(`\n📊 최근 스케줄 정보:`);
    console.log(`   - Schedule ID: ${recentSchedule.id}`);
    console.log(`   - Video ID: ${recentSchedule.video_id}`);
    console.log(`   - Script ID: ${recentSchedule.script_id}`);
    console.log(`   - Status: ${recentSchedule.status}`);
  }

  db.close();
} catch (error) {
  console.log(`❌ DB 오류: ${error.message}`);
}

// 5. 폴더 구조 확인
console.log('\n📋 10. 백엔드 폴더 구조\n');

const backendPath = path.join(__dirname, 'trend-video-backend');

const folders = ['uploads', 'input', 'output'];
folders.forEach(folder => {
  const folderPath = path.join(backendPath, folder);
  const exists = fs.existsSync(folderPath);
  test(`${folder} 폴더 존재`,
    exists
  );

  if (exists) {
    const items = fs.readdirSync(folderPath);
    console.log(`   → ${items.length}개 항목`);
    if (items.length <= 3) {
      items.forEach(item => console.log(`      - ${item}`));
    } else {
      items.slice(0, 3).forEach(item => console.log(`      - ${item}`));
      console.log(`      ... 외 ${items.length - 3}개`);
    }
  }
});

// 결과 출력
console.log('\n' + '═'.repeat(60));
console.log(`📊 결과: ${passCount}/${testCount} 통과`);
console.log('═'.repeat(60));

// 종합 분석
console.log('\n💡 분석:\n');

if (passCount === testCount) {
  console.log('✅ 모든 코드와 설정이 정상입니다.');
  console.log('📌 폴더 버튼이 404 에러를 받는 이유:');
  console.log('   1. 클라이언트에서 응답을 JSON으로 파싱하려고 했지만 실패');
  console.log('   2. 또는 API가 응답을 반환하기 전에 요청이 취소됨');
  console.log('   3. 또는 브라우저의 네트워크 요청이 실패함');
} else {
  console.log('❌ 일부 코드에 문제가 있습니다.');
}

process.exit(passCount === testCount ? 0 : 1);
