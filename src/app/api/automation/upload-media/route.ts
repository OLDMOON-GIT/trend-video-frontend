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

    // 기존 생성된 scene 파일들 삭제 (업로드된 파일이 우선순위)
    try {
      const existingFiles = fs.readdirSync(scriptFolderPath);
      const sceneFiles = existingFiles.filter(f => /^scene_\d+\.(png|jpg|jpeg|webp|mp4)$/i.test(f));

      if (sceneFiles.length > 0) {
        console.log(`[Upload Media] 기존 scene 파일 ${sceneFiles.length}개 삭제 중...`);
        for (const sceneFile of sceneFiles) {
          const sceneFilePath = path.join(scriptFolderPath, sceneFile);
          fs.unlinkSync(sceneFilePath);
          console.log(`[Upload Media] 삭제됨: ${sceneFile}`);
        }
      }
    } catch (error: any) {
      console.warn(`[Upload Media] 기존 scene 파일 삭제 중 오류 (무시): ${error.message}`);
    }

    // story.json에서 씬 개수 확인
    let sceneCount = 0;
    try {
      const storyJsonPath = path.join(scriptFolderPath, 'story.json');
      if (fs.existsSync(storyJsonPath)) {
        const storyData = JSON.parse(fs.readFileSync(storyJsonPath, 'utf-8'));
        sceneCount = storyData.scenes?.length || 0;
        console.log(`[Upload Media] 씬 개수: ${sceneCount}`);
      }
    } catch (error: any) {
      console.warn(`[Upload Media] story.json 읽기 실패 (무시): ${error.message}`);
    }

    // 영상+이미지가 함께 있고, 미디어가 씬보다 많을 때만 첫 이미지를 썸네일로 분리
    const hasVideo = videos.length > 0;
    const hasImage = images.length > 0;
    let thumbnailFile: File | null = null;
    let sceneMediaFiles = mediaFiles;

    if (hasVideo && hasImage && mediaFiles.length > sceneCount && sceneCount > 0) {
      // 첫 번째 이미지 찾기 (비디오가 앞에 있어도 상관없음)
      const firstImageIndex = mediaFiles.findIndex(f => f.type.startsWith('image/'));

      if (firstImageIndex !== -1) {
        thumbnailFile = mediaFiles[firstImageIndex];
        // 첫 번째 이미지를 제외한 나머지
        sceneMediaFiles = [
          ...mediaFiles.slice(0, firstImageIndex),
          ...mediaFiles.slice(firstImageIndex + 1)
        ];
        console.log(`[Upload Media] 📌 썸네일 분리: 영상+이미지 있고 미디어(${mediaFiles.length}) > 씬(${sceneCount})`);
        console.log(`[Upload Media]    🖼️ 썸네일: ${thumbnailFile.name}`);
        console.log(`[Upload Media]    📹 씬 미디어: ${sceneMediaFiles.length}개`);
      }
    } else {
      console.log(`[Upload Media] 📌 썸네일 분리 안 함: 영상(${hasVideo}), 이미지(${hasImage}), 미디어(${mediaFiles.length}) vs 씬(${sceneCount})`);
    }

    // 썸네일 저장
    if (thumbnailFile) {
      const buffer = Buffer.from(await thumbnailFile.arrayBuffer());
      const ext = path.extname(thumbnailFile.name) || '.jpg';
      const thumbnailPath = path.join(scriptFolderPath, `thumbnail${ext}`);
      fs.writeFileSync(thumbnailPath, buffer);
      console.log(`[Upload Media] 💾 Saved 🖼️ Thumbnail: thumbnail${ext}`);
    }

    // 미디어 파일 저장 (이미지 + 비디오 통합 시퀀스)
    let savedCount = 0;
    for (let i = 0; i < sceneMediaFiles.length; i++) {
      const file = sceneMediaFiles[i];
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

    const thumbnailMsg = thumbnailFile ? ` + 썸네일 1개` : '';
    return NextResponse.json({
      success: true,
      count: savedCount,
      images: images.length,
      videos: videos.length,
      hasThumbnail: !!thumbnailFile,
      message: `${savedCount}개 파일이 업로드되었습니다${thumbnailMsg}. (이미지: ${images.length}, 동영상: ${videos.length})`
    });

  } catch (error: any) {
    console.error('[Upload Media] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload media' },
      { status: 500 }
    );
  }
}
