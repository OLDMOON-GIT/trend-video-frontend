import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { createSocialMediaAccount } from '@/lib/db';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const FACEBOOK_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/social-media/facebook/oauth-callback`
  : 'http://localhost:3000/api/social-media/facebook/oauth-callback';

/**
 * GET /api/social-media/facebook/oauth-callback - Facebook OAuth 콜백
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.redirect(new URL('/auth?error=login_required', request.url));
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // 에러 처리
    if (error) {
      console.error('Facebook OAuth 에러:', error);
      return NextResponse.redirect(
        new URL(`/settings?tab=social-media&error=${encodeURIComponent('인증이 취소되었거나 실패했습니다')}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('잘못된 OAuth 응답입니다'), request.url)
      );
    }

    // CSRF 검증
    const savedState = request.cookies.get('facebook_oauth_state')?.value;
    if (!savedState || savedState !== state) {
      console.error('State 불일치:', { savedState, receivedState: state });
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('보안 검증에 실패했습니다'), request.url)
      );
    }

    // Access Token 교환
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `client_id=${FACEBOOK_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}&` +
      `client_secret=${FACEBOOK_APP_SECRET}&` +
      `code=${code}`;

    const tokenResponse = await fetch(tokenUrl);

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('Facebook 토큰 교환 실패:', errorData);
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('토큰 교환에 실패했습니다'), request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, expires_in } = tokenData;

    // Long-lived token으로 교환
    const longLivedUrl = `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${FACEBOOK_APP_ID}&` +
      `client_secret=${FACEBOOK_APP_SECRET}&` +
      `fb_exchange_token=${access_token}`;

    const longLivedResponse = await fetch(longLivedUrl);

    let finalAccessToken = access_token;
    let finalExpiresIn = expires_in || 3600;

    if (longLivedResponse.ok) {
      const longLivedData = await longLivedResponse.json();
      finalAccessToken = longLivedData.access_token;
      finalExpiresIn = longLivedData.expires_in || 5184000; // 60일
    }

    // 사용자 정보 가져오기
    const userInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name,picture&access_token=${finalAccessToken}`
    );

    if (!userInfoResponse.ok) {
      console.error('Facebook 사용자 정보 조회 실패');
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('사용자 정보 조회에 실패했습니다'), request.url)
      );
    }

    const userInfo = await userInfoResponse.json();

    // DB에 계정 정보 저장
    const expiresAt = new Date(Date.now() + finalExpiresIn * 1000).toISOString();

    try {
      await createSocialMediaAccount({
        userId: user.userId,
        platform: 'facebook',
        accountId: userInfo.id,
        username: userInfo.name,
        displayName: userInfo.name,
        profilePicture: userInfo.picture?.data?.url,
        accessToken: finalAccessToken,
        tokenExpiresAt: expiresAt
      });

      const response = NextResponse.redirect(
        new URL('/settings?tab=social-media&success=facebook_connected', request.url)
      );

      // state 쿠키 삭제
      response.cookies.delete('facebook_oauth_state');

      return response;
    } catch (dbError: any) {
      console.error('Facebook 계정 저장 실패:', dbError);
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent(dbError.message || '계정 저장에 실패했습니다'), request.url)
      );
    }
  } catch (error: any) {
    console.error('Facebook OAuth 콜백 처리 실패:', error);
    return NextResponse.redirect(
      new URL('/settings?tab=social-media&error=' + encodeURIComponent('인증 처리에 실패했습니다'), request.url)
    );
  }
}
