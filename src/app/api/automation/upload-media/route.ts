import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const scheduleId = formData.get('scheduleId') as string;
    const scriptId = formData.get('scriptId') as string;
    const mediaFiles = formData.getAll('media') as File[];

    if (!scheduleId || !scriptId) {
      return NextResponse.json(
        { error: 'scheduleId and scriptId are required' },
        { status: 400 }
      );
    }

    if (!mediaFiles || mediaFiles.length === 0) {
      return NextResponse.json(
        { error: 'No media files provided' },
        { status: 400 }
      );
    }

    // 이미지와 비디오 분류
    const images = mediaFiles.filter(f => f.type.startsWith('image/'));
    const videos = mediaFiles.filter(f => f.type.startsWith('video/'));

    console.log(`[Upload Media] Schedule: ${scheduleId}, Script: ${scriptId}`);
    console.log(`[Upload Media] Images: ${images.length}, Videos: ${videos.length}`);

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
      console.log(`[Upload Media] Creating script folder: ${scriptFolderPath}`);
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
      console.log(`[Upload Media] Created story.json in ${scriptFolderPath}`);
    }

    // 미디어 파일 저장 (이미지 + 비디오 통합 시퀀스)
    let savedCount = 0;
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      const buffer = Buffer.from(await file.arrayBuffer());

      // 파일명 결정: scene_0, scene_1, ...
      const ext = path.extname(file.name) || (file.type.startsWith('image/') ? '.png' : '.mp4');
      const filename = `scene_${i}${ext}`;
      const filepath = path.join(scriptFolderPath, filename);

      fs.writeFileSync(filepath, buffer);
      savedCount++;

      const mediaType = file.type.startsWith('image/') ? '🖼️ Image' : '🎬 Video';
      const sizeInMB = (file.size / 1024 / 1024).toFixed(1);
      console.log(`[Upload Media] Saved ${mediaType}: ${filename} (${sizeInMB}MB)`);
    }

    console.log(`[Upload Media] Completed: ${savedCount} files saved to ${scriptFolderPath}`);

    return NextResponse.json({
      success: true,
      count: savedCount,
      images: images.length,
      videos: videos.length,
      message: `${savedCount}개 파일이 업로드되었습니다. (이미지: ${images.length}, 동영상: ${videos.length})`
    });

  } catch (error: any) {
    console.error('[Upload Media] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload media' },
      { status: 500 }
    );
  }
}
