import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { createSocialMediaAccount } from '@/lib/db';

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
const TIKTOK_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/social-media/tiktok/oauth-callback`
  : 'http://localhost:3000/api/social-media/tiktok/oauth-callback';

/**
 * GET /api/social-media/tiktok/oauth-callback - TikTok OAuth 콜백
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
      console.error('TikTok OAuth 에러:', error);
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
    const savedState = request.cookies.get('tiktok_oauth_state')?.value;
    if (!savedState || savedState !== state) {
      console.error('State 불일치:', { savedState, receivedState: state });
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('보안 검증에 실패했습니다'), request.url)
      );
    }

    // Access Token 교환
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: TIKTOK_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('TikTok 토큰 교환 실패:', errorData);
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('토큰 교환에 실패했습니다'), request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, open_id } = tokenData;

    // 사용자 정보 가져오기
    const userInfoResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,follower_count,username', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    if (!userInfoResponse.ok) {
      console.error('TikTok 사용자 정보 조회 실패');
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent('사용자 정보 조회에 실패했습니다'), request.url)
      );
    }

    const userInfo = await userInfoResponse.json();
    const { data: userData } = userInfo;

    // DB에 계정 정보 저장
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    try {
      await createSocialMediaAccount({
        userId: user.userId,
        platform: 'tiktok',
        accountId: open_id,
        username: userData.username || userData.display_name,
        displayName: userData.display_name,
        profilePicture: userData.avatar_url,
        followerCount: userData.follower_count || 0,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: expiresAt
      });

      const response = NextResponse.redirect(
        new URL('/settings?tab=social-media&success=tiktok_connected', request.url)
      );

      // state 쿠키 삭제
      response.cookies.delete('tiktok_oauth_state');

      return response;
    } catch (dbError: any) {
      console.error('TikTok 계정 저장 실패:', dbError);
      return NextResponse.redirect(
        new URL('/settings?tab=social-media&error=' + encodeURIComponent(dbError.message || '계정 저장에 실패했습니다'), request.url)
      );
    }
  } catch (error: any) {
    console.error('TikTok OAuth 콜백 처리 실패:', error);
    return NextResponse.redirect(
      new URL('/settings?tab=social-media&error=' + encodeURIComponent('인증 처리에 실패했습니다'), request.url)
    );
  }
}
