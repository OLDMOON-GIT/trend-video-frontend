import { NextRequest, NextResponse } from 'next/server';
import {
  getAllUserActivityLogs,
  getUserActivityLogsByUserId,
  getAllActiveSessions,
  getSessionsByUserId,
  getUserSessionStats,
  getUsers
} from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

// 관리자 활동 로그 및 세션 조회 API
export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 관리자 권한 확인
    if (!user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'logs', 'sessions', 'stats', 'user-logs', 'user-sessions'
    const userId = searchParams.get('userId');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    if (type === 'logs') {
      // 전체 활동 로그 조회
      const logs = await getAllUserActivityLogs(limit);
      return NextResponse.json({ logs });
    }

    if (type === 'sessions') {
      // 전체 활성 세션 조회
      const sessions = await getAllActiveSessions();
      return NextResponse.json({ sessions });
    }

    if (type === 'user-logs' && userId) {
      // 특정 사용자 활동 로그 조회
      const logs = await getUserActivityLogsByUserId(userId, limit);
      return NextResponse.json({ logs });
    }

    if (type === 'user-sessions' && userId) {
      // 특정 사용자 세션 조회
      const sessions = await getSessionsByUserId(userId);
      return NextResponse.json({ sessions });
    }

    if (type === 'user-stats' && userId) {
      // 특정 사용자 세션 통계 조회
      const stats = await getUserSessionStats(userId);
      return NextResponse.json({ stats });
    }

    if (type === 'dashboard') {
      // 대시보드용 통합 데이터
      const [logs, sessions, users] = await Promise.all([
        getAllUserActivityLogs(100), // 최근 100개
        getAllActiveSessions(),
        getUsers()
      ]);

      // 사용자별 통계
      const userStats = await Promise.all(
        users.map(async (user) => {
          const stats = await getUserSessionStats(user.id);
          const recentLogs = await getUserActivityLogsByUserId(user.id, 10);
          return {
            userId: user.id,
            userEmail: user.email,
            userName: user.name,
            ...stats,
            recentLogs
          };
        })
      );

      return NextResponse.json({
        recentLogs: logs,
        activeSessions: sessions,
        userStats
      });
    }

    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  } catch (error: any) {
    console.error('Error fetching user logs:', error);
    return NextResponse.json(
      { error: error.message || '로그 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
