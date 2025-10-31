import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(request: NextRequest) {
  try {
    const db = new Database(dbPath);

    // scripts_temp 테이블 생성 (admin/titles 페이지용)
    db.exec(`
      CREATE TABLE IF NOT EXISTS scripts_temp (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        message TEXT,
        createdAt TEXT NOT NULL,
        scriptId TEXT,
        type TEXT,
        pid INTEGER,
        logs TEXT DEFAULT '[]'
      )
    `);

    // type, pid 컬럼이 없으면 추가 (기존 데이터 보존)
    try {
      db.exec(`ALTER TABLE scripts_temp ADD COLUMN type TEXT`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column')) {
        console.error('type 컬럼 추가 실패:', e);
      }
    }
    try {
      db.exec(`ALTER TABLE scripts_temp ADD COLUMN pid INTEGER`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column')) {
        console.error('pid 컬럼 추가 실패:', e);
      }
    }

    // URL에서 id 파라미터 확인
    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('id');

    if (scriptId) {
      // 특정 스크립트 조회
      const script = db.prepare(`
        SELECT * FROM scripts_temp WHERE id = ?
      `).get(scriptId);

      db.close();

      if (!script) {
        return NextResponse.json(
          { error: 'Script not found' },
          { status: 404 }
        );
      }

      // logs를 JSON으로 파싱
      const parsedScript = {
        ...script,
        logs: (script as any).logs ? JSON.parse((script as any).logs) : []
      };

      return NextResponse.json({ script: parsedScript });
    } else {
      // 모든 스크립트 조회
      const scripts = db.prepare(`
        SELECT * FROM scripts_temp
        ORDER BY createdAt DESC
      `).all();

      // logs를 JSON으로 파싱
      const parsedScripts = scripts.map((script: any) => ({
        ...script,
        logs: script.logs ? JSON.parse(script.logs) : []
      }));

      db.close();

      return NextResponse.json({ scripts: parsedScripts });
    }
  } catch (error) {
    console.error('Error fetching scripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scripts' },
      { status: 500 }
    );
  }
}
