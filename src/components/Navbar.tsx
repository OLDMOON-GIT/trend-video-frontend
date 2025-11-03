"use client";

import { useState, useEffect } from "react";
import Breadcrumb from "./Breadcrumb";

interface User {
  email: string;
  credits?: number;
  isAdmin?: boolean;
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  const getAuthHeaders = (): HeadersInit => {
    return {}; // 빈 객체 반환 (쿠키가 자동으로 전송됨)
  };

  useEffect(() => {
    setIsMounted(true);
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // 세션 확인
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (data.user) {
        setUser(data.user);
        console.log('✅ 사용자 인증됨:', data.user.email);

        // 크레딧 조회
        const creditsRes = await fetch('/api/credits', { headers: getAuthHeaders() });
        const creditsData = await creditsRes.json();

        if (creditsData.credits !== undefined) {
          setUser(prev => prev ? {...prev, credits: creditsData.credits} : null);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      // 쿠키 기반 인증 - 서버에서 쿠키 삭제
      setUser(null);
      window.location.href = "/auth";
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!isMounted) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-white/10">
      <div className="mx-auto max-w-6xl px-3 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* 로고 및 Breadcrumb */}
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md shadow-purple-500/20 transition hover:shadow-lg hover:shadow-purple-500/30"
              title="홈으로"
            >
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </a>
            <Breadcrumb />
          </div>

          {/* PC 오른쪽 네비게이션 */}
          <nav className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                <a
                  href="/credits"
                  className="rounded-lg bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 px-4 py-2 transition hover:from-yellow-500/30 hover:to-orange-500/30 cursor-pointer"
                >
                  <span className="text-sm font-semibold text-yellow-300">💰 {user.credits?.toLocaleString() || 0}</span>
                </a>

                {user.isAdmin && (
                  <a
                    href="/admin"
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                  >
                    ⚙️ 관리자
                  </a>
                )}

                <a
                  href="/my-content"
                  className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                >
                  📂 내 콘텐츠
                </a>

                <a
                  href="/coupang"
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:from-blue-500 hover:to-cyan-500"
                >
                  🛒 쿠팡 파트너스
                </a>

                <button
                  onClick={handleLogout}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <a
                href="/auth"
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
              >
                로그인 / 회원가입
              </a>
            )}
          </nav>

          {/* 모바일 햄버거 버튼 */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden rounded-lg p-2 text-slate-300 hover:bg-white/10 transition"
            aria-label="메뉴"
          >
            {isMobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* 모바일 드롭다운 메뉴 */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 py-4">
            {user ? (
              <div className="flex flex-col gap-2">
                <div className="px-4 py-2 text-sm text-slate-300">
                  👤 {user.email}
                </div>

                <a
                  href="/credits"
                  className="rounded-lg bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 px-4 py-2 mx-2 transition hover:from-yellow-500/30 hover:to-orange-500/30"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-sm font-semibold text-yellow-300">💰 {user.credits?.toLocaleString() || 0}</span>
                </a>

                {user.isAdmin && (
                  <a
                    href="/admin"
                    className="rounded-lg bg-red-600 px-4 py-2 mx-2 text-sm font-semibold text-white transition hover:bg-red-500"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    ⚙️ 관리자
                  </a>
                )}

                <a
                  href="/my-content"
                  className="rounded-lg bg-purple-600 px-4 py-2 mx-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  📂 내 콘텐츠
                </a>

                <a
                  href="/coupang"
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 mx-2 text-sm font-semibold text-white transition hover:from-blue-500 hover:to-cyan-500"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  🛒 쿠팡 파트너스
                </a>

                <button
                  onClick={() => {
                    handleLogout();
                    setIsMobileMenuOpen(false);
                  }}
                  className="rounded-lg bg-slate-700 px-4 py-2 mx-2 text-sm font-semibold text-white transition hover:bg-slate-600"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <a
                href="/auth"
                className="rounded-lg bg-purple-600 px-4 py-2 mx-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                로그인 / 회원가입
              </a>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
