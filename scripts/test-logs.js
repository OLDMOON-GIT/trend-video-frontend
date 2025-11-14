const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

console.log('🧪 Testing log insertion...\n');

// addPipelineLog 테스트
function testAddPipelineLog() {
  const db = new Database(dbPath);

  try {
    const testPipelineId = 'test_pipeline_' + Date.now();
    const testMessage = '테스트 로그 메시지';
    const testMetadata = { test: true };

    db.prepare(`
      INSERT INTO automation_logs (pipeline_id, log_level, level, message, details, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testPipelineId, 'info', 'info', testMessage, JSON.stringify(testMetadata), JSON.stringify(testMetadata));

    console.log('✅ addPipelineLog test: SUCCESS');

    // 방금 삽입한 로그 조회
    const log = db.prepare('SELECT * FROM automation_logs WHERE pipeline_id = ?').get(testPipelineId);
    console.log('   Inserted log:', JSON.stringify(log, null, 2));

    // 테스트 데이터 삭제
    db.prepare('DELETE FROM automation_logs WHERE pipeline_id = ?').run(testPipelineId);
    console.log('   Test data cleaned up\n');

  } catch (error) {
    console.error('❌ addPipelineLog test: FAILED');
    console.error('   Error:', error.message);
  } finally {
    db.close();
  }
}

// addTitleLog 테스트
function testAddTitleLog() {
  const db = new Database(dbPath);

  try {
    const testTitleId = 'test_title_' + Date.now();
    const testMessage = '테스트 타이틀 로그';
    const testDetails = { stage: 'test' };

    db.prepare(`
      INSERT INTO automation_logs (pipeline_id, title_id, log_level, level, message, details, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run('title_' + testTitleId, testTitleId, 'info', 'info', testMessage, JSON.stringify(testDetails), JSON.stringify(testDetails));

    console.log('✅ addTitleLog test: SUCCESS');

    // 방금 삽입한 로그 조회
    const log = db.prepare('SELECT * FROM automation_logs WHERE title_id = ?').get(testTitleId);
    console.log('   Inserted log:', JSON.stringify(log, null, 2));

    // 테스트 데이터 삭제
    db.prepare('DELETE FROM automation_logs WHERE title_id = ?').run(testTitleId);
    console.log('   Test data cleaned up\n');

  } catch (error) {
    console.error('❌ addTitleLog test: FAILED');
    console.error('   Error:', error.message);
  } finally {
    db.close();
  }
}

// 테이블 구조 확인
function checkTableStructure() {
  const db = new Database(dbPath);
  const info = db.prepare('PRAGMA table_info(automation_logs)').all();
  console.log('📋 Table structure:');
  info.forEach(col => {
    console.log(`   ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : 'NULL'}`);
  });
  console.log('');
  db.close();
}

// 실행
checkTableStructure();
testAddPipelineLog();
testAddTitleLog();

console.log('🎉 All tests completed!');
