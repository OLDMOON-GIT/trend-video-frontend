import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, hashPassword, createUserSession, addUserActivityLog } from '@/lib/db';
import { createSession, setSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { email, password, rememberMe } = await request.json();

    // IP 주소 및 User Agent 추출
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // 유효성 검사
    if (!email || !password) {
      return NextResponse.json(
        { error: '이메일과 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 사용자 찾기
    const user = await findUserByEmail(email);

    if (!user) {
      return NextResponse.json(
        { error: '이메일 또는 비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    // 비밀번호 확인
    const hashedPassword = hashPassword(password);
    if (user.password !== hashedPassword) {
      return NextResponse.json(
        { error: '이메일 또는 비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    // 이메일 인증 확인
    if (!user.emailVerified) {
      return NextResponse.json(
        { error: '이메일 인증이 필요합니다. 가입 시 받은 인증 메일을 확인해주세요.' },
        { status: 403 }
      );
    }

    // 세션 생성 (기존 세션 시스템)
    const sessionId = await createSession(user.id, user.email, user.isAdmin, rememberMe);
    console.log('✅ 로그인 성공 - 세션 ID:', sessionId, '사용자:', user.email, '관리자:', user.isAdmin);

    // 사용자 세션 생성 (활동 추적용)
    await createUserSession(user.id, user.email, ipAddress, userAgent);

    // 활동 로그 기록
    await addUserActivityLog(
      user.id,
      user.email,
      'login',
      `로그인 성공 (RememberMe: ${rememberMe ? 'Yes' : 'No'})`,
      ipAddress,
      userAgent
    );

    // 응답 생성 (세션 ID 포함)
    const response = NextResponse.json({
      success: true,
      sessionId: sessionId, // 세션 ID를 응답에 포함
      user: {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });

    // 세션 쿠키도 설정 (호환성)
    setSessionCookie(response, sessionId);
    console.log('✅ 세션 쿠키 설정 완료, 세션 ID도 응답에 포함');

    return response;

  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: '로그인 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
