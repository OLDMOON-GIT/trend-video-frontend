import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { parseJsonSafely } from '@/lib/json-utils';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * GET /api/scripts/status/[id]
 * 대본 생성 상태 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const db = new Database(dbPath);
    const content = db.prepare('SELECT status, progress, error, content FROM contents WHERE id = ?').get(id) as any;
    db.close();

    if (!content) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    // status가 completed인데 실제 content가 유효한 JSON이 아니면 processing으로 변경
    let actualStatus = content.status;
    if (content.status === 'completed' && content.content) {
      const contentStr = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);

      // parseJsonSafely 사용하여 안전하게 파싱
      const parseResult = parseJsonSafely(contentStr, { logErrors: true });

      if (parseResult.success && parseResult.data) {
        // 파싱 성공
        const parsedContent = parseResult.data;

        // scenes가 없거나 비어있으면 failed로 처리 (무한 루프 방지)
        if (!parsedContent.scenes || parsedContent.scenes.length === 0) {
          console.error(`❌ Script ${id} marked as completed but has no scenes - marking as failed`);
          actualStatus = 'failed';
          // DB에서도 failed로 업데이트
          const dbUpdate = new Database(dbPath);
          dbUpdate.prepare(`
            UPDATE contents
            SET status = 'failed', error = 'No scenes in generated script', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(id);
          dbUpdate.close();
        }
      } else {
        // 파싱 실패
        console.error(`❌ Script ${id} marked as completed but content is not valid JSON - marking as failed`);
        console.error(`   파싱 오류: ${parseResult.error}`);
        console.error(`   원본 내용 (처음 500자):`, contentStr.substring(0, 500));

        actualStatus = 'failed';
        // DB에서도 failed로 업데이트
        const dbUpdate = new Database(dbPath);
        dbUpdate.prepare(`
          UPDATE contents
          SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(`Invalid JSON content: ${parseResult.error}`, id);
        dbUpdate.close();
      }
    }

    return NextResponse.json({
      status: actualStatus,
      progress: content.progress || 0,
      error: content.error || null
    });

  } catch (error: any) {
    console.error('GET /api/scripts/status/[id] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
