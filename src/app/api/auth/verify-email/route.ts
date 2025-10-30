import { NextRequest, NextResponse } from 'next/server';
import { verifyEmail } from '@/lib/db';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/auth';

  if (!token) {
    redirectUrl.searchParams.set('verified', 'missing');
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const result = await verifyEmail(token);

    if (!result.success) {
      redirectUrl.searchParams.set('verified', 'invalid');
      return NextResponse.redirect(redirectUrl);
    }

    redirectUrl.searchParams.set('verified', 'true');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('❌ 이메일 인증 처리 중 오류:', error);
    redirectUrl.searchParams.set('verified', 'error');
    return NextResponse.redirect(redirectUrl);
  }
}
