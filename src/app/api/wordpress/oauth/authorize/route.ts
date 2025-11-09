import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

/**
 * WordPress.com OAuth 인증 시작
 *
 * 사용자를 WordPress.com 인증 페이지로 리다이렉트
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // WordPress.com OAuth 설정
    const clientId = process.env.WORDPRESS_OAUTH_CLIENT_ID;
    const redirectUri = process.env.WORDPRESS_OAUTH_REDIRECT_URI ||
                        `${process.env.NEXT_PUBLIC_BASE_URL}/api/wordpress/oauth/callback`;

    if (!clientId) {
      return NextResponse.json(
        { error: 'WordPress OAuth가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // State 파라미터 생성 (CSRF 방지)
    const state = Buffer.from(JSON.stringify({
      userId: user.userId,
      timestamp: Date.now()
    })).toString('base64');

    // WordPress.com 인증 URL 생성
    const authUrl = new URL('https://public-api.wordpress.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'posts'); // 포스트 작성 권한
    authUrl.searchParams.set('state', state);

    console.log('🔐 WordPress OAuth 인증 시작:', {
      userId: user.userId,
      redirectUri
    });

    // WordPress.com 인증 페이지로 리다이렉트
    return NextResponse.redirect(authUrl.toString());

  } catch (error: any) {
    console.error('❌ OAuth 인증 시작 오류:', error);
    return NextResponse.json(
      { error: error?.message || 'OAuth 인증 시작 실패' },
      { status: 500 }
    );
  }
}
