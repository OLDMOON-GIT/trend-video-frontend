import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { getCurrentUser } from '@/lib/session';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`📝 최근 제목 조회 요청 - userId: ${user.userId}, email: ${user.email}`);

    const db = new Database(dbPath);

    // 최근 4개의 대본 제목만 가져오기 (contents 테이블에서)
    const scriptTitles = db.prepare(`
      SELECT DISTINCT title
      FROM contents
      WHERE user_id = ? AND type = 'script' AND title IS NOT NULL AND title != ''
      ORDER BY created_at DESC
      LIMIT 4
    `).all(user.userId) as Array<{title: string}>;

    db.close();

    // 제목만 배열로 추출
    const titles = scriptTitles.map(row => row.title);

    console.log(`✅ 최근 대본 제목 ${titles.length}개 조회됨:`, titles);

    return NextResponse.json({ titles });
  } catch (error) {
    console.error('❌ Failed to get recent titles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
