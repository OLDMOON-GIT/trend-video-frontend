'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import CoupangQueueMonitor from '@/components/CoupangQueueMonitor';
import ShopClientView from '@/components/ShopClientView';
import { safeJsonResponse } from '@/lib/fetch-utils';

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
  is_favorite?: number; // 0 or 1
  queue_id?: string; // 대기목록에서 온 경우에만 존재
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

  // Google Sites 설정
  const [googleSitesEditUrl, setGoogleSitesEditUrl] = useState('');
  const [googleSitesHomeUrl, setGoogleSitesHomeUrl] = useState('');

  // 탭 관리 - URL에서 초기값 읽기
  const [activeTab, setActiveTab] = useState<'my-list' | 'queue' | 'pending' | 'shop' | 'coupang'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'pending') return 'pending';
      if (tab === 'queue') return 'queue';
      if (tab === 'shop') return 'shop';
      if (tab === 'coupang') return 'coupang';
    }
    return 'my-list';
  });

  // 쿠팡상품 서브 탭
  const [coupangSubTab, setCoupangSubTab] = useState<'bestseller' | 'search'>('bestseller');

  // 탭 변경 시 URL도 업데이트
  const changeTab = (tab: 'my-list' | 'queue' | 'pending' | 'shop' | 'coupang') => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === 'pending') {
      params.set('tab', 'pending');
    } else if (tab === 'queue') {
      params.set('tab', 'queue');
    } else if (tab === 'shop') {
      params.set('tab', 'shop');
    } else if (tab === 'coupang') {
      params.set('tab', 'coupang');
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
  const productUrlInputRef = useRef<HTMLInputElement>(null);

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

  // 상품 편집 모달
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: '',
    original_price: '',
    discount_price: ''
  });

  // 쇼핑몰 (퍼블리시된 상품)
  const [shopCategories, setShopCategories] = useState<Array<{ name: string; count: number; thumbnail?: string }>>([]);
  const [shopTotalProducts, setShopTotalProducts] = useState(0);
  const [shopDataLoaded, setShopDataLoaded] = useState(false);

  // 크롤링 큐 통계
  const [queueTotalCount, setQueueTotalCount] = useState(0);

  // 쿠팡 파트너스 통계
  const [stats, setStats] = useState({
    totalClicks: 0,
    totalLinks: 0,
    estimatedRevenue: 0,
    conversionRate: 0
  });

  // 베스트셀러
  const [bestsellerCategory, setBestsellerCategory] = useState('all');
  const [bestsellerResults, setBestsellerResults] = useState<any[]>([]);
  const [isFetchingBestseller, setIsFetchingBestseller] = useState(false);

  // 상품 검색 (쿠팡 API)
  const [searchKeyword, setSearchKeyword] = useState('');
  const [coupangSearchResults, setCoupangSearchResults] = useState<any[]>([]);
  const [isCoupangSearching, setIsCoupangSearching] = useState(false);

  // 카테고리 이름 → 쿠팡 카테고리 ID 매핑
  const getCategoryId = (category: string): string => {
    const categoryMap: Record<string, string> = {
      'all': '',                   // 전체 (빈 문자열)
      'electronics': '1001',       // 가전디지털
      'fashion': '1002',           // 패션의류
      'beauty': '1010',            // 뷰티
      'kitchen': '1011',           // 주방용품
      'home': '1012',              // 홈데코/인테리어
      'pets': '1029',              // 반려동물
      'baby': '1019',              // 출산/유아동
      'health': '1015',            // 헬스/건강식품
      'food': '1013',              // 식품
      'sports': '1014',            // 스포츠/레저
      'toys': '1020'               // 완구/취미
    };
    return categoryMap[category] || '1001';
  };

  // 딥링크 통계 로드
  const loadStats = async () => {
    try {
      const response = await fetch('/api/coupang/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sessionId')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats || stats);
      }
    } catch (error) {
      console.error('통계 로드 실패:', error);
    }
  };

  // 클립보드 복사
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('링크가 클립보드에 복사되었습니다');
  };

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
    loadStats();
  }, []);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'pending') {
      loadPendingProducts();
      loadLinkHistory();
    } else if (isAuthenticated && activeTab === 'shop') {
      loadPublishedProducts();
    }
  }, [isAuthenticated, activeTab]);

  // products 또는 selectedCategory 변경 시 필터링 업데이트
  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredProducts(products);
    } else if (selectedCategory === 'favorite') {
      // 즐겨찾기 필터
      setFilteredProducts(products.filter((p: Product) => p.is_favorite === 1));
    } else {
      setFilteredProducts(products.filter((p: Product) => p.category === selectedCategory));
    }
  }, [products, selectedCategory]);

  // 사이드바 열릴 때 링크 입력 필드에 자동 포커스
  useEffect(() => {
    if (isSidebarOpen && productUrlInputRef.current) {
      // 약간의 딜레이 후 포커스 (애니메이션 완료 대기)
      setTimeout(() => {
        productUrlInputRef.current?.focus();
      }, 300);
    }
  }, [isSidebarOpen]);


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
      const data = await safeJsonResponse(res);

      if (data.user) {
        setIsAuthenticated(true);
        await loadProducts();
        await loadPendingProducts(); // 대기 목록도 초기 로드
        await loadQueueStats(); // 크롤링 큐 통계 로드
        await loadLinkHistory();

        // 사용자 설정 로드 (Google Sites URL)
        try {
          const settingsRes = await fetch('/api/user/settings');
          const settingsData = await safeJsonResponse(settingsRes);
          if (settingsRes.ok) {
            setGoogleSitesEditUrl(settingsData.googleSitesEditUrl || '');
            setGoogleSitesHomeUrl(settingsData.googleSitesHomeUrl || '');
          }
        } catch (err) {
          console.warn('설정 로드 실패:', err);
        }

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
      const data = await safeJsonResponse(res);

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
            const statusData = await safeJsonResponse(statusRes);

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
      const data = await safeJsonResponse(res);

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

  const loadQueueStats = async () => {
    try {
      const res = await fetch('/api/coupang-crawl-queue', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await safeJsonResponse(res);

      if (res.ok) {
        // 전체 큐 항목 수 계산 (pending + processing + done + failed)
        const total = data.stats.pending + data.stats.processing + data.stats.done + data.stats.failed;
        setQueueTotalCount(total);
      }
    } catch (error) {
      console.error('큐 통계 조회 실패:', error);
    }
  };

  // 퍼블리시된 상품 조회 (쇼핑몰 데이터)
  const loadPublishedProducts = async () => {
    try {
      setShopDataLoaded(false);
      const res = await fetch('/api/shop/products/public');
      const data = await safeJsonResponse(res);

      if (res.ok && data.products) {
        // 카테고리별 상품 개수 계산
        const categoryMap = new Map<string, { count: number; thumbnail?: string }>();

        data.products.forEach((product: any) => {
          const category = product.category || '기타';
          if (!categoryMap.has(category)) {
            categoryMap.set(category, { count: 0, thumbnail: product.image_url });
          }
          const catData = categoryMap.get(category)!;
          catData.count++;
        });

        const categories = Array.from(categoryMap.entries()).map(([name, data]) => ({
          name,
          count: data.count,
          thumbnail: data.thumbnail
        }));

        setShopCategories(categories);
        setShopTotalProducts(data.products.length);
        setShopDataLoaded(true);
      }
    } catch (error) {
      console.error('쇼핑몰 데이터 조회 실패:', error);
      setShopDataLoaded(true);
    }
  };

  // 베스트셀러/검색 결과에서 바로 추가 (크롤링 없이 바로 저장)
  const handleAddToMyList = async (product: any) => {
    const loadingToast = toast.loading('내 목록에 추가 중...');

    try {
      console.log('🔄 상품 추가 시작:', product.productName);

      // 크롤링 없이 바로 저장하는 API 호출
      const res = await fetch('/api/coupang/products/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.productId,
          productName: product.productName,
          productPrice: product.productPrice,
          productImage: product.productImage,
          productUrl: product.productUrl,
          categoryName: product.categoryName
        })
      });

      const data = await safeJsonResponse(res);
      console.log('📡 API 응답:', { status: res.status, ok: res.ok, data });

      // API 응답의 success 필드를 확인 (status 200이어도 실제로는 실패할 수 있음)
      if (res.ok && data.success) {
        // 실제로 추가된 경우
        toast.success(data.message || '내 목록에 추가되었습니다!', { id: loadingToast });
        setSelectedCategory('all');
        setActiveTab('my-list'); // 내목록 탭으로 자동 전환
        await loadProducts();
      } else if (res.ok && !data.success) {
        // API는 성공했지만 상품 추가 실패 (딥링크 생성 실패 등)
        const errorMsg = data.errors && data.errors.length > 0
          ? `상품 추가 실패: ${data.errors[0]}`
          : (data.message || '딥링크 생성에 실패했습니다.');
        toast.error(errorMsg, { id: loadingToast });
        console.error('상품 추가 실패 상세:', data);
      } else {
        toast.error(data.error || '상품 추가 실패', { id: loadingToast });
      }
    } catch (error) {
      console.error('상품 추가 실패:', error);
      toast.error('상품 추가 중 오류가 발생했습니다.', { id: loadingToast });
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

      const data = await safeJsonResponse(res);

      if (res.ok) {
        toast.success('상품이 추가되었습니다!');
        setProductUrl('');
        setCustomCategory('');
        setIsSidebarOpen(false); // 사이드바 닫기
        setSelectedCategory('all'); // 카테고리 필터를 'all'로 리셋하여 새 상품이 보이도록
        await loadProducts();
        await loadQueueStats(); // 큐 통계도 업데이트
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
      const res = await fetch(`/api/coupang-products?id=${productId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await safeJsonResponse(res);

      if (res.ok) {
        toast.success('상품이 삭제되었습니다.');
        await loadProducts();
      } else {
        toast.error(data.error || '상품 삭제 실패');
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

  // 즐겨찾기 토글
  const toggleFavorite = async (productId: string, currentFavorite: number | undefined) => {
    try {
      const newFavorite = currentFavorite ? 0 : 1;

      const response = await fetch('/api/coupang-products', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          productId,
          isFavorite: newFavorite
        })
      });

      const data = await safeJsonResponse(response);

      if (response.ok) {
        toast.success(newFavorite ? '⭐ 즐겨찾기 추가' : '☆ 즐겨찾기 제거');
        // 상품 목록 새로고침
        loadProducts();
      } else {
        toast.error(data.error || '즐겨찾기 업데이트 실패');
      }
    } catch (error) {
      toast.error('즐겨찾기 업데이트 중 오류가 발생했습니다.');
    }
  };

  // 상품 편집 모달 열기
  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      title: product.title,
      description: product.description,
      category: product.category,
      original_price: product.original_price?.toString() || '',
      discount_price: product.discount_price?.toString() || ''
    });
    setIsEditModalOpen(true);
  };

  // 상품 편집 모달 닫기
  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingProduct(null);
    setEditForm({
      title: '',
      description: '',
      category: '',
      original_price: '',
      discount_price: ''
    });
  };

  // 상품 편집 저장
  const handleSaveEdit = async () => {
    if (!editingProduct) return;

    try {
      const res = await fetch(`/api/coupang-products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          category: editForm.category,
          original_price: editForm.original_price ? parseInt(editForm.original_price) : undefined,
          discount_price: editForm.discount_price ? parseInt(editForm.discount_price) : undefined
        })
      });

      if (res.ok) {
        toast.success('상품 정보가 수정되었습니다!');
        handleCloseEditModal();
        loadProducts();
      } else {
        toast.error('수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('수정 실패:', error);
      toast.error('수정 중 오류가 발생했습니다.');
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

  // 일괄 카테고리 재설정
  const handleBulkReclassify = async () => {
    if (selectedProductIds.size === 0) {
      toast.error('카테고리를 재설정할 상품을 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedProductIds.size}개 상품의 카테고리를 AI로 재설정하시겠습니까?\n\n⚠️ 시간이 걸릴 수 있습니다.`)) {
      return;
    }

    const toastId = toast.loading(`${selectedProductIds.size}개 상품 카테고리 재설정 중...`);

    try {
      const res = await fetch('/api/reclassify-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedProductIds),
          type: 'product'
        })
      });

      const data = await safeJsonResponse(res);

      if (!res.ok) {
        throw new Error(data.error || '카테고리 재설정 실패');
      }

      toast.success(`카테고리 재설정 완료: 성공 ${data.successCount}개, 실패 ${data.failCount}개`, { id: toastId });

      // 결과 상세 표시
      if (data.failCount > 0) {
        const failedProducts = data.results.filter((r: any) => !r.success);
        console.log('실패한 상품:', failedProducts);
        toast.error(`일부 상품 재설정 실패 (${data.failCount}개). 콘솔을 확인하세요.`);
      }

      setSelectedProductIds(new Set());
      await loadProducts();
    } catch (error: any) {
      console.error('일괄 카테고리 재설정 실패:', error);
      toast.error(error?.message || '카테고리 재설정 중 오류가 발생했습니다.', { id: toastId });
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

      const data = await safeJsonResponse(res);

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
      const data = await safeJsonResponse(res);
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
      const data = await safeJsonResponse(res);

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

      const data = await safeJsonResponse(res);

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

      const data = await safeJsonResponse(res);

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
      const data = await safeJsonResponse(res);

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

    setCrawlLogs([`🔍 링크 추출 시작: ${crawlUrl}`]);
    setShowCrawlLogs(true);

    console.log('🚀 링크 모음 크롤링:', crawlUrl);

    try {
      const res = await fetch('/api/crawl-product-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl: crawlUrl })
      });

      const data = await safeJsonResponse(res);

      if (res.ok) {
        const { addedCount, duplicateCount, totalLinks } = data;
        setCrawlLogs(prev => [
          ...prev,
          `✅ 쿠팡 링크 ${totalLinks}개 발견`,
          `📝 신규 ${addedCount}개를 크롤링 큐에 추가`,
          `⏭️ 중복 ${duplicateCount}개 제외`,
          `🚀 백그라운드에서 크롤링이 진행됩니다.`,
          `📊 크롤링 큐 탭에서 진행 상태를 확인하세요.`
        ]);
        toast.success(`${addedCount}개 링크가 크롤링 큐에 추가되었습니다.`);
        loadLinkHistory();
        loadQueueStats(); // 큐 통계 새로고침
      } else {
        setCrawlLogs(prev => [...prev, `❌ 실패: ${data.error || data.message}`]);
        toast.error(data.error || '크롤링 실패');
      }
    } catch (error: any) {
      console.error('링크 추출 실패:', error);
      setCrawlLogs(prev => [...prev, `❌ 오류: ${error.message}`]);
      toast.error('링크 추출 중 오류가 발생했습니다.');
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

      const data = await safeJsonResponse(res);

      if (res.ok && data.jobId) {
        toast.success('백그라운드에서 처리 중입니다.');
        setCurrentJobId(data.jobId);
        setSelectedPendingIds(new Set());

        // 폴링 시작
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/job-status?jobId=${data.jobId}`);
            const statusData = await safeJsonResponse(statusRes);

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

  // 대기 목록 카테고리 재분류
  const handleReclassifyPending = async (id: string) => {
    const loadingToast = toast.loading('🤖 AI 카테고리 재분류 중...');

    try {
      const res = await fetch(`/api/reclassify-category?id=${id}&type=pending`, {
        method: 'PUT'
      });

      const data = await safeJsonResponse(res);

      if (res.ok && data.success) {
        toast.success(`✅ 카테고리 변경: ${data.category}`, { id: loadingToast });
        await loadPendingProducts();
      } else {
        toast.error(data.error || '재분류 실패', { id: loadingToast });
      }
    } catch (error) {
      console.error('재분류 실패:', error);
      toast.error('재분류 중 오류가 발생했습니다.', { id: loadingToast });
    }
  };

  // 내 목록 카테고리 재분류
  const handleReclassifyProduct = async (id: string) => {
    const loadingToast = toast.loading('🤖 AI 카테고리 재분류 중...');

    try {
      const res = await fetch(`/api/reclassify-category?id=${id}&type=product`, {
        method: 'PUT'
      });

      const data = await safeJsonResponse(res);

      if (res.ok && data.success) {
        toast.success(`✅ 카테고리 변경: ${data.category}`, { id: loadingToast });
        await loadProducts();
      } else {
        toast.error(data.error || '재분류 실패', { id: loadingToast });
      }
    } catch (error) {
      console.error('재분류 실패:', error);
      toast.error('재분류 중 오류가 발생했습니다.', { id: loadingToast });
    }
  };

  // 대기 목록 대량 카테고리 재분류
  const handleBulkReclassifyPending = async () => {
    if (selectedPendingIds.size === 0) {
      toast.error('카테고리를 재설정할 상품을 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedPendingIds.size}개 상품의 카테고리를 AI로 재설정하시겠습니까?\n\n⚠️ 시간이 걸릴 수 있습니다.`)) {
      return;
    }

    const toastId = toast.loading(`${selectedPendingIds.size}개 상품 카테고리 재설정 중...`);

    try {
      const res = await fetch('/api/reclassify-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedPendingIds),
          type: 'pending'
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '카테고리 재설정 실패');
      }

      toast.success(`카테고리 재설정 완료: 성공 ${data.successCount}개, 실패 ${data.failCount}개`, { id: toastId });

      // 결과 상세 표시
      if (data.failCount > 0) {
        const failedProducts = data.results.filter((r: any) => !r.success);
        console.log('실패한 상품:', failedProducts);
        toast.error(`일부 상품 재설정 실패 (${data.failCount}개). 콘솔을 확인하세요.`);
      }

      setSelectedPendingIds(new Set());
      await loadPendingProducts();
    } catch (error: any) {
      console.error('일괄 카테고리 재설정 실패:', error);
      toast.error(error?.message || '카테고리 재설정 중 오류가 발생했습니다.', { id: toastId });
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

      const data = await safeJsonResponse(res);

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

      const data = await safeJsonResponse(res);

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
      const data = await safeJsonResponse(res);

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
        {/* 통합 검색 */}
        <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-5 backdrop-blur">
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

          {/* 검색 결과 - 개선된 디자인 */}
          {searchResults.length > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-5 backdrop-blur">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">
                  🔍 검색 결과 <span className="text-emerald-400">({searchResults.length}개)</span>
                </h3>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="text-sm text-slate-400 hover:text-white transition"
                >
                  ✕ 닫기
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto">
                {searchResults.map((item, idx) => (
                  <div
                    key={`${item.source}-${item.id}-${idx}`}
                    className="rounded-lg border border-slate-600/50 bg-slate-800/40 p-3 hover:border-emerald-500 transition"
                  >
                    {/* 썸네일 + 출처 뱃지 */}
                    {item.image_url && (
                      <div className="relative w-full h-28 bg-slate-900 rounded-lg mb-2 overflow-hidden">
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="w-full h-full object-contain"
                          onError={(e) => e.currentTarget.style.display = 'none'}
                        />
                        <span className={`absolute top-1 left-1 text-xs px-2 py-0.5 rounded font-bold ${
                          item.source === 'my-list'
                            ? 'bg-purple-600 text-white'
                            : 'bg-blue-600 text-white'
                        }`}>
                          {item.source === 'my-list' ? '📦' : '⏳'}
                        </span>
                      </div>
                    )}

                    {/* 카테고리 */}
                    {item.category && (
                      <div className="mb-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-purple-600/80 text-white font-semibold">
                          {item.category}
                        </span>
                      </div>
                    )}

                    {/* 제목 */}
                    <h4 className="text-sm font-bold text-white mb-1 line-clamp-2">
                      {item.title || '상품명'}
                    </h4>

                    {/* 가격 */}
                    {item.discount_price && (
                      <div className="text-sm font-bold text-green-400 mb-2">
                        {Number(item.discount_price).toLocaleString()}원
                      </div>
                    )}

                    {/* 버튼 */}
                    {item.source === 'my-list' ? (
                      <a
                        href={item.deep_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center rounded bg-orange-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-orange-500 transition"
                      >
                        🛒 쿠팡에서 보기
                      </a>
                    ) : (
                      <button
                        onClick={() => {
                          changeTab('pending');
                          setSearchResults([]);
                          setSearchQuery('');
                        }}
                        className="w-full rounded bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition"
                      >
                        대기 목록으로
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 탭 - 더 큰 스타일로 개선 */}
        <div className="mb-4 rounded-2xl border border-purple-500/30 bg-slate-800/50 p-2 backdrop-blur">
          <div className="flex gap-2">
            <button
              onClick={() => changeTab('my-list')}
              className={`flex-1 px-6 py-4 rounded-xl text-base font-bold transition-all ${
                activeTab === 'my-list'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50'
                  : 'text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              📦 내 목록 <span className="text-sm opacity-80">({products.length})</span>
            </button>
            <button
              onClick={() => changeTab('queue')}
              className={`flex-1 px-6 py-4 rounded-xl text-base font-bold transition-all ${
                activeTab === 'queue'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50'
                  : 'text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              ⚙️ 크롤링 큐 <span className="text-sm opacity-80">({queueTotalCount})</span>
            </button>
            <button
              onClick={() => changeTab('pending')}
              className={`flex-1 px-6 py-4 rounded-xl text-base font-bold transition-all ${
                activeTab === 'pending'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50'
                  : 'text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              ⏳ 대기 목록 <span className="text-sm opacity-80">({pendingProducts.length})</span>
            </button>
            <button
              onClick={() => changeTab('shop')}
              className={`flex-1 px-6 py-4 rounded-xl text-base font-bold transition-all ${
                activeTab === 'shop'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50'
                  : 'text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              📤 퍼블리시 <span className="text-sm opacity-80">({products.filter(p => p.status === 'published').length})</span>
            </button>
            <button
              onClick={() => changeTab('coupang')}
              className={`flex-1 px-6 py-4 rounded-xl text-base font-bold transition-all ${
                activeTab === 'coupang'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/50'
                  : 'text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              🛒 쿠팡상품 <span className="text-sm opacity-80">({bestsellerResults.length + coupangSearchResults.length})</span>
            </button>
          </div>
        </div>

        {/* 내 목록 탭 */}
        {activeTab === 'my-list' && (
          <>
        {/* 카테고리 필터 - 더 작고 깔끔하게 */}
        {products.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-slate-400">📂 카테고리:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleCategoryFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50'
                }`}
              >
                🌐 전체 <span className="text-xs opacity-75">({products.length})</span>
              </button>
              <button
                onClick={() => handleCategoryFilter('favorite')}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  selectedCategory === 'favorite'
                    ? 'bg-yellow-500 text-white shadow-md'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50'
                }`}
              >
                ⭐ 즐겨찾기 <span className="text-xs opacity-75">({products.filter(p => p.is_favorite === 1).length})</span>
              </button>
              {categories.map((cat) => {
                const count = products.filter(p => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => handleCategoryFilter(cat)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50'
                    }`}
                  >
                    {cat} <span className="text-xs opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 일괄 처리 버튼 */}
        {products.length > 0 && (
          <div className="mb-4 space-y-3">
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

            <div className="rounded-lg bg-slate-800/30 border border-slate-700/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={toggleSelectAllProducts}
                  className="rounded-lg bg-slate-700 px-5 py-2 text-sm font-bold text-white hover:bg-slate-600 transition"
                >
                  {selectedProductIds.size === products.length ? '✕ 전체 해제' : '☑ 전체 선택'}
                </button>

                <div className="flex items-center gap-2 text-sm text-slate-300">
                  {selectedProductIds.size > 0 ? (
                    <>
                      <span className="font-semibold text-purple-400">{selectedProductIds.size}개</span> 선택됨
                    </>
                  ) : (
                    <span className="text-slate-500">선택된 상품 없음</span>
                  )}
                </div>
              </div>

              {selectedProductIds.size > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={async () => {
                      const selectedProducts = products.filter(p => selectedProductIds.has(p.id));
                      let successCount = 0;
                      let failCount = 0;

                      for (const product of selectedProducts) {
                        try {
                          // 상품 정보 객체 생성
                          const productInfo = {
                            title: product.title,
                            thumbnail: product.image_url,
                            product_link: product.deep_link || product.product_url,
                            description: product.description
                          };

                          const response = await fetch('/api/automation/titles', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              title: `[광고] ${product.title}`,
                              type: 'product',
                              category: '상품',  // 카테고리는 '상품'으로 고정
                              tags: `상품,쿠팡,${product.category || '기타'}`,
                              productUrl: product.deep_link || product.product_url,
                              productData: JSON.stringify(productInfo),  // 상품 정보 JSON
                              scriptMode: 'chrome',  // 상품은 chrome 모드
                              mediaMode: 'imagen3',  // 기본 미디어 생성
                              model: 'gpt-4o',       // 기본 AI 모델
                              youtubeSchedule: 'immediate'  // 즉시 업로드
                            })
                          });

                          if (response.ok) {
                            successCount++;
                          } else {
                            failCount++;
                          }
                        } catch (error) {
                          failCount++;
                        }
                      }

                      if (successCount > 0) {
                        toast.success(`${successCount}개 상품이 자동화 목록에 추가됨!`);
                        // 자동화 페이지 예약 큐 탭으로 이동
                        setTimeout(() => router.push('/automation?tab=scheduled'), 1000);
                      }
                      if (failCount > 0) {
                        toast.error(`${failCount}개 상품 추가 실패`);
                      }
                    }}
                    className="flex-1 min-w-[180px] rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-sm font-bold text-white hover:from-purple-500 hover:to-pink-500 transition shadow-md"
                  >
                    🤖 자동화 일괄 추가
                  </button>
                  <button
                    onClick={handlePublishSelected}
                    disabled={isPublishing}
                    className="flex-1 min-w-[180px] rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:from-indigo-500 hover:to-purple-500 transition disabled:opacity-50 shadow-md"
                  >
                    {isPublishing ? '퍼블리시 중...' : '🏪 쇼핑몰 퍼블리시'}
                  </button>
                  <button
                    onClick={handleBulkPublish}
                    className="flex-1 min-w-[180px] rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:from-green-500 hover:to-emerald-500 transition shadow-md"
                  >
                    ✅ Google Sites 퍼블리시
                  </button>
                  <button
                    onClick={handleBulkReclassify}
                    className="flex-1 min-w-[180px] rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:from-blue-500 hover:to-cyan-500 transition shadow-md"
                  >
                    🤖 카테고리 AI 재설정
                  </button>
                  <button
                    onClick={handleBulkUnpublish}
                    className="flex-1 min-w-[180px] rounded-lg bg-gradient-to-r from-yellow-600 to-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:from-yellow-500 hover:to-orange-500 transition shadow-md"
                  >
                    🔒 비공개 전환
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 페이지 크기 선택 */}
        <div className="mb-3 flex items-center justify-end gap-2">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.slice(0, myListDisplayCount).map((product) => (
            <div
              key={product.id}
              className={`rounded-xl border backdrop-blur transition overflow-hidden ${
                selectedProductIds.has(product.id)
                  ? 'border-purple-500 bg-purple-900/30'
                  : 'border-slate-600 bg-slate-800/50 hover:border-purple-500'
              }`}
            >
              {/* 썸네일 with 즐겨찾기 */}
              {product.image_url && (
                <div className="relative">
                  <img
                    src={product.image_url}
                    alt={product.title}
                    className="w-full h-48 object-cover"
                  />
                  {/* 썸네일 위 즐겨찾기 별표 */}
                  <button
                    onClick={() => toggleFavorite(product.id, product.is_favorite)}
                    className="absolute top-2 right-2 text-3xl hover:scale-125 transition-transform drop-shadow-lg"
                    title={product.is_favorite ? '즐겨찾기 제거' : '즐겨찾기 추가'}
                  >
                    {product.is_favorite ? '⭐' : '☆'}
                  </button>
                </div>
              )}

              <div className="p-4">
                {/* 체크박스 + 카테고리 + 상태 - 간소화 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(product.id)}
                      onChange={() => toggleProductSelect(product.id)}
                      className="w-5 h-5 rounded bg-slate-700 border-slate-500 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="inline-block rounded-lg bg-purple-600/90 px-3 py-1 text-xs font-bold text-white">
                      {product.category}
                    </span>
                    {/* 크롤링 실패 경고만 중요하게 표시 */}
                    {(product.title === '상품명' || product.description === '상품 설명이 없습니다.') && (
                      <span className="inline-block rounded-lg bg-red-600/90 px-2 py-1 text-xs font-bold text-white animate-pulse" title="크롤링 실패">
                        ⚠️ 실패
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {product.status === 'published' && (
                      <span className="text-xs px-2 py-1 rounded-lg bg-green-600/20 text-green-300 border border-green-500/40 font-semibold">
                        ✅ 퍼블리시
                      </span>
                    )}
                  </div>
                </div>

                {/* 제목 */}
                <h3 className={`text-lg font-bold mb-2 line-clamp-2 ${product.title === '상품명' ? 'text-red-400 italic' : 'text-white'}`}>
                  {product.title}
                </h3>

                {/* 설명 */}
                <p className={`text-sm mb-4 line-clamp-3 ${product.description === '상품 설명이 없습니다.' ? 'text-red-400/60 italic' : 'text-slate-400'}`}>
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

                {/* 딥링크 - 더 간단하게 */}
                <div className="bg-slate-900/50 rounded-lg p-2 mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 font-mono break-all line-clamp-1 flex-1">
                    {product.deep_link}
                  </span>
                  <button
                    onClick={() => {
                      const copyToClipboard = async (text: string) => {
                        try {
                          if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(text);
                          } else {
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
                          toast.success('딥링크 복사됨!');
                        } catch (err) {
                          console.error('복사 실패:', err);
                          toast.error('복사 실패');
                        }
                      };
                      copyToClipboard(product.deep_link);
                    }}
                    className="flex-shrink-0 text-slate-400 hover:text-blue-400 transition"
                    title="딥링크 복사"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>

                {/* 액션 버튼 - 깔끔한 정렬 */}
                <div className="space-y-2">
                  {/* 크롤링 실패 시 표시 */}
                  {(product.title === '상품명' || product.description === '상품 설명이 없습니다.') && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={async () => {
                          if (!confirm('이 상품을 다시 크롤링하시겠습니까?')) return;
                          try {
                            const res = await fetch(`/api/coupang-products/${product.id}/recrawl`, { method: 'POST' });
                            const data = await safeJsonResponse(res);
                            if (res.ok) {
                              toast.success('크롤링 큐에 추가됨!');
                              setTimeout(() => loadProducts(), 2000);
                            } else {
                              toast.error(data.error || '재크롤링 실패');
                            }
                          } catch (error) {
                            toast.error('재크롤링 오류');
                          }
                        }}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 transition"
                      >
                        🔄 재크롤링
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(product)}
                        className="rounded-lg bg-yellow-600 px-3 py-2 text-xs font-bold text-white hover:bg-yellow-500 transition"
                      >
                        ✏️ 수정
                      </button>
                    </div>
                  )}

                  {/* 주요 액션 버튼 */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        const productInfo = {
                          title: product.title,
                          thumbnail: product.image_url,
                          product_link: product.deep_link,
                          description: product.description
                        };
                        localStorage.setItem('product_video_info', JSON.stringify(productInfo));
                        router.push('/?promptType=product');
                        toast.success('상품 정보 로드됨!');
                      }}
                      className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-3 py-3 text-sm font-bold text-white hover:from-green-500 hover:to-emerald-500 transition shadow-lg"
                    >
                      📝 대본작성
                    </button>
                    <button
                      onClick={() => {
                        // 상품정보 대본 생성 (내 콘텐츠와 동일)
                        // 상품관리에서는 product.id가 없으므로 임시로 생성
                        const tempScriptId = `coupang_${product.id}`;

                        // 상품 정보를 localStorage에 저장
                        const productInfo = {
                          title: product.title,
                          thumbnail: product.image_url,
                          product_link: product.deep_link,
                          description: product.description
                        };
                        localStorage.setItem('product_video_info', JSON.stringify(productInfo));

                        // 메인 페이지로 이동하면서 상품정보 대본 생성 트리거
                        router.push(`/?promptType=product-info&fromCoupang=true`);
                        toast.success('상품정보 대본 생성으로 이동합니다!');
                      }}
                      className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-3 text-sm font-bold text-white hover:from-emerald-500 hover:to-teal-500 transition shadow-lg"
                    >
                      🛍️ 상품정보
                    </button>
                    <button
                      onClick={() => {
                        // 상품 정보를 localStorage에 저장 (자동화 페이지에서 읽음)
                        const automationData = {
                          title: product.title,
                          type: 'product',
                          category: '상품',
                          tags: `상품,쿠팡,${product.category || '기타'}`,
                          productUrl: product.deep_link || product.product_url,
                          productData: {
                            title: product.title,
                            thumbnail: product.image_url,
                            product_link: product.deep_link || product.product_url,
                            description: product.description
                          }
                        };
                        localStorage.setItem('automation_prefill', JSON.stringify(automationData));

                        // 자동화 페이지로 이동 (폼이 자동으로 열리고 정보가 채워짐)
                        toast.success('자동화 페이지로 이동합니다!');
                        router.push('/automation?fromProduct=true');
                      }}
                      className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-3 text-sm font-bold text-white hover:from-purple-500 hover:to-pink-500 transition shadow-lg"
                    >
                      🤖 자동화
                    </button>
                  </div>

                  {/* 보조 버튼들 */}
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={product.deep_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white text-center hover:bg-orange-500 transition"
                    >
                      🛒 쿠팡
                    </a>
                    <button
                      onClick={() => handleReclassifyProduct(product.id)}
                      className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-500 transition"
                    >
                      🔄 카테고리 재분류
                    </button>
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="w-full rounded-lg bg-red-600/80 px-3 py-2 text-xs font-bold text-white hover:bg-red-600 transition"
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
          <div className="text-center mt-6">
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

        {/* 크롤링 큐 탭 */}
        {activeTab === 'queue' && (
          <>
            <CoupangQueueMonitor />
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
                      {crawlLogs.length > 0 && (
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
                        onClick={handleBulkReclassifyPending}
                        className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-2 text-sm font-semibold text-white hover:from-blue-500 hover:to-cyan-500 transition"
                      >
                        🤖 {selectedPendingIds.size}개 카테고리 AI 재설정
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
                      <div className="flex items-center gap-2 flex-wrap">
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
                        <button
                          onClick={() => handleReclassifyPending(pending.id)}
                          className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition"
                          title="카테고리 재분류"
                        >
                          🔄 카테고리 재분류
                        </button>
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
                  ref={productUrlInputRef}
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

        {/* 퍼블리시 탭 */}
        {activeTab === 'shop' && (
          <>
            {!shopDataLoaded ? (
              <div className="py-20 text-center text-slate-300">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-purple-400" />
                상품을 불러오는 중입니다...
              </div>
            ) : (
              <ShopClientView
                initialCategories={shopCategories}
                initialTotalProducts={shopTotalProducts}
                googleSitesEditUrl={googleSitesEditUrl}
                googleSitesHomeUrl={googleSitesHomeUrl}
              />
            )}
          </>
        )}

        {/* 쿠팡상품 탭 */}
        {activeTab === 'coupang' && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            {/* 서브 탭 */}
            <div className="mb-6 flex gap-3">
              <button
                onClick={() => setCoupangSubTab('bestseller')}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                  coupangSubTab === 'bestseller'
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🏆 베스트셀러 <span className="text-xs opacity-80">({bestsellerResults.length})</span>
              </button>
              <button
                onClick={() => setCoupangSubTab('search')}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                  coupangSubTab === 'search'
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🔍 상품 검색 <span className="text-xs opacity-80">({coupangSearchResults.length})</span>
              </button>
            </div>

            {/* 베스트셀러 서브탭 */}
            {coupangSubTab === 'bestseller' && (
              <>
                <h2 className="mb-4 text-xl font-bold text-white">🏆 베스트셀러 상품</h2>

                <div className="mb-4 flex gap-3">
                  <select
                    value={bestsellerCategory}
                    onChange={(e) => setBestsellerCategory(e.target.value)}
                    className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white focus:border-purple-500 focus:outline-none [&>option]:bg-slate-800 [&>option]:text-white [&>optgroup]:bg-slate-900 [&>optgroup]:text-slate-300"
                  >
                    <option value="all" className="bg-slate-800 text-white">🌟 전체</option>
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
                  </select>
                  <button
                    onClick={async () => {
                      setIsFetchingBestseller(true);
                      setBestsellerResults([]);
                      try {
                        const categoryId = getCategoryId(bestsellerCategory);
                        const url = categoryId
                          ? `/api/coupang/products?categoryId=${categoryId}&limit=100`
                          : `/api/coupang/products?limit=100`;

                        console.log('🔍 [베스트셀러] 카테고리:', bestsellerCategory, '→', categoryId);
                        console.log('🔍 [베스트셀러] URL:', url);

                        const response = await fetch(url, {
                          headers: {
                            'Authorization': `Bearer ${localStorage.getItem('sessionId')}`
                          }
                        });
                        const data = await response.json();
                        if (response.ok && data.success) {
                          // productId 기준으로 중복 제거
                          const uniqueProducts = Array.from(
                            new Map((data.products || []).map((p: any) => [p.productId, p])).values()
                          );
                          setBestsellerResults(uniqueProducts);
                          toast.success(`${uniqueProducts.length}개 베스트셀러 상품 조회 완료`);
                        } else {
                          throw new Error(data.error || '베스트셀러 조회 실패');
                        }
                      } catch (error: any) {
                        toast.error('베스트셀러 조회 실패: ' + error.message);
                      } finally {
                        setIsFetchingBestseller(false);
                      }
                    }}
                    disabled={isFetchingBestseller}
                    className="rounded-lg bg-emerald-600 px-6 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isFetchingBestseller ? '조회 중...' : '가져오기'}
                  </button>
                </div>

                {bestsellerResults.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {bestsellerResults.map((product: any) => (
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
                              {product.productPrice?.toLocaleString()}원
                            </span>
                            {product.isRocket && (
                              <span className="rounded bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white">
                                로켓배송
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 버튼들 */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleAddToMyList(product)}
                            className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-purple-500"
                          >
                            ➕ 내 목록에 추가
                          </button>
                          <a
                            href={product.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white text-center hover:bg-orange-500 transition"
                          >
                            🛒 쿠팡
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 상품 검색 서브탭 */}
            {coupangSubTab === 'search' && (
              <>
                <h2 className="mb-4 text-xl font-bold text-white">🔍 상품 검색</h2>

                <div className="mb-4 flex gap-3">
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onKeyPress={async (e) => {
                      if (e.key === 'Enter' && searchKeyword.trim()) {
                        setIsCoupangSearching(true);
                        setCoupangSearchResults([]);
                        try {
                          const sessionId = localStorage.getItem('sessionId');
                          console.log('🔑 [프론트-Enter] sessionId:', sessionId);

                          const response = await fetch('/api/coupang/search', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${sessionId}`
                            },
                            body: JSON.stringify({ keyword: searchKeyword })
                          });

                          console.log('📡 [프론트-Enter] 응답 상태:', response.status);

                          const data = await response.json();
                          if (response.ok) {
                            setCoupangSearchResults(data.products || []);
                            toast.success(`${data.products?.length || 0}개 상품 검색 완료`);
                          } else {
                            console.error('❌ [프론트-Enter] 에러:', data);
                            throw new Error(data.error || '검색 실패');
                          }
                        } catch (error: any) {
                          console.error('❌ [프론트-Enter] 예외:', error);
                          toast.error('검색 실패: ' + error.message);
                        } finally {
                          setIsCoupangSearching(false);
                        }
                      }
                    }}
                    placeholder="검색어를 입력하세요 (예: 노트북, 이어폰)"
                    className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                  />
                  <button
                    onClick={async () => {
                      if (!searchKeyword.trim()) {
                        toast.error('검색어를 입력하세요');
                        return;
                      }
                      setIsCoupangSearching(true);
                      setCoupangSearchResults([]);
                      try {
                        const sessionId = localStorage.getItem('sessionId');
                        console.log('🔑 [프론트] sessionId:', sessionId);

                        const response = await fetch('/api/coupang/search', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${sessionId}`
                          },
                          body: JSON.stringify({ keyword: searchKeyword })
                        });

                        console.log('📡 [프론트] 응답 상태:', response.status);

                        const data = await response.json();
                        if (response.ok) {
                          setCoupangSearchResults(data.products || []);
                          toast.success(`${data.products?.length || 0}개 상품 검색 완료`);
                        } else {
                          console.error('❌ [프론트] 에러:', data);
                          throw new Error(data.error || '검색 실패');
                        }
                      } catch (error: any) {
                        console.error('❌ [프론트] 예외:', error);
                        toast.error('검색 실패: ' + error.message);
                      } finally {
                        setIsCoupangSearching(false);
                      }
                    }}
                    disabled={isCoupangSearching}
                    className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    {isCoupangSearching ? '검색 중...' : '검색'}
                  </button>
                </div>

                {coupangSearchResults.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {coupangSearchResults.map((product: any) => (
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
                              {product.productPrice?.toLocaleString()}원
                            </span>
                            {product.isRocket && (
                              <span className="rounded bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white">
                                로켓배송
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 주요 버튼들 */}
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            onClick={async () => {
                              const loadingToast = toast.loading('딥링크 생성 중...');
                              try {
                                // 딥링크 생성
                                const deepLinkRes = await fetch('/api/coupang/deeplink', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ coupangUrls: [product.productUrl] })
                                });
                                const deepLinkData = await deepLinkRes.json();

                                if (!deepLinkData.success || !deepLinkData.data?.[0]?.shortenUrl) {
                                  throw new Error('딥링크 생성 실패');
                                }

                                const productInfo = {
                                  title: product.productName,
                                  thumbnail: product.productImage,
                                  product_link: deepLinkData.data[0].shortenUrl,
                                  description: product.categoryName
                                };
                                localStorage.setItem('product_video_info', JSON.stringify(productInfo));
                                toast.success('상품 정보 로드됨!', { id: loadingToast });
                                router.push('/?promptType=product');
                              } catch (error: any) {
                                toast.error(error.message || '딥링크 생성 실패', { id: loadingToast });
                              }
                            }}
                            className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-3 py-3 text-sm font-bold text-white hover:from-green-500 hover:to-emerald-500 transition shadow-lg"
                          >
                            📝 대본작성
                          </button>
                          <button
                            onClick={async () => {
                              const loadingToast = toast.loading('딥링크 생성 중...');
                              try {
                                // 딥링크 생성
                                const deepLinkRes = await fetch('/api/coupang/deeplink', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ coupangUrls: [product.productUrl] })
                                });
                                const deepLinkData = await deepLinkRes.json();

                                if (!deepLinkData.success || !deepLinkData.data?.[0]?.shortenUrl) {
                                  throw new Error('딥링크 생성 실패');
                                }

                                const productInfo = {
                                  title: product.productName,
                                  thumbnail: product.productImage,
                                  product_link: deepLinkData.data[0].shortenUrl,
                                  description: product.categoryName
                                };
                                localStorage.setItem('product_video_info', JSON.stringify(productInfo));
                                toast.success('상품정보 대본 생성으로 이동합니다!', { id: loadingToast });
                                router.push(`/?promptType=product-info&fromCoupang=true`);
                              } catch (error: any) {
                                toast.error(error.message || '딥링크 생성 실패', { id: loadingToast });
                              }
                            }}
                            className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-3 text-sm font-bold text-white hover:from-emerald-500 hover:to-teal-500 transition shadow-lg"
                          >
                            🛍️ 상품정보
                          </button>
                          <button
                            onClick={async () => {
                              const loadingToast = toast.loading('딥링크 생성 중...');
                              try {
                                // 딥링크 생성
                                const deepLinkRes = await fetch('/api/coupang/deeplink', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ coupangUrls: [product.productUrl] })
                                });
                                const deepLinkData = await deepLinkRes.json();

                                if (!deepLinkData.success || !deepLinkData.data?.[0]?.shortenUrl) {
                                  throw new Error('딥링크 생성 실패');
                                }

                                const automationData = {
                                  title: product.productName,
                                  type: 'product',
                                  category: '상품',
                                  tags: `상품,쿠팡,${product.categoryName || '기타'}`,
                                  productUrl: deepLinkData.data[0].shortenUrl,
                                  productData: {
                                    title: product.productName,
                                    thumbnail: product.productImage,
                                    product_link: deepLinkData.data[0].shortenUrl,
                                    description: product.categoryName
                                  }
                                };
                                localStorage.setItem('automation_prefill', JSON.stringify(automationData));
                                toast.success('자동화 페이지로 이동합니다!', { id: loadingToast });
                                router.push('/automation?fromProduct=true');
                              } catch (error: any) {
                                toast.error(error.message || '딥링크 생성 실패', { id: loadingToast });
                              }
                            }}
                            className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-3 text-sm font-bold text-white hover:from-purple-500 hover:to-pink-500 transition shadow-lg"
                          >
                            🤖 자동화
                          </button>
                        </div>

                        {/* 보조 버튼들 */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleAddToMyList(product)}
                            className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-purple-500"
                          >
                            ➕ 내 목록에 추가
                          </button>
                          <a
                            href={product.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white text-center hover:bg-orange-500 transition"
                          >
                            🛒 쿠팡
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      {/* 상품 편집 모달 */}
      {isEditModalOpen && editingProduct && (
        <div
          className="fixed inset-0 z-[99999] bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
          onClick={handleCloseEditModal}
        >
          <div
            className="w-full max-w-2xl bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h3 className="text-lg font-bold text-white">✏️ 상품 정보 수정</h3>
                <p className="text-sm text-slate-400">상품의 정보를 수정할 수 있습니다</p>
              </div>
              <button
                onClick={handleCloseEditModal}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 space-y-4">
              {/* 상품명 */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  상품명 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                  placeholder="상품명을 입력하세요"
                />
              </div>

              {/* 상품 설명 */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  상품 설명 <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none resize-none"
                  placeholder="상품 설명을 입력하세요"
                />
              </div>

              {/* 카테고리 */}
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  카테고리
                </label>
                <input
                  type="text"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                  placeholder="카테고리를 입력하세요"
                />
              </div>

              {/* 가격 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    할인가 (원)
                  </label>
                  <input
                    type="number"
                    value={editForm.discount_price}
                    onChange={(e) => setEditForm({ ...editForm, discount_price: e.target.value })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                    placeholder="할인가"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    정가 (원)
                  </label>
                  <input
                    type="number"
                    value={editForm.original_price}
                    onChange={(e) => setEditForm({ ...editForm, original_price: e.target.value })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                    placeholder="정가"
                  />
                </div>
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={handleCloseEditModal}
                className="px-6 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:from-purple-500 hover:to-blue-500 transition"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
