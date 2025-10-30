'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';

interface ChargePackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  bonus?: number;
  popular?: boolean;
}

const CHARGE_PACKAGES: ChargePackage[] = [
  {
    id: 'basic',
    name: '기본',
    credits: 1000,
    price: 5000,
  },
  {
    id: 'standard',
    name: '스탠다드',
    credits: 2000,
    price: 10000,
    popular: true,
  },
  {
    id: 'premium',
    name: '프리미엄',
    credits: 5000,
    price: 25000,
    bonus: 500,
  },
  {
    id: 'ultimate',
    name: '얼티밋',
    credits: 10000,
    price: 50000,
    bonus: 2000,
  },
];

export default function ChargePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string; credits: number } | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ChargePackage | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

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
    loadRequests();
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

  const loadRequests = async () => {
    try {
      const response = await fetch('/api/credits/request', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok) {
        setRequests(data.requests);
      }
    } catch (error) {
      console.error('Load requests error:', error);
    }
  };

  const handleRequestCharge = async (amount: number) => {
    if (amount <= 0) {
      alert('유효한 금액을 입력하세요.');
      return;
    }

    if (!confirm(`${amount.toLocaleString()} 크레딧 충전을 요청하시겠습니까?\n\n입금 후 관리자 승인 시 크레딧이 부여됩니다.`)) {
      return;
    }

    setIsRequesting(true);
    try {
      const response = await fetch('/api/credits/request', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ amount })
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ 충전 요청이 완료되었습니다!\n관리자가 입금 확인 후 크레딧을 부여합니다.');
        setCustomAmount('');
        setSelectedPackage(null);
        loadRequests();
      } else {
        alert('❌ 충전 요청 실패: ' + data.error);
      }
    } catch (error) {
      console.error('Request charge error:', error);
      alert('❌ 충전 요청 중 오류가 발생했습니다.');
    } finally {
      setIsRequesting(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-6xl">
        <Breadcrumb />

        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">💳 크레딧 충전</h1>
            {user && <p className="mt-1 text-sm text-slate-400">{user.email}</p>}
          </div>
          <div className="flex gap-3">
            <Link
              href="/credits"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
            >
              ← 돌아가기
            </Link>
            <Link
              href="/"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
            >
              메인으로
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 현재 크레딧 */}
        <div className="mb-8 rounded-xl bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 p-6 backdrop-blur">
          <p className="text-sm text-slate-300">현재 보유 크레딧</p>
          <p className="mt-2 text-3xl font-bold text-yellow-300">
            {user?.credits?.toLocaleString() || '0'}
          </p>
        </div>

        {/* 계좌 정보 */}
        <div className="mb-8 rounded-xl border border-green-500/30 bg-green-500/10 p-6 backdrop-blur">
          <h3 className="mb-3 text-lg font-bold text-green-300">🏦 입금 계좌 정보</h3>
          <div className="flex items-center justify-between rounded-lg bg-black/20 p-4">
            <div>
              <p className="text-sm text-slate-400">카카오뱅크</p>
              <p className="mt-1 text-2xl font-bold text-white">3333-02-1519243</p>
              <p className="mt-1 text-sm text-slate-300">최종문</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText('3333021519243');
                alert('계좌번호가 복사되었습니다!');
              }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500"
            >
              📋 복사
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-300">💡 입금 후 아래에서 충전하기를 눌러 요청하세요.</p>
        </div>

        {/* 충전 요청 */}
        <div className="mb-8 rounded-xl border border-purple-500/30 bg-purple-500/10 p-6 backdrop-blur">
          <h3 className="mb-4 text-lg font-bold text-purple-300">💰 크레딧 충전 요청</h3>

          {/* 빠른 선택 버튼 */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-semibold text-slate-300">빠른 선택</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CHARGE_PACKAGES.map((pkg) => {
                const totalCredits = pkg.credits + (pkg.bonus || 0);
                return (
                  <button
                    key={pkg.id}
                    onClick={() => setCustomAmount(totalCredits.toString())}
                    className={`rounded-lg border p-3 text-left transition hover:bg-white/10 ${
                      customAmount === totalCredits.toString()
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-white/20 bg-white/5'
                    }`}
                  >
                    <p className="text-sm text-slate-400">{pkg.name}</p>
                    <p className="text-lg font-bold text-yellow-300">{totalCredits.toLocaleString()} 크레딧</p>
                    {pkg.bonus && (
                      <p className="text-xs text-green-400">기본 {pkg.credits.toLocaleString()} + 보너스 {pkg.bonus.toLocaleString()}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{pkg.price.toLocaleString()}원</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 직접 입력 */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-semibold text-slate-300">
              충전할 크레딧 금액 (직접 입력)
            </label>
            <input
              type="number"
              min="100"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="예: 2000"
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none transition"
            />
          </div>

          <button
            onClick={() => handleRequestCharge(parseInt(customAmount) || 0)}
            disabled={isRequesting || !customAmount || parseInt(customAmount) <= 0}
            className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white transition hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRequesting ? '요청 중...' : '💸 충전 요청하기'}
          </button>
        </div>

        {/* 충전 요청 내역 */}
        {requests.length > 0 && (
          <div className="mb-8 rounded-xl border border-white/10 bg-white/5 backdrop-blur">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white">📋 나의 충전 요청 내역</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800 text-left text-xs font-semibold text-slate-300">
                  <tr>
                    <th className="p-3">요청일</th>
                    <th className="p-3">크레딧</th>
                    <th className="p-3">상태</th>
                    <th className="p-3">처리일</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-200">
                  {requests.map((req) => (
                    <tr key={req.id} className="border-t border-white/5">
                      <td className="p-3">{new Date(req.createdAt).toLocaleString('ko-KR')}</td>
                      <td className="p-3 font-semibold text-yellow-400">{req.amount.toLocaleString()}</td>
                      <td className="p-3">
                        {req.status === 'pending' && <span className="text-orange-400">⏳ 대기중</span>}
                        {req.status === 'approved' && <span className="text-green-400">✅ 승인됨</span>}
                        {req.status === 'rejected' && <span className="text-red-400">❌ 거부됨</span>}
                      </td>
                      <td className="p-3 text-xs text-slate-400">
                        {req.approvedAt ? new Date(req.approvedAt).toLocaleString('ko-KR') :
                         req.rejectedAt ? new Date(req.rejectedAt).toLocaleString('ko-KR') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 안내 사항 */}
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-6 backdrop-blur">
          <h3 className="mb-3 text-lg font-bold text-blue-300">💡 충전 안내</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>• 위 계좌로 입금 후 충전 요청을 하시면 관리자가 입금 확인 후 크레딧을 부여합니다.</p>
            <p>• 크레딧은 AI 대본 생성과 영상 생성에 사용됩니다.</p>
            <p>• AI 대본 생성: 50 크레딧</p>
            <p>• 영상 생성: 40 크레딧</p>
            <p>• 2000 크레딧으로 약 50개의 영상을 생성할 수 있습니다.</p>
            <p>• 영상 생성 실패 시 크레딧이 자동 환불됩니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
