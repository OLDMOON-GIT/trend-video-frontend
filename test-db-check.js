/**
 * DB 데이터 확인 Regression Test
 */

const Database = require('better-sqlite3');
const path = require('path');

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, msg) {
  console.log(`${c[color]}${msg}${c.reset}`);
}

async function runTest() {
  log('cyan', '\n========== DB 데이터 확인 ==========\n');

  const dbPath = path.join(__dirname, 'data', 'database.sqlite');
  const db = new Database(dbPath, { readonly: true });

  // 테이블 목록 확인
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table'
  `).all();

  log('yellow', `📋 DB 테이블 목록: ${tables.map(t => t.name).join(', ')}\n`);

  // 최근 쇼츠 job 조회
  const shortsJobs = db.prepare(`
    SELECT id, title, type, status, video_path, created_at
    FROM jobs
    WHERE id LIKE 'job_%'
    ORDER BY created_at DESC
    LIMIT 10
  `).all();

  log('blue', `📋 최근 Job (${shortsJobs.length}개):\n`);

  for (const job of shortsJobs) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🆔 ${job.id}`);
    console.log(`   제목: ${job.title || '(없음)'}`);
    console.log(`   타입: ${job.type}`);
    console.log(`   상태: ${job.status}`);
    console.log(`   videoPath: ${job.video_path || '❌ NULL'}`);
    console.log(`   생성시간: ${job.created_at}`);

    if (!job.video_path) {
      log('red', '   ⚠️ videoPath가 NULL입니다!');
    } else if (job.video_path.includes('input/shorts_')) {
      log('green', '   ✅ 쇼츠 경로 정상');
    } else if (job.video_path.includes('uploads/uploaded_')) {
      log('green', '   ✅ 업로드 경로 정상');
    } else {
      log('yellow', '   ⚠️ 알 수 없는 경로 형식');
    }
    console.log('');
  }

  db.close();
  log('cyan', '\n========== 테스트 완료 ==========\n');
}

runTest().catch(err => {
  log('red', `\n❌ 오류: ${err.message}`);
  console.error(err);
});
