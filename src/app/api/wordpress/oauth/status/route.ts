import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

/**
 * WordPress.com OAuth 연결 상태 확인
 *
 * 현재 사용자의 OAuth 토큰 존재 여부 반환
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

    // OAuth 토큰 조회
    const oauthData = db.prepare(`
      SELECT blog_id, blog_url, created_at
      FROM wordpress_oauth_tokens
      WHERE user_id = ?
    `).get(user.userId) as any;

    if (oauthData) {
      return NextResponse.json({
        connected: true,
        blogId: oauthData.blog_id,
        blogUrl: oauthData.blog_url,
        connectedAt: oauthData.created_at
      });
    } else {
      return NextResponse.json({
        connected: false
      });
    }

  } catch (error: any) {
    console.error('❌ OAuth 상태 확인 오류:', error);
    return NextResponse.json(
      { error: error?.message || 'OAuth 상태 확인 실패' },
      { status: 500 }
    );
  }
}

/**
 * WordPress.com OAuth 연결 해제
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // OAuth 토큰 삭제
    db.prepare(`
      DELETE FROM wordpress_oauth_tokens
      WHERE user_id = ?
    `).run(user.userId);

    console.log('✅ OAuth 연결 해제:', { userId: user.userId });

    return NextResponse.json({
      success: true,
      message: 'WordPress.com 연결이 해제되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ OAuth 연결 해제 오류:', error);
    return NextResponse.json(
      { error: error?.message || 'OAuth 연결 해제 실패' },
      { status: 500 }
    );
  }
}
