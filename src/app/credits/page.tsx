'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';

interface CreditHistory {
  id: string;
  type: 'charge' | 'use' | 'refund';
  amount: number;
  balance: number;
  description: string;
  createdAt: string;
}

export default function CreditsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string; credits: number } | null>(null);
  const [history, setHistory] = useState<CreditHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // localStorage에서 세션 ID 가져오기
  const getSessionId = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  };

  // Authorization 헤더 생성
  const getAuthHeaders = (): HeadersInit => {
    const sessionId = getSessionId();
    if (!sessionId) return {};
    return {
      'Authorization': `Bearer ${sessionId}`
    };
  };

  useEffect(() => {
    checkAuth();
    loadCreditsAndHistory();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (!data.user) {
        router.push('/auth');
        return;
      }

      setUser(data.user);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  const loadCreditsAndHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/credits?history=true', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (response.ok) {
        setUser(prev => prev ? { ...prev, credits: data.credits } : null);
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('크레딧/히스토리 로드 오류:', error);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      charge: '💳 충전',
      use: '📤 사용',
      refund: '↩️ 환불'
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      charge: 'text-green-400',
      use: 'text-red-400',
      refund: 'text-blue-400'
    };
    return colors[type] || 'text-slate-400';
  };

  const getAmountDisplay = (type: string, amount: number) => {
    if (type === 'charge' || type === 'refund') {
      return `+${amount.toLocaleString()}`;
    }
    return `${amount.toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-5xl">
        <Breadcrumb />

        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">💰 크레딧</h1>
            {user && <p className="mt-1 text-sm text-slate-400">{user.email}</p>}
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

        {/* 크레딧 잔액 */}
        <div className="mb-6 rounded-xl bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 p-8 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">보유 크레딧</p>
              <p className="mt-2 text-4xl font-bold text-yellow-300">
                {user?.credits?.toLocaleString() || '0'}
              </p>
            </div>
            <Link
              href="/credits/charge"
              className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 text-lg font-semibold text-white transition hover:from-green-500 hover:to-emerald-500"
            >
              💳 충전하기
            </Link>
          </div>
        </div>

        {/* 사용 내역 */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="mb-4 text-xl font-bold text-white">📊 사용 내역</h2>

          {isLoading ? (
            <div className="text-center text-slate-400 py-8">로딩 중...</div>
          ) : history.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              사용 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${getTypeColor(item.type)}`}>
                        {getTypeLabel(item.type)}
                      </span>
                      <span className="text-sm text-slate-300">{item.description}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(item.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${getTypeColor(item.type)}`}>
                      {getAmountDisplay(item.type, item.amount)}
                    </p>
                    <p className="text-xs text-slate-500">잔액: {item.balance.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
