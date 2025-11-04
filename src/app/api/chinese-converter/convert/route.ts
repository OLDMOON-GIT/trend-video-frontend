import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/chinese-converter/convert
 * 중국어 영상을 한국어로 변환
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // FormData 파싱
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;

    if (!videoFile) {
      return NextResponse.json({ error: '비디오 파일이 필요합니다' }, { status: 400 });
    }

    // 파일 저장 경로 생성
    const jobId = uuidv4();
    const uploadDir = path.join(process.cwd(), '..', 'trend-video-backend', 'uploads', 'chinese-converter', jobId);

    // 디렉토리 생성
    await mkdir(uploadDir, { recursive: true });

    // 파일 저장
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    const originalFileName = videoFile.name;
    const fileExtension = path.extname(originalFileName);
    const savedFileName = `original${fileExtension}`;
    const filePath = path.join(uploadDir, savedFileName);

    await writeFile(filePath, buffer);

    console.log('✅ 중국영상변환 파일 업로드 완료:', {
      jobId,
      fileName: originalFileName,
      size: videoFile.size,
      path: filePath
    });

    // TODO: 백그라운드에서 변환 작업 시작
    // 1. 중국어 자막 추출 (Whisper API 또는 자막 파일)
    // 2. 번역 (Papago API 또는 DeepL)
    // 3. 한국어 TTS 생성 (Google TTS 또는 네이버 Clova)
    // 4. 영상 합성 (FFmpeg)

    // 임시로 jobId만 반환
    return NextResponse.json({
      success: true,
      jobId,
      message: '변환 작업이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 중국영상변환 오류:', error);
    return NextResponse.json(
      { error: error.message || '변환 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
