import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getYouTubeChannelById, getDefaultYouTubeChannel } from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_CLI = path.join(BACKEND_PATH, 'youtube_upload_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');

const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');
function getUserTokenPath(userId: string): string {
  return path.join(CREDENTIALS_DIR, `youtube_token_${userId}.json`);
}

/**
 * POST /api/youtube/upload - 비디오 업로드
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
      publishAt,
      channelId // 업로드할 YouTube 채널 ID (선택사항, 없으면 기본 채널 사용)
    } = body;

    if (!videoPath || !title) {
      return NextResponse.json({ error: 'videoPath와 title은 필수입니다' }, { status: 400 });
    }

    // 사용할 채널 결정
    let selectedChannel;
    if (channelId) {
      // 특정 채널 ID가 제공된 경우
      selectedChannel = await getYouTubeChannelById(channelId);
      if (!selectedChannel || selectedChannel.userId !== user.userId) {
        return NextResponse.json({ error: '유효하지 않은 채널입니다' }, { status: 403 });
      }
    } else {
      // channelId가 없으면 기본 채널 사용
      selectedChannel = await getDefaultYouTubeChannel(user.userId);
      if (!selectedChannel) {
        return NextResponse.json({ error: 'YouTube 채널이 연결되지 않았습니다' }, { status: 400 });
      }
    }

    // videoPath가 절대 경로인지 확인
    const fullVideoPath = path.isAbsolute(videoPath) ? videoPath : path.join(BACKEND_PATH, videoPath);

    console.log('📹 비디오 경로 확인:', { videoPath, fullVideoPath, exists: fs.existsSync(fullVideoPath) });

    if (!fs.existsSync(fullVideoPath)) {
      console.error('❌ 비디오 파일을 찾을 수 없음:', fullVideoPath);
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

    // 업로드 실행
    return new Promise((resolve) => {
      const credentialsPath = COMMON_CREDENTIALS_PATH;
      const tokenPath = path.join(CREDENTIALS_DIR, selectedChannel.tokenFile);

      const args = [
        YOUTUBE_CLI,
        '--action', 'upload',
        '--credentials', credentialsPath,
        '--token', tokenPath,
        '--video', fullVideoPath,
        '--metadata', metadataPath
      ];

      if (thumbnailPath) {
        const fullThumbnailPath = path.isAbsolute(thumbnailPath) ? thumbnailPath : path.join(BACKEND_PATH, thumbnailPath);
        console.log('🖼️ 썸네일 경로 확인:', { thumbnailPath, fullThumbnailPath, exists: fs.existsSync(fullThumbnailPath) });
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
