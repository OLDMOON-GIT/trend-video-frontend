import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_CLI = path.join(BACKEND_PATH, 'youtube_upload_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');

// 사용자별 credentials 파일 경로 생성
function getUserCredentialsPath(userId: string): string {
  return path.join(CREDENTIALS_DIR, `youtube_client_secret_${userId}.json`);
}

/**
 * POST /api/youtube/upload - 비디오 업로드
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

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

    if (!videoPath || !title) {
      return NextResponse.json({ error: 'videoPath와 title은 필수입니다' }, { status: 400 });
    }

    const fullVideoPath = path.join(BACKEND_PATH, videoPath);
    if (!fs.existsSync(fullVideoPath)) {
      return NextResponse.json({ error: '비디오 파일을 찾을 수 없습니다' }, { status: 404 });
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

    const tokenPath = path.join(CREDENTIALS_DIR, `youtube_token_${user.userId}.json`);

    // 업로드 실행
    return new Promise((resolve) => {
      const args = [
        YOUTUBE_CLI,
        '--action', 'upload',
        '--credentials', getUserCredentialsPath(user.userId),
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
      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.on('close', () => {
        // 메타데이터 파일 삭제
        try {
          if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
          }
        } catch {}

        try {
          const result = JSON.parse(output.trim());
          if (result.success) {
            resolve(NextResponse.json({
              success: true,
              videoId: result.video_id,
              videoUrl: result.video_url
            }));
          } else {
            resolve(NextResponse.json({ error: result.error || '업로드 실패' }, { status: 500 }));
          }
        } catch {
          resolve(NextResponse.json({ error: '업로드 프로세스 오류' }, { status: 500 }));
        }
      });
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'YouTube 업로드 실패' }, { status: 500 });
  }
}
