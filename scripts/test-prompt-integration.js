const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const promptsDir = path.join(__dirname, '..', 'prompts');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   ${error.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n   예상: ${expected}\n   실제: ${actual}`);
  }
}

console.log('🔗 프롬프트 버전 관리 통합 테스트 시작...\n');
console.log('이 테스트는 실제 사용 시나리오를 시뮬레이션합니다.\n');

const db = new Database(dbPath);
const TEST_PROMPT_NAME = 'test_prompt_' + Date.now();
const TEST_DISPLAY_NAME = '테스트 프롬프트';

// 테스트용 데이터 정리 (이전 테스트 데이터 삭제)
try {
  db.prepare('DELETE FROM prompt_templates WHERE name LIKE ?').run('test_prompt_%');
  console.log('🧹 이전 테스트 데이터 정리 완료\n');
} catch (error) {
  console.log('⚠️  이전 테스트 데이터 없음\n');
}

// ============================================
// 시나리오 1: 새 프롬프트 생성
// ============================================
console.log('📝 시나리오 1: 새 프롬프트 생성\n');

const initialContent = `이것은 테스트 프롬프트입니다.
버전 1의 내용입니다.`;

test('새 프롬프트 v1 생성', () => {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO prompt_templates (id, name, display_name, version, content, change_reason, changed_by, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    TEST_PROMPT_NAME,
    TEST_DISPLAY_NAME,
    1,
    initialContent,
    '테스트 프롬프트 생성',
    'test-system',
    1
  );

  const row = db.prepare('SELECT * FROM prompt_templates WHERE name = ?').get(TEST_PROMPT_NAME);
  assert(row, '프롬프트가 생성되지 않았습니다.');
  assertEqual(row.version, 1, '버전이 1이 아닙니다.');
  assertEqual(row.is_active, 1, '활성화되지 않았습니다.');
});

// ============================================
// 시나리오 2: 프롬프트 수정 (v2 생성)
// ============================================
console.log('\n✏️ 시나리오 2: 프롬프트 수정 (v2 생성)\n');

const v2Content = `이것은 테스트 프롬프트입니다.
버전 2의 내용입니다.
새로운 줄이 추가되었습니다.`;

test('기존 활성 버전을 비활성화', () => {
  db.prepare('UPDATE prompt_templates SET is_active = 0 WHERE name = ? AND is_active = 1')
    .run(TEST_PROMPT_NAME);

  const activeCount = db.prepare(
    'SELECT COUNT(*) as count FROM prompt_templates WHERE name = ? AND is_active = 1'
  ).get(TEST_PROMPT_NAME);

  assertEqual(activeCount.count, 0, '활성 버전이 아직 남아있습니다.');
});

test('새 버전 v2 생성', () => {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO prompt_templates (id, name, display_name, version, content, change_reason, changed_by, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    TEST_PROMPT_NAME,
    TEST_DISPLAY_NAME,
    2,
    v2Content,
    '내용 수정 및 줄 추가',
    'test-user',
    1
  );

  const v2 = db.prepare(
    'SELECT * FROM prompt_templates WHERE name = ? AND version = 2'
  ).get(TEST_PROMPT_NAME);

  assert(v2, 'v2가 생성되지 않았습니다.');
  assertEqual(v2.is_active, 1, 'v2가 활성화되지 않았습니다.');
});

test('이전 버전(v1)이 비활성화되었는지 확인', () => {
  const v1 = db.prepare(
    'SELECT * FROM prompt_templates WHERE name = ? AND version = 1'
  ).get(TEST_PROMPT_NAME);

  assert(v1, 'v1이 사라졌습니다.');
  assertEqual(v1.is_active, 0, 'v1이 아직 활성화되어 있습니다.');
});

test('활성 버전이 정확히 1개인지 확인', () => {
  const activeCount = db.prepare(
    'SELECT COUNT(*) as count FROM prompt_templates WHERE name = ? AND is_active = 1'
  ).get(TEST_PROMPT_NAME);

  assertEqual(activeCount.count, 1, '활성 버전이 1개가 아닙니다.');
});

// ============================================
// 시나리오 3: 버전 복원 (v1으로 되돌리기)
// ============================================
console.log('\n⏪ 시나리오 3: 버전 복원 (v1으로 되돌리기)\n');

test('v2를 비활성화하고 v1을 활성화', () => {
  db.prepare('BEGIN').run();

  try {
    // 모든 버전 비활성화
    db.prepare('UPDATE prompt_templates SET is_active = 0 WHERE name = ?')
      .run(TEST_PROMPT_NAME);

    // v1만 활성화
    db.prepare('UPDATE prompt_templates SET is_active = 1 WHERE name = ? AND version = 1')
      .run(TEST_PROMPT_NAME);

    db.prepare('COMMIT').run();
  } catch (error) {
    db.prepare('ROLLBACK').run();
    throw error;
  }

  const v1 = db.prepare(
    'SELECT * FROM prompt_templates WHERE name = ? AND version = 1'
  ).get(TEST_PROMPT_NAME);

  assertEqual(v1.is_active, 1, 'v1이 활성화되지 않았습니다.');
});

test('v2가 비활성화되었는지 확인', () => {
  const v2 = db.prepare(
    'SELECT * FROM prompt_templates WHERE name = ? AND version = 2'
  ).get(TEST_PROMPT_NAME);

  assertEqual(v2.is_active, 0, 'v2가 아직 활성화되어 있습니다.');
});

test('활성 프롬프트 조회 시 v1 내용이 반환되는지', () => {
  const active = db.prepare(
    'SELECT content FROM prompt_templates WHERE name = ? AND is_active = 1'
  ).get(TEST_PROMPT_NAME);

  assertEqual(active.content, initialContent, '활성 프롬프트 내용이 v1과 일치하지 않습니다.');
});

// ============================================
// 시나리오 4: 버전 히스토리 조회
// ============================================
console.log('\n📜 시나리오 4: 버전 히스토리 조회\n');

test('모든 버전을 내림차순으로 조회', () => {
  const versions = db.prepare(
    'SELECT version, is_active FROM prompt_templates WHERE name = ? ORDER BY version DESC'
  ).all(TEST_PROMPT_NAME);

  assertEqual(versions.length, 2, '버전이 2개가 아닙니다.');
  assertEqual(versions[0].version, 2, '첫 번째 버전이 2가 아닙니다.');
  assertEqual(versions[1].version, 1, '두 번째 버전이 1이 아닙니다.');
});

test('각 버전의 메타데이터 확인', () => {
  const v1 = db.prepare(
    'SELECT change_reason, changed_by FROM prompt_templates WHERE name = ? AND version = 1'
  ).get(TEST_PROMPT_NAME);

  const v2 = db.prepare(
    'SELECT change_reason, changed_by FROM prompt_templates WHERE name = ? AND version = 2'
  ).get(TEST_PROMPT_NAME);

  assert(v1.change_reason, 'v1의 변경 이유가 없습니다.');
  assert(v1.changed_by, 'v1의 변경자가 없습니다.');
  assert(v2.change_reason, 'v2의 변경 이유가 없습니다.');
  assert(v2.changed_by, 'v2의 변경자가 없습니다.');
});

// ============================================
// 시나리오 5: 트랜잭션 무결성 테스트
// ============================================
console.log('\n🔒 시나리오 5: 트랜잭션 무결성 테스트\n');

test('트랜잭션 중 오류 발생 시 롤백', () => {
  const beforeCount = db.prepare(
    'SELECT COUNT(*) as count FROM prompt_templates WHERE name = ?'
  ).get(TEST_PROMPT_NAME).count;

  try {
    db.prepare('BEGIN').run();

    // v3 생성 시도
    const id = uuidv4();
    db.prepare(`
      INSERT INTO prompt_templates (id, name, display_name, version, content, change_reason, changed_by, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      TEST_PROMPT_NAME,
      TEST_DISPLAY_NAME,
      3,
      'v3 content',
      'v3 생성',
      'test',
      1
    );

    // 의도적으로 오류 발생 (중복 버전)
    db.prepare(`
      INSERT INTO prompt_templates (id, name, display_name, version, content, change_reason, changed_by, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      TEST_PROMPT_NAME,
      TEST_DISPLAY_NAME,
      3,  // 중복!
      'v3 duplicate',
      'v3 중복',
      'test',
      1
    );

    db.prepare('COMMIT').run();
  } catch (error) {
    db.prepare('ROLLBACK').run();
  }

  const afterCount = db.prepare(
    'SELECT COUNT(*) as count FROM prompt_templates WHERE name = ?'
  ).get(TEST_PROMPT_NAME).count;

  assertEqual(afterCount, beforeCount, '롤백이 제대로 되지 않았습니다.');
});

// ============================================
// 시나리오 6: 동시성 테스트
// ============================================
console.log('\n⚡ 시나리오 6: 동시성 시뮬레이션\n');

test('동일 프롬프트에 대한 순차적 업데이트', () => {
  const updates = [];

  // 5번의 연속 업데이트 시뮬레이션
  for (let i = 3; i <= 7; i++) {
    db.prepare('BEGIN').run();

    try {
      // 이전 활성 버전 비활성화
      db.prepare('UPDATE prompt_templates SET is_active = 0 WHERE name = ? AND is_active = 1')
        .run(TEST_PROMPT_NAME);

      // 새 버전 생성
      const id = uuidv4();
      db.prepare(`
        INSERT INTO prompt_templates (id, name, display_name, version, content, change_reason, changed_by, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        TEST_PROMPT_NAME,
        TEST_DISPLAY_NAME,
        i,
        `v${i} content`,
        `v${i} 생성`,
        'test',
        1
      );

      db.prepare('COMMIT').run();
      updates.push(i);
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  }

  assertEqual(updates.length, 5, '5번의 업데이트가 모두 성공하지 않았습니다.');

  const latestVersion = db.prepare(
    'SELECT version FROM prompt_templates WHERE name = ? ORDER BY version DESC LIMIT 1'
  ).get(TEST_PROMPT_NAME);

  assertEqual(latestVersion.version, 7, '최신 버전이 7이 아닙니다.');
});

test('활성 버전이 여전히 1개인지 확인', () => {
  const activeCount = db.prepare(
    'SELECT COUNT(*) as count FROM prompt_templates WHERE name = ? AND is_active = 1'
  ).get(TEST_PROMPT_NAME);

  assertEqual(activeCount.count, 1, '활성 버전이 1개가 아닙니다.');
});

// ============================================
// 정리: 테스트 데이터 삭제
// ============================================
console.log('\n🧹 테스트 데이터 정리\n');

test('테스트 프롬프트 데이터 삭제', () => {
  const deleted = db.prepare('DELETE FROM prompt_templates WHERE name = ?').run(TEST_PROMPT_NAME);

  assert(deleted.changes > 0, '데이터가 삭제되지 않았습니다.');

  const remaining = db.prepare(
    'SELECT COUNT(*) as count FROM prompt_templates WHERE name = ?'
  ).get(TEST_PROMPT_NAME);

  assertEqual(remaining.count, 0, '데이터가 완전히 삭제되지 않았습니다.');
});

// ============================================
// DB 닫기
// ============================================
db.close();

// ============================================
// 결과 요약
// ============================================
console.log('\n' + '='.repeat(60));
console.log('🎯 통합 테스트 결과 요약');
console.log('='.repeat(60));
console.log(`✅ 통과: ${testsPassed}개`);
console.log(`❌ 실패: ${testsFailed}개`);
console.log(`📊 성공률: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log('\n🎉 모든 통합 테스트를 통과했습니다!');
  console.log('프롬프트 버전 관리 시스템이 실제 사용 시나리오에서 정상 작동합니다.');
  process.exit(0);
} else {
  console.log('\n⚠️  일부 통합 테스트가 실패했습니다.');
  console.log('위의 실패 항목을 확인하고 수정해주세요.');
  process.exit(1);
}
