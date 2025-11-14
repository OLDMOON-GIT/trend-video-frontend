import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

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
      try {
        let contentStr = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);

        // "JSON" 텍스트 제거 (방어적 처리)
        contentStr = contentStr.trim();
        if (contentStr.startsWith('JSON')) {
          contentStr = contentStr.substring(4).trim();
        }

        // { 이전의 불필요한 텍스트 제거
        const jsonStart = contentStr.indexOf('{');
        if (jsonStart > 0) {
          contentStr = contentStr.substring(jsonStart);
        }

        const parsedContent = JSON.parse(contentStr);
        // scenes가 없거나 비어있으면 아직 완료되지 않은 것
        if (!parsedContent.scenes || parsedContent.scenes.length === 0) {
          console.warn(`⚠️ Script ${id} marked as completed but has no scenes`);
          actualStatus = 'processing';
        }
      } catch (e) {
        console.warn(`⚠️ Script ${id} marked as completed but content is not valid JSON`);
        actualStatus = 'processing';
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
