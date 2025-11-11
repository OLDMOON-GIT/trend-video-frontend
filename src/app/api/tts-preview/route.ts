import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const voice = searchParams.get('voice');
    const speed = searchParams.get('speed') || '1.0';

    if (!voice) {
      return NextResponse.json(
        { error: 'voice 매개변수가 필요합니다.' },
        { status: 400 }
      );
    }

    // 사전 생성된 샘플 파일 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const samplesDir = path.join(backendPath, 'preview_samples');
    const filename = `sample_${voice}_${speed}.mp3`;
    const samplePath = path.join(samplesDir, filename);


    // 파일 존재 확인
    try {
      await fs.access(samplePath);
      console.log('  ✓ 파일 존재 확인됨');
    } catch (error) {
      console.error('  ✗ 파일 없음:', error);
      return NextResponse.json(
        { error: `미리듣기 샘플을 찾을 수 없습니다: ${filename}`, path: samplePath },
        { status: 404 }
      );
    }

    // 오디오 파일 읽기
    const audioBuffer = await fs.readFile(samplePath);

    // 오디오 파일 반환 (7일 캐시)
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'public, max-age=604800, immutable', // 7일 캐시, immutable
      },
    });

  } catch (error: any) {
    console.error('❌ TTS 미리듣기 API 오류:', error);
    return NextResponse.json(
      { error: 'TTS 미리듣기 API 오류', details: error.message },
      { status: 500 }
    );
  }
}
