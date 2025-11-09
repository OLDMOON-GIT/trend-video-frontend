'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

interface WordPressSettings {
  siteUrl: string;
  username: string;
  appPassword: string;
}

interface PostHistory {
  id: string;
  postUrl: string;
  deepLink: string;
  category: string;
  createdAt: string;
}

interface OAuthStatus {
  connected: boolean;
  blogId?: string;
  blogUrl?: string;
  connectedAt?: string;
}

export default function WordPressAutoPostPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // OAuth 상태
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>({ connected: false });
  const [isCheckingOAuth, setIsCheckingOAuth] = useState(false);

  // 워드프레스 설정
  const [settings, setSettings] = useState<WordPressSettings>({
    siteUrl: '',
    username: '',
    appPassword: ''
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // 상품 URL 및 포스팅
  const [productUrl, setProductUrl] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postResult, setPostResult] = useState<any>(null);

  // 포스팅 히스토리
  const [history, setHistory] = useState<PostHistory[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // URL 파라미터에서 OAuth 성공/실패 확인
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get('oauth');
    const oauthError = params.get('error');

    if (oauthSuccess === 'success') {
      toast.success('WordPress.com 연결 성공!');
      checkOAuthStatus();
      // URL 파라미터 제거
      window.history.replaceState({}, '', '/wordpress');
    } else if (oauthError) {
      toast.error(`OAuth 인증 실패: ${oauthError}`);
      // URL 파라미터 제거
      window.history.replaceState({}, '', '/wordpress');
    }
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();

      if (data.user) {
        setIsAuthenticated(true);
        await Promise.all([
          loadSettings(),
          checkOAuthStatus()
        ]);
      } else {
        router.push('/auth');
      }
    } catch (error) {
      console.error('인증 확인 실패:', error);
      router.push('/auth');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/wordpress/settings');
      const data = await res.json();

      if (data.siteUrl) {
        setSettings(data);
        setShowSettings(false);
      } else {
        setShowSettings(true);
        toast.error('워드프레스 설정을 먼저 입력해주세요.');
      }
    } catch (error) {
      console.error('설정 불러오기 실패:', error);
    }
  };

  const saveSettings = async () => {
    if (!settings.siteUrl || !settings.username || !settings.appPassword) {
      toast.error('모든 항목을 입력해주세요.');
      return;
    }

    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/wordpress/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('워드프레스 설정이 저장되었습니다.');
        setShowSettings(false);
      } else {
        toast.error(data.error || '설정 저장 실패');
      }
    } catch (error) {
      console.error('설정 저장 실패:', error);
      toast.error('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const checkOAuthStatus = async () => {
    setIsCheckingOAuth(true);
    try {
      const res = await fetch('/api/wordpress/oauth/status');
      const data = await res.json();

      if (res.ok) {
        setOAuthStatus(data);
      }
    } catch (error) {
      console.error('OAuth 상태 확인 실패:', error);
    } finally {
      setIsCheckingOAuth(false);
    }
  };

  const handleOAuthConnect = () => {
    // OAuth 인증 페이지로 이동
    window.location.href = '/api/wordpress/oauth/authorize';
  };

  const handleOAuthDisconnect = async () => {
    if (!confirm('WordPress.com 연결을 해제하시겠습니까?')) {
      return;
    }

    try {
      const res = await fetch('/api/wordpress/oauth/status', {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('WordPress.com 연결이 해제되었습니다.');
        setOAuthStatus({ connected: false });
      } else {
        toast.error('연결 해제 실패');
      }
    } catch (error) {
      console.error('OAuth 연결 해제 실패:', error);
      toast.error('연결 해제 중 오류가 발생했습니다.');
    }
  };

  const handleAutoPost = async () => {
    if (!productUrl) {
      toast.error('쿠팡 상품 URL을 입력해주세요.');
      return;
    }

    if (!productUrl.includes('coupang.com')) {
      toast.error('올바른 쿠팡 상품 URL을 입력해주세요.');
      return;
    }

    // OAuth 연결 또는 수동 설정 중 하나는 있어야 함
    if (!oauthStatus.connected && !settings.siteUrl) {
      toast.error('WordPress.com 연결 또는 수동 설정이 필요합니다.');
      return;
    }

    setIsPosting(true);
    setPostResult(null);

    try {
      const requestBody: any = {
        productUrl,
        customCategory: customCategory || undefined
      };

      // OAuth가 연결되지 않은 경우에만 수동 설정 전달
      if (!oauthStatus.connected) {
        requestBody.wpSiteUrl = settings.siteUrl;
        requestBody.wpUsername = settings.username;
        requestBody.wpAppPassword = settings.appPassword;
      }

      const res = await fetch('/api/wordpress/auto-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('워드프레스 포스팅 완료!');
        setPostResult(data);
        setProductUrl('');
        setCustomCategory('');

        // 히스토리 추가
        const newHistory: PostHistory = {
          id: data.postId,
          postUrl: data.postUrl,
          deepLink: data.deepLink,
          category: data.category,
          createdAt: new Date().toISOString()
        };
        setHistory(prev => [newHistory, ...prev]);
      } else {
        toast.error(data.error || '포스팅 실패');
      }
    } catch (error) {
      console.error('포스팅 실패:', error);
      toast.error('포스팅 중 오류가 발생했습니다.');
    } finally {
      setIsPosting(false);
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
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">
            🛒 쿠팡 → 워드프레스 자동 포스팅
          </h1>
          <p className="text-slate-400">
            쿠팡 상품을 AI가 분석하여 워드프레스에 자동으로 포스팅합니다
          </p>
        </div>

        {/* WordPress.com OAuth 연결 섹션 */}
        <div className="mb-6">
          <div className="rounded-lg border border-blue-500/20 bg-blue-950/20 p-6 backdrop-blur">
            <h2 className="text-xl font-bold text-white mb-4">🔗 WordPress.com 자동 연결</h2>

            {oauthStatus.connected ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-green-900/20 border border-green-500/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">✅</span>
                    <span className="text-green-400 font-semibold">연결됨</span>
                  </div>
                  <p className="text-sm text-slate-300">
                    <strong>블로그:</strong>{' '}
                    <a
                      href={oauthStatus.blogUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      {oauthStatus.blogUrl}
                    </a>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    연결 시간: {oauthStatus.connectedAt && new Date(oauthStatus.connectedAt).toLocaleString('ko-KR')}
                  </p>
                </div>

                <button
                  onClick={handleOAuthDisconnect}
                  className="w-full rounded-lg bg-red-600 px-4 py-3 text-white font-semibold hover:bg-red-500 transition"
                >
                  🔌 연결 해제
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-300">
                  WordPress.com 계정과 자동으로 연결하여 간편하게 포스팅하세요.
                  Application Password를 수동으로 입력할 필요가 없습니다.
                </p>

                <button
                  onClick={handleOAuthConnect}
                  disabled={isCheckingOAuth}
                  className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 text-white text-lg font-bold hover:from-blue-500 hover:to-blue-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.158 12.786l-2.698 7.84c.87.416 1.825.652 2.84.652 1.177 0 2.288-.292 3.266-.81-.027-.046-.052-.095-.076-.146l-2.332-7.536zm-5.226.95l3.17 8.674c-.024.012-.048.022-.072.034-1.457-.608-2.636-1.647-3.396-2.985-.112-.184-.21-.373-.302-.566zm8.244-6.574l-2.917 8.45 2.988 8.182c.024-.008.048-.016.071-.024 1.454-.61 2.634-1.656 3.392-3.002.112-.185.21-.372.302-.562L15.176 7.162zM13.22 7.188l-2.917 8.45L13.291 24l.002-.001c1.457-.61 2.636-1.656 3.394-3.002.112-.185.21-.372.302-.562l-3.769-12.247z"/>
                  </svg>
                  {isCheckingOAuth ? '확인 중...' : 'WordPress.com으로 연결'}
                </button>

                <div className="text-xs text-slate-400 text-center">
                  WordPress.com 또는 Jetpack이 설치된 사이트에서 사용 가능합니다
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 구분선 */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-slate-400">
            <div className="h-px flex-1 bg-slate-600"></div>
            <span className="text-sm">또는</span>
            <div className="h-px flex-1 bg-slate-600"></div>
          </div>
        </div>

        {/* 워드프레스 설정 섹션 (Application Password 방식) */}
        <div className="mb-6">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 text-white font-semibold hover:bg-purple-500 transition flex items-center justify-between"
          >
            <span>⚙️ 워드프레스 설정</span>
            <span>{showSettings ? '▲' : '▼'}</span>
          </button>

          {showSettings && (
            <div className="mt-4 rounded-lg border border-purple-500/20 bg-purple-950/20 p-6 backdrop-blur">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    워드프레스 사이트 URL
                  </label>
                  <input
                    type="text"
                    value={settings.siteUrl}
                    onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    사용자명
                  </label>
                  <input
                    type="text"
                    value={settings.username}
                    onChange={(e) => setSettings({ ...settings, username: e.target.value })}
                    placeholder="admin"
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Application Password
                    <a
                      href="https://wordpress.com/support/security/two-step-authentication/application-specific-passwords/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs text-purple-400 hover:text-purple-300"
                    >
                      (설정 방법 보기)
                    </a>
                  </label>
                  <input
                    type="password"
                    value={settings.appPassword}
                    onChange={(e) => setSettings({ ...settings, appPassword: e.target.value })}
                    placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    워드프레스 관리자 → 사용자 → 프로필에서 Application Password 생성
                  </p>
                </div>

                <button
                  onClick={saveSettings}
                  disabled={isSavingSettings}
                  className="w-full rounded-lg bg-green-600 px-4 py-3 text-white font-semibold hover:bg-green-500 transition disabled:opacity-50"
                >
                  {isSavingSettings ? '저장 중...' : '💾 설정 저장'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 자동 포스팅 섹션 */}
        <div className="rounded-3xl border border-purple-500/20 bg-purple-950/20 p-8 backdrop-blur mb-6">
          <h2 className="text-2xl font-bold text-white mb-6">📝 상품 포스팅</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                쿠팡 상품 URL
              </label>
              <input
                type="text"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://www.coupang.com/vp/products/..."
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                카테고리 (선택사항)
              </label>
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="비워두면 AI가 자동 분류합니다"
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-400">
                예: 패션, 뷰티, 식품, 생활용품, 디지털, 가전, 스포츠 등
              </p>
            </div>

            <button
              onClick={handleAutoPost}
              disabled={isPosting || (!oauthStatus.connected && !settings.siteUrl)}
              className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 text-white text-lg font-bold hover:from-purple-500 hover:to-pink-500 transition disabled:opacity-50"
            >
              {isPosting ? '포스팅 중... 🔄' : '🚀 자동 포스팅 시작'}
            </button>

            {!oauthStatus.connected && !settings.siteUrl && (
              <p className="text-sm text-yellow-400 text-center">
                ⚠️ WordPress.com 연결 또는 수동 설정이 필요합니다
              </p>
            )}
          </div>
        </div>

        {/* 포스팅 결과 */}
        {postResult && (
          <div className="rounded-lg border border-green-500/20 bg-green-950/20 p-6 backdrop-blur mb-6">
            <h3 className="text-xl font-bold text-green-400 mb-4">✅ 포스팅 완료!</h3>
            <div className="space-y-2 text-sm">
              <p className="text-slate-300">
                <strong>포스트 URL:</strong>{' '}
                <a
                  href={postResult.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 underline"
                >
                  {postResult.postUrl}
                </a>
              </p>
              <p className="text-slate-300">
                <strong>쿠팡 딥링크:</strong>{' '}
                <a
                  href={postResult.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 underline"
                >
                  {postResult.deepLink}
                </a>
              </p>
              <p className="text-slate-300">
                <strong>카테고리:</strong> {postResult.category}
              </p>
            </div>
          </div>
        )}

        {/* 포스팅 히스토리 */}
        {history.length > 0 && (
          <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-6 backdrop-blur">
            <h3 className="text-xl font-bold text-white mb-4">📋 포스팅 히스토리</h3>
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg bg-slate-700/50 p-4 border border-slate-600"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-semibold text-purple-400">
                      {item.category}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <a
                      href={item.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-white hover:text-purple-400 transition truncate"
                    >
                      🔗 {item.postUrl}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
