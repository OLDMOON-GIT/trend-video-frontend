import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

/**
 * WordPress.com OAuth 콜백 처리
 *
 * 인증 코드를 받아 액세스 토큰으로 교환하고 저장
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // 에러 응답 처리
    if (error) {
      console.error('❌ OAuth 인증 실패:', error);
      return NextResponse.redirect(
        new URL(`/wordpress?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: '인증 코드 또는 state가 없습니다.' },
        { status: 400 }
      );
    }

    // State 검증 (CSRF 방지)
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      return NextResponse.json(
        { error: '잘못된 state 파라미터입니다.' },
        { status: 400 }
      );
    }

    // State 타임스탬프 검증 (10분 이내)
    const now = Date.now();
    if (now - stateData.timestamp > 10 * 60 * 1000) {
      return NextResponse.json(
        { error: '인증 요청이 만료되었습니다. 다시 시도해주세요.' },
        { status: 400 }
      );
    }

    // 현재 사용자 확인
    const user = await getCurrentUser(request);
    if (!user || user.userId !== stateData.userId) {
      return NextResponse.json(
        { error: '사용자 정보가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    // WordPress.com OAuth 설정
    const clientId = process.env.WORDPRESS_OAUTH_CLIENT_ID;
    const clientSecret = process.env.WORDPRESS_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.WORDPRESS_OAUTH_REDIRECT_URI ||
                        `${process.env.NEXT_PUBLIC_BASE_URL}/api/wordpress/oauth/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'WordPress OAuth가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    console.log('🔄 액세스 토큰 교환 시작:', { userId: user.userId });

    // 액세스 토큰 교환
    const tokenResponse = await fetch('https://public-api.wordpress.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('❌ 토큰 교환 실패:', errorData);
      return NextResponse.json(
        { error: '액세스 토큰 교환 실패' },
        { status: 500 }
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, blog_id, blog_url } = tokenData;

    console.log('✅ 액세스 토큰 획득:', {
      userId: user.userId,
      blogId: blog_id,
      blogUrl: blog_url
    });

    // 데이터베이스에 OAuth 토큰 저장
    try {
      db.prepare(`
        INSERT INTO wordpress_oauth_tokens (
          user_id,
          access_token,
          blog_id,
          blog_url,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          access_token = excluded.access_token,
          blog_id = excluded.blog_id,
          blog_url = excluded.blog_url,
          updated_at = datetime('now')
      `).run(user.userId, access_token, blog_id, blog_url);

      console.log('✅ OAuth 토큰 저장 완료:', { userId: user.userId });
    } catch (dbError: any) {
      console.error('❌ DB 저장 실패:', dbError);
      return NextResponse.json(
        { error: 'OAuth 토큰 저장 실패' },
        { status: 500 }
      );
    }

    // 워드프레스 페이지로 리다이렉트 (성공 메시지 포함)
    return NextResponse.redirect(
      new URL('/wordpress?oauth=success', request.url)
    );

  } catch (error: any) {
    console.error('❌ OAuth 콜백 처리 오류:', error);
    return NextResponse.json(
      { error: error?.message || 'OAuth 콜백 처리 실패' },
      { status: 500 }
    );
  }
}
