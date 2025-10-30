import { NextRequest, NextResponse } from 'next/server';
import { getUsers } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // 검색어 파라미터
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase() || '';

    // 모든 사용자 가져오기
    const allUsers = await getUsers();

    // 검색어가 있으면 필터링 (undefined 체크)
    const filteredUsers = query
      ? allUsers.filter(u => {
          const name = (u.name || '').toLowerCase();
          const email = (u.email || '').toLowerCase();
          return name.includes(query) || email.includes(query);
        })
      : allUsers;

    // 비밀번호 제거하고 반환
    const safeUsers = filteredUsers.map(({ password, ...user }) => ({
      ...user,
      createdAt: new Date(user.createdAt).toLocaleString('ko-KR')
    }));

    return NextResponse.json({ users: safeUsers });

  } catch (error: any) {
    console.error('Users fetch error:', error);
    return NextResponse.json(
      { error: '사용자 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
