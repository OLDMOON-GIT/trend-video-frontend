import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { findUserById, updateUser } from '@/lib/db';

/**
 * 사용자 설정 API
 *
 * GET: 설정 조회
 * PUT: 설정 업데이트
 */

// 설정 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const profile = await findUserById(user.userId);
    const userInfo = db.prepare(`
      SELECT google_sites_url, nickname FROM users WHERE id = ?
    `).get(user.userId) as any;

    return NextResponse.json({
      userId: user.userId,
      googleSitesUrl: userInfo?.google_sites_url || '',
      nickname: userInfo?.nickname || profile?.nickname || ''
    });

  } catch (error: any) {
    console.error('❌ 설정 조회 오류:', error);
    return NextResponse.json(
      { error: error?.message || '설정 조회 실패' },
      { status: 500 }
    );
  }
}

// 설정 업데이트
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { googleSitesUrl, nickname } = body;

    // URL 유효성 검증 (선택사항)
    if (googleSitesUrl && !googleSitesUrl.includes('sites.google.com')) {
      return NextResponse.json(
        { error: '올바른 Google Sites URL을 입력해주세요.' },
        { status: 400 }
      );
    }

    const trimmedNickname = nickname?.trim() || '';

    if (trimmedNickname.length > 30) {
      return NextResponse.json(
        { error: '별명은 30자 이하로 입력해주세요.' },
        { status: 400 }
      );
    }

    if (nickname !== undefined) {
      await updateUser(user.userId, { nickname: trimmedNickname || undefined });
    }

    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `).run(user.userId, user.email);

    db.prepare(`
      UPDATE users
      SET google_sites_url = ?,
          nickname = COALESCE(?, nickname),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(googleSitesUrl || null, (nickname !== undefined ? (trimmedNickname || null) : null), user.userId);

    console.log('✅ 사용자 설정 업데이트 완료:', user.userId);

    return NextResponse.json({
      success: true,
      message: '설정이 저장되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 설정 업데이트 오류:', error);
    return NextResponse.json(
      { error: error?.message || '설정 업데이트 실패' },
      { status: 500 }
    );
  }
}
