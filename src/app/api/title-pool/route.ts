import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'all';
    const minScore = parseInt(searchParams.get('minScore') || '0');

    const db = new Database(dbPath);

    // 통계 조회
    const stats = db.prepare(`
      SELECT
        category,
        COUNT(*) as total,
        SUM(CASE WHEN used = 0 THEN 1 ELSE 0 END) as unused,
        AVG(score) as avg_score,
        MAX(score) as max_score
      FROM title_pool
      GROUP BY category
      ORDER BY category
    `).all();

    // 제목 목록 조회
    let titlesQuery = `
      SELECT * FROM title_pool
      WHERE score >= ?
    `;
    const params: any[] = [minScore];

    if (category !== 'all') {
      titlesQuery += ` AND category = ?`;
      params.push(category);
    }

    titlesQuery += ` ORDER BY score DESC, created_at DESC LIMIT 1000`;

    const titles = db.prepare(titlesQuery).all(...params);

    db.close();

    return NextResponse.json({
      stats,
      titles
    });
  } catch (error: any) {
    console.error('제목 풀 조회 실패:', error);
    return NextResponse.json(
      { error: '제목 풀 조회 실패', details: error.message },
      { status: 500 }
    );
  }
}
