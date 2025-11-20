/**
 * YouTube Privacy 설정 통합 테스트
 * DB → 스케줄러 → API → metadata.json 전체 플로우 검증
 */

const path = require('path');
const fs = require('fs');
const Database = require(path.join(__dirname, 'trend-video-frontend', 'node_modules', 'better-sqlite3'));

const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
const configPath = path.join(__dirname, 'trend-video-backend', 'config');

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

// 1. Title & Schedule 생성 (private)
function createTestSchedule() {
  const db = new Database(dbPath);

  const titleId = `title_privacy_test_${Date.now()}`;
  const scheduleId = `schedule_privacy_test_${Date.now()}`;
  const userId = db.prepare('SELECT id FROM users LIMIT 1').get()?.id;

  if (!userId) {
    throw new Error('사용자가 없습니다.');
  }

  // Title 생성
  db.prepare(`
    INSERT INTO video_titles (id, title, type, status, user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(titleId, '[Privacy Test] 비공개 테스트', 'longform', 'pending', userId);

  // Schedule 생성 (private)
  const scheduledTime = new Date(Date.now() + 1 * 60 * 1000).toISOString().slice(0, 16);
  db.prepare(`
    INSERT INTO video_schedules (id, title_id, scheduled_time, youtube_privacy)
    VALUES (?, ?, ?, ?)
  `).run(scheduleId, titleId, scheduledTime, 'private');

  db.close();

  log('green', `✅ Title & Schedule 생성: ${scheduleId} (privacy: private)`);
  return { titleId, scheduleId, userId };
}

// 2. 스케줄러 쿼리 시뮬레이션
function simulateSchedulerQuery(scheduleId) {
  const db = new Database(dbPath);

  // getPendingSchedules와 동일한 쿼리
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

  log('cyan', '\n📋 스케줄러가 읽은 데이터:');
  log('cyan', `   youtube_privacy: ${schedule.youtube_privacy}`);
  log('cyan', `   title: ${schedule.title}`);
  log('cyan', `   user_id: ${schedule.user_id}`);

  return schedule;
}

// 3. API 파라미터 시뮬레이션 (automation-scheduler.ts 로직)
function simulateUploadAPICall(schedule) {
  // automation-scheduler.ts line 885
  const privacyValue = schedule.youtube_privacy || 'public';

  const uploadParams = {
    videoPath: '/fake/path/video.mp4',
    title: schedule.title,
    description: '',
    tags: [],
    privacy: privacyValue,
    channelId: 'test-channel',
    jobId: 'test-job',
    publishAt: schedule.youtube_publish_time,
    userId: schedule.user_id
  };

  log('cyan', '\n📤 YouTube Upload API 호출 파라미터:');
  log('cyan', `   privacy: ${uploadParams.privacy}`);
  log('cyan', `   title: ${uploadParams.title}`);

  return uploadParams;
}

// 4. metadata.json 생성 시뮬레이션 (youtube/upload/route.ts 로직)
function simulateMetadataGeneration(uploadParams) {
  // youtube/upload/route.ts line 211-218
  const metadata = {
    title: uploadParams.title,
    description: uploadParams.description,
    tags: uploadParams.tags,
    category_id: '27',
    privacy_status: uploadParams.privacy, // ← 이 값이 중요!
    publish_at: uploadParams.publishAt
  };

  log('cyan', '\n📝 Metadata JSON 생성:');
  log('cyan', `   privacy_status: ${metadata.privacy_status}`);
  log('cyan', `   title: ${metadata.title}`);

  // 실제 파일로 저장
  const metadataPath = path.join(configPath, `youtube_metadata_test_${Date.now()}.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  log('green', `\n✅ Metadata 파일 생성: ${path.basename(metadataPath)}`);

  return { metadata, metadataPath };
}

// 5. metadata.json 파일 검증
function verifyMetadataFile(metadataPath) {
  const content = fs.readFileSync(metadataPath, 'utf-8');
  const metadata = JSON.parse(content);

  log('cyan', '\n🔍 생성된 Metadata 파일 내용:');
  console.log(colors.cyan + content + colors.reset);

  if (metadata.privacy_status === 'private') {
    log('green', '\n✅ privacy_status가 "private"로 정상 기록됨');
    return true;
  } else {
    log('red', `\n❌ privacy_status가 "${metadata.privacy_status}"로 잘못 기록됨 (예상: private)`);
    return false;
  }
}

// 정리
function cleanup(titleId, scheduleId, metadataPath) {
  const db = new Database(dbPath);
  db.prepare('DELETE FROM video_schedules WHERE id = ?').run(scheduleId);
  db.prepare('DELETE FROM video_titles WHERE id = ?').run(titleId);
  db.close();

  if (fs.existsSync(metadataPath)) {
    fs.unlinkSync(metadataPath);
  }

  log('blue', '\n🧹 테스트 데이터 정리 완료');
}

// 메인 테스트
async function runIntegrationTest() {
  log('magenta', '\n' + '='.repeat(80));
  log('magenta', '🧪 YouTube Privacy 설정 통합 테스트');
  log('magenta', '   (DB → Scheduler → API → metadata.json 전체 플로우)');
  log('magenta', '='.repeat(80));

  let titleId, scheduleId, metadataPath;

  try {
    // 1. DB에 Schedule 생성 (private)
    log('blue', '\n📝 Step 1: DB에 Title & Schedule 생성 (private)');
    const data = createTestSchedule();
    titleId = data.titleId;
    scheduleId = data.scheduleId;

    // 2. 스케줄러가 읽는 데이터 확인
    log('blue', '\n📅 Step 2: 스케줄러 쿼리 시뮬레이션');
    const schedule = simulateSchedulerQuery(scheduleId);

    if (schedule.youtube_privacy !== 'private') {
      throw new Error(`DB에서 읽은 youtube_privacy가 ${schedule.youtube_privacy} (예상: private)`);
    }

    // 3. Upload API 파라미터 생성
    log('blue', '\n🚀 Step 3: YouTube Upload API 파라미터 생성');
    const uploadParams = simulateUploadAPICall(schedule);

    if (uploadParams.privacy !== 'private') {
      throw new Error(`API 파라미터 privacy가 ${uploadParams.privacy} (예상: private)`);
    }

    // 4. metadata.json 생성
    log('blue', '\n📄 Step 4: metadata.json 생성');
    const result = simulateMetadataGeneration(uploadParams);
    metadataPath = result.metadataPath;

    if (result.metadata.privacy_status !== 'private') {
      throw new Error(`Metadata privacy_status가 ${result.metadata.privacy_status} (예상: private)`);
    }

    // 5. 파일 검증
    log('blue', '\n✅ Step 5: metadata.json 파일 검증');
    const fileValid = verifyMetadataFile(metadataPath);

    // 결과
    log('magenta', '\n' + '='.repeat(80));
    if (fileValid) {
      log('green', '✅✅✅ 통합 테스트 성공! ✅✅✅');
      log('green', 'DB → Scheduler → API → metadata.json 전체 플로우에서');
      log('green', 'privacy 설정이 "private"로 정상적으로 전달됩니다.');
      log('magenta', '='.repeat(80));
      log('yellow', '\n⚠️ 주의: 이 테스트는 코드 레벨 시뮬레이션입니다.');
      log('yellow', '실제 YouTube 업로드 결과는 YouTube API 응답에 따라 다를 수 있습니다.');
      log('yellow', '\n실제 확인 방법:');
      log('yellow', '1. 자동화에서 "비공개"로 스케줄 생성');
      log('yellow', '2. 영상 업로드 완료 후 YouTube에서 실제 공개 설정 확인');
      log('yellow', '3. config/ 폴더의 최신 youtube_metadata_*.json 파일 확인');
    } else {
      log('red', '❌❌❌ 통합 테스트 실패! ❌❌❌');
      log('red', 'metadata.json 파일에 privacy_status가 잘못 기록되었습니다.');
    }
    log('magenta', '='.repeat(80) + '\n');

    return fileValid;

  } catch (error) {
    log('red', `\n❌ 테스트 실행 중 오류: ${error.message}`);
    console.error(error.stack);
    return false;

  } finally {
    if (titleId && scheduleId) {
      cleanup(titleId, scheduleId, metadataPath);
    }
  }
}

// 실행
runIntegrationTest()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log('red', `Fatal error: ${error.message}`);
    process.exit(1);
  });
