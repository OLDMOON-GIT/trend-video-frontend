'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ChargeRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  memo?: string;
}

export default function AdminChargeRequestsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);
  const [requests, setRequests] = useState<ChargeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<ChargeRequest | null>(null);
  const [rejectMemo, setRejectMemo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  const getAuthHeaders = (): HeadersInit => {
    return {}; // 빈 객체 반환 (쿠키가 자동으로 전송됨)
  };

  useEffect(() => {
    checkAuth();
    loadRequests();
  }, []);

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

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

      setCurrentUser(data.user);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const url = statusFilter === 'all'
        ? '/api/admin/charge-requests'
        : `/api/admin/charge-requests?status=${statusFilter}`;

      const response = await fetch(url, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        setRequests(data.requests);
      } else {
        alert('충전 요청 목록 조회 실패: ' + data.error);
      }
    } catch (error) {
      console.error('Load requests error:', error);
      alert('충전 요청 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (request: ChargeRequest) => {
    if (!confirm(`${request.userName}님의 ${request.amount.toLocaleString()} 크레딧 충전 요청을 승인하시겠습니까?`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(`/api/admin/charge-requests/${request.id}`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'approve' })
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ ' + data.message);
        loadRequests();
      } else {
        alert('❌ 승인 실패: ' + data.error);
      }
    } catch (error) {
      console.error('Approve error:', error);
      alert('❌ 승인 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;

    if (!confirm(`${selectedRequest.userName}님의 충전 요청을 거부하시겠습니까?`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(`/api/admin/charge-requests/${selectedRequest.id}`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ action: 'reject', memo: rejectMemo })
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ ' + data.message);
        setSelectedRequest(null);
        setRejectMemo('');
        loadRequests();
      } else {
        alert('❌ 거부 실패: ' + data.error);
      }
    } catch (error) {
      console.error('Reject error:', error);
      alert('❌ 거부 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
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

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
{/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">💰 크레딧 충전 요청 관리</h1>
            {currentUser && <p className="mt-1 text-sm text-slate-400">{currentUser.email}</p>}
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
            >
              관리자 메인
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

        {/* 대기중 알림 */}
        {pendingCount > 0 && statusFilter !== 'pending' && (
          <div className="mb-6 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 backdrop-blur">
            <p className="text-sm text-orange-300">
              ⚠️ 대기 중인 충전 요청이 {pendingCount}건 있습니다.
              <button
                onClick={() => setStatusFilter('pending')}
                className="ml-2 underline hover:text-orange-200"
              >
                확인하기 →
              </button>
            </p>
          </div>
        )}

        {/* 필터 */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              statusFilter === 'pending'
                ? 'bg-orange-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            ⏳ 대기중 ({requests.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              statusFilter === 'approved'
                ? 'bg-green-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            ✅ 승인됨
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              statusFilter === 'rejected'
                ? 'bg-red-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            ❌ 거부됨
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              statusFilter === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📋 전체
          </button>
        </div>

        {/* 요청 목록 */}
        <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="max-h-[700px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400">로딩 중...</div>
            ) : requests.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                {statusFilter === 'all' ? '충전 요청 내역이 없습니다.' : `${statusFilter} 상태의 요청이 없습니다.`}
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-800 text-left text-xs font-semibold text-slate-300">
                  <tr>
                    <th className="p-3">요청일</th>
                    <th className="p-3">사용자</th>
                    <th className="p-3">이메일</th>
                    <th className="p-3">크레딧</th>
                    <th className="p-3">상태</th>
                    <th className="p-3">처리일</th>
                    <th className="p-3">처리자</th>
                    <th className="p-3">작업</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-200">
                  {requests.map((req) => (
                    <tr key={req.id} className="border-t border-white/5 transition hover:bg-white/5">
                      <td className="p-3 whitespace-nowrap text-xs">{req.createdAt}</td>
                      <td className="p-3">{req.userName}</td>
                      <td className="p-3 text-xs">{req.userEmail}</td>
                      <td className="p-3 font-bold text-yellow-400">{req.amount.toLocaleString()}</td>
                      <td className="p-3">
                        {req.status === 'pending' && <span className="text-orange-400">⏳ 대기중</span>}
                        {req.status === 'approved' && <span className="text-green-400">✅ 승인됨</span>}
                        {req.status === 'rejected' && <span className="text-red-400">❌ 거부됨</span>}
                      </td>
                      <td className="p-3 whitespace-nowrap text-xs text-slate-400">
                        {req.approvedAt || req.rejectedAt || '-'}
                      </td>
                      <td className="p-3 text-xs text-slate-400">
                        {req.approvedBy || req.rejectedBy || '-'}
                      </td>
                      <td className="p-3">
                        {req.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(req)}
                              disabled={isProcessing}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
                            >
                              ✓ 승인
                            </button>
                            <button
                              onClick={() => {
                                setSelectedRequest(req);
                                setRejectMemo('');
                              }}
                              disabled={isProcessing}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                            >
                              ✗ 거부
                            </button>
                          </div>
                        )}
                        {req.status !== 'pending' && req.memo && (
                          <p className="text-xs text-slate-400" title={req.memo}>메모: {req.memo.substring(0, 20)}{req.memo.length > 20 ? '...' : ''}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 거부 모달 */}
        {selectedRequest && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <h3 className="mb-4 text-xl font-bold text-white">충전 요청 거부</h3>
              <div className="mb-4">
                <p className="text-sm text-slate-300">
                  사용자: <span className="font-semibold text-white">{selectedRequest.userName}</span>
                </p>
                <p className="text-sm text-slate-300">
                  크레딧: <span className="font-semibold text-yellow-400">{selectedRequest.amount.toLocaleString()}</span>
                </p>
              </div>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  거부 사유 (선택)
                </label>
                <textarea
                  value={rejectMemo}
                  onChange={(e) => setRejectMemo(e.target.value)}
                  placeholder="거부 사유를 입력하세요..."
                  rows={3}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-red-500 focus:outline-none transition"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  disabled={isProcessing}
                  className="flex-1 rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {isProcessing ? '처리 중...' : '거부하기'}
                </button>
                <button
                  onClick={() => {
                    setSelectedRequest(null);
                    setRejectMemo('');
                  }}
                  disabled={isProcessing}
                  className="rounded-lg bg-slate-600 px-6 py-3 font-semibold text-white transition hover:bg-slate-500"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
