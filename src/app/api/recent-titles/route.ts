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

    // 최근 4개의 제목 가져오기 (contents와 jobs 모두에서, 실패한 것도 포함)
    const scriptTitles = db.prepare(`
      SELECT DISTINCT title, created_at
      FROM (
        SELECT title, created_at
        FROM contents
        WHERE user_id = ?
          AND type = 'script'
          AND title IS NOT NULL
          AND title != ''

        UNION

        SELECT title, created_at
        FROM jobs
        WHERE user_id = ?
          AND title IS NOT NULL
          AND title != ''
      )
      ORDER BY created_at DESC
      LIMIT 4
    `).all(user.userId, user.userId) as Array<{title: string; created_at: string}>;

    db.close();

    // 제목만 배열로 추출
    const titles = scriptTitles.map(row => row.title);

    console.log(`✅ 최근 제목 ${titles.length}개 조회됨 (contents + jobs):`, titles);

    return NextResponse.json({ titles });
  } catch (error) {
    console.error('❌ Failed to get recent titles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
