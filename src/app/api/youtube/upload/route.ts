import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_CLI = path.join(BACKEND_PATH, 'youtube_upload_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');

/**
 * POST /api/youtube/upload - 비디오 업로드
 *
 * Body:
 * {
 *   "videoPath": "path/to/video.mp4",
 *   "title": "제목",
 *   "description": "설명",
 *   "tags": ["태그1", "태그2"],
 *   "privacy": "unlisted" | "public" | "private",
 *   "thumbnailPath": "path/to/thumbnail.jpg" (optional),
 *   "captionsPath": "path/to/captions.srt" (optional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // 요청 데이터 파싱
    const body = await request.json();
    const {
      videoPath,
      title,
      description = '',
      tags = [],
      privacy = 'unlisted',
      categoryId = '27',
      thumbnailPath,
      captionsPath,
      publishAt
    } = body;

    // 필수 파라미터 검증
    if (!videoPath || !title) {
      return NextResponse.json({
        error: 'videoPath와 title은 필수입니다'
      }, { status: 400 });
    }

    // 비디오 파일 존재 확인
    const fullVideoPath = path.join(BACKEND_PATH, videoPath);
    if (!fs.existsSync(fullVideoPath)) {
      return NextResponse.json({
        error: '비디오 파일을 찾을 수 없습니다'
      }, { status: 404 });
    }

    // 메타데이터 JSON 생성
    const metadata = {
      title,
      description,
      tags,
      category_id: categoryId,
      privacy_status: privacy,
      publish_at: publishAt
    };
    const metadataPath = path.join(CREDENTIALS_DIR, `youtube_metadata_${Date.now()}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // 토큰 파일 경로
    const tokenPath = path.join(CREDENTIALS_DIR, `youtube_token_${user.userId}.json`);

    // 업로드 실행
    return new Promise((resolve) => {
      const args = [
        YOUTUBE_CLI,
        '--action', 'upload',
        '--credentials', CREDENTIALS_FILE,
        '--token', tokenPath,
        '--video', fullVideoPath,
        '--metadata', metadataPath
      ];

      if (thumbnailPath) {
        const fullThumbnailPath = path.join(BACKEND_PATH, thumbnailPath);
        if (fs.existsSync(fullThumbnailPath)) {
          args.push('--thumbnail', fullThumbnailPath);
        }
      }

      if (captionsPath) {
        const fullCaptionsPath = path.join(BACKEND_PATH, captionsPath);
        if (fs.existsSync(fullCaptionsPath)) {
          args.push('--captions', fullCaptionsPath);
        }
      }

      const python = spawn('python', args);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
        console.log('[YouTube Upload]', data.toString());
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('[YouTube Upload] stderr:', data.toString());
      });

      python.on('close', (code) => {
        // 메타데이터 파일 삭제
        try {
          if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
          }
        } catch (e) {
          console.error('[YouTube Upload] 메타데이터 파일 삭제 실패:', e);
        }

        try {
          const result = JSON.parse(output.trim());
          if (result.success) {
            resolve(NextResponse.json({
              success: true,
              videoId: result.video_id,
              videoUrl: result.video_url
            }));
          } else {
            resolve(NextResponse.json({
              error: result.error || '업로드 실패'
            }, { status: 500 }));
          }
        } catch (e) {
          resolve(NextResponse.json({
            error: '업로드 프로세스 오류: ' + errorOutput
          }, { status: 500 }));
        }
      });
    });

  } catch (error: any) {
    console.error('[YouTube Upload] Error:', error);
    return NextResponse.json(
      { error: 'YouTube 업로드 실패' },
      { status: 500 }
    );
  }
}
