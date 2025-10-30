import { NextRequest, NextResponse } from 'next/server';
import { getSessionIdFromRequest, deleteSession, deleteSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const sessionId = getSessionIdFromRequest(request);

    if (sessionId) {
      deleteSession(sessionId);
    }

    const response = NextResponse.json({ success: true });
    deleteSessionCookie(response);

    return response;

  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: '로그아웃 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
