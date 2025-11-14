import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

/**
 * GET /api/automation/logs?titleId=xxx
 * 특정 제목의 실행 로그 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const titleId = searchParams.get('titleId');

    if (!titleId) {
      return NextResponse.json({ error: 'titleId is required' }, { status: 400 });
    }

    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    // 최근 100개의 로그 가져오기 (title_logs 테이블 사용)
    const logs = db.prepare(`
      SELECT created_at, level, message FROM title_logs
      WHERE title_id = ?
      ORDER BY created_at ASC
      LIMIT 100
    `).all(titleId);

    db.close();

    // 로그 포맷 변환
    const formattedLogs = logs.map((log: any) => ({
      timestamp: log.created_at,
      level: log.level || 'info',
      message: log.message
    }));

    return NextResponse.json({ logs: formattedLogs });
  } catch (error: any) {
    console.error('GET /api/automation/logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
