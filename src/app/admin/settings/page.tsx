'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';

interface Settings {
  aiScriptCost: number;
  videoGenerationCost: number;
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);
  const [settings, setSettings] = useState<Settings>({ aiScriptCost: 50, videoGenerationCost: 40 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const getSessionId = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  };

  const getAuthHeaders = (): HeadersInit => {
    const sessionId = getSessionId();
    if (!sessionId) return {};
    return {
      'Authorization': `Bearer ${sessionId}`
    };
  };

  useEffect(() => {
    checkAuth();
    loadSettings();
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

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('설정 로드 오류:', error);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        alert('✅ 설정이 저장되었습니다.');
      } else {
        const error = await response.json();
        alert('❌ 저장 실패: ' + error.error);
      }
    } catch (error) {
      console.error('설정 저장 오류:', error);
      alert('❌ 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
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
      <div className="mx-auto max-w-4xl">
        <Breadcrumb />

        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">💰 크레딧 가격 설정</h1>
            {user && <p className="mt-1 text-sm text-slate-400">{user.email}</p>}
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

        {/* 크레딧 설정 */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          <h2 className="mb-6 text-2xl font-bold text-white">💰 크레딧 가격 설정</h2>

          <div className="space-y-6">
            {/* AI 대본 생성 비용 */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                AI 대본 생성 비용 (크레딧)
              </label>
              <input
                type="number"
                min="0"
                value={settings.aiScriptCost}
                onChange={(e) => setSettings({ ...settings, aiScriptCost: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none transition"
              />
              <p className="mt-1 text-xs text-slate-400">AI로 대본을 생성할 때 차감되는 크레딧</p>
            </div>

            {/* 영상 생성 비용 */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300">
                영상 생성 비용 (크레딧)
              </label>
              <input
                type="number"
                min="0"
                value={settings.videoGenerationCost}
                onChange={(e) => setSettings({ ...settings, videoGenerationCost: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none transition"
              />
              <p className="mt-1 text-xs text-slate-400">영상을 생성할 때 차감되는 크레딧</p>
            </div>

            {/* 저장 버튼 */}
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="w-full rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : '💾 설정 저장'}
            </button>
          </div>
        </div>

        {/* 가격 예시 안내 */}
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-6 backdrop-blur">
          <h3 className="mb-3 text-lg font-bold text-blue-300">💡 가격 설정 가이드</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>• <strong>추천 가격:</strong> AI 대본 50 크레딧, 영상 생성 40 크레딧</p>
            <p>• <strong>예시:</strong> 만 원 결제 시 2000 크레딧 제공 → 약 50개 영상 생성 가능</p>
            <p>• <strong>주의:</strong> 가격 변경은 즉시 적용되며, 진행 중인 작업에도 영향을 줍니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
