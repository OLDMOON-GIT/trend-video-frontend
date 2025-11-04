'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface CoupangSettings {
  accessKey: string;
  secretKey: string;
  trackingId: string;
  isConnected: boolean;
  lastChecked?: string;
}

interface Product {
  productId: string;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName: string;
  isRocket: boolean;
}

interface ShortLink {
  id: string;
  originalUrl: string;
  shortUrl: string;
  productName: string;
  clicks: number;
  createdAt: string;
}

interface ShoppingShortsTask {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  progress: string;
  startTime: string;
  endTime?: string;
  results?: any[];
  error?: string;
  logs: string[];
}

type TabType = 'partners' | 'automation';

export default function CoupangPartnersPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('partners');

  // Settings
  const [settings, setSettings] = useState<CoupangSettings>({
    accessKey: '',
    secretKey: '',
    trackingId: '',
    isConnected: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Search
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Links
  const [generatedLinks, setGeneratedLinks] = useState<ShortLink[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  // Stats
  const [stats, setStats] = useState({
    totalClicks: 0,
    totalLinks: 0,
    estimatedRevenue: 0,
    conversionRate: 0
  });

  const [toast, setToast] = useState<{message: string; type: 'success' | 'error' | 'info'} | null>(null);

  // Shopping Shorts Automation
  const [videoLimit, setVideoLimit] = useState(5);
  const [category, setCategory] = useState('electronics');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [currentTask, setCurrentTask] = useState<ShoppingShortsTask | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [taskPollingInterval, setTaskPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    checkAuth();
    loadSettings();
    loadLinks();
    loadStats();
  }, []);

  const getSessionId = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  };

  const getAuthHeaders = (): Record<string, string> => {
    const sessionId = getSessionId();
    return sessionId ? {
      'Authorization': `Bearer ${sessionId}`
    } : {};
  };

  const checkAuth = async () => {
    try {
      const sessionId = getSessionId();
      if (!sessionId) {
        console.log('세션 ID 없음');
        router.push('/auth');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.user) {
        setUser(data.user);
      } else {
        router.push('/auth');
      }
    } catch (error) {
      console.error('인증 확인 실패:', error);
      router.push('/auth');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/coupang/settings', {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings || settings);
      }
    } catch (error) {
      console.error('설정 로드 실패:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/coupang/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        showToast('설정이 저장되었습니다.', 'success');
      } else {
        throw new Error('저장 실패');
      }
    } catch (error) {
      showToast('설정 저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    try {
      const response = await fetch('/api/coupang/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(settings)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSettings({ ...settings, isConnected: true, lastChecked: new Date().toISOString() });
        showToast('✅ 연결 성공! 쿠팡 파트너스 API가 정상 작동합니다.', 'success');
      } else {
        throw new Error(data.error || '연결 실패');
      }
    } catch (error: any) {
      showToast('❌ 연결 실패: ' + error.message, 'error');
    } finally {
      setTestingConnection(false);
    }
  };

  const searchProducts = async () => {
    if (!searchKeyword.trim()) {
      showToast('검색어를 입력하세요.', 'error');
      return;
    }

    if (!settings.isConnected) {
      showToast('먼저 API 키를 연결하세요.', 'error');
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch('/api/coupang/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ keyword: searchKeyword })
      });

      const data = await response.json();

      if (response.ok) {
        setSearchResults(data.products || []);
        showToast(`${data.products?.length || 0}개의 상품을 찾았습니다.`, 'success');
      } else {
        throw new Error(data.error || '검색 실패');
      }
    } catch (error: any) {
      showToast('검색 실패: ' + error.message, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const generateLink = async (product: Product) => {
    try {
      const response = await fetch('/api/coupang/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          productId: product.productId,
          productName: product.productName,
          productUrl: product.productUrl
        })
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentProduct(product);
        setShowLinkModal(true);
        loadLinks();
        showToast('링크가 생성되었습니다!', 'success');
      } else {
        throw new Error(data.error || '링크 생성 실패');
      }
    } catch (error: any) {
      showToast('링크 생성 실패: ' + error.message, 'error');
    }
  };

  const loadLinks = async () => {
    try {
      const response = await fetch('/api/coupang/links', {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setGeneratedLinks(data.links || []);
      }
    } catch (error) {
      console.error('링크 로드 실패:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/coupang/stats', {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats || stats);
      }
    } catch (error) {
      console.error('통계 로드 실패:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('클립보드에 복사되었습니다!', 'success');
  };

  // Shopping Shorts Automation Functions
  const startShoppingShortsPipeline = async () => {
    if (!openaiApiKey.trim()) {
      showToast('OpenAI API 키를 입력하세요.', 'error');
      return;
    }

    if (!settings.isConnected) {
      showToast('먼저 쿠팡 API 키를 연결하세요.', 'error');
      return;
    }

    setIsRunningPipeline(true);
    try {
      const response = await fetch('/api/coupang/shopping-shorts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          videoLimit,
          category,
          openaiApiKey
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast('쇼핑 쇼츠 파이프라인이 시작되었습니다!', 'success');

        // 작업 상태 폴링 시작
        const interval = setInterval(() => {
          pollTaskStatus(data.taskId);
        }, 2000);
        setTaskPollingInterval(interval);

        // 초기 작업 상태 설정
        setCurrentTask({
          taskId: data.taskId,
          status: 'running',
          progress: '파이프라인 시작 중...',
          startTime: new Date().toISOString(),
          logs: []
        });
      } else {
        throw new Error(data.error || '파이프라인 시작 실패');
      }
    } catch (error: any) {
      showToast('파이프라인 시작 실패: ' + error.message, 'error');
      setIsRunningPipeline(false);
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    try {
      const response = await fetch(`/api/coupang/shopping-shorts/start?taskId=${taskId}`, {
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCurrentTask(data.status);

        if (data.status.status === 'completed' || data.status.status === 'failed') {
          // 폴링 중지
          if (taskPollingInterval) {
            clearInterval(taskPollingInterval);
            setTaskPollingInterval(null);
          }
          setIsRunningPipeline(false);

          if (data.status.status === 'completed') {
            showToast(`파이프라인 완료! ${data.status.results?.length || 0}개 영상 처리됨`, 'success');
          } else {
            showToast('파이프라인 실패: ' + data.status.error, 'error');
          }
        }
      }
    } catch (error) {
      console.error('작업 상태 조회 실패:', error);
    }
  };

  const stopShoppingShortsPipeline = async () => {
    if (!currentTask) return;

    try {
      const response = await fetch(`/api/coupang/shopping-shorts/start?taskId=${currentTask.taskId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast('파이프라인이 중지되었습니다.', 'info');

        if (taskPollingInterval) {
          clearInterval(taskPollingInterval);
          setTaskPollingInterval(null);
        }

        setIsRunningPipeline(false);
        setCurrentTask(null);
      } else {
        throw new Error(data.error || '중지 실패');
      }
    } catch (error: any) {
      showToast('중지 실패: ' + error.message, 'error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (taskPollingInterval) {
        clearInterval(taskPollingInterval);
      }
    };
  }, [taskPollingInterval]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
        <div className="text-white">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-6 top-6 z-50 rounded-lg px-6 py-3 shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-500' :
          toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        } text-white`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">🛒 쿠팡 파트너스 통합 관리</h1>
            <p className="mt-2 text-slate-300">API 연결부터 링크 생성, 수익 관리까지 한 번에</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            🏠 홈으로
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-2">
          <button
            onClick={() => setActiveTab('partners')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              activeTab === 'partners'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            🔗 파트너스 링크 생성
          </button>
          <button
            onClick={() => setActiveTab('automation')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              activeTab === 'automation'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            🤖 쇼핑 쇼츠 자동화
          </button>
        </div>
      </div>

      {/* Partners Tab */}
      {activeTab === 'partners' && (
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Settings & Search */}
        <div className="space-y-6 lg:col-span-2">
          {/* API Settings */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">🔑 API 설정</h2>
                <p className="mt-1 text-sm text-slate-400">
                  쿠팡 파트너스 API 키를 등록하고 연결하세요
                </p>
              </div>
              {settings.isConnected && (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
                  ✓ 연결됨
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Access Key
                </label>
                <input
                  type="text"
                  value={settings.accessKey}
                  onChange={(e) => setSettings({ ...settings, accessKey: e.target.value })}
                  placeholder="쿠팡 파트너스 Access Key"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Secret Key
                </label>
                <input
                  type="password"
                  value={settings.secretKey}
                  onChange={(e) => setSettings({ ...settings, secretKey: e.target.value })}
                  placeholder="쿠팡 파트너스 Secret Key"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  Tracking ID (파트너스 ID)
                </label>
                <input
                  type="text"
                  value={settings.trackingId}
                  onChange={(e) => setSettings({ ...settings, trackingId: e.target.value })}
                  placeholder="예: example_id"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={saveSettings}
                  disabled={isSaving}
                  className="flex-1 rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
                >
                  {isSaving ? '저장 중...' : '💾 저장'}
                </button>
                <button
                  onClick={testConnection}
                  disabled={testingConnection || !settings.accessKey || !settings.secretKey}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {testingConnection ? '테스트 중...' : '🔌 연결 테스트'}
                </button>
              </div>

              {settings.lastChecked && (
                <p className="text-xs text-slate-500">
                  마지막 확인: {new Date(settings.lastChecked).toLocaleString('ko-KR')}
                </p>
              )}
            </div>
          </section>

          {/* Product Search */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">🔍 상품 검색</h2>

            <div className="mb-4 flex gap-3">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchProducts()}
                placeholder="검색어를 입력하세요 (예: 노트북, 이어폰)"
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
              />
              <button
                onClick={searchProducts}
                disabled={isSearching || !settings.isConnected}
                className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {isSearching ? '검색 중...' : '검색'}
              </button>
            </div>

            {!settings.isConnected && (
              <div className="rounded-lg bg-amber-500/20 p-3 text-sm text-amber-300">
                ⚠️ 상품을 검색하려면 먼저 API 키를 연결하세요.
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="mt-4 space-y-3">
                {searchResults.map((product) => (
                  <div
                    key={product.productId}
                    className="flex gap-4 rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                  >
                    <img
                      src={product.productImage}
                      alt={product.productName}
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">{product.productName}</h3>
                      <p className="mt-1 text-sm text-slate-400">{product.categoryName}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-lg font-bold text-emerald-400">
                          {product.productPrice.toLocaleString()}원
                        </span>
                        {product.isRocket && (
                          <span className="rounded bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white">
                            로켓배송
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => generateLink(product)}
                      className="self-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                    >
                      🔗 링크 생성
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column - Stats & Links */}
        <div className="space-y-6">
          {/* Stats Dashboard */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">📊 통계</h2>

            <div className="space-y-3">
              <div className="rounded-lg bg-white/5 p-4">
                <p className="text-sm text-slate-400">총 링크 수</p>
                <p className="mt-1 text-2xl font-bold text-white">{stats.totalLinks}</p>
              </div>

              <div className="rounded-lg bg-white/5 p-4">
                <p className="text-sm text-slate-400">총 클릭 수</p>
                <p className="mt-1 text-2xl font-bold text-purple-400">{stats.totalClicks}</p>
              </div>

              <div className="rounded-lg bg-white/5 p-4">
                <p className="text-sm text-slate-400">예상 수익</p>
                <p className="mt-1 text-2xl font-bold text-emerald-400">
                  ₩{stats.estimatedRevenue.toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg bg-white/5 p-4">
                <p className="text-sm text-slate-400">전환율</p>
                <p className="mt-1 text-2xl font-bold text-blue-400">{stats.conversionRate}%</p>
              </div>
            </div>
          </section>

          {/* Generated Links */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">🔗 생성된 링크</h2>

            {generatedLinks.length === 0 ? (
              <p className="text-center text-sm text-slate-500">
                아직 생성된 링크가 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {generatedLinks.slice(0, 5).map((link) => (
                  <div
                    key={link.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-3"
                  >
                    <p className="text-sm font-semibold text-white">{link.productName}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={link.shortUrl}
                        readOnly
                        className="flex-1 rounded bg-white/5 px-2 py-1 text-xs text-slate-300"
                      />
                      <button
                        onClick={() => copyToClipboard(link.shortUrl)}
                        className="rounded bg-purple-600 px-2 py-1 text-xs font-semibold text-white hover:bg-purple-500"
                      >
                        복사
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      클릭: {link.clicks} | {new Date(link.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      )}

      {/* Automation Tab */}
      {activeTab === 'automation' && (
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Pipeline Configuration */}
        <div className="space-y-6 lg:col-span-2">
          {/* Pipeline Info */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">🎬 쇼핑 쇼츠 자동화 파이프라인</h2>
            <div className="rounded-lg bg-blue-500/20 p-4">
              <p className="text-sm font-semibold text-blue-300">자동화 프로세스:</p>
              <ol className="mt-2 space-y-1 text-sm text-blue-200">
                <li>1. 더우인(Douyin) 트렌딩 쇼핑 영상 크롤링</li>
                <li>2. 영상 다운로드 (워터마크 없는 영상 선택)</li>
                <li>3. AI로 제품 정보 추출 및 한국어 번역</li>
                <li>4. 쿠팡에서 유사 제품 검색 및 affiliate 링크 생성</li>
                <li>5. 한국어 쇼츠 대본 자동 생성 (GPT-4)</li>
                <li>6. TTS 음성 생성 (예정)</li>
                <li>7. 자막 합성 (예정)</li>
                <li>8. YouTube/Instagram/TikTok 업로드 (예정)</li>
              </ol>
            </div>
          </section>

          {/* Configuration Form */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">⚙️ 파이프라인 설정</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  OpenAI API 키
                </label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  제품 분석 및 대본 생성에 사용됩니다 (GPT-4)
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  영상 개수 (Video Limit)
                </label>
                <input
                  type="number"
                  value={videoLimit}
                  onChange={(e) => setVideoLimit(parseInt(e.target.value) || 5)}
                  min="1"
                  max="20"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  크롤링할 영상 개수 (1-20)
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  카테고리 (Category)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="electronics">전자제품</option>
                  <option value="fashion">패션</option>
                  <option value="beauty">뷰티</option>
                  <option value="home">홈데코</option>
                  <option value="kitchen">주방용품</option>
                  <option value="toys">장난감</option>
                  <option value="sports">스포츠</option>
                </select>
              </div>

              {!settings.isConnected && (
                <div className="rounded-lg bg-amber-500/20 p-3 text-sm text-amber-300">
                  ⚠️ 먼저 "파트너스 링크 생성" 탭에서 쿠팡 API 키를 연결하세요.
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={startShoppingShortsPipeline}
                  disabled={isRunningPipeline || !settings.isConnected || !openaiApiKey}
                  className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 font-bold text-white transition hover:from-purple-500 hover:to-pink-500 disabled:opacity-50"
                >
                  {isRunningPipeline ? '⏳ 실행 중...' : '🚀 파이프라인 시작'}
                </button>
                {isRunningPipeline && (
                  <button
                    onClick={stopShoppingShortsPipeline}
                    className="rounded-lg bg-red-600 px-6 py-3 font-bold text-white transition hover:bg-red-500"
                  >
                    ⏹️ 중지
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Task Progress */}
          {currentTask && (
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">📊 실행 상태</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  currentTask.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                  currentTask.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {currentTask.status === 'running' ? '⏳ 실행 중' :
                   currentTask.status === 'completed' ? '✅ 완료' : '❌ 실패'}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-400">진행 상황</p>
                  <p className="mt-1 font-semibold text-white">{currentTask.progress}</p>
                </div>

                <div>
                  <p className="text-sm text-slate-400">시작 시간</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {new Date(currentTask.startTime).toLocaleString('ko-KR')}
                  </p>
                </div>

                {currentTask.endTime && (
                  <div>
                    <p className="text-sm text-slate-400">종료 시간</p>
                    <p className="mt-1 text-sm text-slate-300">
                      {new Date(currentTask.endTime).toLocaleString('ko-KR')}
                    </p>
                  </div>
                )}

                {currentTask.error && (
                  <div className="rounded-lg bg-red-500/20 p-3">
                    <p className="text-sm font-semibold text-red-300">오류:</p>
                    <p className="mt-1 text-sm text-red-200">{currentTask.error}</p>
                  </div>
                )}

                {/* Logs */}
                {currentTask.logs.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-slate-400">실행 로그 (최근 10개)</p>
                    <div className="max-h-40 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-xs text-slate-300">
                      {currentTask.logs.slice(-10).map((log, idx) => (
                        <div key={idx} className="mb-1">{log}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Results */}
          {currentTask?.results && currentTask.results.length > 0 && (
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <h2 className="mb-4 text-xl font-bold text-white">✅ 처리 결과 ({currentTask.results.length}개)</h2>

              <div className="space-y-3">
                {currentTask.results.map((result: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white">
                          {result.product_info?.product_name_ko || result.douyin_video?.title?.substring(0, 50)}
                        </h3>
                        {result.coupang_product && (
                          <div className="mt-2 text-sm">
                            <p className="text-slate-300">
                              쿠팡 제품: {result.coupang_product.product_name?.substring(0, 50)}...
                            </p>
                            <p className="text-emerald-400">
                              가격: {result.coupang_product.product_price?.toLocaleString()}원
                            </p>
                            {result.coupang_product.affiliate_link && (
                              <button
                                onClick={() => copyToClipboard(result.coupang_product.affiliate_link)}
                                className="mt-2 rounded bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-500"
                              >
                                링크 복사
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={`ml-2 rounded-full px-2 py-1 text-xs font-semibold ${
                        result.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {result.success ? '✓' : '✗'}
                      </span>
                    </div>

                    {result.error && (
                      <p className="mt-2 text-xs text-red-400">{result.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column - Quick Stats */}
        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">📈 통계</h2>

            <div className="space-y-3">
              <div className="rounded-lg bg-white/5 p-4">
                <p className="text-sm text-slate-400">현재 상태</p>
                <p className="mt-1 text-lg font-bold text-white">
                  {isRunningPipeline ? '⏳ 실행 중' : '⏸️ 대기'}
                </p>
              </div>

              {currentTask?.results && (
                <>
                  <div className="rounded-lg bg-white/5 p-4">
                    <p className="text-sm text-slate-400">처리된 영상</p>
                    <p className="mt-1 text-2xl font-bold text-purple-400">
                      {currentTask.results.length}개
                    </p>
                  </div>

                  <div className="rounded-lg bg-white/5 p-4">
                    <p className="text-sm text-slate-400">성공률</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-400">
                      {Math.round((currentTask.results.filter((r: any) => r.success).length / currentTask.results.length) * 100)}%
                    </p>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">💡 팁</h2>

            <div className="space-y-2 text-sm text-slate-300">
              <p>• 파이프라인은 백그라운드에서 실행됩니다</p>
              <p>• 처리 시간은 영상 개수에 따라 다릅니다</p>
              <p>• 결과는 자동으로 저장됩니다</p>
              <p>• OpenAI API 사용량에 유의하세요</p>
            </div>
          </section>
        </div>
      </div>
      )}
    </div>
  );
}
