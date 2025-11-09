import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { deleteSocialMediaAccount, getSocialMediaAccountById } from '@/lib/db';

/**
 * DELETE /api/social-media/instagram/accounts?accountId=xxx - Instagram 계정 연결 해제
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId가 필요합니다' }, { status: 400 });
    }

    // 계정 소유권 확인
    const account = getSocialMediaAccountById(accountId);
    if (!account) {
      return NextResponse.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });
    }

    if (account.userId !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    if (account.platform !== 'instagram') {
      return NextResponse.json({ error: '잘못된 플랫폼입니다' }, { status: 400 });
    }

    // 계정 삭제
    const success = deleteSocialMediaAccount(accountId);

    if (success) {
      return NextResponse.json({ success: true, message: 'Instagram 계정 연결이 해제되었습니다' });
    } else {
      return NextResponse.json({ error: '계정 삭제에 실패했습니다' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Instagram 계정 삭제 실패:', error);
    return NextResponse.json({ error: '계정 삭제에 실패했습니다' }, { status: 500 });
  }
}
