import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getUserSocialMediaAccounts } from '@/lib/db';

/**
 * GET /api/social-media/accounts - 사용자의 모든 소셜미디어 계정 조회
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // 모든 플랫폼의 계정 조회
    const allAccounts = getUserSocialMediaAccounts(user.userId);

    // 플랫폼별로 그룹화
    const accounts = {
      tiktok: allAccounts.filter(acc => acc.platform === 'tiktok').map(acc => ({
        id: acc.id,
        accountId: acc.accountId,
        username: acc.username,
        displayName: acc.displayName,
        profilePicture: acc.profilePicture,
        followerCount: acc.followerCount,
        isDefault: acc.isDefault,
        createdAt: acc.createdAt
      })),
      instagram: allAccounts.filter(acc => acc.platform === 'instagram').map(acc => ({
        id: acc.id,
        accountId: acc.accountId,
        username: acc.username,
        displayName: acc.displayName,
        profilePicture: acc.profilePicture,
        followerCount: acc.followerCount,
        isDefault: acc.isDefault,
        createdAt: acc.createdAt
      })),
      facebook: allAccounts.filter(acc => acc.platform === 'facebook').map(acc => ({
        id: acc.id,
        accountId: acc.accountId,
        username: acc.username,
        displayName: acc.displayName,
        profilePicture: acc.profilePicture,
        followerCount: acc.followerCount,
        isDefault: acc.isDefault,
        createdAt: acc.createdAt
      }))
    };

    return NextResponse.json({ success: true, accounts });
  } catch (error: any) {
    console.error('소셜미디어 계정 조회 실패:', error);
    return NextResponse.json({ error: '계정 조회에 실패했습니다' }, { status: 500 });
  }
}
