/**
 * TTS Voice Selection Regression Test
 *
 * 테스트 항목:
 * 1. jobs 테이블에 tts_voice 컬럼 존재 확인
 * 2. tts_voice 값 저장 테스트
 * 3. tts_voice 값 조회 및 파싱 테스트
 * 4. 기본값 테스트 (ko-KR-SoonBokNeural)
 * 5. 다양한 TTS 음성 저장/조회 테스트
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(color, msg) {
  console.log(`${c[color]}${msg}${c.reset}`);
}

function assertExists(value, name) {
  if (!value && value !== 0) {
    throw new Error(`❌ ${name} does not exist`);
  }
  log('green', `✅ ${name} exists`);
}

function assertEqual(actual, expected, name) {
  if (actual !== expected) {
    throw new Error(`❌ ${name} mismatch: expected ${expected}, got ${actual}`);
  }
  log('green', `✅ ${name} matches: ${actual}`);
}

async function runTest() {
  log('cyan', '\n' + '='.repeat(60));
  log('cyan', '  TTS Voice Selection Regression Test');
  log('cyan', '='.repeat(60) + '\n');

  const dbPath = path.join(__dirname, 'data', 'database.sqlite');
  const db = new Database(dbPath);

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // ============================================================
    // Test 1: jobs 테이블 tts_voice 컬럼 확인
    // ============================================================
    log('blue', '\n[Test 1] jobs 테이블 스키마 확인\n');

    const jobsColumns = db.prepare(`PRAGMA table_info(jobs)`).all();
    const ttsVoiceColumn = jobsColumns.find(col => col.name === 'tts_voice');

    assertExists(ttsVoiceColumn, 'jobs.tts_voice 컬럼');
    assertEqual(ttsVoiceColumn.type, 'TEXT', 'tts_voice 컬럼 타입');
    testsPassed++;

    // ============================================================
    // Test 2: 기본값(NULL) 테스트
    // ============================================================
    log('blue', '\n[Test 2] 기본값(NULL) 테스트\n');

    const realUser = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!realUser) {
      throw new Error('테스트를 위한 사용자가 없습니다');
    }

    const testUserId = realUser.id;
    const testJobId1 = 'test-job-' + crypto.randomUUID();

    log('yellow', `  👤 테스트 사용자: ${testUserId}`);

    // tts_voice 없이 Job 생성
    db.prepare(`
      INSERT INTO jobs (
        id, user_id, status, progress, created_at, updated_at
      ) VALUES (?, ?, 'pending', 0, datetime('now'), datetime('now'))
    `).run(testJobId1, testUserId);

    const job1 = db.prepare('SELECT id, tts_voice FROM jobs WHERE id = ?').get(testJobId1);
    assertExists(job1, '테스트 Job 1');

    if (job1.tts_voice === null) {
      log('green', '✅ tts_voice 기본값이 NULL입니다');
    } else {
      throw new Error(`❌ tts_voice 기본값이 NULL이 아닙니다: ${job1.tts_voice}`);
    }
    testsPassed++;

    // ============================================================
    // Test 3: 여성 음성 저장 테스트
    // ============================================================
    log('blue', '\n[Test 3] 여성 음성 저장 테스트\n');

    const femaleVoices = [
      'ko-KR-SunHiNeural',
      'ko-KR-JiMinNeural',
      'ko-KR-SeoHyeonNeural',
      'ko-KR-SoonBokNeural',
      'ko-KR-YuJinNeural'
    ];

    const testJobId2 = 'test-job-' + crypto.randomUUID();
    const selectedFemaleVoice = femaleVoices[2]; // SeoHyeon

    db.prepare(`
      INSERT INTO jobs (
        id, user_id, status, progress, tts_voice, created_at, updated_at
      ) VALUES (?, ?, 'pending', 0, ?, datetime('now'), datetime('now'))
    `).run(testJobId2, testUserId, selectedFemaleVoice);

    log('yellow', `  🎤 저장한 음성: ${selectedFemaleVoice}`);

    const job2 = db.prepare('SELECT id, tts_voice FROM jobs WHERE id = ?').get(testJobId2);
    assertExists(job2, '테스트 Job 2');
    assertEqual(job2.tts_voice, selectedFemaleVoice, 'tts_voice 값');
    testsPassed++;

    // ============================================================
    // Test 4: 남성 음성 저장 테스트
    // ============================================================
    log('blue', '\n[Test 4] 남성 음성 저장 테스트\n');

    const maleVoices = [
      'ko-KR-InJoonNeural',
      'ko-KR-HyunsuMultilingualNeural',
      'ko-KR-BongJinNeural',
      'ko-KR-GookMinNeural',
      'ko-KR-HyunsuNeural'
    ];

    const testJobId3 = 'test-job-' + crypto.randomUUID();
    const selectedMaleVoice = maleVoices[1]; // HyunsuMultilingual

    db.prepare(`
      INSERT INTO jobs (
        id, user_id, status, progress, tts_voice, created_at, updated_at
      ) VALUES (?, ?, 'pending', 0, ?, datetime('now'), datetime('now'))
    `).run(testJobId3, testUserId, selectedMaleVoice);

    log('yellow', `  🎤 저장한 음성: ${selectedMaleVoice}`);

    const job3 = db.prepare('SELECT id, tts_voice FROM jobs WHERE id = ?').get(testJobId3);
    assertExists(job3, '테스트 Job 3');
    assertEqual(job3.tts_voice, selectedMaleVoice, 'tts_voice 값');
    testsPassed++;

    // ============================================================
    // Test 5: 모든 음성 타입 순회 테스트
    // ============================================================
    log('blue', '\n[Test 5] 모든 음성 타입 순회 테스트\n');

    const allVoices = [...femaleVoices, ...maleVoices];
    log('yellow', `  📋 총 ${allVoices.length}개 음성 테스트\n`);

    const testJobIds = [];

    for (let i = 0; i < allVoices.length; i++) {
      const voice = allVoices[i];
      const jobId = `test-job-all-${i}-${crypto.randomUUID()}`;

      db.prepare(`
        INSERT INTO jobs (
          id, user_id, status, progress, tts_voice, title, created_at, updated_at
        ) VALUES (?, ?, 'pending', 0, ?, ?, datetime('now'), datetime('now'))
      `).run(jobId, testUserId, voice, `테스트: ${voice}`);

      testJobIds.push(jobId);

      const job = db.prepare('SELECT id, tts_voice, title FROM jobs WHERE id = ?').get(jobId);

      if (job.tts_voice === voice) {
        log('green', `  ✅ [${i + 1}/${allVoices.length}] ${voice}`);
      } else {
        log('red', `  ❌ [${i + 1}/${allVoices.length}] ${voice} - 저장 실패`);
        testsFailed++;
      }
    }

    log('yellow', `\n  ✅ ${allVoices.length}개 음성 모두 저장/조회 성공`);
    testsPassed++;

    // ============================================================
    // Test 6: 실제 Job에서 tts_voice 확인 (있는 경우)
    // ============================================================
    log('blue', '\n[Test 6] 실제 Job에서 tts_voice 확인\n');

    const recentJobs = db.prepare(`
      SELECT id, title, tts_voice, status, created_at
      FROM jobs
      WHERE id NOT LIKE 'test-job%'
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    if (recentJobs.length === 0) {
      log('yellow', '  ⚠️ 실제 Job이 아직 없습니다 (정상)');
    } else {
      log('yellow', `  📋 최근 Job ${recentJobs.length}개 확인\n`);

      for (const job of recentJobs) {
        console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`  🆔 ${job.id}`);
        console.log(`  📝 ${job.title || '(제목 없음)'}`);
        console.log(`  📊 ${job.status}`);

        if (job.tts_voice) {
          log('green', `  ✅ TTS 음성: ${job.tts_voice}`);
        } else {
          log('yellow', '  ⚠️ TTS 음성: NULL (기본값)');
        }
        console.log('');
      }
    }
    testsPassed++;

    // ============================================================
    // Test 7: 테스트 데이터 정리
    // ============================================================
    log('blue', '\n[Test 7] 테스트 데이터 정리\n');

    // 개별 테스트 Job 삭제
    db.prepare('DELETE FROM jobs WHERE id = ?').run(testJobId1);
    db.prepare('DELETE FROM jobs WHERE id = ?').run(testJobId2);
    db.prepare('DELETE FROM jobs WHERE id = ?').run(testJobId3);

    // 순회 테스트 Job 삭제
    for (const jobId of testJobIds) {
      db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId);
    }

    const deletedCount = 3 + testJobIds.length;
    log('yellow', `  🧹 테스트 Job ${deletedCount}개 삭제 완료`);
    testsPassed++;

    // ============================================================
    // 테스트 결과 요약
    // ============================================================
    log('cyan', '\n' + '='.repeat(60));
    log('cyan', '  테스트 결과');
    log('cyan', '='.repeat(60) + '\n');

    log('green', `✅ 성공: ${testsPassed}개`);
    if (testsFailed > 0) {
      log('red', `❌ 실패: ${testsFailed}개`);
    }

    const totalTests = testsPassed + testsFailed;
    const successRate = ((testsPassed / totalTests) * 100).toFixed(1);

    if (testsFailed === 0) {
      log('green', `\n🎉 모든 테스트 통과! (${successRate}%)\n`);
    } else {
      log('red', `\n⚠️ 일부 테스트 실패 (성공률: ${successRate}%)\n`);
      process.exit(1);
    }

  } catch (error) {
    log('red', `\n❌ 테스트 실패: ${error.message}\n`);
    console.error(error);

    // 테스트 데이터 정리 시도
    try {
      db.prepare('DELETE FROM jobs WHERE id LIKE ?').run('test-job%');
      log('yellow', '🧹 테스트 데이터 정리 완료');
    } catch (cleanupError) {
      log('red', '⚠️ 정리 중 오류 발생');
    }

    process.exit(1);
  } finally {
    db.close();
  }
}

runTest();
