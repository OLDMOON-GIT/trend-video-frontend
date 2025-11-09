import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';

// Facebook OAuth 설정
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const FACEBOOK_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/social-media/facebook/oauth-callback`
  : 'http://localhost:3000/api/social-media/facebook/oauth-callback';

/**
 * GET /api/social-media/facebook/oauth-start - Facebook OAuth 인증 시작
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      console.error('Facebook OAuth 설정이 없습니다. FACEBOOK_APP_ID와 FACEBOOK_APP_SECRET 환경 변수를 설정해주세요.');
      return NextResponse.json({
        error: 'Facebook OAuth 설정이 완료되지 않았습니다. 관리자에게 문의하세요.'
      }, { status: 500 });
    }

    // CSRF 보호를 위한 state 생성
    const state = crypto.randomBytes(32).toString('hex');

    const response = NextResponse.json({
      success: true,
      authUrl: buildFacebookAuthUrl(state)
    });

    // state를 쿠키에 저장 (CSRF 검증용)
    response.cookies.set('facebook_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600 // 10분
    });

    return response;
  } catch (error: any) {
    console.error('Facebook OAuth 시작 실패:', error);
    return NextResponse.json({ error: 'OAuth 인증 시작에 실패했습니다' }, { status: 500 });
  }
}

function buildFacebookAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    scope: 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,publish_video', // 필요한 권한
    response_type: 'code',
    state: state
  });

  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
}
