import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findScriptById } from '@/lib/db';
import Database from 'better-sqlite3';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    let scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    // task_* ID인 경우 scripts_temp에서 실제 scriptId 조회
    if (scriptId.startsWith('task_')) {
      const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
      const db = new Database(dbPath);

      const tempScript = db.prepare('SELECT scriptId FROM scripts_temp WHERE id = ?').get(scriptId) as { scriptId: string } | undefined;
      db.close();

      if (!tempScript || !tempScript.scriptId) {
        return NextResponse.json(
          { error: '대본을 찾을 수 없습니다. 아직 생성 중이거나 생성에 실패했습니다.' },
          { status: 404 }
        );
      }

      scriptId = tempScript.scriptId;
    }

    const script = await findScriptById(scriptId);

    if (!script) {
      return NextResponse.json(
        { error: '대본을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 본인 대본인지 확인
    if (script.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 마크다운 코드 블록 제거 (```json ... ``` 형식)
    let content = script.content;
    content = content
      .replace(/^```json\s*/i, '')  // 시작 부분 제거
      .replace(/\s*```\s*$/i, '')   // 끝 부분 제거
      .trim();

    // 대본을 JSON 파일로 반환
    const cleanTitle = script.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '_');
    const fileName = `${cleanTitle}_story.json`;

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });

  } catch (error: any) {
    console.error('Error downloading script:', error);
    return NextResponse.json(
      { error: error?.message || '대본 다운로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
