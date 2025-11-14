import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const scheduleId = formData.get('scheduleId') as string;
    const scriptId = formData.get('scriptId') as string;
    const images = formData.getAll('images') as File[];

    if (!scheduleId || !scriptId) {
      return NextResponse.json(
        { error: 'scheduleId and scriptId are required' },
        { status: 400 }
      );
    }

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }

    console.log(`[Upload Images] Schedule: ${scheduleId}, Script: ${scriptId}, Images: ${images.length}`);

    // 백엔드 input 폴더 경로 결정
    const scriptFolderPath = path.join(
      process.cwd(),
      '..',
      'trend-video-backend',
      'input',
      `project_${scriptId}`
    );

    // 폴더가 없으면 생성하고 story.json 파일 생성
    if (!fs.existsSync(scriptFolderPath)) {
      console.log(`[Upload Images] Creating script folder: ${scriptFolderPath}`);
      fs.mkdirSync(scriptFolderPath, { recursive: true });

      // DB에서 스크립트 내용 가져오기
      const Database = require('better-sqlite3');
      const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
      const db = new Database(dbPath);

      const content = db.prepare(`
        SELECT content, title
        FROM contents
        WHERE id = ? AND type = 'script'
      `).get(scriptId) as any;

      db.close();

      if (!content) {
        return NextResponse.json(
          { error: `Script not found: ${scriptId}` },
          { status: 404 }
        );
      }

      // content 파싱
      let scriptData;
      try {
        let contentStr = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);

        // JSON 정리
        contentStr = contentStr.trim();
        if (contentStr.startsWith('JSON')) {
          contentStr = contentStr.substring(4).trim();
        }
        const jsonStart = contentStr.indexOf('{');
        if (jsonStart > 0) {
          contentStr = contentStr.substring(jsonStart);
        }

        scriptData = JSON.parse(contentStr);
      } catch (e: any) {
        return NextResponse.json(
          { error: `Failed to parse script content: ${e.message}` },
          { status: 400 }
        );
      }

      // story.json 파일 생성
      const storyJson = {
        ...scriptData,
        scenes: scriptData.scenes || []
      };

      const storyJsonPath = path.join(scriptFolderPath, 'story.json');
      fs.writeFileSync(storyJsonPath, JSON.stringify(storyJson, null, 2), 'utf-8');
      console.log(`[Upload Images] Created story.json in ${scriptFolderPath}`);
    }

    // 이미지 저장
    let savedCount = 0;
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const buffer = Buffer.from(await file.arrayBuffer());

      // 파일명 결정: 기존 scene_X 패턴 유지하거나 scene_0, scene_1, ... 사용
      const ext = path.extname(file.name) || '.png';
      const filename = `scene_${i}${ext}`;
      const filepath = path.join(scriptFolderPath, filename);

      fs.writeFileSync(filepath, buffer);
      savedCount++;
      console.log(`[Upload Images] Saved: ${filename}`);
    }

    console.log(`[Upload Images] Completed: ${savedCount} images saved to ${scriptFolderPath}`);

    return NextResponse.json({
      success: true,
      count: savedCount,
      message: `${savedCount}개 이미지가 업로드되었습니다. 영상 생성이 자동으로 시작됩니다.`
    });

  } catch (error: any) {
    console.error('[Upload Images] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload images' },
      { status: 500 }
    );
  }
}
