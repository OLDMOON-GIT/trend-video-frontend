import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import bcrypt from 'bcryptjs';

/**
 * 비밀번호 변경 API
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword } = await request.json();

    // 유효성 검사
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '새 비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // 사용자 정보 조회
    const userInfo = db.prepare(`
      SELECT password FROM users WHERE id = ?
    `).get(user.userId) as any;

    if (!userInfo) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 현재 비밀번호 확인
    const isPasswordCorrect = await bcrypt.compare(currentPassword, userInfo.password);
    if (!isPasswordCorrect) {
      return NextResponse.json(
        { error: '현재 비밀번호가 일치하지 않습니다.' },
        { status: 400 }
      );
    }

    // 새 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 비밀번호 업데이트
    db.prepare(`
      UPDATE users
      SET password = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(hashedPassword, user.userId);

    console.log('✅ 비밀번호 변경 성공:', user.userId);

    return NextResponse.json({
      success: true,
      message: '비밀번호가 변경되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 비밀번호 변경 오류:', error);
    return NextResponse.json(
      { error: error?.message || '비밀번호 변경 실패' },
      { status: 500 }
    );
  }
}
