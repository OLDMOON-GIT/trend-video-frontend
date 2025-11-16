'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface CoupangSettings {
  accessKey: string;
  secretKey: string;
  trackingId: string;
  openaiApiKey?: string;
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
type PartnersSubTabType = 'mylist' | 'bestseller' | 'search';
type AutomationSubTabType = 'mylist' | 'crawling' | 'waiting' | 'published';

export default function CoupangPartnersPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('partners');
  const [partnersSubTab, setPartnersSubTab] = useState<PartnersSubTabType>('mylist');
  const [automationSubTab, setAutomationSubTab] = useState<AutomationSubTabType>('mylist');

  // Settings
  const [settings, setSettings] = useState<CoupangSettings>({
    accessKey: '',
    secretKey: '',
    trackingId: '',
    openaiApiKey: '',
    isConnected: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Search
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Bestseller
  const [bestsellerCategory, setBestsellerCategory] = useState('electronics');
  const [bestsellerResults, setBestsellerResults] = useState<Product[]>([]);
  const [isFetchingBestseller, setIsFetchingBestseller] = useState(false);

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
  const [productLimit, setProductLimit] = useState(3);
  const [videosPerProduct, setVideosPerProduct] = useState(2);
  const [category, setCategory] = useState('electronics');
  const [currentTask, setCurrentTask] = useState<ShoppingShortsTask | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [taskPollingInterval, setTaskPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Shopping Shorts Products
  const [shoppingProducts, setShoppingProducts] = useState<any[]>([]);
  const [productCounts, setProductCounts] = useState({ mylist: 0, crawling: 0, waiting: 0, published: 0 });
  const [loadingProducts, setLoadingProducts] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    checkAuth();
    loadSettings();
    loadLinks();
    loadStats();
    loadShoppingProducts();
  }, []);

  // 자동화 탭이 활성화되거나 서브탭이 변경될 때 상품 목록 새로고침
  useEffect(() => {
    if (activeTab === 'automation') {
      loadShoppingProducts();
    }
  }, [activeTab, automationSubTab]);

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

  // 카테고리 이름 → 쿠팡 카테고리 ID 매핑
  const getCategoryId = (category: string): string => {
    const categoryMap: Record<string, string> = {
      'electronics': '1001',      // 가전디지털
      'fashion': '1002',           // 패션의류
      'beauty': '1010',            // 뷰티
      'kitchen': '1011',           // 주방용품
      'home': '1012',              // 홈데코/인테리어
      'pets': '1029',              // 반려동물
      'baby': '1019',              // 출산/유아동
      'health': '1015',            // 헬스/건강식품
      'food': '1013',              // 식품
      'sports': '1014',            // 스포츠/레저
      'toys': '1020',              // 완구/취미
      'computers': '1001',         // 컴퓨터/노트북
      'mobile': '1001',            // 모바일/액세서리
      'camera': '1001',            // 카메라
      'gaming': '1020',            // 게임
      'smartdevice': '1001',       // 스마트기기
      'appliances': '1011',        // 가전제품
      'furniture': '1012',         // 가구
      'bedding': '1018',           // 침구/홈패브릭
      'storage': '1012',           // 수납
      'cleaning': '1011',          // 생활용품
      'travel': '1014',            // 여행
      'camping': '1014',           // 캠핑
      'fishing': '1014',           // 낚시
      'bicycle': '1014',           // 자전거
      'musical': '1020',           // 악기
      'automotive': '1016',        // 자동차용품
      'tools': '1017',             // 공구/산업용품
      'stationery': '1021',        // 문구/사무용품
      'books': '1009',             // 도서
      'garden': '1012'             // 원예
    };
    return categoryMap[category] || '1001';
  };

  const fetchBestsellers = async () => {
    if (!settings.isConnected) {
      showToast('먼저 API 키를 연결하세요.', 'error');
      return;
    }

    setIsFetchingBestseller(true);
    setBestsellerResults([]);

    try {
      const categoryId = getCategoryId(bestsellerCategory);
      const response = await fetch(`/api/coupang/products?categoryId=${categoryId}`, {
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setBestsellerResults(data.products || []);
        showToast(`${data.products?.length || 0}개의 베스트셀러 상품을 가져왔습니다.`, 'success');
      } else {
        throw new Error(data.error || '베스트셀러 조회 실패');
      }
    } catch (error: any) {
      showToast('베스트셀러 조회 실패: ' + error.message, 'error');
    } finally {
      setIsFetchingBestseller(false);
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

  const loadShoppingProducts = async () => {
    setLoadingProducts(true);
    try {
      const statusParam = automationSubTab === 'mylist' ? '' : `?status=${automationSubTab}`;
      const response = await fetch(`/api/coupang/shopping-shorts/products${statusParam}`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setShoppingProducts(data.products || []);
        setProductCounts(data.counts || { mylist: 0, crawling: 0, waiting: 0, published: 0 });
      }
    } catch (error) {
      console.error('상품 목록 로드 실패:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('클립보드에 복사되었습니다!', 'success');
  };

  // Shopping Shorts Automation Functions
  const startShoppingShortsPipeline = async () => {
    // OpenAI는 경고만 (중국어 번역에 필요)
    if (!settings.openaiApiKey?.trim()) {
      showToast('⚠️ OpenAI 미설정 - 기본 번역 사용됩니다 (AI 번역 스킵)', 'info');
    }

    // 쿠팡 연결은 경고만 (선택사항)
    if (!settings.isConnected) {
      showToast('⚠️ 쿠팡 API 미연결 - 프론트엔드 API 사용', 'info');
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
          productLimit,
          videosPerProduct,
          category,
          openaiApiKey: settings.openaiApiKey
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
        const prevStatus = currentTask?.status;
        setCurrentTask(data.status);

        if (data.status.status === 'completed' || data.status.status === 'failed') {
          // 폴링 중지
          if (taskPollingInterval) {
            clearInterval(taskPollingInterval);
            setTaskPollingInterval(null);
          }
          setIsRunningPipeline(false);

          // 상태 변경 시에만 토스트 표시 (중복 방지)
          if (prevStatus !== data.status.status) {
            if (data.status.status === 'completed') {
              showToast(`파이프라인 완료! ${data.status.results?.length || 0}개 상품 처리됨`, 'success');
            } else {
              showToast('파이프라인 실패: ' + data.status.error, 'error');
            }
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
      <div className="space-y-6">
        {/* API Settings - Always visible */}
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

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={settings.openaiApiKey || ''}
                  onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  쇼핑 쇼츠 자동화에 사용 (GPT-4 제품 분석 및 대본 생성)
                </p>
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

        {/* Sub Tabs for Partners */}
        <div className="flex gap-2">
          <button
            onClick={() => setPartnersSubTab('mylist')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              partnersSubTab === 'mylist'
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            📋 내목록
          </button>
          <button
            onClick={() => setPartnersSubTab('bestseller')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              partnersSubTab === 'bestseller'
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            🏆 베스트셀러
          </button>
          <button
            onClick={() => setPartnersSubTab('search')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              partnersSubTab === 'search'
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            🔍 상품 검색
          </button>
        </div>

        {/* My List Sub Tab */}
        {partnersSubTab === 'mylist' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Stats Dashboard */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur lg:col-span-1">
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
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur lg:col-span-2">
            <h2 className="mb-4 text-xl font-bold text-white">🔗 생성된 링크</h2>

            {generatedLinks.length === 0 ? (
              <p className="text-center text-sm text-slate-500">
                아직 생성된 링크가 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {generatedLinks.map((link) => (
                  <div
                    key={link.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-sm font-semibold text-white">{link.productName}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={link.shortUrl}
                        readOnly
                        className="flex-1 rounded bg-white/5 px-3 py-2 text-sm text-slate-300"
                      />
                      <button
                        onClick={() => copyToClipboard(link.shortUrl)}
                        className="rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500"
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
        )}

        {/* Bestseller Sub Tab */}
        {partnersSubTab === 'bestseller' && (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">🏆 베스트셀러 상품</h2>

            <div className="mb-4 flex gap-3">
              <select
                value={bestsellerCategory}
                onChange={(e) => setBestsellerCategory(e.target.value)}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white focus:border-purple-500 focus:outline-none [&>option]:bg-slate-800 [&>option]:text-white [&>optgroup]:bg-slate-900 [&>optgroup]:text-slate-300"
              >
                <optgroup label="인기 카테고리" className="bg-slate-900 text-slate-300">
                  <option value="electronics" className="bg-slate-800 text-white">📱 전자제품</option>
                  <option value="fashion" className="bg-slate-800 text-white">👗 패션</option>
                  <option value="beauty" className="bg-slate-800 text-white">💄 뷰티/화장품</option>
                  <option value="kitchen" className="bg-slate-800 text-white">🍳 주방용품</option>
                  <option value="home" className="bg-slate-800 text-white">🏠 홈데코/인테리어</option>
                </optgroup>
                <optgroup label="라이프스타일" className="bg-slate-900 text-slate-300">
                  <option value="pets" className="bg-slate-800 text-white">🐶 반려동물용품</option>
                  <option value="baby" className="bg-slate-800 text-white">👶 유아/출산</option>
                  <option value="health" className="bg-slate-800 text-white">💊 건강/웰니스</option>
                  <option value="food" className="bg-slate-800 text-white">🍽️ 식품/간식</option>
                  <option value="sports" className="bg-slate-800 text-white">⚽ 스포츠/아웃도어</option>
                  <option value="toys" className="bg-slate-800 text-white">🧸 장난감/취미</option>
                </optgroup>
                <optgroup label="디지털/IT" className="bg-slate-900 text-slate-300">
                  <option value="computers" className="bg-slate-800 text-white">💻 컴퓨터/노트북</option>
                  <option value="mobile" className="bg-slate-800 text-white">📱 핸드폰/액세서리</option>
                  <option value="camera" className="bg-slate-800 text-white">📷 카메라/영상장비</option>
                  <option value="gaming" className="bg-slate-800 text-white">🎮 게임/콘솔</option>
                  <option value="smartdevice" className="bg-slate-800 text-white">⌚ 스마트기기/웨어러블</option>
                </optgroup>
                <optgroup label="가정/생활" className="bg-slate-900 text-slate-300">
                  <option value="appliances" className="bg-slate-800 text-white">🔌 가전제품</option>
                  <option value="furniture" className="bg-slate-800 text-white">🛋️ 가구</option>
                  <option value="bedding" className="bg-slate-800 text-white">🛏️ 침구/홈패브릭</option>
                  <option value="storage" className="bg-slate-800 text-white">📦 수납/정리용품</option>
                  <option value="cleaning" className="bg-slate-800 text-white">🧹 청소/생활용품</option>
                </optgroup>
                <optgroup label="취미/레저" className="bg-slate-900 text-slate-300">
                  <option value="travel" className="bg-slate-800 text-white">✈️ 여행/레저용품</option>
                  <option value="camping" className="bg-slate-800 text-white">⛺ 캠핑/등산</option>
                  <option value="fishing" className="bg-slate-800 text-white">🎣 낚시</option>
                  <option value="bicycle" className="bg-slate-800 text-white">🚴 자전거</option>
                  <option value="musical" className="bg-slate-800 text-white">🎸 악기</option>
                </optgroup>
                <optgroup label="기타" className="bg-slate-900 text-slate-300">
                  <option value="automotive" className="bg-slate-800 text-white">🚗 자동차용품</option>
                  <option value="tools" className="bg-slate-800 text-white">🔧 공구/DIY</option>
                  <option value="stationery" className="bg-slate-800 text-white">✏️ 문구/사무용품</option>
                  <option value="books" className="bg-slate-800 text-white">📚 도서</option>
                  <option value="garden" className="bg-slate-800 text-white">🌱 원예/가드닝</option>
                </optgroup>
              </select>
              <button
                onClick={fetchBestsellers}
                disabled={isFetchingBestseller || !settings.isConnected}
                className="rounded-lg bg-emerald-600 px-6 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {isFetchingBestseller ? '조회 중...' : '가져오기'}
              </button>
            </div>

            {!settings.isConnected && (
              <div className="rounded-lg bg-amber-500/20 p-3 text-sm text-amber-300">
                ⚠️ 베스트셀러를 조회하려면 먼저 API 키를 연결하세요.
              </div>
            )}

            {bestsellerResults.length > 0 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {bestsellerResults.map((product) => (
                  <div
                    key={product.productId}
                    className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                  >
                    <img
                      src={product.productImage}
                      alt={product.productName}
                      className="h-48 w-full rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-white line-clamp-2">{product.productName}</h3>
                      <p className="mt-1 text-sm text-slate-400">{product.categoryName}</p>
                      <div className="mt-2 flex items-center gap-2">
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
                      className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                    >
                      🔗 링크 생성
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Search Sub Tab */}
        {partnersSubTab === 'search' && (
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
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((product) => (
                  <div
                    key={product.productId}
                    className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                  >
                    <img
                      src={product.productImage}
                      alt={product.productName}
                      className="h-48 w-full rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-white line-clamp-2">{product.productName}</h3>
                      <p className="mt-1 text-sm text-slate-400">{product.categoryName}</p>
                      <div className="mt-2 flex items-center gap-2">
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
                      className="w-full rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                    >
                      🔗 링크 생성
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      )}

      {/* Automation Tab */}
      {activeTab === 'automation' && (
      <div className="space-y-6">
        {/* Sub Tabs for Automation */}
        <div className="flex gap-2">
          <button
            onClick={() => setAutomationSubTab('mylist')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              automationSubTab === 'mylist'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            📦 내 목록 ({productCounts.mylist})
          </button>
          <button
            onClick={() => setAutomationSubTab('crawling')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              automationSubTab === 'crawling'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            ⚙️ 크롤링 큐 ({productCounts.crawling})
          </button>
          <button
            onClick={() => setAutomationSubTab('waiting')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              automationSubTab === 'waiting'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            ⏳ 대기 목록 ({productCounts.waiting})
          </button>
          <button
            onClick={() => setAutomationSubTab('published')}
            className={`rounded-lg px-6 py-2 font-semibold transition ${
              automationSubTab === 'published'
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            📤 퍼블리시 ({productCounts.published})
          </button>
        </div>

        {/* Product List Section */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="mb-4 text-xl font-bold text-white">
            {automationSubTab === 'mylist' && '📦 전체 상품 목록'}
            {automationSubTab === 'crawling' && '⚙️ 크롤링 중인 상품'}
            {automationSubTab === 'waiting' && '⏳ 대기 중인 상품'}
            {automationSubTab === 'published' && '📤 퍼블리시된 영상'}
          </h2>

          {loadingProducts ? (
            <div className="text-center text-slate-400">로딩 중...</div>
          ) : shoppingProducts.length === 0 ? (
            <div className="text-center text-slate-500">
              {automationSubTab === 'mylist' && '아직 크롤링된 상품이 없습니다.'}
              {automationSubTab === 'crawling' && '크롤링 중인 상품이 없습니다.'}
              {automationSubTab === 'waiting' && '대기 중인 상품이 없습니다.'}
              {automationSubTab === 'published' && '퍼블리시된 영상이 없습니다.'}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shoppingProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  {product.thumbnailUrl && (
                    <img
                      src={product.thumbnailUrl}
                      alt={product.productName}
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-white line-clamp-2">{product.productName}</h3>
                    {product.productNameChinese && (
                      <p className="mt-1 text-sm text-slate-400">{product.productNameChinese}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">{product.category}</p>
                    <div className="mt-2">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${
                        product.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' :
                        product.status === 'crawling' ? 'bg-blue-500/20 text-blue-400' :
                        product.status === 'processing' ? 'bg-purple-500/20 text-purple-400' :
                        product.status === 'waiting' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {product.status === 'published' && '✅ 퍼블리시됨'}
                        {product.status === 'crawling' && '⚙️ 크롤링 중'}
                        {product.status === 'processing' && '⚡ 처리 중'}
                        {product.status === 'waiting' && '⏳ 대기 중'}
                        {product.status === 'failed' && '❌ 실패'}
                      </span>
                    </div>
                  </div>
                  {product.videoUrl && (
                    <a
                      href={product.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-blue-500"
                    >
                      🎬 영상 보기
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Pipeline Configuration */}
        <div className="space-y-6 lg:col-span-2">
          {/* Pipeline Info */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">🎬 쇼핑 쇼츠 자동화</h2>
            <div className="rounded-lg bg-blue-500/20 p-4">
              <p className="text-sm font-semibold text-blue-300">자동화 프로세스:</p>
              <ol className="mt-2 space-y-1 text-sm text-blue-200">
                <li>1. 🛒 쿠팡 베스트셀러 상품 가져오기</li>
                <li>2. 🔤 상품명 → 키워드 분석 (GPT-4)</li>
                <li>3. 📥 영상 콘텐츠 수집</li>
                <li>4. 🔊 한국어 TTS 음성 생성 (예정)</li>
                <li>5. 📝 자막 + 쿠팡링크 합성 (예정)</li>
                <li>6. ⬆️ YouTube/Instagram/TikTok 업로드 (예정)</li>
              </ol>
            </div>
            <div className="mt-3 rounded-lg bg-emerald-500/20 p-3 text-xs text-emerald-300">
              💡 베스트 전략: 한국에서 잘 팔리는 상품 자동 분석 및 쇼츠 제작
            </div>
          </section>

          {/* Configuration Form */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-xl font-bold text-white">⚙️ 파이프라인 설정</h2>

            {settings.openaiApiKey && (
              <div className="mb-4 rounded-lg bg-emerald-500/20 p-3 text-sm text-emerald-300">
                ✅ OpenAI API 키 설정됨 - 전체 파이프라인 (AI 분석 포함) 실행 가능
              </div>
            )}

            {!settings.openaiApiKey && (
              <div className="mb-4 rounded-lg bg-blue-500/20 p-3 text-sm text-blue-300">
                ℹ️ OpenAI 미설정 - 크롤링/다운로드만 테스트됩니다 (Step 1-2)
                <br />
                AI 분석/대본 생성은 "파트너스 링크 생성" 탭에서 OpenAI API 키 설정 필요 (Step 3, 5)
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  상품 개수 (Product Limit)
                </label>
                <input
                  type="number"
                  value={productLimit}
                  onChange={(e) => setProductLimit(parseInt(e.target.value) || 3)}
                  min="1"
                  max="10"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  쿠팡에서 가져올 베스트셀러 상품 개수 (1-10)
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  상품당 영상 개수 (Videos Per Product)
                </label>
                <input
                  type="number"
                  value={videosPerProduct}
                  onChange={(e) => setVideosPerProduct(parseInt(e.target.value) || 2)}
                  min="1"
                  max="5"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  각 상품당 생성할 영상 개수 (1-5)
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  카테고리 (Category)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white focus:border-purple-500 focus:outline-none [&>option]:bg-slate-800 [&>option]:text-white [&>optgroup]:bg-slate-900 [&>optgroup]:text-slate-300"
                >
                  <optgroup label="인기 카테고리" className="bg-slate-900 text-slate-300">
                    <option value="electronics" className="bg-slate-800 text-white">📱 전자제품</option>
                    <option value="fashion" className="bg-slate-800 text-white">👗 패션</option>
                    <option value="beauty" className="bg-slate-800 text-white">💄 뷰티/화장품</option>
                    <option value="kitchen" className="bg-slate-800 text-white">🍳 주방용품</option>
                    <option value="home" className="bg-slate-800 text-white">🏠 홈데코/인테리어</option>
                  </optgroup>
                  <optgroup label="라이프스타일" className="bg-slate-900 text-slate-300">
                    <option value="pets" className="bg-slate-800 text-white">🐶 반려동물용품</option>
                    <option value="baby" className="bg-slate-800 text-white">👶 유아/출산</option>
                    <option value="health" className="bg-slate-800 text-white">💊 건강/웰니스</option>
                    <option value="food" className="bg-slate-800 text-white">🍽️ 식품/간식</option>
                    <option value="sports" className="bg-slate-800 text-white">⚽ 스포츠/아웃도어</option>
                    <option value="toys" className="bg-slate-800 text-white">🧸 장난감/취미</option>
                  </optgroup>
                  <optgroup label="디지털/IT" className="bg-slate-900 text-slate-300">
                    <option value="computers" className="bg-slate-800 text-white">💻 컴퓨터/노트북</option>
                    <option value="mobile" className="bg-slate-800 text-white">📱 핸드폰/액세서리</option>
                    <option value="camera" className="bg-slate-800 text-white">📷 카메라/영상장비</option>
                    <option value="gaming" className="bg-slate-800 text-white">🎮 게임/콘솔</option>
                    <option value="smartdevice" className="bg-slate-800 text-white">⌚ 스마트기기/웨어러블</option>
                  </optgroup>
                  <optgroup label="가정/생활" className="bg-slate-900 text-slate-300">
                    <option value="appliances" className="bg-slate-800 text-white">🔌 가전제품</option>
                    <option value="furniture" className="bg-slate-800 text-white">🛋️ 가구</option>
                    <option value="bedding" className="bg-slate-800 text-white">🛏️ 침구/홈패브릭</option>
                    <option value="storage" className="bg-slate-800 text-white">📦 수납/정리용품</option>
                    <option value="cleaning" className="bg-slate-800 text-white">🧹 청소/생활용품</option>
                  </optgroup>
                  <optgroup label="취미/레저" className="bg-slate-900 text-slate-300">
                    <option value="travel" className="bg-slate-800 text-white">✈️ 여행/레저용품</option>
                    <option value="camping" className="bg-slate-800 text-white">⛺ 캠핑/등산</option>
                    <option value="fishing" className="bg-slate-800 text-white">🎣 낚시</option>
                    <option value="bicycle" className="bg-slate-800 text-white">🚴 자전거</option>
                    <option value="musical" className="bg-slate-800 text-white">🎸 악기</option>
                  </optgroup>
                  <optgroup label="기타" className="bg-slate-900 text-slate-300">
                    <option value="automotive" className="bg-slate-800 text-white">🚗 자동차용품</option>
                    <option value="tools" className="bg-slate-800 text-white">🔧 공구/DIY</option>
                    <option value="stationery" className="bg-slate-800 text-white">✏️ 문구/사무용품</option>
                    <option value="books" className="bg-slate-800 text-white">📚 도서</option>
                    <option value="garden" className="bg-slate-800 text-white">🌱 원예/가드닝</option>
                  </optgroup>
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  쿠팡 베스트셀러 카테고리 선택
                </p>
              </div>

              {!settings.isConnected && (
                <div className="rounded-lg bg-blue-500/20 p-3 text-sm text-blue-300">
                  ℹ️ 쿠팡 API 미연결 - 프론트엔드 API로 자동 조회합니다
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={startShoppingShortsPipeline}
                  disabled={isRunningPipeline}
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
                    <p className="mb-2 text-sm font-semibold text-slate-400">실행 로그 (최근 50개)</p>
                    <div className="max-h-96 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-xs text-slate-300">
                      {currentTask.logs.slice(-50).map((log, idx) => (
                        <div key={idx} className="mb-1 whitespace-pre-wrap break-words">{log}</div>
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
                          {result.product_info?.product_name_ko || '상품 정보'}
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
