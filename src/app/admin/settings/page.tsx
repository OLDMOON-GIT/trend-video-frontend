'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'youtube' | 'google-sites'>('youtube');

  // 공통
  const [isLoading, setIsLoading] = useState(true);

  // Google Sites 설정
  const [isSaving, setIsSaving] = useState(false);
  const [googleSitesUrl, setGoogleSitesUrl] = useState('');
  const [userId, setUserId] = useState('');

  // YouTube 설정
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [channel, setChannel] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // URL 파라미터에서 탭 읽기
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'youtube' || tab === 'google-sites') {
      setActiveTab(tab);
    }

    // success 파라미터 처리 (YouTube OAuth 리다이렉트 후)
    if (params.get('success') === 'true') {
      toast.success('YouTube 채널 연결이 완료되었습니다!');
      // URL 파라미터 제거
      window.history.replaceState({}, '', '/admin/settings?tab=youtube');
    }

    loadAllSettings();
  }, []);

  const loadAllSettings = async () => {
    try {
      // Google Sites 설정 로드
      const sitesRes = await fetch('/api/user/settings');
      const sitesData = await sitesRes.json();

      if (sitesRes.ok) {
        setUserId(sitesData.userId || '');
        setGoogleSitesUrl(sitesData.googleSitesUrl || '');
      } else if (sitesRes.status === 401) {
        router.push('/auth');
        return;
      }

      // YouTube 설정 로드
      const youtubeRes = await fetch('/api/youtube/auth', { credentials: 'include' });
      const youtubeData = await youtubeRes.json();

      setIsAuthenticated(youtubeData.authenticated || false);
      setHasCredentials(youtubeData.hasCredentials || false);
      setChannel(youtubeData.channel || null);
    } catch (error) {
      console.error('설정 로드 실패:', error);
      toast.error('설정 로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Google Sites 설정 저장
  const handleSaveGoogleSites = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleSitesUrl })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Google Sites 설정이 저장되었습니다!');
      } else {
        toast.error(data.error || '설정 저장 실패');
      }
    } catch (error) {
      console.error('설정 저장 실패:', error);
      toast.error('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // YouTube 연결
  const handleYouTubeConnect = async () => {
    if (!hasCredentials) {
      toast.error('관리자가 YouTube API Credentials를 설정하지 않았습니다.');
      return;
    }

    try {
      setIsConnecting(true);
      toast.loading('YouTube 채널 연결 중...', { id: 'youtube-auth' });

      const res = await fetch('/api/youtube/auth', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('YouTube 채널 연결 성공!', { id: 'youtube-auth' });
        await loadAllSettings();
      } else {
        throw new Error(data.error || '연결 실패');
      }
    } catch (error: any) {
      console.error('YouTube 연결 실패:', error);
      toast.error(`연결 실패: ${error.message}`, { id: 'youtube-auth' });
    } finally {
      setIsConnecting(false);
    }
  };

  // YouTube 연결 해제
  const handleYouTubeDisconnect = async () => {
    if (!confirm('정말로 YouTube 채널 연결을 해제하시겠습니까?')) {
      return;
    }

    try {
      toast.loading('연결 해제 중...', { id: 'youtube-disconnect' });
      const res = await fetch('/api/youtube/auth', {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('YouTube 연결 해제 완료', { id: 'youtube-disconnect' });
        setIsAuthenticated(false);
        setChannel(null);
      } else {
        throw new Error(data.error || '연결 해제 실패');
      }
    } catch (error: any) {
      console.error('연결 해제 실패:', error);
      toast.error(`연결 해제 실패: ${error.message}`, { id: 'youtube-disconnect' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-300 text-lg">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <Toaster position="top-right" />

      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">⚙️ 설정</h1>
          <p className="text-slate-400">
            YouTube 채널 및 쿠팡 쇼핑몰 설정을 관리하세요
          </p>
        </div>

        {/* 탭 메뉴 */}
        <div className="mb-8 flex gap-2">
          <button
            onClick={() => setActiveTab('youtube')}
            className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
              activeTab === 'youtube'
                ? 'bg-red-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            📺 YouTube 설정
          </button>
          <button
            onClick={() => setActiveTab('google-sites')}
            className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
              activeTab === 'google-sites'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🌐 Google Sites 설정
          </button>
        </div>

        {/* YouTube 설정 탭 */}
        {activeTab === 'youtube' && (
          <div className="rounded-2xl border border-slate-600 bg-slate-800/50 backdrop-blur">
            {/* 관리자 설정 필요 경고 */}
            {!hasCredentials && (
              <div className="p-6 border-b border-slate-700">
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <h3 className="text-lg font-bold text-yellow-400 mb-2">관리자 설정 필요</h3>
                      <p className="text-yellow-300/90 text-sm">
                        YouTube API Credentials가 설정되지 않았습니다. 관리자에게 문의하세요.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 연결 상태 */}
            <div className="p-8 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4">연결 상태</h2>

              {isAuthenticated && channel ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-400 font-semibold">연결됨</span>
                  </div>

                  <div className="p-6 bg-slate-900/50 rounded-lg space-y-3">
                    <div className="flex items-center gap-3">
                      {channel.thumbnail_url && (
                        <img
                          src={channel.thumbnail_url}
                          alt={channel.title}
                          className="w-16 h-16 rounded-full border-2 border-red-500"
                        />
                      )}
                      <div>
                        <h3 className="text-lg font-bold text-white">{channel.title}</h3>
                        <p className="text-sm text-slate-400">
                          구독자 {channel.subscriber_count?.toLocaleString() || '0'}명
                        </p>
                      </div>
                    </div>
                    {channel.description && (
                      <p className="text-sm text-slate-300 mt-2">{channel.description}</p>
                    )}
                  </div>

                  <button
                    onClick={handleYouTubeDisconnect}
                    className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition"
                  >
                    YouTube 연결 해제
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg">
                    <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                    <span className="text-slate-300">연결되지 않음</span>
                  </div>

                  <button
                    onClick={handleYouTubeConnect}
                    disabled={!hasCredentials || isConnecting}
                    className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
                  >
                    {isConnecting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>연결 중...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        <span>YouTube 채널 연결</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* 안내 */}
            <div className="p-8">
              <h2 className="text-xl font-bold text-white mb-4">📖 사용 방법</h2>
              <div className="space-y-3 text-sm text-slate-300">
                <p>1. "YouTube 채널 연결" 버튼을 클릭하세요.</p>
                <p>2. Google 계정으로 로그인하고 YouTube 채널 접근 권한을 부여하세요.</p>
                <p>3. 연결이 완료되면 이 계정으로 비디오를 업로드할 수 있습니다.</p>
              </div>
            </div>
          </div>
        )}

        {/* Google Sites 설정 탭 */}
        {activeTab === 'google-sites' && (
        <div className="rounded-2xl border border-slate-600 bg-slate-800/50 p-8 backdrop-blur mb-6">
          <h2 className="text-2xl font-bold text-white mb-4">🌐 Google Sites 연동</h2>
          <p className="text-slate-400 mb-6 text-sm">
            상품을 게시할 Google Sites 페이지 URL을 입력하세요
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Google Sites 페이지 URL
              </label>
              <input
                type="text"
                value={googleSitesUrl}
                onChange={(e) => setGoogleSitesUrl(e.target.value)}
                placeholder="https://sites.google.com/..."
                className="w-full rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
              />
              <p className="mt-2 text-xs text-slate-500">
                예: https://sites.google.com/d/1wdaBjcpjaM0WhdQOhG-ATzJ_Dx83ytH_/p/10Ms4qn7y-fscezanBmegRpWuro_iYjoX/edit
              </p>
            </div>

            {/* 안내 사항 */}
            <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-300 mb-2">💡 사용 방법</h3>
              <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                <li>Google Sites에서 상품을 표시할 페이지를 생성하세요</li>
                <li>페이지 URL을 위 입력창에 붙여넣으세요</li>
                <li>상품 관리 페이지에서 퍼블리시할 상품을 선택하세요</li>
                <li>Google Sites 페이지에 임베드 코드를 추가하세요</li>
              </ol>
            </div>

            {/* 임베드 코드 */}
            {googleSitesUrl && userId && (
              <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-300 mb-2">📋 임베드 코드</h3>
                <p className="text-xs text-slate-400 mb-2">
                  다음 코드를 Google Sites 페이지에 추가하세요 (HTML 삽입)
                </p>
                <div className="bg-slate-900 rounded p-3 font-mono text-xs text-green-400 overflow-x-auto">
                  <code>
                    {`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/shop/embed?userId=${userId}" width="100%" height="800" frameborder="0"></iframe>`}
                  </code>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  * 퍼블리시한 상품만 표시됩니다
                </p>
              </div>
            )}
          </div>

          {/* 저장 버튼 */}
          <div className="mt-6">
            <button
              onClick={handleSaveGoogleSites}
              disabled={isSaving}
              className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-white font-bold hover:from-purple-500 hover:to-pink-500 transition disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '💾 설정 저장'}
            </button>
          </div>
        </div>
        )}

        {/* 돌아가기 버튼 */}
        <div className="text-center mt-8">
          <button
            onClick={() => router.push('/admin/coupang-products')}
            className="text-slate-400 hover:text-white transition"
          >
            ← 상품 관리로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
