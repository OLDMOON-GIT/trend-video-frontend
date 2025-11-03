import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs';
import path from 'path';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');

/**
 * GET /api/youtube/oauth-start - YouTube OAuth 시작 URL 생성
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    if (!fs.existsSync(COMMON_CREDENTIALS_PATH)) {
      return NextResponse.json({
        error: 'YouTube API credentials가 설정되지 않았습니다',
        details: '관리자에게 문의하여 공통 Credentials를 설정해야 합니다.'
      }, { status: 500 });
    }

    // credentials 파일 읽기
    const credentialsContent = fs.readFileSync(COMMON_CREDENTIALS_PATH, 'utf-8');
    const credentials = JSON.parse(credentialsContent);
    const { client_id, redirect_uris } = credentials.installed || credentials.web;

    // 현재 호스트 감지
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'http'; // iptime.org도 http

    // 리다이렉트 URI 설정
    const redirectUri = `${protocol}://${host}/api/youtube/oauth-callback`;

    // OAuth URL 생성
    const scope = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ].join(' ');

    const state = Math.random().toString(36).substring(7);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', client_id);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');

    console.log('[OAuth Start] Generated OAuth URL:', {
      redirectUri,
      state,
      userId: user.userId
    });

    return NextResponse.json({
      success: true,
      authUrl: authUrl.toString(),
      userId: user.userId,
      state
    });

  } catch (error: any) {
    console.error('[OAuth Start] Error:', error);
    return NextResponse.json({ error: 'OAuth URL 생성 실패: ' + error.message }, { status: 500 });
  }
}
