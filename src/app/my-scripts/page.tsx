'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Script {
  id: string;
  title: string;
  content: string;
  status?: string;
  progress?: number;
  type?: 'longform' | 'shortform' | 'sora2';
  useClaudeLocal?: boolean;
  model?: string;
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
  createdAt: string;
}

type FilterType = 'all' | 'processing' | 'completed';

export default function MyScriptsPage() {
  const router = useRouter();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [expandedScriptId, setExpandedScriptId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

      if (!data.user) {
        router.push('/auth');
        return;
      }

      setUser(data.user);
      fetchScripts();
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  const fetchScripts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/my-scripts', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (response.ok) {
        setScripts(data.scripts);
      }
    } catch (error) {
      console.error('Error fetching scripts:', error);
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

  const handleDownload = async (scriptId: string) => {
    try {
      const response = await fetch(`/api/download-script?scriptId=${scriptId}`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json();
        alert('다운로드 실패: ' + (data.error || '알 수 없는 오류'));
        return;
      }

      // Content-Type 체크 (JSON 에러 응답 방지)
      const contentType = response.headers.get('Content-Type');
      if (contentType?.includes('application/json') && !contentType?.includes('attachment')) {
        const data = await response.json();
        if (data.error) {
          alert('다운로드 실패: ' + data.error);
          return;
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Content-Disposition 헤더에서 파일명 추출
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : 'script.txt';

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log('✅ 다운로드 완료:', fileName);
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (scriptId: string, title: string) => {
    if (!confirm(`"${title}" 대본을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/my-scripts?scriptId=${scriptId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        alert('대본이 삭제되었습니다.');
        fetchScripts(); // 목록 새로고침
      } else {
        alert('삭제 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const toggleContent = (scriptId: string) => {
    setExpandedScriptId(expandedScriptId === scriptId ? null : scriptId);
  };

  // 필터링 및 검색된 대본 목록
  const filteredScripts = scripts.filter(script => {
    // 상태 필터
    const statusMatch =
      filter === 'all' ? true :
      filter === 'processing' ? (script.status === 'processing' || script.status === 'pending') :
      filter === 'completed' ? (script.status === 'completed' || !script.status) :
      true;

    // 검색 필터
    const searchMatch = searchQuery.trim() === '' ||
      script.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      script.content.toLowerCase().includes(searchQuery.toLowerCase());

    return statusMatch && searchMatch;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-6xl">
{/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              내 대본 목록
              {scripts.length > 0 && <span className="ml-3 text-lg text-slate-400">전체 {scripts.length}개</span>}
            </h1>
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
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
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

        {/* 필터 탭 및 검색 */}
        <div className="mb-6 space-y-4">
          {/* 필터 탭 */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                filter === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              전체 ({scripts.length})
            </button>
            <button
              onClick={() => setFilter('processing')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                filter === 'processing'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              진행중 ({scripts.filter(s => s.status === 'processing' || s.status === 'pending').length})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                filter === 'completed'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              완료 ({scripts.filter(s => s.status === 'completed' || !s.status).length})
            </button>
          </div>

          {/* 검색창 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="제목 또는 내용으로 검색..."
                className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 pl-10 text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
              />
              <svg
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/20"
              >
                초기화
              </button>
            )}
          </div>

          {/* 검색 결과 개수 */}
          {searchQuery && (
            <div className="text-sm text-slate-400">
              검색 결과: {filteredScripts.length}개
            </div>
          )}
        </div>

        {/* 대본 목록 */}
        {isLoading ? (
          <div className="text-center text-slate-400">로딩 중...</div>
        ) : filteredScripts.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
            <p className="text-slate-400">
              {filter === 'all' ? '생성한 대본이 없습니다.' : `${filter === 'processing' ? '진행중인' : '완료된'} 대본이 없습니다.`}
            </p>
            {filter === 'all' && (
              <Link
                href="/"
                className="mt-4 inline-block rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500"
              >
                대본 생성하러 가기
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredScripts.map((script) => (
              <div
                key={script.id}
                className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:bg-white/10"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-white">
                        {script.title}
                      </h3>
                      {script.type && (
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          script.type === 'shortform' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                          script.type === 'longform' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                          'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}>
                          {script.type === 'shortform' ? '⚡ 숏폼' : script.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
                        </span>
                      )}
                    </div>

                    <div className="mb-3 space-y-1 text-sm text-slate-400">
                      <p>생성 시간: {formatDate(script.createdAt)}</p>
                      {script.model && (
                        <p>
                          AI 모델: {
                            script.model === 'claude' ? '🤖 Claude' :
                            script.model === 'gpt' ? '💬 ChatGPT' :
                            script.model === 'gemini' ? '✨ Gemini' :
                            `🤖 ${script.model}`
                          }
                        </p>
                      )}
                      {script.tokenUsage && (
                        <p>
                          토큰 사용: {script.tokenUsage.input_tokens.toLocaleString()} (입력) + {script.tokenUsage.output_tokens.toLocaleString()} (출력)
                        </p>
                      )}
                      <p>길이: {script.content.length.toLocaleString()}자</p>
                    </div>

                    {/* 대본 내용 미리보기/전체보기 */}
                    <div className="mb-3">
                      {expandedScriptId === script.id ? (
                        <div className="rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                          <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">
                            {script.content}
                          </pre>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                          <p className="text-sm text-slate-400 line-clamp-3">
                            {script.content}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ml-4 flex flex-col gap-2">
                    <button
                      onClick={() => toggleContent(script.id)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                    >
                      {expandedScriptId === script.id ? '📄 접기' : '📖 펼치기'}
                    </button>
                    {(script.status === 'completed' || !script.status) && (
                      <button
                        onClick={() => {
                          // JSON 파싱 후 메인 페이지로 이동하며 파이프라인 시작
                          try {
                            // 마크다운 코드 블록 제거
                            let content = script.content
                              .replace(/^```json\s*/i, '')
                              .replace(/\s*```\s*$/i, '')
                              .trim();

                            let scriptJson;
                            try {
                              scriptJson = JSON.parse(content);
                            } catch (firstError) {
                              console.warn('JSON 파싱 실패, 자동 수정 시도 중...', firstError);

                              try {
                                // 1. 이미 이스케이프된 따옴표를 임시 토큰으로 보호
                                let fixed = content.replace(/\\"/g, '__ESC_QUOTE__');

                                // 2. narration 필드의 값 내부에 있는 이스케이프 안 된 따옴표 수정
                                fixed = fixed.replace(
                                  /"narration"\s*:\s*"([^]*?)"\s*([,}\]])/g,
                                  (match, value, ending) => {
                                    const fixedValue = value.replace(/"/g, '\\"');
                                    return `"narration": "${fixedValue}"${ending}`;
                                  }
                                );

                                // 3. 보호한 임시 토큰을 다시 이스케이프된 따옴표로 복원
                                fixed = fixed.replace(/__ESC_QUOTE__/g, '\\"');

                                scriptJson = JSON.parse(fixed);
                                console.log('✅ JSON 자동 수정 성공');
                              } catch (secondError) {
                                throw new Error(`JSON 자동 수정 실패: ${secondError}`);
                              }
                            }

                            // 로컬 스토리지에 저장 (포맷 타입 포함)
                            localStorage.setItem('pipelineScript', JSON.stringify({
                              title: script.title,
                              content: scriptJson,
                              type: script.type || 'longform' // 기본값은 longform
                            }));
                            // 메인 페이지로 이동
                            window.location.href = '/';
                          } catch (error) {
                            alert('JSON 파싱 오류: ' + error);
                          }
                        }}
                        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                      >
                        🎬 영상 제작
                      </button>
                    )}
                    {(script.status === 'completed' || !script.status) && (
                      <button
                        onClick={() => {
                          // 상품정보 생성을 위해 메인 페이지로 이동
                          window.location.href = `/?promptType=product-info&generateProductInfo=${script.id}`;
                        }}
                        className="rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-amber-500 hover:to-yellow-500"
                      >
                        📝 상품정보
                      </button>
                    )}
                    <button
                      onClick={() => handleDownload(script.id)}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500"
                    >
                      📥 다운로드
                    </button>
                    <button
                      onClick={() => handleDelete(script.id, script.title)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
