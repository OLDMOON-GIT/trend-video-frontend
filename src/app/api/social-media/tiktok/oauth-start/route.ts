import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';

// TikTok OAuth 설정 (환경 변수에서 로드)
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
const TIKTOK_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/social-media/tiktok/oauth-callback`
  : 'http://localhost:3000/api/social-media/tiktok/oauth-callback';

/**
 * GET /api/social-media/tiktok/oauth-start - TikTok OAuth 인증 시작
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
      console.error('TikTok OAuth 설정이 없습니다. TIKTOK_CLIENT_KEY와 TIKTOK_CLIENT_SECRET 환경 변수를 설정해주세요.');
      return NextResponse.json({
        error: 'TikTok OAuth 설정이 완료되지 않았습니다. 관리자에게 문의하세요.'
      }, { status: 500 });
    }

    // CSRF 보호를 위한 state 생성
    const state = crypto.randomBytes(32).toString('hex');

    // state를 세션에 저장 (또는 쿠키에 저장)
    const response = NextResponse.json({
      success: true,
      authUrl: buildTikTokAuthUrl(state)
    });

    // state를 쿠키에 저장 (CSRF 검증용)
    response.cookies.set('tiktok_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600 // 10분
    });

    return response;
  } catch (error: any) {
    console.error('TikTok OAuth 시작 실패:', error);
    return NextResponse.json({ error: 'OAuth 인증 시작에 실패했습니다' }, { status: 500 });
  }
}

function buildTikTokAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: 'user.info.basic,video.upload,video.publish', // 필요한 권한
    response_type: 'code',
    redirect_uri: TIKTOK_REDIRECT_URI,
    state: state
  });

  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}
