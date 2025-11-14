import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

/**
 * POST /api/videos/generate
 * 대본 ID로 영상 생성 (자동화 시스템용)
 */
export async function POST(request: NextRequest) {
  try {
    // 내부 요청 확인
    const isInternal = request.headers.get('X-Internal-Request') === 'automation-system';

    if (!isInternal) {
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { scriptId, mediaMode, type, imageSource } = body;

    console.log('📥 [VIDEO-GEN] Received request:', { scriptId, mediaMode, type, imageSource });

    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId is required' }, { status: 400 });
    }

    // contents 테이블에서 대본 조회
    const db = new Database(dbPath);
    const content = db.prepare(`
      SELECT id, title, content, type, user_id
      FROM contents
      WHERE id = ? AND type = 'script'
    `).get(scriptId) as any;

    db.close();

    if (!content) {
      console.error('❌ [VIDEO-GEN] Script not found:', scriptId);
      return NextResponse.json({ error: 'Script not found' }, { status: 404 });
    }

    console.log('✅ [VIDEO-GEN] Script found:', { title: content.title, scriptId });

    // content 파싱
    let scriptData;
    try {
      let contentStr = typeof content.content === 'string' ? content.content : JSON.stringify(content.content);

      // JSON 파싱 전 클리닝 - 코드펜스와 "JSON" 접두사 제거
      contentStr = contentStr
        .replace(/^```json?\s*/i, '')  // 시작 코드펜스 제거
        .replace(/```\s*$/i, '')       // 끝 코드펜스 제거
        .replace(/^JSON\s*/i, '')       // "JSON" 접두사 제거
        .trim();

      scriptData = JSON.parse(contentStr);
    } catch (e: any) {
      console.error('❌ [VIDEO-GEN] Failed to parse script content:', e);
      console.error('❌ [VIDEO-GEN] Content value:', content.content);
      return NextResponse.json({
        error: `Invalid script content: ${e.message}. Script may not be completed yet.`
      }, { status: 400 });
    }

    // 대본이 실제로 완료되었는지 확인
    if (!scriptData.scenes || scriptData.scenes.length === 0) {
      console.error('❌ [VIDEO-GEN] Script has no scenes:', scriptData);
      return NextResponse.json({
        error: 'Script has no scenes. Script generation may not be completed yet.'
      }, { status: 400 });
    }

    // 타입 결정: 요청 > 스크립트 메타데이터 > 기본값
    const videoType = type || scriptData.metadata?.genre || 'shortform';
    console.log(`🎬 [VIDEO-GEN] Video type: ${videoType}`);

    // FormData로 변환하여 /api/generate-video-upload 호출
    console.log('📤 [VIDEO-GEN] Calling /api/generate-video-upload...');

    // story.json 생성
    const storyJson = {
      ...scriptData,
      scenes: scriptData.scenes || []
    };

    // FormData 생성
    const formData = new FormData();

    // JSON 파일로 변환
    const jsonBlob = new Blob([JSON.stringify(storyJson, null, 2)], { type: 'application/json' });
    formData.append('json', jsonBlob, 'story.json');

    // 사용자 ID 추가 (내부 요청용)
    formData.append('userId', content.user_id);

    // 이미지 소스 설정 (media_mode가 dalle, imagen3 등)
    formData.append('imageSource', imageSource || 'none');

    // 이미지 모델 설정 (imagen3 -> imagen3, 나머지는 dalle3)
    const imageModel = imageSource === 'imagen3' ? 'imagen3' : 'dalle3';
    formData.append('imageModel', imageModel);

    // 비디오 포맷
    formData.append('videoFormat', videoType);

    // TTS 음성 (기본값)
    formData.append('ttsVoice', 'ko-KR-SoonBokNeural');

    console.log('📤 [VIDEO-GEN] FormData:', {
      imageSource: imageSource || 'none',
      imageModel,
      videoType,
      userId: content.user_id
    });

    // 내부 요청임을 명시
    const videoResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-video-upload`, {
      method: 'POST',
      headers: {
        'X-Internal-Request': 'automation-system'
      },
      body: formData
    });

    console.log(`📥 [VIDEO-GEN] generate-video response: ${videoResponse.status}`);

    if (!videoResponse.ok) {
      const errorText = await videoResponse.text();
      console.error('❌ [VIDEO-GEN] generate-video failed:', errorText);
      return NextResponse.json(
        { error: `Video generation failed: ${errorText}` },
        { status: videoResponse.status }
      );
    }

    const result = await videoResponse.json();
    console.log('✅ [VIDEO-GEN] Video generation started:', result);

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      message: 'Video generation started'
    });

  } catch (error: any) {
    console.error('❌ [VIDEO-GEN] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
