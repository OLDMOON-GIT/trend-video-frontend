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

export default function CoupangPartnersPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      </div>

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
    </div>
  );
}
