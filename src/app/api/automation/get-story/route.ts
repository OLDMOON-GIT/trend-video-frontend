import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';

/**
 * GET /api/automation/get-story?scriptId=xxx
 * 자동화 폴더의 story.json 파일을 읽어서 반환
 * 파일이 없으면 DB에서 가져와서 자동으로 폴더+파일 생성
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId is required' }, { status: 400 });
    }

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const projectDir = path.join(backendPath, 'input', `project_${scriptId}`);
    const storyPath = path.join(projectDir, 'story.json');

    // 1. 파일이 있으면 그대로 반환
    try {
      const storyContent = await fs.readFile(storyPath, 'utf-8');
      const storyJson = JSON.parse(storyContent);

      console.log('✅ story.json 파일 읽기 성공:', storyPath);
      return NextResponse.json({
        success: true,
        storyJson
      });
    } catch (fileError: any) {
      console.log('⚠️ story.json 파일 없음, DB에서 가져옴:', fileError.message);
    }

    // 2. 파일이 없으면 DB에서 가져오기
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    let db: Database.Database | null = null;

    try {
      db = new Database(dbPath);

      const content = db.prepare(`
        SELECT content, title
        FROM contents
        WHERE id = ? AND type = 'script'
      `).get(scriptId) as any;

      if (!content) {
        return NextResponse.json({
          error: 'DB에서 대본을 찾을 수 없습니다',
          scriptId
        }, { status: 404 });
      }

      // 3. content 파싱
      let contentStr = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);

      // JSON 정리
      contentStr = contentStr.trim();
      if (contentStr.startsWith('```json')) {
        contentStr = contentStr.substring(7).trim();
      }
      if (contentStr.endsWith('```')) {
        contentStr = contentStr.substring(0, contentStr.length - 3).trim();
      }
      const jsonStart = contentStr.indexOf('{');
      if (jsonStart > 0) {
        contentStr = contentStr.substring(jsonStart);
      }

      if (!contentStr || contentStr.length === 0 || !contentStr.includes('{')) {
        return NextResponse.json({
          error: '대본 content가 비어있거나 JSON이 아닙니다',
          scriptId
        }, { status: 400 });
      }

      const storyJson = JSON.parse(contentStr);

      // 4. 폴더 생성
      await fs.mkdir(projectDir, { recursive: true });
      console.log('✅ 폴더 생성:', projectDir);

      // 5. story.json 파일 생성
      await fs.writeFile(storyPath, JSON.stringify(storyJson, null, 2), 'utf-8');
      console.log('✅ story.json 파일 생성:', storyPath);

      return NextResponse.json({
        success: true,
        storyJson,
        created: true  // 새로 생성되었음을 알림
      });

    } finally {
      if (db) {
        try {
          db.close();
        } catch (e) {
          console.error('⚠️ DB close 실패:', e);
        }
      }
    }

  } catch (error: any) {
    console.error('GET /api/automation/get-story error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
