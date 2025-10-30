import { NextRequest, NextResponse } from 'next/server';
import { createUser, deleteUserById } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email';
import { createSession, setSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, phone, address, kakaoId, rememberMe } = await request.json();

    // 기본 필수값 검증
    if (!email || !password || !name || !phone || !address) {
      return NextResponse.json(
        { error: '이메일, 비밀번호, 이름, 휴대폰 번호, 주소는 필수입니다.' },
        { status: 400 }
      );
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '올바른 이메일 형식이 아닙니다.' },
        { status: 400 }
      );
    }

    // 비밀번호 길이 검증
    if (password.length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // 휴대폰 번호 형식 검증 (숫자만 사용)
    const phoneRegex = /^01[0-9]{8,9}$/;
    if (!phoneRegex.test(phone.replace(/-/g, ''))) {
      return NextResponse.json(
        { error: '올바른 휴대폰 번호 형식이 아닙니다. (예: 01012345678)' },
        { status: 400 }
      );
    }

    // 사용자 생성
    const user = await createUser(email, password, name, phone, address, kakaoId);

    // 일반 사용자: 이메일 인증 메일 발송 후 로그인 보류
    if (!user.emailVerified && user.emailVerificationToken) {
      try {
        await sendVerificationEmail(user.email, user.emailVerificationToken);
        console.log('✅ 회원가입 완료 - 인증 메일 발송:', user.email);
      } catch (emailError) {
        console.error('❌ 이메일 인증 메일 발송 실패:', emailError);
        await deleteUserById(user.id);
        return NextResponse.json(
          { error: '이메일 인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        requiresVerification: true
      });
    }

    // 관리자 계정은 즉시 로그인 처리
    const sessionId = await createSession(user.id, user.email, user.isAdmin, rememberMe);
    console.log('✅ 회원가입 완료 - 관리자 계정으로 즉시 로그인:', user.email);

    const response = NextResponse.json({
      success: true,
      sessionId,
      user: {
        id: user.id,
        email: user.email
      }
    });

    setSessionCookie(response, sessionId);

    return response;

  } catch (error: any) {
    console.error('Signup error:', error);

    if (error.message === '이미 존재하는 이메일입니다.') {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: '회원가입 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
