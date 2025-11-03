'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  address: string;
  kakaoId?: string;
  credits: number;
  isAdmin: boolean;
  emailVerified: boolean;
  adminMemo?: string;
  createdAt: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [creditAmount, setCreditAmount] = useState(0);
  const [creditDescription, setCreditDescription] = useState('');
  const [isGrantingCredit, setIsGrantingCredit] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [memoUser, setMemoUser] = useState<User | null>(null);
  const [memoText, setMemoText] = useState('');
  const [isSavingMemo, setIsSavingMemo] = useState(false);

  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  const getAuthHeaders = (): HeadersInit => {
    return {}; // 빈 객체 반환 (쿠키가 자동으로 전송됨)
  };

  useEffect(() => {
    checkAuth();
    loadUsers();
  }, []);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      loadUsers();
    }, 300);
    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

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

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const url = searchQuery
        ? `/api/admin/users?q=${encodeURIComponent(searchQuery)}`
        : '/api/admin/users';

      console.log('🔍 사용자 목록 로드 중:', url);

      const response = await fetch(url, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      console.log('📡 응답 상태:', response.status);

      const data = await response.json();
      console.log('📦 받은 데이터:', data);

      if (response.ok) {
        setUsers(data.users);
        console.log('✅ 사용자 목록 업데이트:', data.users.length, '명');
      } else {
        console.error('❌ 사용자 로드 오류:', data.error);
        alert('사용자 목록을 불러오는 중 오류가 발생했습니다: ' + data.error);
      }
    } catch (error) {
      console.error('❌ 사용자 로드 오류:', error);
      alert('사용자 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleGrantCredit = async () => {
    if (!selectedUser || creditAmount <= 0) {
      alert('사용자를 선택하고 양수 금액을 입력하세요.');
      return;
    }

    setIsGrantingCredit(true);
    try {
      const response = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: creditAmount,
          description: creditDescription || '관리자 크레딧 부여'
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ ${selectedUser.name}님에게 ${creditAmount} 크레딧을 부여했습니다.`);
        setCreditAmount(0);
        setCreditDescription('');
        setSelectedUser(null);
        loadUsers();
      } else {
        alert('❌ 크레딧 부여 실패: ' + data.error);
      }
    } catch (error) {
      console.error('크레딧 부여 오류:', error);
      alert('❌ 크레딧 부여 중 오류가 발생했습니다.');
    } finally {
      setIsGrantingCredit(false);
    }
  };

  const handleVerifyEmail = async (user: User) => {
    if (user.emailVerified) {
      alert('이미 인증된 사용자입니다.');
      return;
    }

    if (!confirm(`${user.name}님의 이메일을 인증 완료 처리하시겠습니까?`)) {
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetch('/api/admin/verify-user', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id })
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ ' + data.message);
        loadUsers();
      } else {
        alert('❌ 인증 처리 실패: ' + data.error);
      }
    } catch (error) {
      console.error('인증 처리 오류:', error);
      alert('❌ 인증 처리 중 오류가 발생했습니다.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveMemo = async () => {
    if (!memoUser) return;

    setIsSavingMemo(true);
    try {
      const response = await fetch(`/api/admin/users/${memoUser.id}/memo`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ memo: memoText })
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ ' + data.message);
        setMemoUser(null);
        setMemoText('');
        loadUsers();
      } else {
        alert('❌ 메모 저장 실패: ' + data.error);
      }
    } catch (error) {
      console.error('메모 저장 오류:', error);
      alert('❌ 메모 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingMemo(false);
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
{/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">👥 사용자 관리</h1>
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

        {/* 검색 */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <label className="mb-2 block text-sm font-semibold text-slate-300">
            🔍 이름 또는 이메일로 검색
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && loadUsers()}
              placeholder="검색어를 입력하세요..."
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none transition"
            />
            <button
              onClick={loadUsers}
              disabled={isLoadingUsers}
              className="rounded-lg bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
            >
              {isLoadingUsers ? '검색 중...' : '🔍 검색'}
            </button>
          </div>
        </div>

        {/* 사용자 목록 */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 backdrop-blur">
          <div className="max-h-[500px] overflow-y-auto">
            {isLoadingUsers ? (
              <div className="p-8 text-center text-slate-400">로딩 중...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                {searchQuery ? '검색 결과가 없습니다.' : '등록된 사용자가 없습니다.'}
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-800 text-left text-xs font-semibold text-slate-300">
                  <tr>
                    <th className="p-2">이름</th>
                    <th className="p-2">이메일</th>
                    <th className="p-2">핸드폰</th>
                    <th className="p-2">주소</th>
                    <th className="p-2">카톡ID</th>
                    <th className="p-2">크레딧</th>
                    <th className="p-2">인증</th>
                    <th className="p-2">가입일</th>
                    <th className="p-2">메모</th>
                    <th className="p-2">작업</th>
                  </tr>
                </thead>
                <tbody className="text-xs text-slate-200">
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className={`border-t border-white/5 transition hover:bg-white/5 ${
                        selectedUser?.id === u.id ? 'bg-purple-500/20' : ''
                      }`}
                    >
                      <td className="p-2">
                        {u.name}
                        {u.isAdmin && <span className="ml-1 text-xs text-yellow-400">👑</span>}
                      </td>
                      <td className="p-2">{u.email}</td>
                      <td className="p-2">{u.phone}</td>
                      <td className="p-2 max-w-[200px] truncate" title={u.address}>{u.address}</td>
                      <td className="p-2">{u.kakaoId || '-'}</td>
                      <td className="p-2 font-semibold text-green-400">{u.credits.toLocaleString()}</td>
                      <td className="p-2">
                        {u.emailVerified ? (
                          <span className="text-xs text-green-400">✓</span>
                        ) : (
                          <button
                            onClick={() => handleVerifyEmail(u)}
                            disabled={isVerifying}
                            className="text-xs text-orange-400 hover:text-orange-300 underline disabled:opacity-50"
                          >
                            인증
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-xs text-slate-400 whitespace-nowrap">{u.createdAt}</td>
                      <td className="p-2">
                        {u.adminMemo ? (
                          <button
                            onClick={() => {
                              setMemoUser(u);
                              setMemoText(u.adminMemo || '');
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300 underline"
                            title={u.adminMemo}
                          >
                            메모 보기
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setMemoUser(u);
                              setMemoText('');
                            }}
                            className="rounded px-2 py-1 text-xs font-semibold bg-white/10 text-slate-300 hover:bg-white/20 transition"
                          >
                            메모 작성
                          </button>
                        )}
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => setSelectedUser(u)}
                          className={`rounded px-2 py-1 text-xs font-semibold transition whitespace-nowrap ${
                            selectedUser?.id === u.id
                              ? 'bg-purple-600 text-white'
                              : 'bg-white/10 text-slate-300 hover:bg-white/20'
                          }`}
                        >
                          {selectedUser?.id === u.id ? '✓' : '부여'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 크레딧 부여 */}
        {selectedUser && (
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-6 backdrop-blur">
            <h3 className="mb-4 text-lg font-bold text-purple-300">
              💰 {selectedUser.name}님에게 크레딧 부여
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  부여할 크레딧 (현재 잔액: {selectedUser.credits.toLocaleString()})
                </label>
                <input
                  type="number"
                  min="1"
                  value={creditAmount || ''}
                  onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                  placeholder="예: 10000"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  메모 (선택)
                </label>
                <input
                  type="text"
                  value={creditDescription}
                  onChange={(e) => setCreditDescription(e.target.value)}
                  placeholder="예: 이벤트 보상"
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none transition"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleGrantCredit}
                  disabled={isGrantingCredit || creditAmount <= 0}
                  className="flex-1 rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGrantingCredit ? '처리 중...' : '💸 크레딧 부여'}
                </button>
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setCreditAmount(0);
                    setCreditDescription('');
                  }}
                  className="rounded-lg bg-slate-600 px-6 py-3 font-semibold text-white transition hover:bg-slate-500"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 메모 모달 */}
        {memoUser && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
            <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <h3 className="mb-4 text-xl font-bold text-white">📝 관리자 메모</h3>
              <div className="mb-4">
                <p className="text-sm text-slate-300">
                  사용자: <span className="font-semibold text-white">{memoUser.name}</span>
                </p>
                <p className="text-sm text-slate-300">
                  이메일: <span className="font-semibold text-white">{memoUser.email}</span>
                </p>
              </div>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  메모 내용
                </label>
                <textarea
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  placeholder="이 사용자에 대한 메모를 입력하세요..."
                  rows={5}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none transition"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveMemo}
                  disabled={isSavingMemo}
                  className="flex-1 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSavingMemo ? '저장 중...' : '💾 저장'}
                </button>
                <button
                  onClick={() => {
                    setMemoUser(null);
                    setMemoText('');
                  }}
                  disabled={isSavingMemo}
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
