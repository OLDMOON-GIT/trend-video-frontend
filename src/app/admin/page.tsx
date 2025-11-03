'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  const getAuthHeaders = (): HeadersInit => {
    return {}; // 빈 객체 반환 (쿠키가 자동으로 전송됨)
  };

  useEffect(() => {
    checkAuth();
  }, []);

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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      localStorage.removeItem('sessionId');
      router.push('/auth');
    } catch (error) {
      console.error('Logout error:', error);
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
      <div className="mx-auto max-w-5xl">
{/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white">⚙️ 관리자 대시보드</h1>
            {user && <p className="mt-2 text-sm text-slate-400">{user.email}</p>}
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
            >
              메인으로
            </Link>
            <Link
              href="/my-videos"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
            >
              내 영상
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 메뉴 카드 */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* 사용자 관리 */}
          <Link
            href="/admin/users"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-8 backdrop-blur transition hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/20"
          >
            <div className="mb-4 text-5xl">👥</div>
            <h2 className="mb-2 text-2xl font-bold text-white">사용자 관리</h2>
            <p className="text-sm text-slate-300">
              회원 정보 조회, 검색, 크레딧 부여, 이메일 인증 관리
            </p>
            <div className="mt-4 flex items-center text-sm font-semibold text-purple-300 transition group-hover:translate-x-2">
              관리하기 →
            </div>
          </Link>

          {/* 크레딧 충전 요청 */}
          <Link
            href="/admin/charge-requests"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/20 to-yellow-500/20 p-8 backdrop-blur transition hover:border-orange-500/50 hover:shadow-2xl hover:shadow-orange-500/20"
          >
            <div className="mb-4 text-5xl">💸</div>
            <h2 className="mb-2 text-2xl font-bold text-white">충전 요청 관리</h2>
            <p className="text-sm text-slate-300">
              사용자 크레딧 충전 요청 승인/거부 관리
            </p>
            <div className="mt-4 flex items-center text-sm font-semibold text-orange-300 transition group-hover:translate-x-2">
              관리하기 →
            </div>
          </Link>

          {/* 크레딧 설정 */}
          <Link
            href="/admin/settings"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-green-500/20 to-emerald-500/20 p-8 backdrop-blur transition hover:border-green-500/50 hover:shadow-2xl hover:shadow-green-500/20"
          >
            <div className="mb-4 text-5xl">💰</div>
            <h2 className="mb-2 text-2xl font-bold text-white">크레딧 가격 설정</h2>
            <p className="text-sm text-slate-300">
              AI 대본 생성 비용, 영상 생성 비용 설정
            </p>
            <div className="mt-4 flex items-center text-sm font-semibold text-green-300 transition group-hover:translate-x-2">
              설정하기 →
            </div>
          </Link>

          {/* 사용자 활동 로그 */}
          <Link
            href="/admin/user-activity"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-8 backdrop-blur transition hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/20"
          >
            <div className="mb-4 text-5xl">📊</div>
            <h2 className="mb-2 text-2xl font-bold text-white">사용자 활동 로그</h2>
            <p className="text-sm text-slate-300">
              로그인 기록, 활동 시간, 사용자 세션 모니터링
            </p>
            <div className="mt-4 flex items-center text-sm font-semibold text-blue-300 transition group-hover:translate-x-2">
              조회하기 →
            </div>
          </Link>

          {/* 프롬프트 관리 */}
          <Link
            href="/admin/prompts"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 p-8 backdrop-blur transition hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/20"
          >
            <div className="mb-4 text-5xl">📝</div>
            <h2 className="mb-2 text-2xl font-bold text-white">프롬프트 관리</h2>
            <p className="text-sm text-slate-300">
              롱폼/숏폼 영상 생성 프롬프트 템플릿 관리
            </p>
            <div className="mt-4 flex items-center text-sm font-semibold text-indigo-300 transition group-hover:translate-x-2">
              관리하기 →
            </div>
          </Link>

          {/* Tasks 관리 */}
          <Link
            href="/admin/tasks"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 p-8 backdrop-blur transition hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-500/20"
          >
            <div className="mb-4 text-5xl">📋</div>
            <h2 className="mb-2 text-2xl font-bold text-white">작업 관리</h2>
            <p className="text-sm text-slate-300">
              TODO 작업 생성, 진행 상태 관리, 작업 로그 조회
            </p>
            <div className="mt-4 flex items-center text-sm font-semibold text-emerald-300 transition group-hover:translate-x-2">
              관리하기 →
            </div>
          </Link>

          {/* 대본 제목 등록 */}
          <Link
            href="/admin/titles"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-rose-500/20 to-pink-500/20 p-8 backdrop-blur transition hover:border-rose-500/50 hover:shadow-2xl hover:shadow-rose-500/20"
          >
            <div className="mb-4 text-5xl">🎬</div>
            <h2 className="mb-2 text-2xl font-bold text-white">대본 제목 등록</h2>
            <p className="text-sm text-slate-300">
              영상 제목을 입력하면 Claude AI가 자동으로 대본 생성
            </p>
            <div className="mt-4 flex items-center text-sm font-semibold text-rose-300 transition group-hover:translate-x-2">
              등록하기 →
            </div>
          </Link>

          {/* DB 백업 관리 */}
          <Link
            href="/admin/backup"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-8 backdrop-blur transition hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/20"
          >
            <div className="mb-4 text-5xl">💾</div>
            <h2 className="mb-2 text-2xl font-bold text-white">DB 백업 관리</h2>
            <p className="text-sm text-slate-300">
              데이터베이스 백업 생성, 복원, 삭제 및 상태 모니터링
            </p>
            <div className="mt-4 flex items-center text-sm font-semibold text-cyan-300 transition group-hover:translate-x-2">
              관리하기 →
            </div>
          </Link>
        </div>

        {/* 안내 */}
        <div className="mt-8 rounded-xl border border-blue-500/30 bg-blue-500/10 p-6 backdrop-blur">
          <h3 className="mb-3 text-lg font-bold text-blue-300">💡 관리자 기능 안내</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>• <strong>사용자 관리:</strong> 회원 검색, 정보 조회, 크레딧 부여, 이메일 인증 처리</p>
            <p>• <strong>충전 요청 관리:</strong> 사용자 크레딧 충전 요청 승인/거부 처리</p>
            <p>• <strong>크레딧 설정:</strong> AI 대본 생성 및 영상 생성 시 차감되는 크레딧 금액 설정</p>
            <p>• <strong>사용자 활동 로그:</strong> 로그인/로그아웃 기록, 활동 시간, 활성 세션 모니터링</p>
            <p>• <strong>DB 백업 관리:</strong> 데이터베이스 자동/수동 백업, 복원, 무결성 체크</p>
            <p>• <strong>권한:</strong> 이 페이지는 관리자만 접근할 수 있습니다.</p>
          </div>
        </div>
      </div>

      {/* 맨 위로 플로팅 버튼 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 rounded-full bg-purple-600 p-4 text-white shadow-lg transition hover:bg-purple-500 hover:shadow-xl z-50 cursor-pointer"
        title="맨 위로"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>
    </div>
  );
}
