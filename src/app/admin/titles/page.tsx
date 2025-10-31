'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';

interface ScriptTask {
  id: string;
  title: string;
  status: 'PENDING' | 'ING' | 'DONE' | 'ERROR';
  message?: string;
  createdAt: string;
  scriptPath?: string;
  type?: 'longform' | 'shortform' | 'sora2';
  logs?: Array<{
    timestamp: string;
    message: string;
  }>;
}

export default function TitlesPage() {
  const router = useRouter();
  const [scripts, setScripts] = useState<ScriptTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [scriptType, setScriptType] = useState<'longform' | 'shortform' | 'sora2'>('longform'); // 기본값: 롱폼
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set()); // 펼쳐진 로그 ID들

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
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json'
    };
  };

  useEffect(() => {
    checkAuth();
    fetchScripts();

    // 2초마다 대본 목록 자동 새로고침 (로그 실시간 업데이트)
    const interval = setInterval(() => {
      fetchScripts();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // ING 상태인 스크립트 자동으로 펼치기
  useEffect(() => {
    const newExpandedIds = new Set(expandedLogIds);
    scripts.forEach(script => {
      if (script.status === 'ING' && script.logs && script.logs.length > 0) {
        newExpandedIds.add(script.id);
      }
    });
    setExpandedLogIds(newExpandedIds);
  }, [scripts]);

  // 로그 자동 스크롤 (ING 상태만)
  useEffect(() => {
    scripts.forEach(script => {
      if (script.status === 'ING' && script.logs && script.logs.length > 0) {
        const logElement = document.getElementById(`log-${script.id}`);
        if (logElement) {
          logElement.scrollTop = logElement.scrollHeight;
        }
      }
    });
  }, [scripts]);

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
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  const fetchScripts = async () => {
    try {
      const response = await fetch('/api/scripts', {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch scripts');
      }

      const data = await response.json();
      setScripts(data.scripts || []);
    } catch (error) {
      console.error('Error fetching scripts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateScript = async () => {
    if (!newTitle.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: newTitle.trim(),
          type: scriptType
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate script');
      }

      const data = await response.json();

      setNewTitle('');
      setShowNewModal(false);
      alert('대본 생성이 시작되었습니다! 잠시 후 목록에서 확인하세요.');
      fetchScripts();
    } catch (error) {
      console.error('Error generating script:', error);
      alert('대본 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const cancelScript = async (taskId: string, title: string) => {
    if (!confirm(`"${title}" 대본 생성을 중지하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch('/api/scripts/cancel', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ taskId })
      });

      if (!response.ok) {
        throw new Error('Failed to cancel script');
      }

      alert('대본 생성이 중지되었습니다.');
      fetchScripts();
    } catch (error) {
      console.error('Error canceling script:', error);
      alert('중지에 실패했습니다.');
    }
  };

  const getStatusBadge = (status: ScriptTask['status']) => {
    const configs = {
      PENDING: { label: 'PENDING', icon: '⏳', bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500' },
      ING: { label: 'ING', icon: '🔄', bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500' },
      DONE: { label: 'DONE', icon: '✅', bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500' },
      ERROR: { label: 'ERROR', icon: '❌', bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500' }
    };

    const config = configs[status];
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${config.bg} ${config.text} ${config.border}`}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>
    );
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
      <div className="mx-auto max-w-6xl">
        <Breadcrumb />

        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold text-white">📝 대본 제목 등록</h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowNewModal(true)}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-semibold text-white transition hover:from-purple-500 hover:to-pink-500"
            >
              ➕ 새 제목 등록
            </button>
            <Link
              href="/admin"
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              뒤로가기
            </Link>
          </div>
        </div>

        {/* 대본 목록 */}
        <div className="space-y-4">
          {scripts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-16 text-center backdrop-blur">
              <div className="text-6xl mb-4">🎬</div>
              <p className="text-xl text-slate-400 mb-2">등록된 대본이 없습니다</p>
              <p className="text-sm text-slate-500">상단의 "➕ 새 제목 등록" 버튼을 눌러 제목을 추가하세요</p>
            </div>
          ) : (
            scripts.map(script => (
              <div
                key={script.id}
                className={`rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur transition hover:border-purple-500/50 ${
                  script.status === 'DONE' ? 'opacity-80' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(script.status)}
                      {script.type && (
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          script.type === 'shortform' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                          script.type === 'longform' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                          'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}>
                          {script.type === 'shortform' ? '⚡ 숏폼' : script.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(script.createdAt).toLocaleString('ko-KR')}
                      </span>
                    </div>
                    <h3 className="text-lg text-white font-medium mb-2">{script.title}</h3>
                    {script.message && (
                      <p className="text-sm text-slate-400">{script.message}</p>
                    )}

                    {/* 로그 표시 */}
                    {script.logs && script.logs.length > 0 && (
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            const newSet = new Set(expandedLogIds);
                            if (newSet.has(script.id)) {
                              newSet.delete(script.id);
                            } else {
                              newSet.add(script.id);
                            }
                            setExpandedLogIds(newSet);
                          }}
                          className="text-sm text-blue-400 hover:text-blue-300 transition cursor-pointer mb-2"
                        >
                          {expandedLogIds.has(script.id) ? '📋 로그 닫기' : '📋 로그 보기'} ({script.logs.length}개)
                        </button>
                        {expandedLogIds.has(script.id) && (
                          <div className="rounded-lg bg-slate-900/50 p-4 max-h-64 overflow-y-auto" id={`log-${script.id}`}>
                            <div className="space-y-1">
                              {script.logs.map((log, index) => {
                                // API 사용 여부 감지
                                const isUsingAPI = log.message.includes('Claude API') ||
                                                  log.message.includes('API 호출') ||
                                                  log.message.includes('Using Claude API');
                                const isUsingLocal = log.message.includes('로컬 Claude') ||
                                                    log.message.includes('Local Claude') ||
                                                    log.message.includes('python');

                                return (
                                  <p key={index} className="text-xs text-slate-300 font-mono leading-relaxed">
                                    <span className="text-blue-400">[{new Date(log.timestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                    {isUsingAPI && (
                                      <span className="font-bold text-red-500 mr-1">[💰 API 사용]</span>
                                    )}
                                    {isUsingLocal && (
                                      <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>
                                    )}
                                    {log.message}
                                  </p>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {script.status === 'ING' && (
                      <button
                        onClick={() => cancelScript(script.id, script.title)}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
                      >
                        ⏹️ 중지
                      </button>
                    )}
                    {script.status === 'DONE' && script.scriptPath && (
                      <a
                        href={script.scriptPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-500"
                      >
                        보기
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 새 제목 등록 모달 */}
      {showNewModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => !isGenerating && setShowNewModal(false)}
        >
          <div
            className="bg-slate-800 rounded-2xl border border-white/10 p-8 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-white mb-6">📝 새 제목 등록</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  영상 제목
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 p-4 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                  placeholder="예: 파이썬으로 웹 크롤링하는 방법"
                  disabled={isGenerating}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  대본 타입
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setScriptType('longform')}
                    disabled={isGenerating}
                    className={`flex-1 rounded-lg border-2 p-3 transition ${
                      scriptType === 'longform'
                        ? 'border-purple-500 bg-purple-500/20 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                    } disabled:opacity-50`}
                  >
                    <div className="text-base font-bold mb-1">📝 롱폼</div>
                    <div className="text-xs">16:9 가로</div>
                    <div className="text-xs text-slate-500">8-10분</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptType('shortform')}
                    disabled={isGenerating}
                    className={`flex-1 rounded-lg border-2 p-3 transition ${
                      scriptType === 'shortform'
                        ? 'border-purple-500 bg-purple-500/20 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                    } disabled:opacity-50`}
                  >
                    <div className="text-base font-bold mb-1">⚡ 숏폼</div>
                    <div className="text-xs">9:16 세로</div>
                    <div className="text-xs text-slate-500">30-60초</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptType('sora2')}
                    disabled={isGenerating}
                    className={`flex-1 rounded-lg border-2 p-3 transition ${
                      scriptType === 'sora2'
                        ? 'border-purple-500 bg-purple-500/20 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                    } disabled:opacity-50`}
                  >
                    <div className="text-base font-bold mb-1">🎬 Sora2</div>
                    <div className="text-xs">9:16 세로</div>
                    <div className="text-xs text-slate-500">AI 시네마틱</div>
                  </button>
                </div>
              </div>

              <div className="rounded-lg bg-blue-900/20 border border-blue-500/30 p-4">
                <p className="text-sm text-blue-300">
                  💡 제목을 입력하면 Claude AI가 선택한 포맷에 맞는 대본을 자동으로 생성합니다.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={generateScript}
                disabled={isGenerating}
                className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white transition hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? '생성 중...' : '대본 생성'}
              </button>
              <button
                onClick={() => setShowNewModal(false)}
                disabled={isGenerating}
                className="rounded-lg bg-slate-700 px-6 py-3 font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

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
