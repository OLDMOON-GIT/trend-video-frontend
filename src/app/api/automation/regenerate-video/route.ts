import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/automation/regenerate-video
 * 영상 재생성
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { videoId, scriptId } = body;

    if (!videoId && !scriptId) {
      return NextResponse.json({ error: 'videoId or scriptId is required' }, { status: 400 });
    }

    console.log(`🔄 영상 재생성 요청: videoId=${videoId}, scriptId=${scriptId}`);

    const db = new Database(dbPath);

    // videoId가 있으면 비디오 기록 확인, 없으면 scriptId로 스케줄 확인
    let targetVideoId = videoId;

    if (!targetVideoId && scriptId) {
      // scriptId로 video_id 찾기
      const schedule = db.prepare(`
        SELECT video_id
        FROM automation_schedules
        WHERE script_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(scriptId) as any;

      if (schedule?.video_id) {
        targetVideoId = schedule.video_id;
      }
    }

    if (!targetVideoId) {
      db.close();
      return NextResponse.json({ error: '영상을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 기존 영상 확인
    const existingVideo = db.prepare(`
      SELECT id, title, status, videoPath
      FROM contents
      WHERE id = ? AND type = 'video'
    `).get(targetVideoId) as any;

    if (!existingVideo) {
      db.close();
      return NextResponse.json({ error: '기존 영상을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 기존 영상 상태를 pending으로 변경하고 재생성 플래그 설정
    db.prepare(`
      UPDATE contents
      SET status = 'pending',
          progress = 0,
          error = NULL,
          isRegenerated = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(targetVideoId);

    db.close();

    console.log(`✅ 영상 재생성 준비 완료: ${targetVideoId}`);
    console.log(`   기존 제목: ${existingVideo.title}`);
    console.log(`   상태: ${existingVideo.status} → pending`);

    return NextResponse.json({
      success: true,
      message: '영상이 재생성 대기 상태로 변경되었습니다. 스케줄러가 자동으로 재생성합니다.',
      videoId: targetVideoId
    });

  } catch (error: any) {
    console.error('POST /api/automation/regenerate-video error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
