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

    // 1. title_logs에서 기본 로그 가져오기
    const titleLogs = db.prepare(`
      SELECT created_at, level, message FROM title_logs
      WHERE title_id = ?
      ORDER BY created_at ASC
    `).all(titleId);

    // 2. video_schedules에서 video_id 찾기
    const schedule = db.prepare(`
      SELECT video_id FROM video_schedules
      WHERE title_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(titleId) as { video_id?: string } | undefined;

    let pythonLogs: string[] = [];

    // 3. video_id가 있으면 jobs 테이블에서 Python 로그 가져오기
    if (schedule?.video_id) {
      const job = db.prepare(`
        SELECT logs FROM jobs
        WHERE id = ?
      `).get(schedule.video_id) as { logs?: string } | undefined;

      if (job?.logs) {
        // Python 로그를 줄 단위로 분리
        pythonLogs = job.logs.split('\n').filter(line => line.trim());
      }
    }

    db.close();

    // 4. title_logs 포맷 변환
    const formattedTitleLogs = titleLogs.map((log: any) => ({
      timestamp: log.created_at,
      level: log.level || 'info',
      message: log.message,
      source: 'title'
    }));

    // 5. Python 로그 포맷 변환 (타임스탬프 없으면 현재 시간 사용)
    const formattedPythonLogs = pythonLogs.map((line: string) => {
      // Python 로그 형식: "2025-11-14 17:36:09,615 - INFO - 메시지"
      const pythonMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+ - (\w+) - (.+)$/);

      if (pythonMatch) {
        return {
          timestamp: pythonMatch[1].replace(' ', 'T'),
          level: pythonMatch[2].toLowerCase(),
          message: pythonMatch[3],
          source: 'python'
        };
      }

      // FFmpeg나 기타 출력 (타임스탬프 없음)
      return {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: line,
        source: 'python'
      };
    });

    // 6. 모든 로그 병합 및 시간순 정렬
    const allLogs = [...formattedTitleLogs, ...formattedPythonLogs].sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    // 7. 최근 200개만 반환
    const recentLogs = allLogs.slice(-200);

    return NextResponse.json({ logs: recentLogs });
  } catch (error: any) {
    console.error('GET /api/automation/logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
