import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { createSocialMediaAccount } from '@/lib/db';

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
const INSTAGRAM_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/social-media/instagram/oauth-callback`
  : 'http://localhost:3000/api/social-media/instagram/oauth-callback';

/**
 * GET /api/social-media/instagram/oauth-callback - Instagram OAuth 콜백
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
      console.error('Instagram OAuth 에러:', error);
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
    const savedState = request.cookies.get('instagram_oauth_state')?.value;
    if (!savedState || savedState !== state) {
      console.error('State 불일치:', { savedState, receivedState: state });
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('보안 검증에 실패했습니다'), request.url)
      );
    }

    // Access Token 교환
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: INSTAGRAM_APP_ID,
        client_secret: INSTAGRAM_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        code: code
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('Instagram 토큰 교환 실패:', errorData);
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('토큰 교환에 실패했습니다'), request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, user_id } = tokenData;

    // Long-lived token으로 교환
    const longLivedTokenResponse = await fetch(
      `https://graph.instagram.com/access_token?` +
      `grant_type=ig_exchange_token&` +
      `client_secret=${INSTAGRAM_APP_SECRET}&` +
      `access_token=${access_token}`
    );

    let finalAccessToken = access_token;
    let expiresIn = 3600; // 기본 1시간

    if (longLivedTokenResponse.ok) {
      const longLivedData = await longLivedTokenResponse.json();
      finalAccessToken = longLivedData.access_token;
      expiresIn = longLivedData.expires_in || 5184000; // 60일
    }

    // 사용자 정보 가져오기
    const userInfoResponse = await fetch(
      `https://graph.instagram.com/${user_id}?fields=id,username,account_type,media_count&access_token=${finalAccessToken}`
    );

    if (!userInfoResponse.ok) {
      console.error('Instagram 사용자 정보 조회 실패');
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('사용자 정보 조회에 실패했습니다'), request.url)
      );
    }

    const userInfo = await userInfoResponse.json();

    // DB에 계정 정보 저장
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    try {
      await createSocialMediaAccount({
        userId: user.userId,
        platform: 'instagram',
        accountId: userInfo.id,
        username: userInfo.username,
        displayName: userInfo.username,
        accessToken: finalAccessToken,
        tokenExpiresAt: expiresAt
      });

      const response = NextResponse.redirect(
        new URL('/settings?tab=social-media&success=instagram_connected', request.url)
      );

      // state 쿠키 삭제
      response.cookies.delete('instagram_oauth_state');

      return response;
    } catch (dbError: any) {
      console.error('Instagram 계정 저장 실패:', dbError);
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent(dbError.message || '계정 저장에 실패했습니다'), request.url)
      );
    }
  } catch (error: any) {
    console.error('Instagram OAuth 콜백 처리 실패:', error);
    return NextResponse.redirect(
      new URL('/settings?tab=social-media&error=' + encodeURIComponent('인증 처리에 실패했습니다'), request.url)
    );
  }
}
