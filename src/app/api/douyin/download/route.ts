import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Douyin 영상 다운로드 API
 *
 * POST /api/douyin/download
 * Body: { videoUrl: string }
 *
 * TODO: 실제 Douyin 다운로드 구현 필요
 * - yt-dlp 사용
 * - 또는 Python 백엔드 연동
 * - 또는 douyin-downloader 라이브러리 사용
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoUrl } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { success: false, error: 'videoUrl이 필요합니다.' },
        { status: 400 }
      );
    }

    // URL 유효성 검사
    if (!videoUrl.includes('douyin.com') && !videoUrl.includes('iesdouyin.com')) {
      return NextResponse.json(
        { success: false, error: '올바른 Douyin URL이 아닙니다.' },
        { status: 400 }
      );
    }

    // yt-dlp를 사용한 다운로드
    const outputDir = path.join(process.cwd(), 'public', 'downloads', 'douyin');
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = Date.now();
    const outputPath = path.join(outputDir, `douyin_${timestamp}.mp4`);

    try {
      console.log('🎬 Douyin 영상 다운로드 시작:', videoUrl);

      // yt-dlp 명령어 실행
      const { stdout, stderr } = await execAsync(
        `yt-dlp -o "${outputPath}" "${videoUrl}"`,
        { timeout: 120000 } // 120초 타임아웃 (2분)
      );

      console.log('✅ yt-dlp 실행 완료');
      if (stdout) console.log('stdout:', stdout);
      if (stderr) console.log('stderr:', stderr);

      // 파일이 생성되었는지 확인
      await fs.access(outputPath);

      // 상대 경로로 변환
      const relativePath = `/downloads/douyin/douyin_${timestamp}.mp4`;

      console.log('✅ 영상 다운로드 성공:', relativePath);

      return NextResponse.json({
        success: true,
        videoPath: relativePath,
        message: '영상 다운로드 완료'
      });

    } catch (error: any) {
      console.error('❌ yt-dlp 실행 실패:', error);

      // 생성된 파일 정리
      try {
        await fs.unlink(outputPath);
      } catch {}

      return NextResponse.json(
        {
          success: false,
          error: `다운로드 실패: ${error.message}`
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Douyin download API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '영상 다운로드 중 오류가 발생했습니다.'
      },
      { status: 500 }
    );
  }
}

/**
 * Douyin 다운로드 구현 방법:
 *
 * 1. yt-dlp 사용 (권장)
 *    - 설치: pip install yt-dlp 또는 npm install -g yt-dlp
 *    - 명령어: yt-dlp -o "output.mp4" "douyin_url"
 *
 * 2. Python 스크립트 사용
 *    - TikTok-Api 또는 douyin-downloader 라이브러리
 *    - Node.js에서 Python 스크립트 호출
 *
 * 3. 외부 API 사용
 *    - https://www.tikwm.com/api
 *    - https://api.douyin.wtf
 *    - 등등
 *
 * 4. Puppeteer 사용
 *    - 브라우저 자동화로 영상 다운로드
 *    - 복잡하고 느리므로 비권장
 */
