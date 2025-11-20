/**
 * YouTube 공개 설정 전체 플로우 테스트
 * 1. title 생성
 * 2. schedule 생성 (private)
 * 3. DB 저장 확인
 * 4. API 체인 확인
 */

const path = require('path');
const Database = require(path.join(__dirname, 'trend-video-frontend', 'node_modules', 'better-sqlite3'));

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');

// 색상
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

// 1. title 생성
function createTestTitle() {
  const db = new Database(dbPath);

  const titleId = `title_test_${Date.now()}`;

  db.prepare(`
    INSERT INTO video_titles (id, title, type, status, user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(titleId, '[테스트] YouTube 공개 설정 테스트', 'longform', 'pending', 'test-user-id');

  db.close();

  log('green', `✅ Title 생성: ${titleId}`);
  return titleId;
}

// 2. schedule 생성 (private)
function createTestSchedule(titleId) {
  const db = new Database(dbPath);

  const scheduleId = `schedule_test_${Date.now()}`;
  const scheduledTime = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16); // 10분 후

  db.prepare(`
    INSERT INTO video_schedules (id, title_id, scheduled_time, youtube_privacy)
    VALUES (?, ?, ?, ?)
  `).run(scheduleId, titleId, scheduledTime, 'private');

  db.close();

  log('green', `✅ Schedule 생성: ${scheduleId} (privacy: private)`);
  return scheduleId;
}

// 3. DB에서 조회
function verifyScheduleInDB(scheduleId) {
  const db = new Database(dbPath);

  const schedule = db.prepare(`
    SELECT id, youtube_privacy FROM video_schedules WHERE id = ?
  `).get(scheduleId);

  db.close();

  if (!schedule) {
    log('red', '❌ Schedule을 찾을 수 없습니다!');
    return false;
  }

  log('cyan', `\n📋 DB 저장 값:`);
  log('cyan', `   Schedule ID: ${schedule.id}`);
  log('cyan', `   YouTube Privacy: ${schedule.youtube_privacy}`);

  if (schedule.youtube_privacy === 'private') {
    log('green', '✅ DB에 private로 저장됨');
    return true;
  } else {
    log('red', `❌ DB에 ${schedule.youtube_privacy}로 저장됨 (예상: private)`);
    return false;
  }
}

// 4. getPendingSchedules로 조회 (스케줄러가 사용하는 방식)
function verifySchedulerQuery(scheduleId) {
  const db = new Database(dbPath);

  // 스케줄러와 동일한 쿼리
  const schedules = db.prepare(`
    SELECT
      s.*,
      t.title,
      t.type,
      t.user_id
    FROM video_schedules s
    JOIN video_titles t ON s.title_id = t.id
    WHERE s.id = ?
  `).all(scheduleId);

  db.close();

  if (schedules.length === 0) {
    log('red', '❌ 스케줄러 쿼리에서 찾을 수 없습니다!');
    return false;
  }

  const schedule = schedules[0];

  log('cyan', `\n📋 스케줄러 쿼리 결과:`);
  log('cyan', `   Schedule ID: ${schedule.id}`);
  log('cyan', `   Title: ${schedule.title}`);
  log('cyan', `   YouTube Privacy: ${schedule.youtube_privacy}`);

  if (schedule.youtube_privacy === 'private') {
    log('green', '✅ 스케줄러 쿼리에서 private로 조회됨');
    return true;
  } else {
    log('red', `❌ 스케줄러 쿼리에서 ${schedule.youtube_privacy}로 조회됨 (예상: private)`);
    return false;
  }
}

// 5. API 파라미터 시뮬레이션
function simulateAPICall(scheduleId) {
  const db = new Database(dbPath);

  const schedule = db.prepare(`
    SELECT
      s.*,
      t.title,
      t.type,
      t.user_id
    FROM video_schedules s
    JOIN video_titles t ON s.title_id = t.id
    WHERE s.id = ?
  `).get(scheduleId);

  db.close();

  // automation-scheduler.ts의 로직 시뮬레이션
  const privacyValue = schedule.youtube_privacy || 'public';

  const uploadParams = {
    title: schedule.title,
    privacy: privacyValue,
    userId: schedule.user_id
  };

  log('cyan', `\n📋 YouTube API 파라미터 (시뮬레이션):`);
  log('cyan', `   title: ${uploadParams.title}`);
  log('cyan', `   privacy: ${uploadParams.privacy}`);
  log('cyan', `   userId: ${uploadParams.userId}`);

  if (uploadParams.privacy === 'private') {
    log('green', '✅ API에 private로 전달됨');
    return true;
  } else {
    log('red', `❌ API에 ${uploadParams.privacy}로 전달됨 (예상: private)`);
    return false;
  }
}

// 정리
function cleanup(titleId, scheduleId) {
  const db = new Database(dbPath);

  db.prepare('DELETE FROM video_schedules WHERE id = ?').run(scheduleId);
  db.prepare('DELETE FROM video_titles WHERE id = ?').run(titleId);

  db.close();

  log('blue', '\n🧹 테스트 데이터 삭제 완료');
}

// 메인 테스트
async function runTest() {
  log('magenta', '\n' + '='.repeat(80));
  log('magenta', '🧪 YouTube 공개 설정 전체 플로우 테스트');
  log('magenta', '='.repeat(80) + '\n');

  let titleId = null;
  let scheduleId = null;

  try {
    // 1. Title 생성
    log('blue', '📝 Step 1: Title 생성');
    titleId = createTestTitle();

    // 2. Schedule 생성 (private)
    log('blue', '\n📅 Step 2: Schedule 생성 (private)');
    scheduleId = createTestSchedule(titleId);

    // 3. DB 조회
    log('blue', '\n🔍 Step 3: DB 저장 확인');
    const dbOk = verifyScheduleInDB(scheduleId);

    // 4. 스케줄러 쿼리 확인
    log('blue', '\n🔍 Step 4: 스케줄러 쿼리 확인');
    const queryOk = verifySchedulerQuery(scheduleId);

    // 5. API 파라미터 시뮬레이션
    log('blue', '\n🔍 Step 5: API 파라미터 시뮬레이션');
    const apiOk = simulateAPICall(scheduleId);

    // 결과
    log('magenta', '\n' + '='.repeat(80));
    if (dbOk && queryOk && apiOk) {
      log('green', '✅✅✅ 모든 테스트 통과! ✅✅✅');
      log('green', 'YouTube 공개 설정이 전체 플로우에서 정상적으로 전달됩니다.');
    } else {
      log('red', '❌❌❌ 테스트 실패! ❌❌❌');
      log('red', '문제가 발견되었습니다:');
      if (!dbOk) log('red', '  - DB 저장 실패');
      if (!queryOk) log('red', '  - 스케줄러 쿼리 실패');
      if (!apiOk) log('red', '  - API 파라미터 전달 실패');
    }
    log('magenta', '='.repeat(80) + '\n');

    return dbOk && queryOk && apiOk;

  } catch (error) {
    log('red', `\n❌ 테스트 실행 중 오류: ${error.message}`);
    console.error(error.stack);
    return false;

  } finally {
    // 정리
    if (titleId && scheduleId) {
      cleanup(titleId, scheduleId);
    }
  }
}

// 실행
runTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log('red', `Fatal error: ${error.message}`);
    process.exit(1);
  });
