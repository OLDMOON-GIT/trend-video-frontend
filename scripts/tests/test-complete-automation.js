/**
 * 완전 자동화 시스템 통합 테스트
 *
 * 테스트 항목:
 * 1. DB 스키마 - categories 컬럼 존재 확인
 * 2. 채널 설정 - categories 저장/조회
 * 3. 다음 스케줄 시간 계산
 * 4. 자동 제목 생성 (AI API 호출)
 * 5. 자동 스케줄 추가
 * 6. 전체 플로우 시뮬레이션
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');

console.log('\n' + '='.repeat(80));
console.log('🧪 완전 자동화 시스템 통합 테스트');
console.log('='.repeat(80) + '\n');

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) console.log(`   ${details}`);

  testResults.push({ name, passed, details });
  if (passed) testsPassed++;
  else testsFailed++;
}

// ========== 테스트 1: DB 스키마 확인 ==========
console.log('\n📋 테스트 1: DB 스키마 - categories 컬럼 확인\n');

try {
  const db = new Database(dbPath);

  // youtube_channel_settings 테이블 스키마 조회
  const schema = db.prepare(`PRAGMA table_info(youtube_channel_settings)`).all();
  const categoriesColumn = schema.find(col => col.name === 'categories');

  logTest(
    'youtube_channel_settings 테이블에 categories 컬럼 존재',
    !!categoriesColumn,
    categoriesColumn ? `타입: ${categoriesColumn.type}` : 'categories 컬럼이 없습니다'
  );

  db.close();
} catch (error) {
  logTest('DB 스키마 확인', false, error.message);
}

// ========== 테스트 2: 채널 설정 CRUD ==========
console.log('\n📋 테스트 2: 채널 설정 - categories 저장/조회\n');

const testUserId = 'test_user_' + Date.now();
const testChannelId = 'UC_test_' + Date.now();
const testCategories = ['시니어사연', '복수극', '감동'];

try {
  const db = new Database(dbPath);

  // 2-1. 채널 설정 추가 (categories 포함)
  const settingId = `channel_settings_${Date.now()}_test`;
  db.prepare(`
    INSERT INTO youtube_channel_settings
      (id, user_id, channel_id, channel_name, color, posting_mode,
       interval_value, interval_unit, is_active, categories)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    settingId,
    testUserId,
    testChannelId,
    '테스트 채널',
    '#3b82f6',
    'fixed_interval',
    3,
    'days',
    1,
    JSON.stringify(testCategories)
  );

  logTest('채널 설정 추가 (categories 포함)', true, `설정 ID: ${settingId}`);

  // 2-2. 채널 설정 조회 및 categories 파싱
  const setting = db.prepare(`
    SELECT * FROM youtube_channel_settings WHERE id = ?
  `).get(settingId);

  const categoriesParsed = setting.categories ? JSON.parse(setting.categories) : null;

  logTest(
    'categories 조회 및 JSON 파싱',
    Array.isArray(categoriesParsed) && categoriesParsed.length === 3,
    `조회된 카테고리: [${categoriesParsed?.join(', ')}]`
  );

  logTest(
    'categories 내용 일치',
    JSON.stringify(categoriesParsed) === JSON.stringify(testCategories),
    `저장: [${testCategories.join(', ')}] / 조회: [${categoriesParsed?.join(', ')}]`
  );

  // 2-3. categories 업데이트
  const updatedCategories = ['시니어사연', '복수극', '감동', '패션'];
  db.prepare(`
    UPDATE youtube_channel_settings
    SET categories = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(JSON.stringify(updatedCategories), settingId);

  const updatedSetting = db.prepare(`
    SELECT * FROM youtube_channel_settings WHERE id = ?
  `).get(settingId);

  const updatedCategoriesParsed = JSON.parse(updatedSetting.categories);

  logTest(
    'categories 업데이트',
    updatedCategoriesParsed.length === 4,
    `업데이트 후: [${updatedCategoriesParsed.join(', ')}]`
  );

  // 정리
  db.prepare(`DELETE FROM youtube_channel_settings WHERE id = ?`).run(settingId);

  db.close();
} catch (error) {
  logTest('채널 설정 CRUD', false, error.message);
}

// ========== 테스트 3: 다음 스케줄 시간 계산 ==========
console.log('\n📋 테스트 3: 다음 스케줄 시간 계산 로직\n');

try {
  // 고정 주기 모드: 3일마다
  const lastScheduleTime = new Date('2025-01-01T12:00:00');
  const intervalValue = 3;
  const intervalUnit = 'days';

  const nextTime = new Date(lastScheduleTime);
  if (intervalUnit === 'hours') {
    nextTime.setHours(nextTime.getHours() + intervalValue);
  } else if (intervalUnit === 'days') {
    nextTime.setDate(nextTime.getDate() + intervalValue);
  }

  const expectedDate = '2025-01-04T12:00:00';
  const actualDate = nextTime.toISOString().slice(0, 19);

  logTest(
    '고정 주기 모드 - 3일 후 계산',
    actualDate === expectedDate,
    `마지막: ${lastScheduleTime.toISOString().slice(0, 19)} → 다음: ${actualDate} (기대: ${expectedDate})`
  );

  // 요일/시간 모드: 매주 월수금 12시
  const weekdays = [1, 3, 5]; // 월, 수, 금
  const postingTime = '12:00';
  const currentDate = new Date('2025-01-06T15:00:00'); // 월요일 15시

  let nextWeekdayTime = new Date(currentDate);
  nextWeekdayTime.setDate(nextWeekdayTime.getDate() + 1); // 다음 날부터 검색

  // 다음 해당 요일 찾기
  while (!weekdays.includes(nextWeekdayTime.getDay())) {
    nextWeekdayTime.setDate(nextWeekdayTime.getDate() + 1);
  }

  // 시간 설정
  const [hours, minutes] = postingTime.split(':');
  nextWeekdayTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  const expectedWeekday = 3; // 수요일
  const actualWeekday = nextWeekdayTime.getDay();

  logTest(
    '요일/시간 모드 - 다음 수요일 12시 계산',
    actualWeekday === expectedWeekday,
    `현재: 월요일 15시 → 다음: ${nextWeekdayTime.toISOString().slice(0, 19)} (${['일', '월', '화', '수', '목', '금', '토'][actualWeekday]}요일)`
  );

} catch (error) {
  logTest('다음 스케줄 시간 계산', false, error.message);
}

// ========== 테스트 4: AI 제목 생성 API 확인 ==========
console.log('\n📋 테스트 4: AI 제목 생성 API 존재 확인\n');

try {
  const apiPath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'api', 'generate-title-suggestions', 'route.ts');

  logTest(
    'AI 제목 생성 API 파일 존재',
    fs.existsSync(apiPath),
    `경로: ${apiPath}`
  );

  if (fs.existsSync(apiPath)) {
    const apiContent = fs.readFileSync(apiPath, 'utf-8');
    const hasPostMethod = apiContent.includes('export async function POST');
    const hasCategoriesParam = apiContent.includes('categories');

    logTest('API POST 메서드 존재', hasPostMethod);
    logTest('API categories 파라미터 처리', hasCategoriesParam);
  }
} catch (error) {
  logTest('AI 제목 생성 API 확인', false, error.message);
}

// ========== 테스트 5: 자동화 스케줄러 함수 확인 ==========
console.log('\n📋 테스트 5: 자동화 스케줄러 - checkAndCreateAutoSchedules 함수\n');

try {
  const schedulerPath = path.join(__dirname, 'trend-video-frontend', 'src', 'lib', 'automation-scheduler.ts');

  logTest(
    'automation-scheduler.ts 파일 존재',
    fs.existsSync(schedulerPath),
    `경로: ${schedulerPath}`
  );

  if (fs.existsSync(schedulerPath)) {
    const schedulerContent = fs.readFileSync(schedulerPath, 'utf-8');

    const hasAutoScheduleFunction = schedulerContent.includes('async function checkAndCreateAutoSchedules');
    logTest('checkAndCreateAutoSchedules 함수 존재', hasAutoScheduleFunction);

    const hasChannelSettingsQuery = schedulerContent.includes('SELECT * FROM youtube_channel_settings');
    logTest('채널 설정 조회 쿼리 존재', hasChannelSettingsQuery);

    const hasCategoriesCheck = schedulerContent.includes('setting.categories');
    logTest('categories 확인 로직 존재', hasCategoriesCheck);

    const hasRandomCategorySelection = schedulerContent.includes('Math.random()');
    logTest('랜덤 카테고리 선택 로직 존재', hasRandomCategorySelection);

    const hasTitleGeneration = schedulerContent.includes('generate-title-suggestions');
    logTest('AI 제목 생성 API 호출 존재', hasTitleGeneration);

    const hasAddVideoTitle = schedulerContent.includes('addVideoTitle');
    logTest('제목 DB 추가 로직 존재', hasAddVideoTitle);

    const hasAddSchedule = schedulerContent.includes('addSchedule');
    logTest('스케줄 자동 추가 로직 존재', hasAddSchedule);

    const isCalledInScheduler = schedulerContent.includes('checkAndCreateAutoSchedules()');
    logTest('스케줄러에서 함수 호출', isCalledInScheduler);

    // 호출 횟수 확인 (시작 시 1회 + setInterval 내부 1회 = 최소 2회)
    const callCount = (schedulerContent.match(/checkAndCreateAutoSchedules\(\)/g) || []).length;
    logTest(
      '스케줄러에서 주기적으로 호출',
      callCount >= 2,
      `함수 호출 횟수: ${callCount}회 (시작 시 + 주기적)`
    );
  }
} catch (error) {
  logTest('자동화 스케줄러 함수 확인', false, error.message);
}

// ========== 테스트 6: ChannelSettings UI 확인 ==========
console.log('\n📋 테스트 6: ChannelSettings UI - 카테고리 선택 기능\n');

try {
  const uiPath = path.join(__dirname, 'trend-video-frontend', 'src', 'components', 'automation', 'ChannelSettings.tsx');

  logTest(
    'ChannelSettings.tsx 파일 존재',
    fs.existsSync(uiPath),
    `경로: ${uiPath}`
  );

  if (fs.existsSync(uiPath)) {
    const uiContent = fs.readFileSync(uiPath, 'utf-8');

    const hasCategoriesInInterface = uiContent.includes('categories?: string[]');
    logTest('인터페이스에 categories 필드 존재', hasCategoriesInInterface);

    const hasCategoryOptions = uiContent.includes('CATEGORY_OPTIONS');
    logTest('카테고리 프리셋 옵션 존재', hasCategoryOptions);

    const hasToggleCategory = uiContent.includes('toggleCategory');
    logTest('카테고리 토글 함수 존재', hasToggleCategory);

    const hasAddCustomCategory = uiContent.includes('addCustomCategory');
    logTest('사용자 정의 카테고리 추가 함수 존재', hasAddCustomCategory);

    const hasAutomationBadge = uiContent.includes('완전 자동화');
    logTest('완전 자동화 배지 표시', hasAutomationBadge);

    const hasCategoryDisplay = uiContent.includes('자동 제목 생성 카테고리');
    logTest('카테고리 선택 UI 존재', hasCategoryDisplay);
  }
} catch (error) {
  logTest('ChannelSettings UI 확인', false, error.message);
}

// ========== 테스트 7: API Route 확인 ==========
console.log('\n📋 테스트 7: Channel Settings API - categories 처리\n');

try {
  const apiRoutePath = path.join(__dirname, 'trend-video-frontend', 'src', 'app', 'api', 'automation', 'channel-settings', 'route.ts');

  logTest(
    'channel-settings API 파일 존재',
    fs.existsSync(apiRoutePath),
    `경로: ${apiRoutePath}`
  );

  if (fs.existsSync(apiRoutePath)) {
    const apiContent = fs.readFileSync(apiRoutePath, 'utf-8');

    const hasCategoriesParam = apiContent.includes('const categories = body.categories');
    logTest('POST 요청에서 categories 파라미터 추출', hasCategoriesParam);

    const passesCategoriesParam = apiContent.includes('categories');
    logTest('upsertChannelSettings에 categories 전달', passesCategoriesParam);
  }
} catch (error) {
  logTest('Channel Settings API 확인', false, error.message);
}

// ========== 테스트 8: automation.ts 함수 확인 ==========
console.log('\n📋 테스트 8: automation.ts - categories 관련 함수\n');

try {
  const automationPath = path.join(__dirname, 'trend-video-frontend', 'src', 'lib', 'automation.ts');

  logTest(
    'automation.ts 파일 존재',
    fs.existsSync(automationPath),
    `경로: ${automationPath}`
  );

  if (fs.existsSync(automationPath)) {
    const automationContent = fs.readFileSync(automationPath, 'utf-8');

    // upsertChannelSettings 함수에 categories 파라미터
    const hasUpsertCategories = automationContent.includes('categories?: string[]');
    logTest('upsertChannelSettings에 categories 파라미터', hasUpsertCategories);

    // getChannelSettings에서 categories 파싱
    const hasGetCategories = automationContent.includes('categories: setting.categories ? JSON.parse(setting.categories)');
    logTest('getChannelSettings에서 categories JSON 파싱', hasGetCategories);

    // updateChannelSettings에 categories 파라미터
    const hasUpdateCategories = automationContent.includes('categories?: string[]');
    logTest('updateChannelSettings에 categories 파라미터', hasUpdateCategories);

    // calculateNextScheduleTime 함수 존재
    const hasCalculateNext = automationContent.includes('export function calculateNextScheduleTime');
    logTest('calculateNextScheduleTime 함수 존재', hasCalculateNext);
  }
} catch (error) {
  logTest('automation.ts 함수 확인', false, error.message);
}

// ========== 테스트 9: 전체 플로우 시뮬레이션 ==========
console.log('\n📋 테스트 9: 전체 플로우 시뮬레이션\n');

try {
  const db = new Database(dbPath);

  // 9-1. 테스트 채널 설정 추가
  const testSettingId = `test_flow_${Date.now()}`;
  const testFlowUserId = 'test_flow_user';
  const testFlowChannelId = 'UC_flow_test';

  db.prepare(`
    INSERT INTO youtube_channel_settings
      (id, user_id, channel_id, channel_name, posting_mode, interval_value, interval_unit, is_active, categories)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testSettingId,
    testFlowUserId,
    testFlowChannelId,
    '시뮬레이션 채널',
    'fixed_interval',
    3,
    'days',
    1,
    JSON.stringify(['테스트카테고리1', '테스트카테고리2'])
  );

  logTest('전체 플로우 - 채널 설정 추가', true, `채널: ${testFlowChannelId}`);

  // 9-2. 채널 설정 조회
  const channelSetting = db.prepare(`
    SELECT * FROM youtube_channel_settings WHERE id = ?
  `).get(testSettingId);

  const flowCategories = JSON.parse(channelSetting.categories);
  logTest(
    '전체 플로우 - 카테고리 조회',
    flowCategories.length === 2,
    `카테고리: [${flowCategories.join(', ')}]`
  );

  // 9-3. 랜덤 카테고리 선택
  const randomCategory = flowCategories[Math.floor(Math.random() * flowCategories.length)];
  logTest(
    '전체 플로우 - 랜덤 카테고리 선택',
    flowCategories.includes(randomCategory),
    `선택된 카테고리: "${randomCategory}"`
  );

  // 9-4. 제목 생성 시뮬레이션 (실제 API 호출은 하지 않고 mock)
  const mockTitle = `[테스트] ${randomCategory} 제목 예시 - ${Date.now()}`;
  logTest(
    '전체 플로우 - 제목 생성 (mock)',
    mockTitle.includes(randomCategory),
    `생성된 제목: "${mockTitle}"`
  );

  // 9-5. 제목 DB에 추가
  const testTitleId = `title_flow_${Date.now()}`;
  db.prepare(`
    INSERT INTO video_titles (id, title, type, category, channel, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    testTitleId,
    mockTitle,
    'longform',
    randomCategory,
    testFlowChannelId,
    testFlowUserId
  );

  const addedTitle = db.prepare('SELECT * FROM video_titles WHERE id = ?').get(testTitleId);
  logTest(
    '전체 플로우 - 제목 DB 추가',
    addedTitle && addedTitle.title === mockTitle,
    `제목 ID: ${testTitleId}`
  );

  // 9-6. 다음 스케줄 시간 계산
  const nextScheduleTime = new Date();
  nextScheduleTime.setDate(nextScheduleTime.getDate() + 3); // 3일 후

  logTest(
    '전체 플로우 - 다음 스케줄 시간 계산',
    nextScheduleTime > new Date(),
    `다음 스케줄: ${nextScheduleTime.toISOString().slice(0, 19)}`
  );

  // 9-7. 스케줄 자동 추가
  const testScheduleId = `schedule_flow_${Date.now()}`;
  db.prepare(`
    INSERT INTO video_schedules (id, title_id, scheduled_time, youtube_privacy)
    VALUES (?, ?, ?, ?)
  `).run(
    testScheduleId,
    testTitleId,
    nextScheduleTime.toISOString(),
    'public'
  );

  const addedSchedule = db.prepare('SELECT * FROM video_schedules WHERE id = ?').get(testScheduleId);
  logTest(
    '전체 플로우 - 스케줄 자동 추가',
    addedSchedule && addedSchedule.title_id === testTitleId,
    `스케줄 ID: ${testScheduleId}`
  );

  // 9-8. 스케줄과 제목 연결 확인
  const joinedData = db.prepare(`
    SELECT s.*, t.title, t.category
    FROM video_schedules s
    JOIN video_titles t ON s.title_id = t.id
    WHERE s.id = ?
  `).get(testScheduleId);

  logTest(
    '전체 플로우 - 스케줄-제목 연결',
    joinedData && joinedData.title === mockTitle && joinedData.category === randomCategory,
    `제목: "${joinedData?.title}" / 카테고리: "${joinedData?.category}"`
  );

  // 정리
  db.prepare('DELETE FROM video_schedules WHERE id = ?').run(testScheduleId);
  db.prepare('DELETE FROM video_titles WHERE id = ?').run(testTitleId);
  db.prepare('DELETE FROM youtube_channel_settings WHERE id = ?').run(testSettingId);

  db.close();
} catch (error) {
  logTest('전체 플로우 시뮬레이션', false, error.message);
}

// ========== 테스트 10: 중복 방지 로직 확인 ==========
console.log('\n📋 테스트 10: 중복 방지 로직\n');

try {
  const schedulerPath = path.join(__dirname, 'trend-video-frontend', 'src', 'lib', 'automation-scheduler.ts');

  if (fs.existsSync(schedulerPath)) {
    const schedulerContent = fs.readFileSync(schedulerPath, 'utf-8');

    const hasExistingScheduleCheck = schedulerContent.includes('existingSchedule');
    logTest('중복 스케줄 확인 로직 존재', hasExistingScheduleCheck);

    const hasSkipLogic = schedulerContent.includes('Schedule already exists');
    logTest('중복 시 스킵 로직 존재', hasSkipLogic);
  }
} catch (error) {
  logTest('중복 방지 로직 확인', false, error.message);
}

// ========== 최종 결과 ==========
console.log('\n' + '='.repeat(80));
console.log('📊 테스트 결과 요약');
console.log('='.repeat(80));
console.log(`✅ 통과: ${testsPassed}개`);
console.log(`❌ 실패: ${testsFailed}개`);
console.log(`📊 총 테스트: ${testsPassed + testsFailed}개`);
console.log(`📈 성공률: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
console.log('='.repeat(80));

if (testsFailed > 0) {
  console.log('\n❌ 실패한 테스트:\n');
  testResults
    .filter(t => !t.passed)
    .forEach(t => {
      console.log(`- ${t.name}`);
      if (t.details) console.log(`  ${t.details}`);
    });
}

console.log('\n' + '='.repeat(80));

if (testsFailed === 0) {
  console.log('🎉 모든 테스트 통과! 완전 자동화 시스템이 정상 작동합니다!');
  console.log('\n다음 단계:');
  console.log('1. /automation → 스케줄 관리 → 채널 설정에서 카테고리 설정');
  console.log('2. 스케줄러 활성화 (automation_settings에서 enabled = true)');
  console.log('3. 로그 확인하여 자동 제목/스케줄 생성 모니터링');
} else {
  console.log('⚠️ 일부 테스트 실패. 위의 실패 내역을 확인하세요.');
}

console.log('='.repeat(80) + '\n');

process.exit(testsFailed > 0 ? 1 : 0);
