const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const promptsDir = path.join(__dirname, '..', 'prompts');

// 프롬프트 파일 매핑 (파일명 -> 표시명)
const PROMPT_FILES = {
  'prompt_product.txt': {
    name: 'product',
    displayName: '상품 영상 대본'
  },
  'prompt_product_info.txt': {
    name: 'product_info',
    displayName: '상품 정보 텍스트'
  },
  'prompt_longform.txt': {
    name: 'longform',
    displayName: '롱폼 대본'
  },
  'prompt_shortform.txt': {
    name: 'shortform',
    displayName: '숏폼 대본'
  },
  'prompt_sora2.txt': {
    name: 'sora2',
    displayName: 'Sora 2 프롬프트'
  }
};

function migratePrompts() {
  const db = new Database(dbPath);

  try {
    console.log('🚀 프롬프트 마이그레이션 시작...\n');

    let migratedCount = 0;
    let skippedCount = 0;

    for (const [fileName, config] of Object.entries(PROMPT_FILES)) {
      const filePath = path.join(promptsDir, fileName);

      // 파일이 존재하는지 확인
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  ${fileName} - 파일 없음, 건너뜀`);
        skippedCount++;
        continue;
      }

      // 이미 마이그레이션되었는지 확인
      const existing = db.prepare('SELECT id FROM prompt_templates WHERE name = ? AND version = 1').get(config.name);
      if (existing) {
        console.log(`⏭️  ${config.displayName} - 이미 마이그레이션됨, 건너뜀`);
        skippedCount++;
        continue;
      }

      // 파일 내용 읽기
      const content = fs.readFileSync(filePath, 'utf-8');

      // DB에 저장
      const id = uuidv4();
      db.prepare(`
        INSERT INTO prompt_templates (id, name, display_name, version, content, change_reason, changed_by, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        config.name,
        config.displayName,
        1,
        content,
        '초기 버전 (기존 파일에서 마이그레이션)',
        'system',
        1  // 첫 버전은 활성화
      );

      console.log(`✅ ${config.displayName} - 버전 1로 마이그레이션 완료 (${content.length} bytes)`);
      migratedCount++;
    }

    console.log('\n🎉 마이그레이션 완료!');
    console.log(`   - 마이그레이션: ${migratedCount}개`);
    console.log(`   - 건너뜀: ${skippedCount}개`);

    // 현재 저장된 프롬프트 목록 확인
    console.log('\n📋 현재 저장된 프롬프트 버전:');
    const prompts = db.prepare(`
      SELECT name, display_name, version, is_active, created_at
      FROM prompt_templates
      ORDER BY name, version DESC
    `).all();

    prompts.forEach(p => {
      const activeLabel = p.is_active ? '🟢 활성' : '⚪ 비활성';
      console.log(`   ${activeLabel} ${p.display_name} v${p.version} (${new Date(p.created_at).toLocaleString('ko-KR')})`);
    });

  } catch (error) {
    console.error('❌ 마이그레이션 중 오류 발생:', error);
    throw error;
  } finally {
    db.close();
  }
}

// 실행
migratePrompts();
