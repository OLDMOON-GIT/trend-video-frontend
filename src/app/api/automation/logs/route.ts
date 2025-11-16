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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const titleId = searchParams.get('titleId');

    if (!titleId) {
      return NextResponse.json({ error: 'titleId is required' }, { status: 400 });
    }

    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    // 본인의 제목인지 확인 (admin은 모든 로그 볼 수 있음)
    if (!user.isAdmin) {
      const titleOwner = db.prepare(`
        SELECT user_id FROM video_titles WHERE id = ?
      `).get(titleId) as { user_id?: string } | undefined;

      if (!titleOwner || titleOwner.user_id !== user.userId) {
        db.close();
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

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

    let pythonLogs: any[] = [];

    // 3. video_id가 있으면 job_logs 테이블에서 Python 로그 가져오기 (실시간!)
    if (schedule?.video_id) {
      // job_logs 테이블에서 해당 job의 모든 로그 가져오기 (시간순 정렬)
      const jobLogs = db.prepare(`
        SELECT log_message, created_at FROM job_logs
        WHERE job_id = ?
        ORDER BY id ASC
      `).all(schedule.video_id) as Array<{ log_message: string; created_at: string }>;

      pythonLogs = jobLogs;
    }

    db.close();

    // 4. title_logs 포맷 변환
    const formattedTitleLogs = titleLogs.map((log: any) => ({
      timestamp: log.created_at,
      level: log.level || 'info',
      message: log.message,
      source: 'title'
    }));

    // 5. Python 로그 포맷 변환 (job_logs 테이블에서 가져온 데이터)
    const formattedPythonLogs = pythonLogs.map((row: { log_message: string; created_at: string }) => {
      const line = row.log_message;

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

      // FFmpeg나 기타 출력 (created_at 타임스탬프 사용)
      return {
        timestamp: row.created_at,
        level: 'info',
        message: line.trim(),
        source: 'python'
      };
    });

    // 6. 모든 로그 병합 및 시간순 정렬
    const allLogs = [...formattedTitleLogs, ...formattedPythonLogs].sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    // 7. 모든 로그 반환 (제한 없음 - 프론트엔드에서 스크롤로 처리)
    return NextResponse.json({ logs: allLogs });
  } catch (error: any) {
    console.error('GET /api/automation/logs error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
