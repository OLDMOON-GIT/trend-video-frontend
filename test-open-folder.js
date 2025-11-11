/**
 * 폴더 열기 Regression Test
 *
 * 테스트 대상: 쇼츠 job의 폴더 경로 추정 로직
 *
 * 실행 방법:
 *   node test-open-folder.js
 */

const path = require('path');
const fs = require('fs').promises;
const Database = require('better-sqlite3');

// 색상
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

/**
 * open-folder 로직 복제
 */
function getFolderPath(job, jobId) {
  const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

  if (job.videoPath || job.video_path) {
    // videoPath에서 추출 (절대 경로와 상대 경로 모두 지원)
    const videoPath = job.videoPath || job.video_path;
    const normalizedPath = videoPath.replace(/\\/g, '/');
    const pathParts = normalizedPath.split('/');

    // uploads 또는 input 폴더 찾기
    const uploadsIndex = pathParts.findIndex(p => p === 'uploads');
    const inputIndex = pathParts.findIndex(p => p === 'input');

    if (uploadsIndex !== -1 && uploadsIndex + 1 < pathParts.length) {
      const projectName = pathParts[uploadsIndex + 1];
      const folderPath = path.join(backendPath, 'uploads', projectName);
      return path.resolve(folderPath);
    } else if (inputIndex !== -1 && inputIndex + 1 < pathParts.length) {
      const projectName = pathParts[inputIndex + 1];
      const folderPath = path.join(backendPath, 'input', projectName);
      return path.resolve(folderPath);
    } else {
      const projectName = `uploaded_${jobId}`;
      const folderPath = path.join(backendPath, 'uploads', projectName);
      return path.resolve(folderPath);
    }
  } else {
    // videoPath 없으면 type에 따라 추정
    if (job.type === 'shortform') {
      // jobId에서 timestamp 추출 (job_1762844840576_xxx 형식)
      const timestampMatch = jobId.match(/job_(\d+)_/);
      if (timestampMatch) {
        const timestamp = timestampMatch[1];
        const projectName = `shorts_${timestamp}`;
        const folderPath = path.join(backendPath, 'input', projectName);
        return path.resolve(folderPath);
      } else {
        const projectName = `uploaded_${jobId}`;
        const folderPath = path.join(backendPath, 'uploads', projectName);
        return path.resolve(folderPath);
      }
    } else {
      const projectName = `uploaded_${jobId}`;
      const folderPath = path.join(backendPath, 'uploads', projectName);
      return path.resolve(folderPath);
    }
  }
}

/**
 * 테스트 실행
 */
async function runTests() {
  log('cyan', '\n========== 폴더 열기 Regression Test ==========\n');

  // DB 연결
  const dbPath = path.join(__dirname, 'data', 'database.db');
  log('blue', `📂 DB 경로: ${dbPath}`);

  try {
    await fs.access(dbPath);
    log('green', '✅ DB 파일 존재\n');
  } catch (err) {
    log('red', `❌ DB 파일 없음: ${err.message}`);
    return;
  }

  try {
    const db = new Database(dbPath, { readonly: true });

    // 최근 쇼츠 job 조회
    log('cyan', '========== 최근 쇼츠 Job 조회 ==========\n');

    try {
      const shortsJobs = db.prepare(`
        SELECT id, title, type, status, video_path
        FROM jobs
        WHERE type = 'shortform'
        ORDER BY created_at DESC
        LIMIT 5
      `).all();

      log('blue', `📋 쇼츠 Job (${shortsJobs.length}개):\n`);

      for (const job of shortsJobs) {
        console.log(`🆔 Job ID: ${job.id}`);
        console.log(`   제목: ${job.title || '(없음)'}`);
        console.log(`   타입: ${job.type}`);
        console.log(`   상태: ${job.status}`);
        console.log(`   videoPath: ${job.video_path || '(없음)'}`);

        // 폴더 경로 추정
        const folderPath = getFolderPath(job, job.id);
        console.log(`   📁 추정 경로: ${folderPath}`);

        // 폴더 존재 확인
        try {
          await fs.access(folderPath);
          log('green', `   ✅ 폴더 존재\n`);
        } catch (err) {
          log('red', `   ❌ 폴더 없음\n`);

          // input 폴더 전체 스캔
          const inputPath = path.join(process.cwd(), '..', 'trend-video-backend', 'input');
          try {
            const files = await fs.readdir(inputPath);
            const shortsFiles = files.filter(f => f.startsWith('shorts_'));

            if (shortsFiles.length > 0) {
              log('yellow', `   💡 input 폴더 내 shorts_* 폴더 (${shortsFiles.length}개):`);
              shortsFiles.slice(0, 5).forEach(f => console.log(`      - ${f}`));
              console.log('');
            }
          } catch (scanErr) {
            log('yellow', `   ⚠️ input 폴더 스캔 실패: ${scanErr.message}\n`);
          }
        }
      }
    } catch (dbErr) {
      log('yellow', `⚠️ DB 조회 실패 (테이블 없음?): ${dbErr.message}\n`);
    }

    db.close();
  } catch (dbErr) {
    log('yellow', `⚠️ DB 연결 실패: ${dbErr.message}\n`);
  }

  // 수동 테스트 케이스
  log('cyan', '\n========== 수동 테스트 케이스 ==========\n');

  const testCases = [
    {
      jobId: 'job_1762845565033_dsd709',
      job: { type: 'shortform', video_path: null },
      expected: 'input/shorts_1762845565033'
    },
    {
      jobId: 'job_1762844840576_g58ze5',
      job: { type: 'shortform', video_path: null },
      expected: 'input/shorts_1762844840576'
    },
    {
      jobId: 'upload_1762841000063_fydihfdwq',
      job: { type: 'longform', video_path: 'uploads/uploaded_upload_1762841000063_fydihfdwq/video.mp4' },
      expected: 'uploads/uploaded_upload_1762841000063_fydihfdwq'
    },
    {
      jobId: 'job_1762846147215_l3jkcs',
      job: { type: 'shortform', video_path: 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\input\\shorts_1762846147215\\generated_videos\\video.mp4' },
      expected: 'input/shorts_1762846147215'
    }
  ];

  for (const tc of testCases) {
    console.log(`🔍 Test: ${tc.jobId}`);
    console.log(`   Type: ${tc.job.type}`);
    console.log(`   VideoPath: ${tc.job.video_path || '(없음)'}`);

    const folderPath = getFolderPath(tc.job, tc.jobId);
    const relativePath = path.relative(path.join(process.cwd(), '..', 'trend-video-backend'), folderPath);

    console.log(`   📁 추정 경로: ${relativePath}`);
    console.log(`   📁 기대 경로: ${tc.expected}`);

    if (relativePath === tc.expected.replace(/\//g, path.sep)) {
      log('green', '   ✅ 경로 일치\n');
    } else {
      log('red', '   ❌ 경로 불일치\n');
    }
  }

  log('cyan', '\n========== 테스트 완료 ==========\n');
}

// 실행
runTests().catch(err => {
  log('red', `\n❌ 테스트 실행 중 오류: ${err.message}`);
  console.error(err);
  process.exit(1);
});
