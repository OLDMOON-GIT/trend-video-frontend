'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import CoupangQueueMonitor from '@/components/CoupangQueueMonitor';

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  image_url: string;
  product_url?: string;
  deep_link: string;
  original_price?: number;
  discount_price?: number;
  status: string;
  view_count: number;
  click_count: number;
  created_at: string;
}

interface CrawlHistoryItem {
  id: string;
  url: string;
  hostname?: string;
  lastCrawledAt?: string;
  resultCount?: number;
  duplicateCount?: number;
  errorCount?: number;
  totalLinks?: number;
  status?: string;
  message?: string;
  pendingCount?: number;
}

const HISTORY_INITIAL_LIMIT = 5;
const HISTORY_PAGE_SIZE = 10;

export default function CoupangProductsAdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 탭 관리 - URL에서 초기값 읽기
  const [activeTab, setActiveTab] = useState<'my-list' | 'pending'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'pending') return 'pending';
    }
    return 'my-list';
  });

  // 탭 변경 시 URL도 업데이트
  const changeTab = (tab: 'my-list' | 'pending') => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === 'pending') {
      params.set('tab', 'pending');
    } else {
      params.delete('tab');
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
  };

  // 상품 추가 사이드바
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [productUrl, setProductUrl] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // 내 목록
  const [products, setProducts] = useState<Product[]>([]); // 전체 상품
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]); // 필터링된 상품
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // 대기 목록
  const [pendingProducts, setPendingProducts] = useState<any[]>([]);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [crawlUrl, setCrawlUrl] = useState('');
  const [isCrawling, setIsCrawling] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [crawlHistory, setCrawlHistory] = useState<CrawlHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [crawlProgress, setCrawlProgress] = useState(0);
  const [crawlStatus, setCrawlStatus] = useState('');
  const [crawlLogs, setCrawlLogs] = useState<string[]>([]);
  const [showCrawlLogs, setShowCrawlLogs] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobPollingInterval, setJobPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const applyPendingCounts = (historyItems: CrawlHistoryItem[], products: any[]) => {
    if (historyItems.length === 0) return historyItems;
    const counts = new Map<string, number>();
    products.forEach((p: any) => {
      if (!p?.source_url) return;
      counts.set(p.source_url, (counts.get(p.source_url) || 0) + 1);
    });
    return historyItems.map(item => ({
      ...item,
      pendingCount: counts.get(item.url) ?? 0
    }));
  };

  const getHostnameFromUrl = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

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
      loadLinkHistory();
    }
  }, [isAuthenticated, activeTab]);

  // products 또는 selectedCategory 변경 시 필터링 업데이트
  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(products.filter((p: Product) => p.category === selectedCategory));
    }
  }, [products, selectedCategory]);

  // 컴포넌트 언마운트 시 폴링 정리
  useEffect(() => {
    return () => {
      if (jobPollingInterval) {
        clearInterval(jobPollingInterval);
      }
    };
  }, [jobPollingInterval]);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();

      if (data.user) {
        setIsAuthenticated(true);
        await loadProducts();
        await loadPendingProducts(); // 대기 목록도 초기 로드
        await loadLinkHistory();

        // 진행 중인 작업 복구 (새로고침 시)
        await checkOngoingJob();
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

  // 진행 중인 작업 확인 및 복구
  const checkOngoingJob = async () => {
    try {
      // 가장 최근의 product_batch 작업 중 processing 상태인 것 찾기
      const res = await fetch('/api/job-status?type=product_batch&status=processing');
      const data = await res.json();

      if (data.jobId) {
        console.log('🔄 진행 중인 작업 발견:', data.jobId);
        setCurrentJobId(data.jobId);
        setIsMoving(true);
        setShowCrawlLogs(true);
        setCrawlProgress(data.progress || 0);
        setCrawlStatus(data.step || '');

        // 로그 로드
        if (data.logs && Array.isArray(data.logs)) {
          const logMessages = data.logs.map((log: any) =>
            typeof log === 'string' ? log : log.log_message
          );
          setCrawlLogs(logMessages);
        }

        // 폴링 시작
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/job-status?jobId=${data.jobId}`);
            const statusData = await statusRes.json();

            setCrawlProgress(statusData.progress || 0);
            setCrawlStatus(statusData.step || '');

            if (statusData.logs && Array.isArray(statusData.logs)) {
              const logMessages = statusData.logs.map((log: any) =>
                typeof log === 'string' ? log : log.log_message
              );
              setCrawlLogs(logMessages);
            }

            if (statusData.status === 'completed' || statusData.status === 'failed') {
              clearInterval(interval);
              setJobPollingInterval(null);
              setIsMoving(false);
              setCurrentJobId(null);

              if (statusData.status === 'completed') {
                toast.success('일괄 이동이 완료되었습니다!');
                await loadPendingProducts();
                await loadProducts();
              } else {
                toast.error('일괄 이동 실패: ' + (statusData.error || '알 수 없는 오류'));
              }
            }
          } catch (pollError) {
            console.error('폴링 오류:', pollError);
          }
        }, 2000);

        setJobPollingInterval(interval);
      }
    } catch (error) {
      console.error('진행 중인 작업 확인 실패:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await fetch('/api/coupang-products');
      const data = await res.json();

      if (res.ok) {
        setProducts(data.products);

        // 카테고리 추출 (전체 상품에서)
        const cats = Array.from(new Set(data.products.map((p: Product) => p.category)));
        setCategories(cats as string[]);

        // 필터링은 useEffect에서 자동 처리됨
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
    // 필터링은 useEffect에서 자동 처리됨
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
    if (selectedProductIds.size === filteredProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  // 일괄 퍼블리시
  const handleBulkPublish = async () => {
    if (selectedProductIds.size === 0) {
      toast.error('퍼블리시할 상품을 선택해주세요.');
      return;
    }

    // 선택한 상품 중 이미 published 상태인 것만 선택되었는지 확인
    const selectedProducts = products.filter(p => selectedProductIds.has(p.id));
    const alreadyPublished = selectedProducts.filter(p => p.status === 'published');
    const needsPublish = selectedProducts.filter(p => p.status !== 'published');

    if (needsPublish.length === 0) {
      toast.error('선택한 모든 상품이 이미 Google Sites에 퍼블리시되어 있습니다.');
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
      toast.success(`${needsPublish.length}개 상품이 퍼블리시되었습니다!${alreadyPublished.length > 0 ? ` (${alreadyPublished.length}개는 이미 퍼블리시됨)` : ''}`);
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

    // 선택한 상품 중 이미 active(비공개) 상태인 것만 선택되었는지 확인
    const selectedProducts = products.filter(p => selectedProductIds.has(p.id));
    const alreadyActive = selectedProducts.filter(p => p.status === 'active');
    const needsUnpublish = selectedProducts.filter(p => p.status !== 'active');

    if (needsUnpublish.length === 0) {
      toast.error('선택한 모든 상품이 이미 비공개 상태입니다.');
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
      toast.success(`${needsUnpublish.length}개 상품이 비공개로 전환되었습니다!${alreadyActive.length > 0 ? ` (${alreadyActive.length}개는 이미 비공개)` : ''}`);
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
        if (data.alreadyPublished) {
          toast.error(data.message || '선택한 모든 상품이 이미 쇼핑몰에 퍼블리시되어 있습니다.');
        } else {
          toast.success(`${data.count}개 상품이 퍼블리시되었습니다!`);
        }
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
        setCrawlHistory(prev => applyPendingCounts(prev, products));
      }
    } catch (error) {
      console.error('대기 목록 조회 실패:', error);
    }
  };

  const loadLinkHistory = async (
    { append = false, limit = HISTORY_INITIAL_LIMIT }: { append?: boolean; limit?: number } = {}
  ) => {
    try {
      setIsHistoryLoading(true);
      const offset = append ? crawlHistory.length : 0;
      const res = await fetch(`/api/crawl-link-history?limit=${limit}&offset=${offset}`);
      const data = await res.json();

      if (!res.ok) {
        console.error('링크 히스토리 조회 실패:', data.error || data.message);
        return;
      }

      const mapped: CrawlHistoryItem[] = (data.items || []).map((item: any) => ({
        id: item.id,
        url: item.sourceUrl,
        hostname: item.hostname,
        lastCrawledAt: item.lastCrawledAt,
        resultCount: item.lastResultCount,
        duplicateCount: item.lastDuplicateCount,
        errorCount: item.lastErrorCount,
        totalLinks: item.lastTotalLinks,
        status: item.lastStatus,
        message: item.lastMessage
      }));

      setHistoryTotal(data.total || 0);

      setCrawlHistory(prev => {
        if (append) {
          const map = new Map(prev.map(item => [item.id, item]));
          mapped.forEach(item => {
            map.set(item.id, { ...map.get(item.id), ...item });
          });
          const combined = Array.from(map.values()).sort((a, b) => {
            const aTime = a.lastCrawledAt ? new Date(a.lastCrawledAt).getTime() : 0;
            const bTime = b.lastCrawledAt ? new Date(b.lastCrawledAt).getTime() : 0;
            return bTime - aTime;
          });
          return applyPendingCounts(combined, pendingProducts);
        }

        const sorted = mapped.sort((a, b) => {
          const aTime = a.lastCrawledAt ? new Date(a.lastCrawledAt).getTime() : 0;
          const bTime = b.lastCrawledAt ? new Date(b.lastCrawledAt).getTime() : 0;
          return bTime - aTime;
        });
        return applyPendingCounts(sorted, pendingProducts);
      });
    } catch (error) {
      console.error('링크 히스토리 조회 실패:', error);
    } finally {
      setIsHistoryLoading(false);
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
  const handleStopCrawl = async () => {
    if (!currentJobId) {
      toast.error('중지할 작업이 없습니다.');
      return;
    }

    // 즉시 폴링 중지
    if (jobPollingInterval) {
      clearInterval(jobPollingInterval);
      setJobPollingInterval(null);
    }

    // UI 상태 즉시 업데이트
    setIsCrawling(false);
    setCrawlStatus('중지 요청 중...');
    addCrawlLog('🛑 중지 요청 전송 중...');

    try {
      const res = await fetch(`/api/crawl-product-links?jobId=${currentJobId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (res.ok) {
        addCrawlLog('✅ 크롤링이 중지되었습니다.');
        setCrawlStatus('중지됨');
        toast.success('크롤링이 중지되었습니다.');

        // 대기 목록 새로고침
        await loadPendingProducts();
        await loadLinkHistory();
      } else {
        addCrawlLog(`❌ 중지 요청 실패: ${data.error}`);
        toast.error(data.error || '중지 실패');
      }
    } catch (error: any) {
      console.error('중지 요청 실패:', error);
      addCrawlLog(`❌ 중지 요청 오류: ${error.message}`);
      toast.error('중지 요청 중 오류가 발생했습니다.');
    } finally {
      setCurrentJobId(null);

      // 3초 후 진행바 초기화
      setTimeout(() => {
        setCrawlProgress(0);
        setCrawlStatus('');
      }, 3000);
    }
  };

  // 일괄 이동 중지
  const handleStopBatchMove = async () => {
    if (!currentJobId) {
      toast.error('중지할 작업이 없습니다.');
      return;
    }

    // 즉시 폴링 중지
    if (jobPollingInterval) {
      clearInterval(jobPollingInterval);
      setJobPollingInterval(null);
    }

    // UI 상태 즉시 업데이트
    setIsMoving(false);
    setCrawlStatus('중지 요청 중...');
    addCrawlLog('🛑 중지 요청 전송 중...');

    try {
      const res = await fetch(`/api/pending-products/batch?jobId=${currentJobId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (res.ok) {
        addCrawlLog('✅ 일괄 이동이 중지되었습니다.');
        setCrawlStatus('중지됨');
        toast.success('일괄 이동이 중지되었습니다.');

        // 대기 목록 새로고침
        await loadPendingProducts();
        await loadProducts();
      } else {
        addCrawlLog(`❌ 중지 요청 실패: ${data.error}`);
        toast.error(data.error || '중지 실패');
      }
    } catch (error: any) {
      console.error('중지 요청 실패:', error);
      addCrawlLog(`❌ 중지 요청 오류: ${error.message}`);
      toast.error('중지 요청 중 오류가 발생했습니다.');
    } finally {
      setCurrentJobId(null);

      // 3초 후 진행바 초기화
      setTimeout(() => {
        setCrawlProgress(0);
        setCrawlStatus('');
      }, 3000);
    }
  };

  // Job 상태 폴링
  // 마지막 대기 목록 새로고침 시간 추적
  const lastPendingRefreshRef = useRef<number>(0);
  const lastProgressCheckRef = useRef<number>(0);

  // 로그 자동 스크롤용 ref
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 로그가 업데이트될 때마다 자동으로 맨 아래로 스크롤
  useEffect(() => {
    if (logContainerRef.current && crawlLogs.length > 0) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [crawlLogs]);

  const pollJobStatus = async (jobId: string) => {
    try {
      const res = await fetch(`/api/crawl-product-links?jobId=${jobId}`);
      const data = await res.json();

      if (res.ok && data.job) {
        const job = data.job;

        console.log('📡 Job 상태:', {
          progress: job.progress,
          status: job.status,
          logsCount: job.logs?.length || 0,
          aborted: job.aborted
        });

        // 진행률 및 상태 업데이트
        const previousProgress = lastProgressCheckRef.current;
        setCrawlProgress(job.progress);
        setCrawlStatus(job.status);
        lastProgressCheckRef.current = job.progress;

        // 로그 업데이트 - 서버 로그로 완전히 교체
        if (job.logs && job.logs.length > 0) {
          console.log('📝 로그 업데이트:', job.logs.length, '개');
          setCrawlLogs(job.logs);
        }

        // 크롤링 진행 중 - 5초마다 또는 진행률 5% 증가마다 대기 목록 새로고침
        const now = Date.now();
        const timeSinceLastRefresh = now - lastPendingRefreshRef.current;
        const progressIncrease = job.progress - previousProgress;

        if (
          job.progress > 20 &&
          job.progress < 95 &&
          !job.aborted &&
          (timeSinceLastRefresh > 5000 || progressIncrease >= 5)
        ) {
          console.log('🔄 크롤링 중 대기 목록 자동 새로고침 (progress:', job.progress, ')');
          lastPendingRefreshRef.current = now;
          await loadPendingProducts();
        }

        // Job이 완료되었거나 중지되었으면 폴링 중지
          if (job.progress >= 100 || job.aborted || job.status.includes('완료') || job.status.includes('중지')) {
            console.log('✅ Job 완료/중지 감지, 폴링 중지');
            if (jobPollingInterval) {
              clearInterval(jobPollingInterval);
              setJobPollingInterval(null);
            }
            setIsCrawling(false);
            setCurrentJobId(null);

            // 대기 목록 새로고침
            await loadPendingProducts();
            await loadLinkHistory();
            setCrawlLogs(prev => [...prev, '✅ 대기 목록이 새로고침되었습니다.']);

          // 완료 메시지
          if (job.status.includes('완료')) {
            toast.success('크롤링이 완료되었습니다!');
          } else if (job.aborted || job.status.includes('중지')) {
            toast.error('크롤링이 중지되었습니다.');
          }

          // 3초 후 진행바 초기화
          setTimeout(() => {
            setCrawlProgress(0);
            setCrawlStatus('');
          }, 3000);
        }
      } else {
        // Job을 찾을 수 없으면 폴링 중지
        if (jobPollingInterval) {
          clearInterval(jobPollingInterval);
          setJobPollingInterval(null);
        }
        setIsCrawling(false);
        setCurrentJobId(null);
      }
    } catch (error: any) {
      console.error('Job 상태 조회 실패:', error);
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
    setCrawlStatus('크롤링 시작 중...');
    setCrawlLogs([`🔍 크롤링 시작 요청: ${crawlUrl}`]);
    setShowCrawlLogs(true);

    console.log('🚀 크롤링 시작:', crawlUrl);

    try {
      // Job 생성
      const res = await fetch('/api/crawl-product-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl: crawlUrl })
      });

      const data = await res.json();

      if (res.ok && data.jobId) {
        const jobId = data.jobId;
        setCurrentJobId(jobId);
        console.log('✅ Job 생성됨:', jobId);
        setCrawlLogs(prev => [
          ...prev,
          `✅ 크롤링 Job 생성: ${jobId}`,
          '📡 서버에서 백그라운드로 크롤링 중...'
        ]);

        // Job 상태 폴링 시작 (1초마다)
        const interval = setInterval(() => {
          pollJobStatus(jobId);
        }, 1000);
        setJobPollingInterval(interval);

        // 초기 상태 조회
        setTimeout(() => pollJobStatus(jobId), 500);
        loadLinkHistory();
      } else {
        setIsCrawling(false);
        setCrawlLogs(prev => [...prev, `❌ 크롤링 시작 실패: ${data.error || data.message}`]);
        toast.error(data.error || '크롤링 시작 실패');
      }
    } catch (error: any) {
      setIsCrawling(false);
      console.error('크롤링 시작 실패:', error);
      setCrawlLogs(prev => [...prev, `❌ 크롤링 시작 오류: ${error.message}`]);
      toast.error('크롤링 시작 중 오류가 발생했습니다.');
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
    setCrawlLogs([]);
    setShowCrawlLogs(true);

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

      if (res.ok && data.jobId) {
        toast.success('백그라운드에서 처리 중입니다.');
        setCurrentJobId(data.jobId);
        setSelectedPendingIds(new Set());

        // 폴링 시작
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/job-status?jobId=${data.jobId}`);
            const statusData = await statusRes.json();

            // 진행 상태 업데이트
            setCrawlProgress(statusData.progress || 0);
            setCrawlStatus(statusData.step || '');

            // 로그 업데이트
            if (statusData.logs && Array.isArray(statusData.logs)) {
              const logMessages = statusData.logs.map((log: any) =>
                typeof log === 'string' ? log : log.log_message
              );
              setCrawlLogs(logMessages);
            }

            // 완료 또는 실패 시 폴링 중지
            if (statusData.status === 'completed' || statusData.status === 'failed') {
              clearInterval(interval);
              setJobPollingInterval(null);
              setIsMoving(false);
              setCurrentJobId(null);

              if (statusData.status === 'completed') {
                toast.success('일괄 이동이 완료되었습니다!');
                await loadPendingProducts();
                await loadProducts(); // 내 목록도 새로고침
              } else {
                toast.error('일괄 이동 실패: ' + (statusData.error || '알 수 없는 오류'));
              }
            }
          } catch (pollError) {
            console.error('폴링 오류:', pollError);
          }
        }, 2000); // 2초마다 확인

        setJobPollingInterval(interval);
      } else {
        toast.error(data.error || '이동 실패');
        setIsMoving(false);
      }
    } catch (error) {
      console.error('이동 실패:', error);
      toast.error('이동 중 오류가 발생했습니다.');
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

  const handleRefreshHistory = () => {
    const limit = Math.max(HISTORY_INITIAL_LIMIT, crawlHistory.length || HISTORY_INITIAL_LIMIT);
    loadLinkHistory({ limit });
  };

  const handleOpenHistoryModal = () => {
    setIsHistoryModalOpen(true);
    if (crawlHistory.length < historyTotal && !isHistoryLoading) {
      loadLinkHistory({ append: true, limit: HISTORY_PAGE_SIZE });
    }
  };

  const handleCloseHistoryModal = () => {
    setIsHistoryModalOpen(false);
  };

  const handleLoadMoreHistory = () => {
    if (isHistoryLoading || crawlHistory.length >= historyTotal) return;
    loadLinkHistory({ append: true, limit: HISTORY_PAGE_SIZE });
  };

  const handleDeleteHistoryItem = async (historyId: string) => {
    if (!historyId) return;
    if (!confirm('이 링크 기록을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const res = await fetch(`/api/crawl-link-history?id=${historyId}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (res.ok) {
        toast.success('링크 기록이 삭제되었습니다.');
        setCrawlHistory(prev => applyPendingCounts(prev.filter(item => item.id !== historyId), pendingProducts));
        setHistoryTotal(prev => Math.max(0, prev - 1));
      } else {
        toast.error(data.error || '링크 기록 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('링크 기록 삭제 실패:', error);
      toast.error('링크 기록 삭제 중 오류가 발생했습니다.');
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
        toast('검색 결과가 없습니다.');
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

  const visibleHistory = crawlHistory.slice(0, HISTORY_INITIAL_LIMIT);
  const remainingHistoryCount = Math.max(historyTotal - HISTORY_INITIAL_LIMIT, 0);

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
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-white">
              <span className="text-xs uppercase tracking-widest text-slate-400">총 보유</span>
              <span className="text-lg font-bold">{products.length}</span>
              <span className="text-slate-300">개 상품</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-emerald-200">
              <span className="text-xs uppercase tracking-widest text-emerald-300">대기</span>
              <span className="text-base font-semibold">{pendingProducts.length}</span>
              <span className="text-emerald-100">개 준비 중</span>
            </span>
          </div>
        </div>

        {/* 크롤링 큐 모니터 */}
        <CoupangQueueMonitor />

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

                    {/* 가격 정보 */}
                    {(item.discount_price || item.original_price) && (
                      <div className="flex items-center gap-2 mb-2">
                        {item.discount_price && (
                          <span className="text-base font-bold text-green-400">
                            {Number(item.discount_price).toLocaleString()}원
                          </span>
                        )}
                        {item.original_price && item.discount_price !== item.original_price && (
                          <span className="text-xs text-slate-500 line-through">
                            {Number(item.original_price).toLocaleString()}원
                          </span>
                        )}
                      </div>
                    )}

                    {/* 원본 URL */}
                    {item.product_url && (
                      <div className="mb-2">
                        <a
                          href={item.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 break-all line-clamp-1 underline"
                        >
                          {item.product_url}
                        </a>
                      </div>
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
                            changeTab('pending');
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

        {/* 탭 */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => changeTab('my-list')}
              className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
                activeTab === 'my-list'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              📦 내 목록 ({products.length})
            </button>
            <button
              onClick={() => changeTab('pending')}
              className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
                activeTab === 'pending'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              ⏳ 대기 목록 ({pendingProducts.length})
            </button>
          </div>

        </div>

        {/* 내 목록 탭 */}
        {activeTab === 'my-list' && (
          <>
        {/* 카테고리 필터 탭 */}
        {products.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleCategoryFilter('all')}
                className={`px-6 py-3 rounded-xl text-base font-bold transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50 scale-105'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                }`}
              >
                🌐 전체 ({products.length})
              </button>
              {categories.map((cat) => {
                const count = products.filter(p => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => handleCategoryFilter(cat)}
                    className={`px-6 py-3 rounded-xl text-base font-bold transition-all ${
                      selectedCategory === cat
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50 scale-105'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 일괄 처리 버튼 */}
        {products.length > 0 && (
          <div className="mb-6 space-y-4">
            {/* 선택된 상품 카테고리별 개수 표시 */}
            {selectedProductIds.size > 0 && (
              <div className="rounded-lg bg-slate-800/50 border border-purple-500/30 p-4">
                <h3 className="text-sm font-semibold text-purple-400 mb-3">📊 선택한 상품 (총 {selectedProductIds.size}개)</h3>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const categoryCounts = new Map<string, number>();
                    products.forEach(p => {
                      if (selectedProductIds.has(p.id)) {
                        categoryCounts.set(p.category, (categoryCounts.get(p.category) || 0) + 1);
                      }
                    });
                    return Array.from(categoryCounts.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([category, count]) => (
                        <span key={category} className="inline-flex items-center gap-1 rounded-full bg-purple-600/20 border border-purple-500/30 px-3 py-1.5 text-sm">
                          <span className="font-semibold text-purple-300">{category}</span>
                          <span className="text-purple-400">{count}개</span>
                        </span>
                      ));
                  })()}
                </div>
              </div>
            )}

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

        {/* 페이지 크기 선택 */}
        <div className="mb-6 flex items-center justify-end gap-2">
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

        {/* 상품 목록 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.slice(0, myListDisplayCount).map((product) => (
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

                {/* 가격 정보 */}
                {(product.discount_price || product.original_price) && (
                  <div className="flex items-center gap-2 mb-3">
                    {product.discount_price && (
                      <span className="text-xl font-bold text-green-400">
                        {Number(product.discount_price).toLocaleString()}원
                      </span>
                    )}
                    {product.original_price && product.discount_price !== product.original_price && (
                      <span className="text-sm text-slate-500 line-through">
                        {Number(product.original_price).toLocaleString()}원
                      </span>
                    )}
                  </div>
                )}

                {/* 통계 제거 */}
                <div className="text-xs text-slate-500 mb-3">파트너스 조회/클릭 데이터는 관리자 페이지에서만 확인합니다.</div>

                {/* 원본 상품 URL */}
                {product.product_url && (
                  <div className="bg-slate-900/50 rounded-lg p-2 mb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">상품 원본:</span>
                      <a
                        href={product.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 underline line-clamp-1"
                      >
                        {product.product_url}
                      </a>
                    </div>
                  </div>
                )}

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
                  {/* 영상 제작 버튼 */}
                  <button
                    onClick={() => {
                      // 상품 정보를 로컬 스토리지에 저장
                      const productInfo = {
                        title: product.title,
                        thumbnail: product.image_url,
                        product_link: product.deep_link,
                        description: product.description
                      };

                      console.log('🎬🎬🎬 영상 제작하기 클릭 - 상품 정보 저장');
                      console.log('📦 Product 전체:', product);
                      console.log('📝 저장할 productInfo:', productInfo);
                      console.log('  - title:', productInfo.title);
                      console.log('  - thumbnail:', productInfo.thumbnail);
                      console.log('  - product_link:', productInfo.product_link);
                      console.log('  - description:', productInfo.description);

                      localStorage.setItem('product_video_info', JSON.stringify(productInfo));

                      // 저장 확인
                      const saved = localStorage.getItem('product_video_info');
                      console.log('💾 localStorage 저장 확인:', saved);

                      // 메인 페이지로 이동 (상품 프롬프트 타입)
                      router.push('/?promptType=product');
                      toast.success('상품 정보가 로드되었습니다!');
                    }}
                    className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:from-green-500 hover:to-emerald-500 transition"
                  >
                    🎬 영상 제작하기
                  </button>

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
        {myListDisplayCount < filteredProducts.length && (
          <div className="text-center mt-8">
            <button
              onClick={() => setMyListDisplayCount(myListDisplayCount + myListPageSize)}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-3 text-white font-bold hover:from-purple-500 hover:to-pink-500 transition"
            >
              ➕ {Math.min(myListPageSize, filteredProducts.length - myListDisplayCount)}개 더 보기 ({myListDisplayCount} / {filteredProducts.length})
            </button>
          </div>
        )}

        {filteredProducts.length === 0 && products.length > 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">선택한 카테고리에 상품이 없습니다.</p>
            <button
              onClick={() => handleCategoryFilter('all')}
              className="mt-4 rounded-lg bg-purple-600 px-6 py-2 text-white font-semibold hover:bg-purple-500 transition"
            >
              전체 상품 보기
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
            <div className="mb-8 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 to-slate-800/40 p-6 backdrop-blur shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                    📚 최근 링크 히스토리
                  </h3>
                  <p className="text-sm text-blue-300">
                    최근 크롤링한 {historyTotal}개 링크 • 대기 목록 {pendingProducts.length}개
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefreshHistory}
                    className="px-4 py-2 rounded-lg bg-slate-900/60 border border-slate-700/70 text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition text-sm font-semibold"
                  >
                    🔄 새로고침
                  </button>
                  <button
                    onClick={handleOpenHistoryModal}
                    className="px-4 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 transition text-sm font-semibold flex items-center gap-2"
                  >
                    📋 목록보기
                  </button>
                </div>
              </div>

              {historyTotal === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p>아직 저장된 링크 기록이 없습니다.</p>
                  <p className="text-slate-500 text-sm mt-2">링크 모음 URL을 입력하고 크롤링을 시작해보세요!</p>
                </div>
              ) : crawlHistory.length === 0 ? (
                <div className="text-center py-10 text-slate-400">최근 링크를 불러오는 중입니다...</div>
              ) : (
                <>
                  <div className="space-y-3">
                    {visibleHistory.map((item, idx) => {
                      const normalizedStatus = (item.status || '').toLowerCase();
                      const statusLabel = normalizedStatus === 'completed'
                        ? '완료'
                        : normalizedStatus === 'error'
                        ? '실패'
                        : normalizedStatus === 'aborted'
                        ? '중지'
                        : '진행중';
                      const statusColor = normalizedStatus === 'completed'
                        ? 'text-emerald-300'
                        : normalizedStatus === 'error'
                        ? 'text-red-300'
                        : normalizedStatus === 'aborted'
                        ? 'text-orange-300'
                        : 'text-blue-300';
                      const pendingCount = item.pendingCount ?? 0;

                      return (
                        <div
                          key={item.id}
                          className="group relative rounded-xl border border-slate-600 bg-slate-800/80 hover:bg-slate-800 hover:border-blue-500/50 transition-all p-4 shadow-lg hover:shadow-blue-500/20"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => {
                                setCrawlUrl(item.url);
                                toast.success('URL이 입력되었습니다!');
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs px-2 py-1 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30 font-semibold">
                                  #{idx + 1}
                                </span>
                                <span className="text-xs text-slate-400">
                                  🌐 {item.hostname || getHostnameFromUrl(item.url)}
                                </span>
                              </div>
                              <p className="text-sm text-white font-medium break-all mb-2 hover:text-blue-300 transition">
                                {item.url}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                {item.lastCrawledAt && (
                                  <span className="flex items-center gap-1">
                                    📅 {new Date(item.lastCrawledAt).toLocaleString('ko-KR', {
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-emerald-300">
                                  ✅ 신규 {item.resultCount ?? 0}개
                                </span>
                                {typeof item.duplicateCount === 'number' && item.duplicateCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    ⏭️ 중복 {item.duplicateCount}
                                  </span>
                                )}
                                {typeof item.errorCount === 'number' && item.errorCount > 0 && (
                                  <span className="flex items-center gap-1 text-red-300">
                                    ⚠️ 실패 {item.errorCount}
                                  </span>
                                )}
                                {pendingCount > 0 && (
                                  <span className="flex items-center gap-1 text-orange-300">
                                    🕒 대기 {pendingCount}
                                  </span>
                                )}
                                <span className={`flex items-center gap-1 font-semibold ${statusColor}`}>
                                  {statusLabel}
                                </span>
                              </div>
                              {item.message && (
                                <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                                  {item.message}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCrawlUrl(item.url);
                                  toast.success('URL이 입력되었습니다!');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 hover:text-blue-200 text-xs font-semibold transition"
                              >
                                🔁 URL 입력
                              </button>
                              {pendingCount > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteBySourceUrl(item.url, pendingCount);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 text-amber-200 text-xs font-semibold transition"
                                >
                                  🧺 대기 삭제
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteHistoryItem(item.id);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 text-xs font-semibold transition"
                              >
                                🧹 기록 삭제
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {remainingHistoryCount > 0 && (
                    <div className="text-right mt-5">
                      <button
                        onClick={handleOpenHistoryModal}
                        className="text-sm font-semibold text-blue-200 hover:text-blue-100 transition"
                      >
                        목록보기 · {remainingHistoryCount}개 더 보기
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

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

              {/* 크롤링 로그 - 접기/펼치기 가능 */}
              {(isCrawling || crawlLogs.length > 0 || showCrawlLogs) && (
                <div className="mt-6 rounded-lg border border-slate-600 bg-slate-900/90 overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 cursor-pointer hover:bg-slate-750 transition"
                    onClick={() => setShowCrawlLogs(!showCrawlLogs)}
                  >
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      {showCrawlLogs ? '▼' : '▶'} 📝 크롤링 로그
                      <span className="text-xs text-slate-400">({crawlLogs.length})</span>
                      {isCrawling && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs animate-pulse">
                          ● 진행 중
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      {!isCrawling && crawlLogs.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCrawlLogs([]);
                            setShowCrawlLogs(false);
                          }}
                          className="text-xs text-slate-400 hover:text-white transition"
                        >
                          로그 지우기
                        </button>
                      )}
                    </div>
                  </div>
                  {showCrawlLogs && (
                    <div
                      ref={logContainerRef}
                      className="p-4 h-96 overflow-y-auto font-mono text-xs space-y-1 bg-slate-950/50"
                    >
                      {crawlLogs.length > 0 ? (
                        crawlLogs.map((log, idx) => (
                          <div key={idx} className="text-slate-300 hover:bg-slate-800/50 px-2 py-1 rounded transition">
                            {log}
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500 text-center py-8">
                          {isCrawling ? '로그를 기다리는 중...' : '크롤링을 시작하면 로그가 여기에 표시됩니다.'}
                        </div>
                      )}
                    </div>
                  )}
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

                    {/* 가격 정보 */}
                    {(pending.discount_price || pending.original_price) && (
                      <div className="flex items-center gap-2 mb-3">
                        {pending.discount_price && (
                          <span className="text-lg font-bold text-green-400">
                            {Number(pending.discount_price).toLocaleString()}원
                          </span>
                        )}
                        {pending.original_price && pending.discount_price !== pending.original_price && (
                          <span className="text-xs text-slate-500 line-through">
                            {Number(pending.original_price).toLocaleString()}원
                          </span>
                        )}
                      </div>
                    )}

                    {/* 원본 URL */}
                    <div className="bg-slate-900/50 rounded-lg p-2 mb-2">
                      <a
                        href={pending.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 break-all line-clamp-1 underline"
                      >
                        {pending.product_url}
                      </a>
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
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/70 flex items-start justify-center p-4 pt-16 overflow-y-auto">
          <div className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h3 className="text-lg font-bold text-white">📋 링크 모음 전체 목록</h3>
                <p className="text-sm text-slate-400">총 {historyTotal}개 링크가 저장되어 있습니다.</p>
              </div>
              <button
                onClick={handleCloseHistoryModal}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-800">
              {crawlHistory.length === 0 ? (
                <div className="text-center text-slate-400 py-10">링크를 불러오는 중입니다...</div>
              ) : (
                crawlHistory.map((item) => {
                  const normalizedStatus = (item.status || '').toLowerCase();
                  const statusLabel = normalizedStatus === 'completed'
                    ? '완료'
                    : normalizedStatus === 'error'
                    ? '실패'
                    : normalizedStatus === 'aborted'
                    ? '중지'
                    : '진행중';
                  const statusColor = normalizedStatus === 'completed'
                    ? 'text-emerald-300'
                    : normalizedStatus === 'error'
                    ? 'text-red-300'
                    : normalizedStatus === 'aborted'
                    ? 'text-orange-300'
                    : 'text-blue-300';
                  const pendingCount = item.pendingCount ?? 0;

                  return (
                    <div key={item.id} className="px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium break-all mb-1">{item.url}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span>🌐 {item.hostname || getHostnameFromUrl(item.url)}</span>
                          {item.lastCrawledAt && (
                            <span>📅 {new Date(item.lastCrawledAt).toLocaleString('ko-KR')}</span>
                          )}
                          <span className="text-emerald-300">✅ {item.resultCount ?? 0}개</span>
                          {typeof item.duplicateCount === 'number' && item.duplicateCount > 0 && (
                            <span>⏭️ {item.duplicateCount}개 중복</span>
                          )}
                          {typeof item.errorCount === 'number' && item.errorCount > 0 && (
                            <span className="text-red-300">⚠️ {item.errorCount}개 실패</span>
                          )}
                          {pendingCount > 0 && (
                            <span className="text-orange-300">🕒 대기 {pendingCount}개</span>
                          )}
                          <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                        </div>
                        {item.message && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.message}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 w-full sm:w-48">
                        <button
                          onClick={() => {
                            setCrawlUrl(item.url);
                            toast.success('URL이 입력되었습니다!');
                          }}
                          className="px-3 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 text-xs font-semibold transition"
                        >
                          🔁 URL 입력
                        </button>
                        {pendingCount > 0 && (
                          <button
                            onClick={() => handleDeleteBySourceUrl(item.url, pendingCount)}
                            className="px-3 py-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-100 text-xs font-semibold transition"
                          >
                            🧺 대기 삭제
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteHistoryItem(item.id)}
                          className="px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-200 text-xs font-semibold transition"
                        >
                          🧹 기록 삭제
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
              <span className="text-sm text-slate-400">
                {crawlHistory.length} / {historyTotal}개 로드됨
              </span>
              {crawlHistory.length < historyTotal && (
                <button
                  onClick={handleLoadMoreHistory}
                  disabled={isHistoryLoading}
                  className="px-4 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isHistoryLoading ? '불러오는 중...' : `더보기 (${historyTotal - crawlHistory.length}개 남음)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
