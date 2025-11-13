import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * DB에서 활성 프롬프트를 가져옵니다.
 * DB에 없으면 파일에서 fallback합니다.
 */
export function getActivePrompt(name: string): string {
  try {
    const db = new Database(dbPath);

    try {
      // DB에서 활성 프롬프트 조회
      const row = db.prepare(
        'SELECT content FROM prompt_templates WHERE name = ? AND is_active = 1'
      ).get(name) as any;

      if (row && row.content) {
        console.log(`✅ [프롬프트] ${name} - DB에서 로드됨 (v${row.version || '?'})`);
        return row.content;
      }

      console.warn(`⚠️ [프롬프트] ${name} - DB에 없음, 파일에서 fallback`);

      // Fallback: 파일에서 읽기
      return getPromptFromFile(name);

    } finally {
      db.close();
    }

  } catch (error) {
    console.error(`❌ [프롬프트] ${name} - DB 조회 실패:`, error);
    console.log(`📂 [프롬프트] ${name} - 파일에서 fallback`);

    // Fallback: 파일에서 읽기
    return getPromptFromFile(name);
  }
}

/**
 * 파일에서 프롬프트를 읽습니다 (fallback용)
 */
function getPromptFromFile(name: string): string {
  const promptsDir = path.join(process.cwd(), 'prompts');
  const fileName = `prompt_${name}.txt`;
  const filePath = path.join(promptsDir, fileName);

  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  throw new Error(`프롬프트를 찾을 수 없습니다: ${name} (DB와 파일 모두 없음)`);
}

/**
 * 모든 활성 프롬프트 목록 조회
 */
export function getAllActivePrompts() {
  const db = new Database(dbPath);

  try {
    const prompts = db.prepare(`
      SELECT name, display_name, version, created_at
      FROM prompt_templates
      WHERE is_active = 1
      ORDER BY name
    `).all();

    return prompts;

  } finally {
    db.close();
  }
}
