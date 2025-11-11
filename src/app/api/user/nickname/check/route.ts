import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

/**
 * 닉네임 중복 체크 API
 * GET /api/user/nickname/check?nickname=xxx
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

    const { searchParams } = new URL(request.url);
    const nickname = searchParams.get('nickname');

    if (!nickname || !nickname.trim()) {
      return NextResponse.json(
        { error: '닉네임을 입력해주세요.' },
        { status: 400 }
      );
    }

    const trimmedNickname = nickname.trim();

    // 닉네임 길이 검증
    if (trimmedNickname.length < 2) {
      return NextResponse.json({
        available: false,
        message: '닉네임은 최소 2자 이상이어야 합니다.'
      });
    }

    if (trimmedNickname.length > 30) {
      return NextResponse.json({
        available: false,
        message: '닉네임은 최대 30자까지 가능합니다.'
      });
    }

    // 특수문자 검증 (한글, 영문, 숫자만 허용)
    const validPattern = /^[가-힣a-zA-Z0-9_\s]+$/;
    if (!validPattern.test(trimmedNickname)) {
      return NextResponse.json({
        available: false,
        message: '닉네임은 한글, 영문, 숫자, 언더스코어(_), 공백만 사용 가능합니다.'
      });
    }

    // 중복 체크 (자기 자신 제외)
    const existingUser = db.prepare(`
      SELECT id FROM users
      WHERE nickname = ? AND id != ?
    `).get(trimmedNickname, user.userId) as any;

    if (existingUser) {
      return NextResponse.json({
        available: false,
        message: '이미 사용 중인 닉네임입니다.'
      });
    }

    return NextResponse.json({
      available: true,
      message: '사용 가능한 닉네임입니다.'
    });

  } catch (error: any) {
    console.error('❌ 닉네임 중복 체크 오류:', error);
    return NextResponse.json(
      { error: error?.message || '닉네임 중복 체크 실패' },
      { status: 500 }
    );
  }
}
