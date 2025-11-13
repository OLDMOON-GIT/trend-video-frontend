const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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

console.log('🧪 프롬프트 버전 관리 시스템 리그레션 테스트 시작...\n');

// ============================================
// 1. DB 마이그레이션 검증
// ============================================
console.log('📋 1. DB 마이그레이션 검증\n');

const db = new Database(dbPath);

test('prompt_templates 테이블이 존재하는지', () => {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_templates'"
  ).all();
  assert(tables.length === 1, 'prompt_templates 테이블이 존재하지 않습니다.');
});

test('5개 프롬프트가 모두 마이그레이션되었는지', () => {
  const count = db.prepare('SELECT COUNT(*) as count FROM prompt_templates').get();
  assert(count.count >= 5, `프롬프트가 ${count.count}개만 있습니다. 최소 5개 필요합니다.`);
});

const EXPECTED_PROMPTS = ['product', 'product_info', 'longform', 'shortform', 'sora2'];

EXPECTED_PROMPTS.forEach(name => {
  test(`${name} 프롬프트가 DB에 존재하는지`, () => {
    const row = db.prepare('SELECT * FROM prompt_templates WHERE name = ?').get(name);
    assert(row, `${name} 프롬프트가 DB에 없습니다.`);
  });

  test(`${name} 프롬프트의 버전 1이 활성화되어 있는지`, () => {
    const row = db.prepare(
      'SELECT * FROM prompt_templates WHERE name = ? AND version = 1 AND is_active = 1'
    ).get(name);
    assert(row, `${name} 프롬프트의 버전 1이 활성화되어 있지 않습니다.`);
  });

  test(`${name} 프롬프트의 내용이 비어있지 않은지`, () => {
    const row = db.prepare('SELECT content FROM prompt_templates WHERE name = ?').get(name);
    assert(row && row.content && row.content.length > 100,
      `${name} 프롬프트의 내용이 너무 짧거나 비어있습니다.`);
  });
});

// ============================================
// 2. 프롬프트 조회 테스트
// ============================================
console.log('\n📖 2. 프롬프트 조회 테스트\n');

test('활성 프롬프트 조회가 정상 작동하는지', () => {
  const row = db.prepare(
    'SELECT content FROM prompt_templates WHERE name = ? AND is_active = 1'
  ).get('product');
  assert(row && row.content, '활성 프롬프트를 조회할 수 없습니다.');
});

test('모든 활성 프롬프트를 한번에 조회할 수 있는지', () => {
  const prompts = db.prepare(
    'SELECT name, version FROM prompt_templates WHERE is_active = 1'
  ).all();
  assert(prompts.length >= 5, '활성 프롬프트가 5개 미만입니다.');
});

// ============================================
// 3. 버전 관리 테스트
// ============================================
console.log('\n🔢 3. 버전 관리 테스트\n');

test('버전 번호가 순차적으로 증가하는지', () => {
  const versions = db.prepare(
    'SELECT version FROM prompt_templates WHERE name = ? ORDER BY version'
  ).all('product');

  for (let i = 0; i < versions.length; i++) {
    assertEqual(versions[i].version, i + 1, `버전 번호가 순차적이지 않습니다. (${i}번째)`);
  }
});

test('각 프롬프트마다 활성 버전이 정확히 1개인지', () => {
  EXPECTED_PROMPTS.forEach(name => {
    const count = db.prepare(
      'SELECT COUNT(*) as count FROM prompt_templates WHERE name = ? AND is_active = 1'
    ).get(name);
    assertEqual(count.count, 1, `${name} 프롬프트의 활성 버전이 ${count.count}개입니다.`);
  });
});

// ============================================
// 4. 인덱스 확인
// ============================================
console.log('\n🔍 4. 인덱스 확인\n');

test('name-version 유니크 인덱스가 존재하는지', () => {
  const indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_prompt_version'"
  ).all();
  assert(indexes.length === 1, 'idx_prompt_version 인덱스가 존재하지 않습니다.');
});

test('name-is_active 인덱스가 존재하는지', () => {
  const indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_active_prompt'"
  ).all();
  assert(indexes.length === 1, 'idx_active_prompt 인덱스가 존재하지 않습니다.');
});

// ============================================
// 5. 파일 시스템 검증
// ============================================
console.log('\n📁 5. 파일 시스템 검증\n');

test('prompts 디렉토리가 존재하는지', () => {
  assert(fs.existsSync(promptsDir), 'prompts 디렉토리가 존재하지 않습니다.');
});

EXPECTED_PROMPTS.forEach(name => {
  test(`prompt_${name}.txt 파일이 존재하는지`, () => {
    const filePath = path.join(promptsDir, `prompt_${name}.txt`);
    assert(fs.existsSync(filePath), `prompt_${name}.txt 파일이 존재하지 않습니다.`);
  });

  test(`prompt_${name}.txt 파일과 DB 내용이 일치하는지`, () => {
    const filePath = path.join(promptsDir, `prompt_${name}.txt`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const dbContent = db.prepare(
      'SELECT content FROM prompt_templates WHERE name = ? AND is_active = 1'
    ).get(name);

    assert(dbContent && dbContent.content === fileContent,
      `${name} 프롬프트의 파일과 DB 내용이 일치하지 않습니다.`);
  });
});

// ============================================
// 6. 데이터 무결성 검증
// ============================================
console.log('\n🔐 6. 데이터 무결성 검증\n');

test('모든 프롬프트에 display_name이 있는지', () => {
  const rows = db.prepare(
    "SELECT name FROM prompt_templates WHERE display_name IS NULL OR display_name = ''"
  ).all();
  assert(rows.length === 0, '일부 프롬프트에 display_name이 없습니다.');
});

test('모든 프롬프트에 change_reason이 있는지', () => {
  const rows = db.prepare(
    "SELECT name FROM prompt_templates WHERE change_reason IS NULL OR change_reason = ''"
  ).all();
  assert(rows.length === 0, '일부 프롬프트에 change_reason이 없습니다.');
});

test('모든 프롬프트에 changed_by가 있는지', () => {
  const rows = db.prepare(
    "SELECT name FROM prompt_templates WHERE changed_by IS NULL OR changed_by = ''"
  ).all();
  assert(rows.length === 0, '일부 프롬프트에 changed_by가 없습니다.');
});

test('created_at 필드가 유효한 날짜인지', () => {
  const rows = db.prepare('SELECT created_at FROM prompt_templates').all();
  rows.forEach(row => {
    const date = new Date(row.created_at);
    assert(!isNaN(date.getTime()), `유효하지 않은 날짜: ${row.created_at}`);
  });
});

// ============================================
// 7. 쿼리 성능 테스트
// ============================================
console.log('\n⚡ 7. 쿼리 성능 테스트\n');

test('활성 프롬프트 조회가 10ms 이내에 완료되는지', () => {
  const start = Date.now();
  const row = db.prepare(
    'SELECT content FROM prompt_templates WHERE name = ? AND is_active = 1'
  ).get('product');
  const elapsed = Date.now() - start;

  assert(row, '프롬프트를 조회할 수 없습니다.');
  assert(elapsed < 10, `쿼리가 너무 느립니다. (${elapsed}ms)`);
});

test('전체 프롬프트 목록 조회가 20ms 이내에 완료되는지', () => {
  const start = Date.now();
  const rows = db.prepare(
    'SELECT name, version, is_active FROM prompt_templates'
  ).all();
  const elapsed = Date.now() - start;

  assert(rows.length > 0, '프롬프트를 조회할 수 없습니다.');
  assert(elapsed < 20, `쿼리가 너무 느립니다. (${elapsed}ms)`);
});

// ============================================
// DB 닫기
// ============================================
db.close();

// ============================================
// 결과 요약
// ============================================
console.log('\n' + '='.repeat(60));
console.log('🎯 테스트 결과 요약');
console.log('='.repeat(60));
console.log(`✅ 통과: ${testsPassed}개`);
console.log(`❌ 실패: ${testsFailed}개`);
console.log(`📊 성공률: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log('\n🎉 모든 테스트를 통과했습니다!');
  console.log('프롬프트 버전 관리 시스템이 정상적으로 작동합니다.');
  process.exit(0);
} else {
  console.log('\n⚠️  일부 테스트가 실패했습니다.');
  console.log('위의 실패 항목을 확인하고 수정해주세요.');
  process.exit(1);
}
