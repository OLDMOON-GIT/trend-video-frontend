import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getUserYouTubeChannels, addYouTubeChannel, deleteYouTubeChannel, setDefaultYouTubeChannel } from '@/lib/db';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_CLI = path.join(BACKEND_PATH, 'youtube_upload_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');

function getChannelTokenPath(userId: string, channelId: string): string {
  return path.join(CREDENTIALS_DIR, `youtube_token_${userId}_${channelId}.json`);
}

/**
 * GET /api/youtube/channels - 사용자의 연결된 YouTube 채널 목록 조회
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const channels = await getUserYouTubeChannels(user.userId);
    const hasCredentials = fs.existsSync(COMMON_CREDENTIALS_PATH);

    return NextResponse.json({
      channels,
      hasCredentials
    });

  } catch (error: any) {
    console.error('YouTube 채널 목록 조회 실패:', error);
    return NextResponse.json({ error: '채널 목록 조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/youtube/channels - 새 YouTube 채널 연결
 */
/**
 * POST /api/youtube/channels - OAuth 플로우 시작 (사용하지 않음)
 * 이제 프론트엔드에서 /api/youtube/oauth-start를 사용합니다
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ 
    error: "이 엔드포인트는 더 이상 사용되지 않습니다. /api/youtube/oauth-start를 사용하세요." 
  }, { status: 410 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId가 필요합니다' }, { status: 400 });
    }

    // 채널 정보 가져오기
    const channels = await getUserYouTubeChannels(user.userId);
    const channel = channels.find(ch => ch.id === channelId);

    if (!channel) {
      return NextResponse.json({ error: '채널을 찾을 수 없습니다' }, { status: 404 });
    }

    // 토큰 파일 삭제
    const tokenPath = path.join(CREDENTIALS_DIR, channel.tokenFile);
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }

    // DB에서 채널 삭제
    await deleteYouTubeChannel(channelId);

    return NextResponse.json({ success: true, message: 'YouTube 채널 연결 해제 완료' });

  } catch (error: any) {
    console.error('YouTube 채널 연결 해제 실패:', error);
    return NextResponse.json({ error: 'YouTube 채널 연결 해제 실패' }, { status: 500 });
  }
}

/**
 * PATCH /api/youtube/channels/:channelId/default - 기본 채널 설정
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId가 필요합니다' }, { status: 400 });
    }

    const success = await setDefaultYouTubeChannel(user.userId, channelId);

    if (!success) {
      return NextResponse.json({ error: '채널을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: '기본 채널로 설정되었습니다' });

  } catch (error: any) {
    console.error('기본 채널 설정 실패:', error);
    return NextResponse.json({ error: '기본 채널 설정 실패' }, { status: 500 });
  }
}
