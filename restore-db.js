const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('🔄 데이터 복원 시작...\n');

try {
  // contents_backup의 컬럼 확인
  const backupColumns = db.prepare("PRAGMA table_info(contents_backup)").all();
  console.log('📋 백업 테이블 컬럼:', backupColumns.map(c => c.name).join(', '));

  // 백업 데이터 개수 확인
  const backupCount = db.prepare("SELECT COUNT(*) as count FROM contents_backup").get();
  console.log('📦 백업 데이터 개수:', backupCount.count);

  // 현재 contents 데이터 개수
  const currentCount = db.prepare("SELECT COUNT(*) as count FROM contents").get();
  console.log('📊 현재 데이터 개수:', currentCount.count);

  if (backupCount.count > 0 && currentCount.count === 0) {
    console.log('\n✅ 데이터 복원 필요! 복원 시작...\n');

    // 명시적으로 컬럼을 지정하여 복원
    db.prepare(`
      INSERT INTO contents (
        id, user_id, type, format, title, original_title, content,
        status, progress, error, pid,
        video_path, thumbnail_path, published, published_at,
        input_tokens, output_tokens, use_claude_local,
        source_content_id, conversion_type, is_regenerated,
        created_at, updated_at, model
      )
      SELECT
        id, user_id, type, format, title, original_title, content,
        status, progress, error, pid,
        video_path, thumbnail_path, published, published_at,
        input_tokens, output_tokens, use_claude_local,
        source_content_id, conversion_type, is_regenerated,
        created_at, updated_at, model
      FROM contents_backup
    `).run();

    const restoredCount = db.prepare("SELECT COUNT(*) as count FROM contents").get();
    console.log('✅ 복원 완료! 복원된 데이터 개수:', restoredCount.count);

    // 백업 테이블 삭제
    db.exec('DROP TABLE contents_backup');
    console.log('✅ 백업 테이블 삭제 완료');

    // 인덱스 재생성
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_user_id ON contents(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_format ON contents(format)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_contents_published ON contents(published)');
    console.log('✅ 인덱스 재생성 완료');

    console.log('\n🎉 모든 데이터 복원 완료!');
  } else if (currentCount.count > 0) {
    console.log('\n⚠️ 데이터가 이미 존재합니다. 복원을 건너뜁니다.');
  } else {
    console.log('\n⚠️ 백업 데이터가 없습니다.');
  }

} catch (error) {
  console.error('❌ 오류 발생:', error.message);
  console.error(error.stack);
} finally {
  db.close();
}
