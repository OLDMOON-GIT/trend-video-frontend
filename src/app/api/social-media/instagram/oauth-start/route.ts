import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';

// Instagram Graph API OAuth 설정 (Facebook App 사용)
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
const INSTAGRAM_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/social-media/instagram/oauth-callback`
  : 'http://localhost:3000/api/social-media/instagram/oauth-callback';

/**
 * GET /api/social-media/instagram/oauth-start - Instagram OAuth 인증 시작
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
      console.error('Instagram OAuth 설정이 없습니다. INSTAGRAM_APP_ID와 INSTAGRAM_APP_SECRET 환경 변수를 설정해주세요.');
      return NextResponse.json({
        error: 'Instagram OAuth 설정이 완료되지 않았습니다. 관리자에게 문의하세요.'
      }, { status: 500 });
    }

    // CSRF 보호를 위한 state 생성
    const state = crypto.randomBytes(32).toString('hex');

    const response = NextResponse.json({
      success: true,
      authUrl: buildInstagramAuthUrl(state)
    });

    // state를 쿠키에 저장 (CSRF 검증용)
    response.cookies.set('instagram_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600 // 10분
    });

    return response;
  } catch (error: any) {
    console.error('Instagram OAuth 시작 실패:', error);
    return NextResponse.json({ error: 'OAuth 인증 시작에 실패했습니다' }, { status: 500 });
  }
}

function buildInstagramAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    scope: 'instagram_basic,instagram_content_publish', // 필요한 권한
    response_type: 'code',
    state: state
  });

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
}
