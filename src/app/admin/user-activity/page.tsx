'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UserActivityLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

interface UserSession {
  id: string;
  userId: string;
  userEmail: string;
  loginAt: string;
  lastActivityAt: string;
  logoutAt?: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
}

interface UserStats {
  userId: string;
  userEmail: string;
  userName: string;
  totalSessions: number;
  totalActiveTime: number;
  averageSessionTime: number;
  lastLoginAt?: string;
}

export default function UserActivityPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [tab, setTab] = useState<'logs' | 'sessions' | 'stats'>('logs');
  const [logs, setLogs] = useState<UserActivityLog[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [userStats, setUserStats] = useState<UserStats[]>([]);

  // localStorage에서 세션 ID 가져오기
  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  const getAuthHeaders = (): HeadersInit => {
    return {}; // 빈 객체 반환 (쿠키가 자동으로 전송됨)
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, tab]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (!data.user || !data.user.isAdmin) {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
        return;
      }

      setUser(data.user);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    } finally {
      setIsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      if (tab === 'logs') {
        const response = await fetch('/api/admin/user-logs?type=logs&limit=100', {
          headers: getAuthHeaders(),
          credentials: 'include'
        });
        const data = await response.json();
        setLogs(data.logs || []);
      } else if (tab === 'sessions') {
        const response = await fetch('/api/admin/user-logs?type=sessions', {
          headers: getAuthHeaders(),
          credentials: 'include'
        });
        const data = await response.json();
        setSessions(data.sessions || []);
      } else if (tab === 'stats') {
        const response = await fetch('/api/admin/user-logs?type=dashboard', {
          headers: getAuthHeaders(),
          credentials: 'include'
        });
        const data = await response.json();
        setUserStats(data.userStats || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds}초`;
    } else {
      return `${seconds}초`;
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'login':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'logout':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'generate_video':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'search_youtube':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
{/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white">📊 사용자 활동 로그</h1>
            {user && <p className="mt-2 text-sm text-slate-400">{user.email}</p>}
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
          >
            ← 관리자 대시보드
          </Link>
        </div>

        {/* 탭 메뉴 */}
        <div className="mb-6 flex gap-2 rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur">
          <button
            onClick={() => setTab('logs')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'logs'
                ? 'bg-blue-500 text-white'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            📋 활동 로그
          </button>
          <button
            onClick={() => setTab('sessions')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'sessions'
                ? 'bg-blue-500 text-white'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            🔐 활성 세션
          </button>
          <button
            onClick={() => setTab('stats')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'stats'
                ? 'bg-blue-500 text-white'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            📈 사용자 통계
          </button>
        </div>

        {/* 활동 로그 탭 */}
        {tab === 'logs' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">최근 활동 로그 (최대 100개)</h2>
            <div className="space-y-3">
              {logs.length === 0 ? (
                <p className="text-center text-slate-400 py-8">활동 로그가 없습니다.</p>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getActionBadgeColor(log.action)}`}>
                            {log.action}
                          </span>
                          <span className="text-sm font-semibold text-white">
                            {log.userEmail}
                          </span>
                        </div>
                        {log.details && (
                          <p className="text-sm text-slate-300 mb-2">{log.details}</p>
                        )}
                        <div className="flex gap-4 text-xs text-slate-400">
                          <span>🕐 {formatDateTime(log.createdAt)}</span>
                          {log.ipAddress && <span>📍 {log.ipAddress}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 활성 세션 탭 */}
        {tab === 'sessions' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">
              현재 활성 세션 ({sessions.length}개)
            </h2>
            <div className="space-y-3">
              {sessions.length === 0 ? (
                <p className="text-center text-slate-400 py-8">활성 세션이 없습니다.</p>
              ) : (
                sessions.map((session) => {
                  const duration = new Date().getTime() - new Date(session.loginAt).getTime();
                  return (
                    <div
                      key={session.id}
                      className="rounded-lg border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-400"></span>
                            <span className="text-sm font-semibold text-white">
                              {session.userEmail}
                            </span>
                          </div>
                          <div className="space-y-1 text-xs text-slate-400">
                            <p>🕐 로그인: {formatDateTime(session.loginAt)}</p>
                            <p>⏱️  활동 시간: {formatDuration(duration)}</p>
                            <p>📍 마지막 활동: {formatDateTime(session.lastActivityAt)}</p>
                            {session.ipAddress && <p>📍 IP: {session.ipAddress}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 사용자 통계 탭 */}
        {tab === 'stats' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">사용자별 통계</h2>
            <div className="space-y-3">
              {userStats.length === 0 ? (
                <p className="text-center text-slate-400 py-8">통계 데이터가 없습니다.</p>
              ) : (
                userStats.map((stat) => (
                  <div
                    key={stat.userId}
                    className="rounded-lg border border-white/10 bg-white/5 p-4"
                  >
                    <div className="mb-3">
                      <h3 className="text-lg font-semibold text-white">{stat.userName}</h3>
                      <p className="text-sm text-slate-400">{stat.userEmail}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="rounded-lg bg-blue-500/10 p-3 border border-blue-500/20">
                        <p className="text-xs text-blue-300 mb-1">총 세션 수</p>
                        <p className="text-2xl font-bold text-white">{stat.totalSessions}</p>
                      </div>
                      <div className="rounded-lg bg-green-500/10 p-3 border border-green-500/20">
                        <p className="text-xs text-green-300 mb-1">총 활동 시간</p>
                        <p className="text-lg font-bold text-white">{formatDuration(stat.totalActiveTime)}</p>
                      </div>
                      <div className="rounded-lg bg-purple-500/10 p-3 border border-purple-500/20">
                        <p className="text-xs text-purple-300 mb-1">평균 세션 시간</p>
                        <p className="text-lg font-bold text-white">{formatDuration(stat.averageSessionTime)}</p>
                      </div>
                      <div className="rounded-lg bg-orange-500/10 p-3 border border-orange-500/20">
                        <p className="text-xs text-orange-300 mb-1">마지막 로그인</p>
                        <p className="text-xs font-semibold text-white">
                          {stat.lastLoginAt ? formatDateTime(stat.lastLoginAt) : '없음'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
