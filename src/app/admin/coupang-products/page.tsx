'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  image_url: string;
  deep_link: string;
  original_price?: number;
  discount_price?: number;
  status: string;
  view_count: number;
  click_count: number;
  created_at: string;
}

export default function CoupangProductsAdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 탭 관리
  const [activeTab, setActiveTab] = useState<'my-list' | 'pending'>('my-list');

  // 상품 추가 사이드바
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [productUrl, setProductUrl] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // 내 목록
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // 대기 목록
  const [pendingProducts, setPendingProducts] = useState<any[]>([]);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [crawlUrl, setCrawlUrl] = useState('');
  const [isCrawling, setIsCrawling] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [crawlHistory, setCrawlHistory] = useState<Array<{url: string, count: number, latestDate?: string}>>([]);
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [crawlStatus, setCrawlStatus] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [crawlLogs, setCrawlLogs] = useState<string[]>([]);
  const [showCrawlLogs, setShowCrawlLogs] = useState(false);
  const [crawlAbortController, setCrawlAbortController] = useState<AbortController | null>(null);

  // 통합 검색
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 퍼블리시
  const [isPublishing, setIsPublishing] = useState(false);

  // 페이지네이션
  const [myListPageSize, setMyListPageSize] = useState(20);
  const [myListDisplayCount, setMyListDisplayCount] = useState(20);
  const [pendingPageSize, setPendingPageSize] = useState(20);
  const [pendingDisplayCount, setPendingDisplayCount] = useState(20);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'pending') {
      loadPendingProducts();
    }
  }, [isAuthenticated, activeTab]);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();

      if (data.user) {
        setIsAuthenticated(true);
        await loadProducts();
        await loadPendingProducts(); // 대기 목록도 초기 로드
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

  const loadProducts = async (category?: string) => {
    try {
      const url = category && category !== 'all'
        ? `/api/coupang-products?category=${category}`
        : '/api/coupang-products';

      const res = await fetch(url);
      const data = await res.json();

      if (res.ok) {
        setProducts(data.products);

        // 카테고리 추출
        const cats = Array.from(new Set(data.products.map((p: Product) => p.category)));
        setCategories(cats as string[]);
      }
    } catch (error) {
      console.error('상품 목록 조회 실패:', error);
    }
  };

  const handleAddProduct = async () => {
    if (!productUrl) {
      toast.error('쿠팡 딥링크를 입력해주세요.');
      return;
    }

    if (!productUrl.includes('coupang.com') && !productUrl.includes('link.coupang.com')) {
      toast.error('올바른 쿠팡 URL을 입력해주세요.');
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch('/api/coupang-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productUrl,
          customCategory: customCategory || undefined
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('상품이 추가되었습니다!');
        setProductUrl('');
        setCustomCategory('');
        setIsSidebarOpen(false); // 사이드바 닫기
        await loadProducts();
      } else {
        toast.error(data.error || '상품 추가 실패');
      }
    } catch (error) {
      console.error('상품 추가 실패:', error);
      toast.error('상품 추가 중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('이 상품을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const res = await fetch(`/api/coupang-products/${productId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('상품이 삭제되었습니다.');
        await loadProducts();
      } else {
        toast.error('상품 삭제 실패');
      }
    } catch (error) {
      console.error('상품 삭제 실패:', error);
      toast.error('상품 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleCategoryFilter = (category: string) => {
    setSelectedCategory(category);
    loadProducts(category);
  };

  // 내 목록 선택 토글
  const toggleProductSelect = (id: string) => {
    const newSet = new Set(selectedProductIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedProductIds(newSet);
  };

  // 내 목록 전체 선택/해제
  const toggleSelectAllProducts = () => {
    if (selectedProductIds.size === products.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(products.map(p => p.id)));
    }
  };

  // 일괄 퍼블리시
  const handleBulkPublish = async () => {
    if (selectedProductIds.size === 0) {
      toast.error('퍼블리시할 상품을 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedProductIds.size}개 상품을 Google Sites에 퍼블리시하시겠습니까?`)) {
      return;
    }

    try {
      const promises = Array.from(selectedProductIds).map(id =>
        fetch(`/api/coupang-products/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' })
        })
      );

      await Promise.all(promises);
      toast.success(`${selectedProductIds.size}개 상품이 퍼블리시되었습니다!`);
      setSelectedProductIds(new Set());
      await loadProducts();
    } catch (error) {
      console.error('일괄 퍼블리시 실패:', error);
      toast.error('퍼블리시 중 오류가 발생했습니다.');
    }
  };

  // 일괄 비공개
  const handleBulkUnpublish = async () => {
    if (selectedProductIds.size === 0) {
      toast.error('비공개 전환할 상품을 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedProductIds.size}개 상품을 비공개로 전환하시겠습니까?`)) {
      return;
    }

    try {
      const promises = Array.from(selectedProductIds).map(id =>
        fetch(`/api/coupang-products/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' })
        })
      );

      await Promise.all(promises);
      toast.success(`${selectedProductIds.size}개 상품이 비공개로 전환되었습니다!`);
      setSelectedProductIds(new Set());
      await loadProducts();
    } catch (error) {
      console.error('일괄 비공개 실패:', error);
      toast.error('비공개 전환 중 오류가 발생했습니다.');
    }
  };

  // 선택한 상품 퍼블리시 (쇼핑몰에 게시)
  const handlePublishSelected = async () => {
    if (selectedProductIds.size === 0) {
      toast.error('퍼블리시할 상품을 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedProductIds.size}개 상품을 쇼핑몰에 퍼블리시하시겠습니까?`)) {
      return;
    }

    setIsPublishing(true);
    try {
      const res = await fetch('/api/coupang-products/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: Array.from(selectedProductIds)
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`${data.count}개 상품이 퍼블리시되었습니다!`);
        setSelectedProductIds(new Set());
        await loadProducts();
      } else {
        toast.error(data.error || '퍼블리시 실패');
      }
    } catch (error) {
      console.error('퍼블리시 실패:', error);
      toast.error('퍼블리시 중 오류가 발생했습니다.');
    } finally {
      setIsPublishing(false);
    }
  };

  // 대기 목록 조회
  const loadPendingProducts = async () => {
    try {
      const res = await fetch('/api/crawl-product-links');
      const data = await res.json();
      if (res.ok) {
        const products = data.products || [];
        setPendingProducts(products);

        // 크롤링 히스토리 계산 (source_url별 그룹화 + 최신 날짜)
        const historyMap = new Map<string, {count: number, latestDate: string}>();
        products.forEach((p: any) => {
          const url = p.source_url;
          const existing = historyMap.get(url);
          if (existing) {
            existing.count += 1;
            // 최신 날짜 업데이트
            if (p.created_at && new Date(p.created_at) > new Date(existing.latestDate)) {
              existing.latestDate = p.created_at;
            }
          } else {
            historyMap.set(url, { count: 1, latestDate: p.created_at || new Date().toISOString() });
          }
        });

        const history = Array.from(historyMap.entries())
          .map(([url, data]) => ({ url, count: data.count, latestDate: data.latestDate }))
          .sort((a, b) => {
            // 최신 날짜 순으로 정렬
            return new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime();
          });

        setCrawlHistory(history);
      }
    } catch (error) {
      console.error('대기 목록 조회 실패:', error);
    }
  };

  // 로그 추가 헬퍼
  const addCrawlLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    const logMessage = `[${timestamp}] ${message}`;
    setCrawlLogs(prev => [...prev, logMessage]);
    console.log(logMessage);
  };

  // 크롤링 중지
  const handleStopCrawl = () => {
    if (crawlAbortController) {
      crawlAbortController.abort();
      addCrawlLog('⛔ 사용자가 크롤링을 중지했습니다.');
      toast.error('크롤링이 중지되었습니다.');
      setIsCrawling(false);
      setCrawlAbortController(null);
    }
  };

  // 링크 크롤링
  const handleCrawlLinks = async () => {
    if (!crawlUrl) {
      toast.error('크롤링할 URL을 입력해주세요.');
      return;
    }

    setIsCrawling(true);
    setCrawlProgress(0);
    setCrawlStatus('페이지 크롤링 중...');
    setCrawlLogs([]);
    setShowCrawlLogs(true);

    // AbortController 생성
    const controller = new AbortController();
    setCrawlAbortController(controller);

    // 진행바 시뮬레이션
    // 링크당 평균 8초 예상 + 초기 페이지 크롤링 3초
    const startTime = Date.now();
    const baseTime = 3000; // 초기 페이지 크롤링
    const timePerLink = 8000; // 링크당 8초
    // 평균 5개 링크로 가정 (실제로는 응답 후 업데이트)
    let estimatedDuration = baseTime + (5 * timePerLink); // 기본 43초

    addCrawlLog(`🔍 크롤링 시작: ${crawlUrl}`);

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / estimatedDuration) * 95, 95); // 최대 95%까지만
      setCrawlProgress(progress);

      if (progress < 10) {
        setCrawlStatus('페이지 HTML 다운로드 중...');
      } else if (progress < 20) {
        setCrawlStatus('쿠팡 링크 추출 중...');
        if (Math.floor(progress) === 15) addCrawlLog('📄 HTML 다운로드 완료, 링크 추출 중...');
      } else if (progress < 40) {
        setCrawlStatus('축약 링크 확장 중...');
        if (Math.floor(progress) === 25) addCrawlLog('🔗 쿠팡 링크 발견, 축약 링크 확장 시작...');
      } else if (progress < 70) {
        setCrawlStatus('상품 정보 크롤링 중... (썸네일, 제목)');
        if (Math.floor(progress) === 45) addCrawlLog('🖼️ 상품 정보 크롤링 중...');
      } else if (progress < 90) {
        setCrawlStatus('AI 카테고리 분류 중...');
        if (Math.floor(progress) === 75) addCrawlLog('🤖 AI 카테고리 분류 중...');
      } else {
        setCrawlStatus('거의 완료...');
      }
    }, 500);

    try {
      const res = await fetch('/api/crawl-product-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl: crawlUrl }),
        signal: controller.signal
      });

      const data = await res.json();

      clearInterval(progressInterval);

      if (res.ok) {
        // 실제 링크 수에 따른 예상 시간 업데이트 (다음 크롤링 참고용)
        if (data.totalFound) {
          estimatedDuration = baseTime + (data.totalFound * timePerLink);
        }

        setCrawlProgress(100);
        setCrawlStatus(`완료! ${data.totalFound}개 링크 → ${data.added}개 추가, ${data.duplicate}개 중복, ${data.error}개 실패`);

        // 로그 추가
        addCrawlLog(`✅ 크롤링 완료: 총 ${data.totalFound}개 링크 발견`);
        addCrawlLog(`   ✓ 신규 추가: ${data.added}개`);
        addCrawlLog(`   ⏭️ 중복 제외: ${data.duplicate}개`);
        if (data.error > 0) {
          addCrawlLog(`   ❌ 실패: ${data.error}개`);
        }

        // 성공 메시지
        toast.success(data.message);

        // 에러가 있으면 경고 표시
        if (data.error > 0 && data.errors && data.errors.length > 0) {
          console.warn('❌ 크롤링 실패 링크:', data.errors);
          toast.error(`${data.error}개 링크 크롤링 실패 (로그 확인)`);
          data.errors.forEach((err: string) => {
            addCrawlLog(`   ⚠️ ${err}`);
          });
        }

        addCrawlLog('🎉 대기 목록 새로고침 중...');
        await loadPendingProducts();
        addCrawlLog('✅ 모든 작업 완료!');

        setCrawlUrl('');
      } else {
        setCrawlProgress(0);
        setCrawlStatus('');
        addCrawlLog(`❌ 크롤링 실패: ${data.error}`);
        toast.error(data.error || '크롤링 실패');
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      setCrawlProgress(0);
      setCrawlStatus('');

      // Abort 에러는 무시 (사용자가 중지한 경우)
      if (error.name === 'AbortError') {
        console.log('크롤링이 사용자에 의해 중지되었습니다.');
      } else {
        console.error('크롤링 실패:', error);
        addCrawlLog(`❌ 크롤링 오류: ${error.message}`);
        toast.error('크롤링 중 오류가 발생했습니다.');
      }
    } finally {
      setIsCrawling(false);
      setCrawlAbortController(null);
      setTimeout(() => {
        setCrawlProgress(0);
        setCrawlStatus('');
      }, 3000);
    }
  };

  // 대기 목록 선택 토글
  const togglePendingSelect = (id: string) => {
    const newSet = new Set(selectedPendingIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedPendingIds(newSet);
  };

  // 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedPendingIds.size === pendingProducts.length) {
      setSelectedPendingIds(new Set());
    } else {
      setSelectedPendingIds(new Set(pendingProducts.map(p => p.id)));
    }
  };

  // 일괄 내 목록으로 이동
  const handleMoveToMain = async () => {
    if (selectedPendingIds.size === 0) {
      toast.error('이동할 상품을 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedPendingIds.size}개 상품을 내 목록으로 이동하시겠습니까?`)) {
      return;
    }

    setIsMoving(true);
    try {
      const res = await fetch('/api/pending-products/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move-all-to-main',
          ids: Array.from(selectedPendingIds)
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message);
        setSelectedPendingIds(new Set());
        await loadPendingProducts();
        await loadProducts(); // 내 목록도 새로고침
      } else {
        toast.error(data.error || '이동 실패');
      }
    } catch (error) {
      console.error('이동 실패:', error);
      toast.error('이동 중 오류가 발생했습니다.');
    } finally {
      setIsMoving(false);
    }
  };

  // 대기 목록 개별 삭제
  const handleDeletePending = async (id: string) => {
    if (!confirm('이 상품을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const res = await fetch(`/api/pending-products/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('삭제되었습니다.');
        await loadPendingProducts();
      } else {
        toast.error('삭제 실패');
      }
    } catch (error) {
      console.error('삭제 실패:', error);
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  // 대기 목록 선택 삭제
  const handleDeleteSelected = async () => {
    if (selectedPendingIds.size === 0) {
      toast.error('삭제할 상품을 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedPendingIds.size}개 상품을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const res = await fetch('/api/pending-products/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-all',
          ids: Array.from(selectedPendingIds)
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message);
        setSelectedPendingIds(new Set());
        await loadPendingProducts();
      } else {
        toast.error(data.error || '삭제 실패');
      }
    } catch (error) {
      console.error('삭제 실패:', error);
      toast.error('삭제 중 오류가 발생했습니다.');
    }
  };

  // 특정 source_url의 모든 상품 삭제
  const handleDeleteBySourceUrl = async (sourceUrl: string, count: number) => {
    if (!confirm(`"${new URL(sourceUrl).hostname}"에서 크롤링한 ${count}개 상품을 모두 삭제하시겠습니까?`)) {
      return;
    }

    try {
      toast.loading('삭제 중...', { id: 'delete-source' });

      // 해당 source_url의 모든 상품 ID 찾기
      const productsToDelete = pendingProducts.filter(p => p.source_url === sourceUrl);
      const ids = productsToDelete.map(p => p.id);

      const res = await fetch('/api/pending-products/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-all',
          ids: ids
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`${count}개 상품이 삭제되었습니다`, { id: 'delete-source' });
        await loadPendingProducts();
      } else {
        toast.error(data.error || '삭제 실패', { id: 'delete-source' });
      }
    } catch (error) {
      console.error('삭제 실패:', error);
      toast.error('삭제 중 오류가 발생했습니다.', { id: 'delete-source' });
    }
  };

  // 통합 검색
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const query = searchQuery.toLowerCase();

      // 내 목록 검색
      const myListResults = products.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.deep_link.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
      ).map(p => ({ ...p, source: 'my-list' }));

      // 대기 목록 검색
      const pendingResults = pendingProducts.filter(p =>
        p.title?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.product_url?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
      ).map(p => ({ ...p, source: 'pending' }));

      const combined = [...myListResults, ...pendingResults];
      setSearchResults(combined);

      if (combined.length === 0) {
        toast.info('검색 결과가 없습니다.');
      }
    } catch (error) {
      console.error('검색 실패:', error);
      toast.error('검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
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

      <div className="max-w-7xl mx-auto pb-32">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🛒 쿠팡 상품 관리
          </h1>
          <p className="text-slate-400">
            쿠팡 상품을 추가하고 관리하세요. 자동으로 쇼핑몰 사이트에 표시됩니다.
          </p>
        </div>

        {/* 통합 검색 */}
        <div className="mb-8 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-6 backdrop-blur">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="제목, 설명, URL, 카테고리로 검색... (내 목록 + 대기 목록)"
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 pl-12 text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 px-8 py-3 text-white font-bold hover:from-emerald-500 hover:to-green-500 transition disabled:opacity-50"
            >
              {isSearching ? '검색 중...' : '🔍 통합 검색'}
            </button>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="rounded-lg bg-slate-700 px-4 py-3 text-white hover:bg-slate-600 transition"
              >
                ✕
              </button>
            )}
          </div>

          {/* 검색 결과 */}
          {searchResults.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold text-white mb-4">
                🔍 검색 결과 ({searchResults.length}개)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                {searchResults.map((item, idx) => (
                  <div
                    key={`${item.source}-${item.id}-${idx}`}
                    className="rounded-xl border border-slate-600 bg-slate-800/50 p-4 hover:border-emerald-500 transition"
                  >
                    {/* 출처 뱃지 */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                        item.source === 'my-list'
                          ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                          : 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                      }`}>
                        {item.source === 'my-list' ? '📦 내 목록' : '⏳ 대기 목록'}
                      </span>
                      {item.category && (
                        <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
                          {item.category}
                        </span>
                      )}
                    </div>

                    {/* 썸네일 */}
                    {item.image_url && (
                      <div className="relative w-full h-32 bg-slate-900 rounded-lg mb-3 overflow-hidden">
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="w-full h-full object-contain"
                          onError={(e) => e.currentTarget.style.display = 'none'}
                        />
                      </div>
                    )}

                    {/* 제목 */}
                    <h4 className="text-sm font-semibold text-white mb-2 line-clamp-2">
                      {item.title || '상품명'}
                    </h4>

                    {/* 설명 */}
                    {item.description && (
                      <p className="text-xs text-slate-400 mb-2 line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    {/* 액션 버튼 */}
                    <div className="flex flex-col gap-2 mt-3">
                      {item.source === 'my-list' ? (
                        <>
                          <div className="flex gap-2">
                            <a
                              href={item.deep_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 text-center rounded-lg bg-gradient-to-r from-orange-600 to-red-600 px-3 py-2 text-xs font-semibold text-white hover:from-orange-500 hover:to-red-500 transition"
                            >
                              🛒 쿠팡에서 보기
                            </a>
                            <a
                              href={`/shop/product/${item.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 text-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition"
                            >
                              👁️ 쇼핑몰
                            </a>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveTab('pending');
                            setSearchResults([]);
                            setSearchQuery('');
                          }}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition"
                        >
                          대기 목록으로
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 탭 + 설정 버튼 */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('my-list')}
              className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
                activeTab === 'my-list'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              📦 내 목록 ({products.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
                activeTab === 'pending'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              ⏳ 대기 목록 ({pendingProducts.length})
            </button>
          </div>

          {/* 설정 버튼 */}
          <button
            onClick={() => router.push('/settings?tab=google-sites')}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 text-white font-semibold hover:from-blue-500 hover:to-cyan-500 transition"
          >
            ⚙️ 설정
          </button>
        </div>

        {/* 내 목록 탭 */}
        {activeTab === 'my-list' && (
          <>
        {/* 일괄 처리 버튼 */}
        {products.length > 0 && (
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex gap-4 flex-wrap">
              <button
                onClick={toggleSelectAllProducts}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition"
              >
                {selectedProductIds.size === products.length ? '전체 해제' : '전체 선택'}
              </button>
              {selectedProductIds.size > 0 && (
                <>
                  <button
                    onClick={handleBulkPublish}
                    className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:from-green-500 hover:to-emerald-500 transition"
                  >
                    ✅ {selectedProductIds.size}개 Google Sites 퍼블리시
                  </button>
                  <button
                    onClick={handleBulkUnpublish}
                    className="rounded-lg bg-gradient-to-r from-yellow-600 to-orange-600 px-6 py-2 text-sm font-semibold text-white hover:from-yellow-500 hover:to-orange-500 transition"
                  >
                    🔒 {selectedProductIds.size}개 비공개 전환
                  </button>
                </>
              )}
              {/* 쇼핑몰 퍼블리시 버튼 */}
              {selectedProductIds.size > 0 && (
                <button
                  onClick={handlePublishSelected}
                  disabled={isPublishing}
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2 text-sm font-semibold text-white hover:from-indigo-500 hover:to-purple-500 transition disabled:opacity-50"
                >
                  {isPublishing ? '퍼블리시 중...' : `🏪 ${selectedProductIds.size}개 쇼핑몰 퍼블리시`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 카테고리 필터 + 페이지 크기 */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleCategoryFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              selectedCategory === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            전체 ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryFilter(cat)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                selectedCategory === cat
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
          </div>

          {/* 페이지 크기 선택 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">표시:</span>
            {[20, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => {
                  setMyListPageSize(size);
                  setMyListDisplayCount(size);
                }}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  myListPageSize === size
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {size}개
              </button>
            ))}
          </div>
        </div>

        {/* 상품 목록 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.slice(0, myListDisplayCount).map((product) => (
            <div
              key={product.id}
              className={`rounded-xl border backdrop-blur transition overflow-hidden ${
                selectedProductIds.has(product.id)
                  ? 'border-purple-500 bg-purple-900/30'
                  : 'border-slate-600 bg-slate-800/50 hover:border-purple-500'
              }`}
            >
              {/* 썸네일 */}
              {product.image_url && (
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="w-full h-48 object-cover"
                />
              )}

              <div className="p-4">
                {/* 체크박스 + 카테고리 + 상태 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(product.id)}
                      onChange={() => toggleProductSelect(product.id)}
                      className="w-5 h-5 rounded bg-slate-700 border-slate-500 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="inline-block rounded-full bg-purple-600 px-3 py-1 text-xs font-semibold text-white">
                      {product.category}
                    </span>
                  </div>
                  {product.status === 'published' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-600/20 text-green-300 border border-green-500/30">
                      ✅ 퍼블리시됨
                    </span>
                  )}
                </div>

                {/* 제목 */}
                <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">
                  {product.title}
                </h3>

                {/* 설명 */}
                <p className="text-sm text-slate-400 mb-4 line-clamp-3">
                  {product.description}
                </p>

                {/* 통계 */}
                <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                  <span>👁️ {product.view_count} 조회</span>
                  <span>🖱️ {product.click_count} 클릭</span>
                </div>

                {/* 파트너스 딥링크 */}
                <div className="bg-slate-900/50 rounded-lg p-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-mono break-all line-clamp-1">
                      {product.deep_link}
                    </span>
                    <button
                      onClick={() => {
                        // 안전한 클립보드 복사
                        const copyToClipboard = async (text: string) => {
                          try {
                            if (navigator.clipboard && window.isSecureContext) {
                              await navigator.clipboard.writeText(text);
                            } else {
                              // 폴백: 레거시 방법
                              const textArea = document.createElement('textarea');
                              textArea.value = text;
                              textArea.style.position = 'fixed';
                              textArea.style.left = '-999999px';
                              document.body.appendChild(textArea);
                              textArea.focus();
                              textArea.select();
                              try {
                                document.execCommand('copy');
                              } finally {
                                document.body.removeChild(textArea);
                              }
                            }
                            alert('딥링크가 복사되었습니다!');
                          } catch (err) {
                            console.error('복사 실패:', err);
                            alert('복사에 실패했습니다. 딥링크를 수동으로 복사해주세요.');
                          }
                        };
                        copyToClipboard(product.deep_link);
                      }}
                      className="ml-2 flex-shrink-0 text-slate-400 hover:text-blue-400 transition"
                      title="딥링크 복사"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <a
                      href={product.deep_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-lg bg-gradient-to-r from-orange-600 to-red-600 px-4 py-2 text-sm font-semibold text-white text-center hover:from-orange-500 hover:to-red-500 transition"
                    >
                      🛒 쿠팡에서 보기
                    </a>
                    <a
                      href={`/shop/product/${product.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white text-center hover:bg-blue-500 transition"
                    >
                      👁️ 쇼핑몰 미리보기
                    </a>
                  </div>
                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition"
                  >
                    🗑️ 삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 더보기 버튼 */}
        {myListDisplayCount < products.length && (
          <div className="text-center mt-8">
            <button
              onClick={() => setMyListDisplayCount(myListDisplayCount + myListPageSize)}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-3 text-white font-bold hover:from-purple-500 hover:to-pink-500 transition"
            >
              ➕ {Math.min(myListPageSize, products.length - myListDisplayCount)}개 더 보기 ({myListDisplayCount} / {products.length})
            </button>
          </div>
        )}

        {products.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">등록된 상품이 없습니다.</p>
            <p className="text-slate-500 text-sm mt-2">오른쪽 + 버튼을 눌러 새 상품을 추가해보세요!</p>
          </div>
        )}
        </>
      )}

        {/* 대기 목록 탭 */}
        {activeTab === 'pending' && (
          <>
            {/* 크롤링 히스토리 */}
            {crawlHistory.length > 0 && (
              <div className="mb-8 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 to-slate-800/40 p-6 backdrop-blur shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                      📚 크롤링 히스토리
                    </h3>
                    <p className="text-sm text-blue-300">
                      최근 크롤링한 {crawlHistory.length}개 링크 • 총 {pendingProducts.length}개 상품
                    </p>
                  </div>
                  {crawlHistory.length > 5 && (
                    <button
                      onClick={() => setShowAllHistory(!showAllHistory)}
                      className="px-4 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 hover:text-blue-200 transition font-semibold text-sm flex items-center gap-2"
                    >
                      {showAllHistory ? (
                        <>접기 <span className="text-xs">▲</span></>
                      ) : (
                        <>더보기 ({crawlHistory.length - 5}개) <span className="text-xs">▼</span></>
                      )}
                    </button>
                  )}
                </div>

                {/* 최근 5개 - 카드 스타일 */}
                <div className="space-y-3">
                  {crawlHistory.slice(0, 5).map((item, idx) => (
                    <div
                      key={idx}
                      className="group relative rounded-xl border border-slate-600 bg-slate-800/80 hover:bg-slate-800 hover:border-blue-500/50 transition-all p-4 shadow-lg hover:shadow-blue-500/20"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setCrawlUrl(item.url)}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30 font-semibold">
                              #{idx + 1}
                            </span>
                            <span className="text-xs text-slate-400">
                              🌐 {new URL(item.url).hostname}
                            </span>
                          </div>
                          <p className="text-sm text-white font-medium truncate mb-2 hover:text-blue-300 transition">
                            {item.url}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            {item.latestDate && (
                              <span className="flex items-center gap-1">
                                📅 {new Date(item.latestDate).toLocaleString('ko-KR', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              📦 {item.count}개 상품
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCrawlUrl(item.url);
                              toast.success('URL이 입력되었습니다!');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 hover:text-blue-200 text-xs font-semibold transition"
                            title="다시 크롤링"
                          >
                            🔄 재실행
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBySourceUrl(item.url, item.count);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-semibold transition"
                            title="모든 상품 삭제"
                          >
                            🗑️ 삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 나머지 목록 - 접을 수 있음 */}
                {showAllHistory && crawlHistory.length > 5 && (
                  <div className="mt-4 pt-4 border-t border-slate-600">
                    <h4 className="text-sm font-semibold text-slate-400 mb-3">이전 크롤링 기록</h4>
                    <div className="space-y-2">
                      {crawlHistory.slice(5).map((item, idx) => (
                        <div
                          key={idx + 5}
                          className="group flex items-center justify-between p-3 rounded-lg bg-slate-900/50 hover:bg-slate-900 transition border border-transparent hover:border-slate-600"
                        >
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => {
                              setCrawlUrl(item.url);
                              toast.success('URL이 입력되었습니다!');
                            }}
                          >
                            <p className="text-sm text-white truncate hover:text-blue-300 transition">
                              {item.url}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                              <span>🌐 {new URL(item.url).hostname}</span>
                              {item.latestDate && (
                                <span>📅 {new Date(item.latestDate).toLocaleDateString('ko-KR')}</span>
                              )}
                              <span className="text-blue-400 font-semibold">{item.count}개</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBySourceUrl(item.url, item.count);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs font-semibold ml-3"
                            title="모든 상품 삭제"
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 크롤링 섹션 */}
            <div className="mb-8 rounded-3xl border border-blue-500/20 bg-blue-950/20 p-8 backdrop-blur">
              <h2 className="text-2xl font-bold text-white mb-4">🔗 링크 모음 크롤링</h2>
              <p className="text-slate-400 mb-6 text-sm">
                외부 링크 모음 사이트에서 쿠팡 링크들을 자동으로 추출합니다
                <br />
                <span className="text-blue-400">✨ 자동으로 축약 링크를 풀고, 썸네일/제목/카테고리를 가져옵니다</span>
              </p>
              <div className="flex gap-4">
                <input
                  type="text"
                  value={crawlUrl}
                  onChange={(e) => setCrawlUrl(e.target.value)}
                  placeholder="링크 모음 사이트 URL을 입력하세요"
                  disabled={isCrawling}
                  className="flex-1 rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
                {isCrawling ? (
                  <button
                    onClick={handleStopCrawl}
                    className="rounded-lg bg-gradient-to-r from-red-600 to-rose-600 px-8 py-3 text-white font-bold hover:from-red-500 hover:to-rose-500 transition"
                  >
                    ⛔ 중지
                  </button>
                ) : (
                  <button
                    onClick={handleCrawlLinks}
                    className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-3 text-white font-bold hover:from-blue-500 hover:to-cyan-500 transition"
                  >
                    🔍 크롤링 시작
                  </button>
                )}
              </div>

              {/* 진행바 */}
              {isCrawling && crawlProgress > 0 && (
                <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-blue-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-blue-400">{crawlStatus}</span>
                    <span className="text-sm font-bold text-blue-300">{Math.round(crawlProgress)}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500 ease-out"
                      style={{ width: `${crawlProgress}%` }}
                    >
                      <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    💡 링크 확장, 썸네일 크롤링, AI 카테고리 분류 진행 중...
                  </p>
                </div>
              )}

              {/* 크롤링 로그 */}
              {showCrawlLogs && crawlLogs.length > 0 && (
                <div className="mt-6 rounded-lg border border-slate-600 bg-slate-900/90 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      📝 크롤링 로그
                      <span className="text-xs text-slate-400">({crawlLogs.length})</span>
                    </h3>
                    <button
                      onClick={() => setShowCrawlLogs(false)}
                      className="text-slate-400 hover:text-white transition"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-4 max-h-80 overflow-y-auto font-mono text-xs space-y-1">
                    {crawlLogs.map((log, idx) => (
                      <div key={idx} className="text-slate-300 hover:bg-slate-800/50 px-2 py-1 rounded">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 일괄 처리 버튼 + 페이지 크기 */}
            {pendingProducts.length > 0 && (
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="flex gap-4">
                  <button
                    onClick={toggleSelectAll}
                    className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 transition"
                  >
                    {selectedPendingIds.size === pendingProducts.length ? '전체 해제' : '전체 선택'}
                  </button>
                  {selectedPendingIds.size > 0 && (
                    <>
                      <button
                        onClick={handleMoveToMain}
                        disabled={isMoving}
                        className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:from-green-500 hover:to-emerald-500 transition disabled:opacity-50"
                      >
                        {isMoving ? '이동 중...' : `✅ ${selectedPendingIds.size}개 내 목록으로 이동`}
                      </button>
                      <button
                        onClick={handleDeleteSelected}
                        className="rounded-lg bg-gradient-to-r from-red-600 to-rose-600 px-6 py-2 text-sm font-semibold text-white hover:from-red-500 hover:to-rose-500 transition"
                      >
                        🗑️ {selectedPendingIds.size}개 삭제
                      </button>
                    </>
                  )}
                </div>

                {/* 페이지 크기 선택 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">표시:</span>
                  {[20, 50, 100].map((size) => (
                    <button
                      key={size}
                      onClick={() => {
                        setPendingPageSize(size);
                        setPendingDisplayCount(size);
                      }}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        pendingPageSize === size
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {size}개
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 대기 목록 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pendingProducts.slice(0, pendingDisplayCount).map((pending) => (
                <div
                  key={pending.id}
                  className={`rounded-xl border backdrop-blur transition overflow-hidden ${
                    selectedPendingIds.has(pending.id)
                      ? 'border-blue-500 bg-blue-900/30'
                      : 'border-slate-600 bg-slate-800/50 hover:border-blue-500'
                  }`}
                >
                  {/* 썸네일 */}
                  {pending.image_url && (
                    <div className="relative w-full h-48 bg-slate-900">
                      <img
                        src={pending.image_url}
                        alt={pending.title || '상품 이미지'}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div className="p-4">
                    {/* 체크박스 + 카테고리 */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedPendingIds.has(pending.id)}
                          onChange={() => togglePendingSelect(pending.id)}
                          className="w-5 h-5 rounded bg-slate-700 border-slate-500 text-blue-600 focus:ring-blue-500"
                        />
                        {pending.category && (
                          <span className="text-xs px-2 py-1 rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/30">
                            {pending.category}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeletePending(pending.id)}
                        className="text-slate-400 hover:text-red-500 transition"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* 제목 */}
                    {pending.title && (
                      <h3 className="text-sm font-semibold text-white mb-2 line-clamp-2">
                        {pending.title}
                      </h3>
                    )}

                    {/* 설명 */}
                    {pending.description && (
                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                        {pending.description}
                      </p>
                    )}

                    {/* URL */}
                    <div className="bg-slate-900/50 rounded-lg p-2 mb-2">
                      <p className="text-xs text-slate-500 break-all line-clamp-1">
                        {pending.product_url}
                      </p>
                    </div>

                    {/* 출처 */}
                    <p className="text-xs text-slate-500">
                      🔗 출처: {new URL(pending.source_url).hostname}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* 더보기 버튼 */}
            {pendingDisplayCount < pendingProducts.length && (
              <div className="text-center mt-8">
                <button
                  onClick={() => setPendingDisplayCount(pendingDisplayCount + pendingPageSize)}
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-3 text-white font-bold hover:from-blue-500 hover:to-cyan-500 transition-all transform hover:scale-105"
                >
                  ➕ {Math.min(pendingPageSize, pendingProducts.length - pendingDisplayCount)}개 더 보기
                  ({pendingDisplayCount} / {pendingProducts.length})
                </button>
              </div>
            )}

            {pendingProducts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-slate-400 text-lg">대기 중인 상품이 없습니다.</p>
                <p className="text-slate-500 text-sm mt-2">위에서 링크 모음을 크롤링해보세요!</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* 플로팅 추가 버튼 (내 목록 탭에서만) */}
      {activeTab === 'my-list' && (
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="fixed bottom-24 right-8 w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-3xl font-bold shadow-2xl hover:shadow-purple-500/50 hover:scale-110 transition-all z-40"
        title="새 상품 추가"
      >
        +
      </button>
      )}

      {/* 사이드바 오버레이 */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-slate-900 shadow-2xl z-50 transform transition-transform duration-300 ${
          isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* 사이드바 헤더 */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700">
            <h2 className="text-2xl font-bold text-white">➕ 새 상품 추가</h2>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-slate-400 hover:text-white transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 사이드바 컨텐츠 */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  쿠팡 딥링크 URL
                </label>
                <input
                  type="text"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="https://link.coupang.com/a/..."
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-2 text-xs text-slate-400">
                  🛒 쿠팡 파트너스 페이지에서 생성한 딥링크를 입력하세요
                </p>
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
                <p className="mt-2 text-xs text-slate-400">
                  예: 패션, 뷰티, 식품, 생활용품, 디지털, 가전, 스포츠 등
                </p>
              </div>

              <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-4">
                <p className="text-sm text-slate-300 mb-2">자동 처리 항목:</p>
                <ul className="text-xs text-slate-400 space-y-1">
                  <li>• 상품 정보 자동 크롤링</li>
                  <li>• AI 카테고리 자동 분류</li>
                  <li>• AI 상세 설명 자동 생성</li>
                  <li>• 썸네일 자동 추출</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 사이드바 푸터 */}
          <div className="p-6 border-t border-slate-700">
            <button
              onClick={handleAddProduct}
              disabled={isAdding}
              className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 text-white text-lg font-bold hover:from-purple-500 hover:to-pink-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdding ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  상품 추가 중...
                </span>
              ) : (
                '➕ 상품 추가'
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
