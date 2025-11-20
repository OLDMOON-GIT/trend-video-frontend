'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ScheduleCalendar from '@/components/automation/ScheduleCalendar';
import ChannelSettings from '@/components/automation/ChannelSettings';
import CategoryManagement from '@/components/automation/CategoryManagement';
import GenerationDashboard from '@/components/automation/GenerationDashboard';
import MediaUploadBox from '@/components/MediaUploadBox';
import YouTubeUploadButton from '@/components/YouTubeUploadButton';

function AutomationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [titles, setTitles] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState(() => {
    const selectedType = getSelectedType();
    return {
      title: '',
      type: selectedType,
      category: getSelectedCategory(),
      tags: '',
      productUrl: '',
      scheduleTime: (() => {
        // 현재 시간 + 3분을 기본값으로 설정
        const now = new Date(Date.now() + 3 * 60 * 1000);
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      })(),
      channel: '',
      scriptMode: 'chrome',
      mediaMode: getSelectedMediaMode(),
      model: getDefaultModelByType(selectedType), // ✅ 타입에 따른 모델 자동 설정
      youtubeSchedule: 'immediate',
      youtubePublishAt: '',
      youtubePrivacy: getSelectedPrivacy()
    };
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [recentTitles, setRecentTitles] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string>('');
  const [expandedLogsFor, setExpandedLogsFor] = useState<string | null>(null);
  const [logsMap, setLogsMap] = useState<Record<string, any[]>>({});
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [mainTab, setMainTab] = useState<'queue' | 'schedule-management' | 'monitoring' | 'title-pool'>('queue');
  const [queueTab, setQueueTab] = useState<'scheduled' | 'processing' | 'waiting_upload' | 'failed' | 'completed'>('scheduled');
  const [scheduleManagementTab, setScheduleManagementTab] = useState<'channel-settings' | 'category-management' | 'calendar'>('channel-settings');
  const [progressMap, setProgressMap] = useState<Record<string, { scriptProgress?: number; videoProgress?: number }>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null); // 업로드 중인 스케줄 ID
  const [uploadedImagesFor, setUploadedImagesFor] = useState<Record<string, File[]>>({}); // 스케줄별 업로드된 이미지
  const [uploadedVideosFor, setUploadedVideosFor] = useState<Record<string, File[]>>({}); // 스케줄별 업로드된 동영상
  const [isManualSortFor, setIsManualSortFor] = useState<Record<string, boolean>>({}); // 스케줄별 수동 정렬 여부
  const [draggingCardIndexFor, setDraggingCardIndexFor] = useState<Record<string, number | null>>({}); // 스케줄별 드래그 중인 카드 인덱스
  const [uploadBoxOpenFor, setUploadBoxOpenFor] = useState<Record<string, boolean>>({}); // 스케줄별 업로드 박스 열림 여부
  const [downloadMenuFor, setDownloadMenuFor] = useState<Record<string, boolean>>({}); // 다운로드 메뉴 열림 여부
  const [isSubmitting, setIsSubmitting] = useState(false); // 제목 추가 중복 방지
  const [currentProductData, setCurrentProductData] = useState<any>(null); // 현재 상품 정보
  const [availableProducts, setAvailableProducts] = useState<any[]>([]); // 선택된 카테고리에 해당하는 상품 목록
  const [fetchingProducts, setFetchingProducts] = useState(false); // 상품 목록 로딩 중
  const [testModalOpen, setTestModalOpen] = useState(false); // 테스트 모달 열림 여부
  const [testLogs, setTestLogs] = useState<string[]>([]); // 테스트 로그
  const [testInProgress, setTestInProgress] = useState(false); // 테스트 진행 중

  // 제목 풀 관련
  const [poolTitles, setPoolTitles] = useState<any[]>([]);
  const [poolStats, setPoolStats] = useState<any[]>([]);
  const [poolCategory, setPoolCategory] = useState<string>('all');
  const [poolMinScore, setPoolMinScore] = useState(90);
  const [poolLoading, setPoolLoading] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateLogs, setGenerateLogs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [crawlingFor, setCrawlingFor] = useState<string | null>(null); // 크롤링 중인 title ID
  const [crawlLogs, setCrawlLogs] = useState<Record<string, string[]>>({}); // title별 크롤링 로그

  // localStorage에서 선택한 채널 불러오기
  function getSelectedChannel(): string {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_selected_channel');
      return saved || '';
    }
    return '';
  }

  // localStorage에서 선택한 카테고리 불러오기
  function getSelectedCategory(): string {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_selected_category');
      return saved || '';
    }
    return '';
  }

  // localStorage에서 선택한 타입 불러오기
  function getSelectedType(): string {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_selected_type');
      return saved || 'longform';
    }
    return 'longform';
  }

  // 타입별 기본 모델 설정
  function getDefaultModelByType(type?: string): string {
    switch (type) {
      case 'product':
      case 'product-info':
        return 'gemini'; // 상품: Gemini
      case 'longform':
      case 'sora2':
        return 'claude'; // 롱폼: Claude
      case 'shortform':
        return 'chatgpt'; // 숏폼: ChatGPT
      default:
        return 'claude'; // 기본값: Claude
    }
  }

  // localStorage에서 선택한 LLM 모델 불러오기
  function getSelectedModel(): string {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_selected_model');
      return saved || 'claude';
    }
    return 'claude';
  }

  // 현재 선택된 타입에 따른 모델 가져오기
  function getModelForCurrentType(): string {
    const currentType = getSelectedType();
    return getDefaultModelByType(currentType);
  }

  // localStorage에서 선택한 미디어 모드 불러오기
  function getSelectedMediaMode(): string {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_selected_media_mode');
      return saved || 'imagen3';
    }
    return 'imagen3';
  }

  // localStorage에서 선택한 공개 설정 불러오기
  function getSelectedPrivacy(): string {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_selected_privacy');
      return saved || 'public';
    }
    return 'public';
  }

  // 현재 시간을 datetime-local 형식으로 반환
  function getCurrentTimeForInput() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // 현재 시간 + 3분 계산 (로컬 시간대)
  function getDefaultScheduleTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 3);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // 파일명으로 사용할 수 없는 문자 검증 (? 제외 - YouTube 제목에는 사용 가능)
  function validateTitle(title: string): string {
    const invalidChars = /[<>:"/\\|*]/g; // ? 제거됨
    const foundChars = title.match(invalidChars);

    if (foundChars) {
      const uniqueChars = [...new Set(foundChars)].join(' ');
      return `파일명으로 사용할 수 없는 문자가 포함되어 있습니다: ${uniqueChars}`;
    }
    return '';
  }

  function handleTitleChange(value: string) {
    setNewTitle(prev => ({ ...prev, title: value }));
    setTitleError(validateTitle(value));
  }

  useEffect(() => {
    fetchData();
    loadRecentTitles();
    fetchChannels();
    fetchCategories();

    // 상품관리에서 왔는지 체크
    // ⚠️ CRITICAL: 쿠팡 상품 관리 페이지에서 전달된 상품 정보 처리
    //
    // 📋 프로세스: 쿠팡 상품 페이지 → 자동화 페이지
    // 1. 쿠팡 상품 페이지에서 "🤖 자동화" 버튼 클릭
    // 2. 상품 정보 localStorage에 저장 (automation_prefill)
    //    - 베스트셀러의 경우: 내 목록 추가 → 딥링크 발급 → 자동화 전달
    //    - 내 목록의 경우: 이미 발급된 딥링크 포함하여 전달
    // 3. 자동화 페이지로 이동 (?fromProduct=true)
    // 4. 이 코드에서 localStorage 읽어서 폼 자동 채우기
    //
    // productData 구조:
    // - UI 표시용 키: productName, productImage, productUrl, productPrice, productId
    // - 백엔드 대본용 키: title, thumbnail, product_link, description
    //
    // ⚠️ 중요:
    // - productUrl/product_link는 딥링크여야 함 (수익화 필수)
    // - productData는 대본 생성 시 프롬프트에 포함됨
    // - current_product_data는 영상 생성 시 사용됨
    //
    // 📖 상세 문서: /AUTOMATION_PRODUCT_FLOW.md
    const fromProduct = searchParams.get('fromProduct');
    if (fromProduct === 'true') {
      // localStorage에서 상품 정보 읽기
      const prefillData = localStorage.getItem('automation_prefill');
      if (prefillData) {
        try {
          const data = JSON.parse(prefillData);
          console.log('🛍️ [상품관리 → 자동화] 정보 자동 입력:', data);

          // productData를 별도로 저장 (대본 생성 시 프롬프트에 포함)
          if (data.productData) {
            const productDataStr = JSON.stringify(data.productData);
            localStorage.setItem('current_product_data', productDataStr);
            console.log('✅ productData 저장 완료 (딥링크 포함):', {
              productUrl: data.productData.productUrl,
              product_link: data.productData.product_link
            });
          }

          // 폼 열기 + 정보 채우기 (자동 시작 X - 사용자가 확인 후 수동 저장)
          setShowAddForm(true);
          const productType = data.type || 'product';
          setNewTitle(prev => ({
            ...prev,
            title: data.title ? `[광고] ${data.title}` : '[광고] ',
            type: productType,
            category: data.category || '상품',
            tags: data.tags || '',
            productUrl: data.productUrl || '', // ⭐ 딥링크
            scriptMode: 'chrome',
            mediaMode: getSelectedMediaMode(),
            model: getDefaultModelByType(productType), // ✅ 상품은 항상 gemini
            youtubeSchedule: 'immediate'
          }));
          // 사용자가 선택한 타입과 모델을 localStorage에 저장 (다음 생성 시 기본값으로 사용)
          localStorage.setItem('automation_selected_type', productType);
          localStorage.setItem('automation_selected_model', getDefaultModelByType(productType));
          // 상품 정보 UI 미리보기 표시
          setCurrentProductData(data.productData);

          // 일회성 데이터이므로 사용 후 삭제
          localStorage.removeItem('automation_prefill');

        } catch (error) {
          console.error('❌ 상품 정보 파싱 실패:', error);
        }
      }
    }
  }, [searchParams]);

  // 예약큐 → 진행큐 자동 전환
  useEffect(() => {
    // 현재 scheduled 탭을 보고 있을 때만 체크
    if (queueTab === 'scheduled' && schedules.length > 0) {
      const scheduledItems = schedules.filter((s: any) => s.status === 'pending');
      const processingItems = schedules.filter((s: any) => s.status === 'processing');

      // scheduled 큐가 비어있고 processing 큐에 항목이 있으면 자동 전환
      if (scheduledItems.length === 0 && processingItems.length > 0) {
        console.log('🔄 예약큐 → 진행큐 자동 전환');
        setQueueTab('processing');
      }
    }
  }, [schedules, queueTab]);

  // 카테고리 또는 타입 변경 시 상품 목록 불러오기 (딥링크 발급된 "내 목록"에서만)
  useEffect(() => {
    async function fetchProductsByCategory() {
      if (newTitle.type === 'product' && newTitle.category) {
        setFetchingProducts(true);
        try {
          // ⭐ 딥링크가 이미 발급된 "내 목록" 상품만 가져오기
          const response = await fetch(`/api/admin/coupang-products`);
          if (response.ok) {
            const data = await response.json();
            // 선택한 카테고리에 해당하는 상품만 필터링 (딥링크 검증)
            const filteredProducts = (data.products || [])
              .filter((p: any) => p.category_id === newTitle.category)
              .filter((p: any) => {
                // ⭐ 딥링크 검증: 'partner=' 포함 필수 (쿠팡 제휴 URL)
                if (!p.deep_link || !p.deep_link.includes('partner=')) {
                  console.warn(`⚠️ [자동화] 딥링크 없음 또는 잘못됨: ${p.product_name} (${p.deep_link})`);
                  return false;
                }
                return true;
              })
              .map((p: any) => ({
                productId: p.product_id,
                productName: p.product_name,
                productPrice: p.discount_price || p.original_price,
                productImage: p.image_url,
                productUrl: p.deep_link, // ⭐ 딥링크만 사용!
                categoryName: p.category_name
              }));

            console.log(`✅ [자동화] 카테고리 ${newTitle.category} 상품 ${filteredProducts.length}개 (모두 딥링크 검증됨)`);
            setAvailableProducts(filteredProducts);
          } else {
            console.error('Failed to fetch products from my list:', response.statusText);
            setAvailableProducts([]);
          }
        } catch (error) {
          console.error('Error fetching products from my list:', error);
          setAvailableProducts([]);
        } finally {
          setFetchingProducts(false);
        }
      } else {
        setAvailableProducts([]); // 상품 타입이 아니거나 카테고리가 없으면 목록 초기화
      }
    }
    fetchProductsByCategory();
  }, [newTitle.type, newTitle.category]);

  // 제목 풀 탭 전환 시 데이터 로드
  useEffect(() => {
    if (mainTab === 'title-pool') {
      fetchTitlePool();
    }
  }, [mainTab, poolCategory, poolMinScore]);

  // titleId 파라미터 처리 (titles 로드 후)
  useEffect(() => {
    const titleId = searchParams.get('titleId');
    if (titleId && titles.length > 0) {
      const targetTitle = titles.find((t: any) => t.id === titleId);
      if (targetTitle) {
        startEdit(targetTitle); // 수정 모드로 전환 + editForm 로드
      }
    }
  }, [searchParams, titles]);

  // 진행 중인 제목이 있으면 5초마다 데이터 새로고침 (완료/실패는 제외)
  useEffect(() => {
    if (!titles || titles.length === 0) return;

    const hasActiveJobs = titles.some((t: any) =>
      ['processing', 'scheduled', 'waiting_for_upload'].includes(t.status)
    );

    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      fetchData();
    }, 5000);

    return () => clearInterval(interval);
  }, [titles]);

  // 제목 풀 탭 열 때 데이터 로드 (처음 한 번만)
  useEffect(() => {
    if (mainTab === 'title-pool') {
      fetchTitlePool();
    }
  }, [mainTab]);

  // 소재찾기에서 전달받은 제목 자동 추가
  useEffect(() => {
    const from = searchParams.get('from');
    if (from === 'material-suggestions') {
      try {
        const pendingTitles = localStorage.getItem('automation_pending_titles');
        if (pendingTitles) {
          const titlesToAdd = JSON.parse(pendingTitles);
          console.log('📥 소재찾기에서 전달받은 제목:', titlesToAdd);

          // localStorage 클리어
          localStorage.removeItem('automation_pending_titles');

          // 제목 추가 폼 표시
          setShowAddForm(true);

          // 제목이 있으면 첫 번째 제목을 입력 폼에 설정
          if (titlesToAdd.length > 0) {
            setNewTitle(prev => ({
              ...prev,
              title: titlesToAdd[0]
            }));

            // 나머지 제목들은 순차적으로 추가
            if (titlesToAdd.length > 1) {
              setTimeout(async () => {
                for (let i = 1; i < titlesToAdd.length; i++) {
                  await addTitle(titlesToAdd[i], true);
                  await new Promise(resolve => setTimeout(resolve, 500)); // 500ms 대기
                }
                await fetchData();
                alert(`✅ ${titlesToAdd.length}개 제목이 자동으로 추가되었습니다!`);
              }, 1000);
            } else {
              alert(`✅ 1개 제목이 입력 폼에 추가되었습니다. 설정 후 등록하세요!`);
            }
          }
        }
      } catch (error) {
        console.error('제목 자동 추가 오류:', error);
      }
    }
  }, [searchParams]);

  async function fetchChannels() {
    try {
      const response = await fetch('/api/youtube/channels');
      const data = await response.json();
      console.log('📺 유튜브 채널 조회 결과:', data);

      if (data.channels && data.channels.length > 0) {
        console.log('✅ 연결된 채널:', data.channels.length, '개');
        setChannels(data.channels);

        // 채널 선택 우선순위:
        // 1. localStorage에 저장된 채널
        // 2. 기본 채널 (isDefault가 true)
        // 3. 첫 번째 채널
        if (!newTitle.channel) {
          const savedChannelId = getSelectedChannel();
          const savedChannel = data.channels.find((ch: any) => ch.id === savedChannelId);
          const defaultChannel = data.channels.find((ch: any) => ch.isDefault);
          const selectedChannelId = savedChannel?.id || defaultChannel?.id || data.channels[0].id;

          console.log('📌 선택된 채널:', {
            saved: savedChannelId,
            default: defaultChannel?.channelTitle,
            selected: selectedChannelId
          });

          setNewTitle(prev => ({ ...prev, channel: selectedChannelId }));
        }
      } else {
        console.warn('⚠️ 연결된 유튜브 채널이 없습니다');
        setChannels([]);
      }
    } catch (error) {
      console.error('❌ 채널 조회 실패:', error);
      setChannels([]);
    }
  }

  async function fetchCategories() {
    try {
      const response = await fetch('/api/automation/categories');
      const data = await response.json();
      if (data.categories && data.categories.length > 0) {
        setCategories(data.categories.map((c: any) => c.name));
        console.log('✅ 카테고리 로드:', data.categories.length, '개');
      } else {
        setCategories([]);
      }
    } catch (error) {
      console.error('❌ 카테고리 조회 실패:', error);
      setCategories([]);
    }
  }

  function loadRecentTitles() {
    try {
      const saved = localStorage.getItem('automation_recent_titles');
      if (saved) {
        setRecentTitles(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load recent titles:', error);
    }
  }

  function saveRecentTitle(title: string) {
    try {
      const saved = localStorage.getItem('automation_recent_titles');
      const recent = saved ? JSON.parse(saved) : [];
      const updated = [title, ...recent.filter((t: string) => t !== title)].slice(0, 4);
      localStorage.setItem('automation_recent_titles', JSON.stringify(updated));
      setRecentTitles(updated);
    } catch (error) {
      console.error('Failed to save recent title:', error);
    }
  }

  async function fetchTitlePool() {
    try {
      setPoolLoading(true);

      // 통계 + 제목 한번에 로드
      const params = new URLSearchParams({
        category: poolCategory,
        minScore: poolMinScore.toString()
      });
      const res = await fetch(`/api/title-pool?${params}`);

      if (res.ok) {
        const data = await res.json();
        setPoolStats(data.stats || []);
        setPoolTitles(data.titles || []);
      }
    } catch (error) {
      console.error('Failed to fetch title pool:', error);
    } finally {
      setPoolLoading(false);
    }
  }

  async function generateTitlePool() {
    setGenerateModalOpen(true);
    setGenerateLogs([]);
    setIsGenerating(true);

    try {
      // API 호출 (jobId 받기)
      const response = await fetch('/api/title-pool/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        setGenerateLogs(prev => [...prev, '❌ 제목 생성 API 호출 실패']);
        setIsGenerating(false);
        return;
      }

      const { jobId } = await response.json();
      setGenerateLogs(prev => [...prev, `🚀 제목 생성 시작 (Job ID: ${jobId})`]);

      // 폴링으로 로그 조회 (내 콘텐츠 방식)
      const pollInterval = setInterval(async () => {
        try {
          const logsRes = await fetch(`/api/automation/logs?jobId=${jobId}`);
          if (logsRes.ok) {
            const logsData = await logsRes.json();
            if (logsData.logs && logsData.logs.length > 0) {
              setGenerateLogs(logsData.logs.map((log: any) => log.log_message || log.message || log));
            }

            // 완료 체크
            const lastLog = logsData.logs[logsData.logs.length - 1];
            if (lastLog && (lastLog.log_message || lastLog.message || '').includes('배치 생성 완료')) {
              clearInterval(pollInterval);
              setIsGenerating(false);
            }
          }
        } catch (error) {
          console.error('로그 조회 실패:', error);
        }
      }, 2000); // 2초마다 조회

      // 최대 10분 후 자동 종료
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isGenerating) {
          setGenerateLogs(prev => [...prev, '⏱️ 타임아웃 - 작업이 오래 걸리고 있습니다']);
          setIsGenerating(false);
        }
      }, 600000);

    } catch (error: any) {
      console.error('Failed to generate titles:', error);
      setGenerateLogs(prev => [...prev, `❌ 제목 생성 실패: ${error.message}`]);
      setIsGenerating(false);
    }
  }

  async function fetchData() {
    try {
      const [statusRes, titlesRes, schedulesRes] = await Promise.all([
        fetch('/api/automation/scheduler'),
        fetch('/api/automation/titles'),
        fetch('/api/automation/schedules')
      ]);

      const status = await statusRes.json();
      const titlesData = await titlesRes.json();
      const schedulesData = await schedulesRes.json();

      console.log('🔄 자동화 데이터 새로고침:', {
        titles: titlesData.titles?.length || 0,
        processing: titlesData.titles?.filter((t: any) => t.status === 'processing').length || 0,
        scheduled: titlesData.titles?.filter((t: any) => t.status === 'scheduled').length || 0,
        completed: titlesData.titles?.filter((t: any) => t.status === 'completed').length || 0
      });

      if (status?.status) {
        setSchedulerStatus(status.status);
        setSettings(status.status.settings || {});
      } else {
        console.error('⚠️ 스케줄러 상태 응답이 잘못되었습니다:', status);
      }
      setTitles(titlesData.titles || []);
      setSchedules(schedulesData.schedules || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleScheduler() {
    const action = schedulerStatus?.isRunning ? 'stop' : 'start';
    try {
      const response = await fetch('/api/automation/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (!response.ok) throw new Error('Failed to toggle scheduler');

      await fetchData();
    } catch (error) {
      console.error(`Failed to ${action} scheduler:`, error);
    }
  }

  async function addTitle(customTitle?: string, autoMode: boolean = false) {
    // 중복 제출 방지 (강화) - 자동 모드는 예외
    if (isSubmitting && !autoMode) {
      console.warn('⚠️ 이미 제목 추가 중입니다. 중복 제출을 방지합니다.');
      return;
    }

    const titleToAdd = customTitle || newTitle.title;

    if (!titleToAdd || !newTitle.type) {
      if (!autoMode) {
        alert('제목과 타입은 필수입니다');
      }
      return;
    }

    if (titleError && !autoMode) {
      alert(titleError);
      return;
    }

    // 🔍 과거 시간 검증 (제목 추가 전에!)
    if (newTitle.scheduleTime) {
      const scheduledDate = new Date(newTitle.scheduleTime);
      const now = new Date();
      if (scheduledDate < now) {
        alert('⚠️ 과거 시간으로 스케줄을 설정할 수 없습니다.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // 상품 정보가 있으면 포함 (product, product-info 모두)
      let productData = null;
      if (newTitle.type === 'product' || newTitle.type === 'product-info') {
        // 1. 현재 페이지에서 입력한 상품 정보 우선
        if (currentProductData) {
          // ⭐ productUrl 검증 (딥링크여야 함!)
          const isDeeplink = currentProductData.productUrl &&
            (currentProductData.productUrl.includes('partner=') || currentProductData.productUrl.includes('link.coupang.com/a/'));
          if (!isDeeplink) {
            alert('❌ 상품 URL이 딥링크가 아닙니다.\n\n제휴 마크(partner=) 또는 link.coupang.com/a/ 형식이어야 합니다.\n\n내 목록에서 상품을 다시 선택해주세요.');
            setIsSubmitting(false);
            return;
          }
          productData = JSON.stringify(currentProductData);
          console.log('✅ [자동화] currentProductData 사용 (딥링크 검증됨):', currentProductData.productUrl);
        }
        // 2. localStorage에서 가져온 상품 정보 (상품관리에서 넘어온 경우)
        else {
          const savedProductData = localStorage.getItem('current_product_data');
          if (savedProductData) {
            const parsedData = JSON.parse(savedProductData);
            // ⭐ productUrl 검증 (딥링크여야 함!)
            const isDeeplink = parsedData.productUrl &&
              (parsedData.productUrl.includes('partner=') || parsedData.productUrl.includes('link.coupang.com/a/'));
            if (!isDeeplink) {
              alert('❌ 상품 URL이 딥링크가 아닙니다.\n\n제휴 마크(partner=) 또는 link.coupang.com/a/ 형식이어야 합니다.\n\n내 목록에서 상품을 다시 선택해주세요.');
              setIsSubmitting(false);
              return;
            }
            productData = savedProductData; // 이미 JSON 문자열
            localStorage.removeItem('current_product_data'); // 사용 후 삭제
            console.log('✅ [자동화] localStorage productData 사용 (딥링크 검증됨):', parsedData.productUrl);
          } else {
            alert('⚠️ 상품 정보가 없습니다.\n\n내 목록에서 상품을 선택해주세요.');
            setIsSubmitting(false);
            return;
          }
        }
      }

      const response = await fetch('/api/automation/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleToAdd,
          type: newTitle.type,
          category: newTitle.category,
          tags: newTitle.tags,
          productUrl: newTitle.productUrl,
          productData: productData,  // 상품 정보 추가
          channel: newTitle.channel,
          scriptMode: newTitle.scriptMode,
          mediaMode: newTitle.mediaMode,
          model: newTitle.model,
          youtubeSchedule: newTitle.youtubeSchedule,
          youtubePublishAt: newTitle.youtubePublishAt
        })
      });

      if (!response.ok) throw new Error('Failed to add title');

      const data = await response.json();
      const titleId = data.titleId;

      // 스케줄 시간이 입력되었으면 스케줄 추가 (이미 검증 완료)
      if (newTitle.scheduleTime) {
        await addScheduleToTitle(
          titleId,
          newTitle.scheduleTime,
          newTitle.youtubePublishAt || undefined,
          newTitle.youtubePrivacy
        );
      }

      saveRecentTitle(titleToAdd);

      // 자동 모드가 아닐 때만 폼 초기화
      if (!autoMode) {
        // 다음 제목 추가 시에도 동일한 채널 유지 (localStorage에 저장됨)
        const currentChannel = newTitle.channel;

        setNewTitle({
          title: '',
          type: getSelectedType(), // localStorage에서 불러온 타입 유지
          category: getSelectedCategory(), // localStorage에서 불러온 카테고리 유지
          tags: '',
          productUrl: '',
          scheduleTime: '',
          channel: currentChannel, // 현재 선택된 채널 유지
          scriptMode: 'chrome',
          mediaMode: getSelectedMediaMode(), // localStorage에서 불러온 미디어 모드 유지
          youtubeSchedule: 'immediate',
          youtubePublishAt: '',
          youtubePrivacy: getSelectedPrivacy(), // localStorage에서 불러온 공개 설정 유지
          model: getSelectedModel() // localStorage에서 불러온 모델 유지
        });
        setShowAddForm(false);
        setCurrentProductData(null); // 상품정보 초기화
      }

      await fetchData();

      if (!autoMode) {
        setQueueTab('scheduled'); // 예약 큐 탭으로 자동 전환
      }
    } catch (error) {
      console.error('Failed to add title:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteTitle(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/automation/titles?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete title');

      await fetchData();
    } catch (error) {
      console.error('Failed to delete title:', error);
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/automation/schedules?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete schedule');

      await fetchData();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  }

  function viewPipelineDetails(scheduleId: string) {
    router.push(`/automation/pipeline/${scheduleId}`);
  }

  function startEdit(title: any) {
    const titleSchedules = schedules.filter(s => s.title_id === title.id);
    setEditingId(title.id);

    // product_data에서 deepLink 추출 (딥링크 우선 사용)
    let productUrl = title.product_url;
    if (title.product_data) {
      try {
        const productData = typeof title.product_data === 'string'
          ? JSON.parse(title.product_data)
          : title.product_data;
        if (productData.deepLink) {
          productUrl = productData.deepLink;
        } else if (productData.productUrl) {
          productUrl = productData.productUrl;
        }
      } catch (e) {
        console.error('❌ product_data 파싱 실패:', e);
      }
    }

    setEditForm({
      ...title,
      product_url: productUrl, // 딥링크로 업데이트
      channel_id: title.channel, // channel을 channel_id로 매핑
      schedules: titleSchedules
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function saveEdit() {
    try {
      console.log('📝 [수정 저장] 시작:', editForm);

      // 제목 업데이트 (모든 필드 포함)
      const response = await fetch('/api/automation/titles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editForm.id,
          title: editForm.title,
          type: editForm.type,
          category: editForm.category,
          tags: editForm.tags,
          productUrl: editForm.product_url,
          channelId: editForm.channel_id,
          scriptMode: editForm.script_mode,
          mediaMode: editForm.media_mode,
          model: editForm.model
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ [수정 저장] API 실패:', error);
        alert(`저장 실패: ${error.error || '알 수 없는 오류'}`);
        return;
      }

      console.log('✅ [수정 저장] 성공');
      cancelEdit();
      await fetchData();
    } catch (error) {
      console.error('❌ [수정 저장] 실패:', error);
      alert(`저장 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  async function addScheduleToTitle(titleId: string, scheduledTime: string, youtubePublishTime?: string, youtubePrivacy?: string) {
    try {
      const response = await fetch('/api/automation/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleId,
          scheduledTime,
          youtubePublishTime: youtubePublishTime || null,
          youtubePrivacy: youtubePrivacy || 'public'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to add schedule');
        return;
      }

      await fetchData();
    } catch (error) {
      console.error('Failed to add schedule:', error);
      alert('스케줄 추가 중 오류가 발생했습니다.');
    }
  }

  async function updateSchedule(scheduleId: string, scheduledTime: string) {
    try {
      // 과거 시간 검증
      const scheduledDate = new Date(scheduledTime);
      const now = new Date();
      if (scheduledDate < now) {
        alert('⚠️ 과거 시간으로 스케줄을 설정할 수 없습니다.');
        return;
      }

      const response = await fetch('/api/automation/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scheduleId,
          scheduledTime
        })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to update schedule');
        return;
      }

      await fetchData();
      setEditingScheduleId(null);
    } catch (error) {
      console.error('Failed to update schedule:', error);
      alert('스케줄 수정 중 오류가 발생했습니다.');
    }
  }

  async function updateSettings(newSettings: any) {
    try {
      const response = await fetch('/api/automation/scheduler', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: newSettings
        })
      });

      if (!response.ok) throw new Error('Failed to update settings');

      await fetchData();
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  }

  async function fetchLogs(titleId: string) {
    const isFirstLoad = !logsMap[titleId];
    if (isFirstLoad) setIsLoadingLogs(true);

    try {
      const response = await fetch(`/api/automation/logs?titleId=${titleId}`);
      const data = await response.json();
      if (data.logs) {
        setLogsMap(prev => {
          const prevLogs = prev[titleId] || [];
          // 로그 개수와 마지막 로그가 같으면 업데이트 안 함 (성능 최적화)
          if (prevLogs.length === data.logs.length &&
              prevLogs.length > 0 &&
              JSON.stringify(prevLogs[prevLogs.length - 1]) === JSON.stringify(data.logs[data.logs.length - 1])) {
            return prev;
          }
          return { ...prev, [titleId]: data.logs };
        });
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      if (isFirstLoad) setIsLoadingLogs(false);
    }
  }

  // script_id와 video_id로 진행 상황 조회
  async function fetchProgress(title: any) {
    try {
      const progress: { scriptProgress?: number; videoProgress?: number } = {};

      // 대본 생성 진행률 조회
      if (title.script_id) {
        const scriptRes = await fetch(`/api/scripts/status/${title.script_id}`);
        if (scriptRes.ok) {
          const scriptData = await scriptRes.json();
          progress.scriptProgress = scriptData.progress || 0;
        }
      }

      // 영상 생성 진행률 조회
      if (title.video_id) {
        const videoRes = await fetch(`/api/generate-video?jobId=${title.video_id}`);
        if (videoRes.ok) {
          const videoData = await videoRes.json();
          progress.videoProgress = videoData.progress || 0;
        }
      }

      if (Object.keys(progress).length > 0) {
        setProgressMap(prev => ({ ...prev, [title.id]: progress }));
      }
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    }
  }

  // 실시간 로그 업데이트 (3초마다)
  useEffect(() => {
    if (!expandedLogsFor) return;

    // 즉시 로드
    fetchLogs(expandedLogsFor);

    const interval = setInterval(() => {
      fetchLogs(expandedLogsFor);
    }, 3000);

    return () => clearInterval(interval);
  }, [expandedLogsFor]);

  // 진행 중인 제목들의 로그 및 진행 상황 자동 업데이트
  useEffect(() => {
    if (!titles || titles.length === 0) return;

    // 진행 중이거나 예약된 제목들 찾기
    const activeTitles = titles.filter((t: any) =>
      t.status === 'processing' || t.status === 'scheduled'
    );

    // 진행 중인 작업이 없으면 자동 업데이트만 중단 (로그는 닫지 않음)
    if (activeTitles.length === 0) {
      return;
    }

    // 진행 중인 작업이 있고, 현재 열린 로그가 없거나 진행 중인 작업의 로그가 아니면 자동으로 열기
    if (!expandedLogsFor || !activeTitles.find((t: any) => t.id === expandedLogsFor)) {
      setExpandedLogsFor(activeTitles[0].id);
    }

    // 즉시 로드
    activeTitles.forEach((t: any) => {
      fetchLogs(t.id);
      fetchProgress(t);
    });

    // 3초마다 업데이트
    const interval = setInterval(() => {
      activeTitles.forEach((t: any) => {
        fetchLogs(t.id);
        fetchProgress(t);
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [titles]);

  // 로그가 업데이트될 때 자동으로 스크롤을 맨 아래로 이동
  useEffect(() => {
    Object.keys(logsMap).forEach(titleId => {
      const logContainer = document.getElementById(`log-container-${titleId}`);
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    });
  }, [logsMap]);

  function toggleLogs(titleId: string) {
    if (expandedLogsFor === titleId) {
      setExpandedLogsFor(null);
    } else {
      setExpandedLogsFor(titleId);
      // 로그가 없으면 즉시 로드
      if (!logsMap[titleId]) {
        fetchLogs(titleId);
      }
    }
  }

  // 재시도 함수 (실패한 구간부터 재시작)
  async function retryFailed(titleId: string, titleObj: any) {
    const titleSchedules = schedules.filter(s => s.title_id === titleId);
    const hasScriptId = titleSchedules.some((s: any) => s.script_id);
    const hasVideoId = titleSchedules.some((s: any) => s.video_id);

    console.log('[Retry] Title:', titleObj.title);
    console.log('[Retry] Has script_id:', hasScriptId);
    console.log('[Retry] Has video_id:', hasVideoId);
    console.log('[Retry] Media mode:', titleObj.media_mode);

    // 1. script_id가 없으면 대본 생성부터 재시작
    if (!hasScriptId) {
      if (!confirm(`"${titleObj.title}"\n\n대본 생성이 실패했습니다.\n처음부터 재시작하시겠습니까?`)) {
        return;
      }
      await forceExecute(titleId, titleObj.title);
      return;
    }

    // 2. script_id는 있는데 video_id가 없으면 영상 생성부터 재시작
    if (hasScriptId && !hasVideoId) {
      // upload 모드면 업로드 UI 표시
      if (titleObj.media_mode === 'upload') {
        if (!confirm(`"${titleObj.title}"\n\n미디어 업로드가 필요합니다.\n업로드 화면을 여시겠습니까?`)) {
          return;
        }
        // 업로드 박스 열기 + waiting_for_upload 상태로 변경
        setUploadBoxOpenFor(prev => ({ ...prev, [titleId]: true }));

        // DB에서 status를 waiting_for_upload로 업데이트
        try {
          await fetch(`/api/automation/titles/${titleId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'waiting_for_upload' })
          });
          await fetchData();
          setQueueTab('waiting_upload');
        } catch (error) {
          console.error('Failed to update status:', error);
        }
        return;
      }

      // 자동 생성 모드면 영상 재생성
      if (!confirm(`"${titleObj.title}"\n\n영상 생성이 실패했습니다.\n영상을 재생성하시겠습니까?`)) {
        return;
      }

      // TODO: 영상 재생성 API 필요
      alert('영상 재생성 기능은 준비 중입니다.');
      return;
    }

    // 3. video_id까지 있으면 업로드/퍼블리시 단계 실패
    if (hasScriptId && hasVideoId) {
      if (!confirm(`"${titleObj.title}"\n\nYouTube 업로드가 실패했습니다.\n재시도하시겠습니까?`)) {
        return;
      }
      // TODO: 업로드만 재시도하는 API 필요
      alert('YouTube 업로드 재시도 기능은 준비 중입니다.');
      return;
    }
  }

  async function forceExecute(titleId: string, title: string) {
    // 확인 메시지
    if (!confirm(`"${title}"\n\n즉시 실행하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch('/api/automation/force-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId })
      });

      const data = await response.json();

      if (response.ok) {
        await fetchData();
        setQueueTab('processing'); // 진행 큐 탭으로 자동 전환
      } else {
        alert(`❌ 실행 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Force execute error:', error);
      alert('강제 실행 중 오류가 발생했습니다.');
    }
  }

  async function handleOpenFolder(videoId: string | null, scriptId: string | null, status: string) {
    try {
      let url: string;

      if (videoId) {
        // video_id가 있으면 jobId로 사용
        url = `/api/open-folder?jobId=${videoId}`;
      } else if (scriptId) {
        // scriptId만 있으면 경로 직접 지정
        const folderType = status === 'completed' ? 'output' : 'input';
        const folderPath = `../trend-video-backend/${folderType}/project_${scriptId}`;
        url = `/api/open-folder?path=${encodeURIComponent(folderPath)}`;
      } else {
        alert('폴더를 열 수 없습니다: ID를 찾을 수 없습니다');
        return;
      }

      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`폴더 열기 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      console.error('폴더 열기 실패:', error);
      alert('폴더 열기 중 오류가 발생했습니다.');
    }
  }

  async function handleDownload(scriptId: string, type: 'video' | 'script' | 'materials' | 'all', title: string) {
    try {
      const typeLabels = {
        video: '영상',
        script: '대본',
        materials: '재료',
        all: '전체'
      };

      console.log(`📥 ${typeLabels[type]} 다운로드 시작:`, scriptId);

      // API 호출하여 파일 다운로드
      const url = `/api/automation/download?scriptId=${encodeURIComponent(scriptId)}&type=${type}&title=${encodeURIComponent(title)}`;

      const response = await fetch(url, {
        credentials: 'include'
      });

      // 에러 응답 체크
      if (!response.ok) {
        const contentType = response.headers.get('Content-Type');
        if (contentType?.includes('application/json')) {
          const error = await response.json();
          const errorMsg = error.error || '알 수 없는 오류';
          const details = error.details ? `\n\n상세: ${error.details}` : '';
          alert(`다운로드 실패: ${errorMsg}${details}`);
          return;
        }
        alert(`다운로드 실패: ${response.status} ${response.statusText}`);
        return;
      }

      // Content-Type이 JSON인 경우 (에러 응답)
      const contentType = response.headers.get('Content-Type');
      if (contentType?.includes('application/json') && !contentType?.includes('attachment')) {
        const data = await response.json();
        if (data.error) {
          const errorMsg = data.error;
          const details = data.details ? `\n\n상세: ${data.details}` : '';
          alert(`다운로드 실패: ${errorMsg}${details}`);
          return;
        }
      }

      // 파일 다운로드
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;

      // Content-Disposition에서 파일명 추출
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition?.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : `${title}_${type}.zip`;

      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      console.log(`✅ ${typeLabels[type]} 다운로드 완료`);
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  }

  async function handleImageCrawling(scriptId: string, titleId: string, title: string) {
    try {
      setCrawlingFor(titleId);
      setCrawlLogs(prev => ({ ...prev, [titleId]: ['🚀 이미지 크롤링 시작...'] }));

      // story.json 읽기
      const storyRes = await fetch(`/api/automation/get-story?scriptId=${scriptId}`);
      if (!storyRes.ok) {
        throw new Error('story.json을 불러올 수 없습니다');
      }

      const storyData = await storyRes.json();
      console.log('📖 Story 데이터:', JSON.stringify(storyData, null, 2));

      // story.json 구조: { storyJson: { scenes: [...] } } 또는 { story: { scenes: [...] } } 또는 { scenes: [...] }
      const scenes = storyData.storyJson?.scenes || storyData.story?.scenes || storyData.scenes || [];

      if (!scenes || scenes.length === 0) {
        console.error('❌ Scenes 데이터 없음. 받은 데이터:', storyData);
        throw new Error(`크롤링할 씬 데이터가 없습니다. (${JSON.stringify(Object.keys(storyData))})`);
      }

      setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), `📋 ${scenes.length}개 씬 발견`] }));

      // 이미지 크롤링 API 호출
      const response = await fetch('/api/images/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes, contentId: scriptId })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '크롤링 실패');
      }

      const taskId = result.taskId;
      setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), `✅ 크롤링 작업 생성: ${taskId}`, '⏳ 실시간 로그 수신 중...'] }));

      // 실시간 로그 폴링
      let lastLogCount = 0;
      let pollCount = 0;
      const maxPolls = 120; // 최대 10분 (5초 간격)

      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          const statusRes = await fetch(`/api/images/crawl?taskId=${taskId}`);

          if (!statusRes.ok) {
            clearInterval(pollInterval);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), '❌ 상태 확인 실패'] }));
            setCrawlingFor(null);
            return;
          }

          const status = await statusRes.json();

          // 새로운 로그만 추가
          if (status.logs && status.logs.length > lastLogCount) {
            const newLogs = status.logs.slice(lastLogCount);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), ...newLogs] }));
            lastLogCount = status.logs.length;
          }

          // 완료 또는 실패 시 폴링 중단
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), '✅ 이미지 크롤링 완료! 이제 영상 제작을 시작할 수 있습니다.'] }));
            setCrawlingFor(null);
            alert('✅ 이미지 크롤링이 완료되었습니다!\n\n이제 영상 제작을 진행할 수 있습니다.');
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), `❌ 크롤링 실패: ${status.error || '알 수 없는 오류'}`] }));
            setCrawlingFor(null);
            alert(`❌ 이미지 크롤링이 실패했습니다.\n\n${status.error || '알 수 없는 오류'}`);
          } else if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), '⏱️ 타임아웃: 작업이 너무 오래 걸립니다. 수동으로 확인해주세요.'] }));
            setCrawlingFor(null);
          }
        } catch (pollError: any) {
          console.error('폴링 에러:', pollError);
        }
      }, 5000); // 5초마다 폴링

    } catch (error: any) {
      setCrawlLogs(prev => ({ ...prev, [titleId]: [...(prev[titleId] || []), `❌ ${error.message}`] }));
      alert(`❌ 크롤링 실패: ${error.message}`);
      console.error('Image crawling error:', error);
      setCrawlingFor(null);
    }
  }

  async function handleRegenerateScript(scriptId: string, titleId: string, title: string) {
    try {
      if (!confirm(`"${title}" 대본을 재생성하시겠습니까?\n\n기존 대본이 초기화되고 새로운 대본이 생성됩니다.`)) {
        return;
      }

      console.log(`🔄 대본 재생성 시작: ${scriptId}`);

      const response = await fetch('/api/automation/regenerate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scriptId, titleId })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ ${data.message}`);
        await fetchData();
      } else {
        alert(`❌ 재생성 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Regenerate script error:', error);
      alert('대본 재생성 중 오류가 발생했습니다.');
    }
  }

  async function handleRegenerateVideo(videoId: string | null, scriptId: string | null, title: string) {
    try {
      if (!videoId && !scriptId) {
        alert('재생성할 영상을 찾을 수 없습니다.');
        return;
      }

      if (!confirm(`"${title}" 영상을 재생성하시겠습니까?\n\n기존 영상이 초기화되고 새로운 영상이 생성됩니다.`)) {
        return;
      }

      console.log(`🔄 영상 재생성 시작: videoId=${videoId}, scriptId=${scriptId}`);

      const response = await fetch('/api/automation/regenerate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoId, scriptId })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ ${data.message}`);
        await fetchData();
      } else {
        alert(`❌ 재생성 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Regenerate video error:', error);
      alert('영상 재생성 중 오류가 발생했습니다.');
    }
  }

  // 미디어(이미지+동영상) 업로드 실행
  async function uploadImages(titleId: string, scheduleId: string, scriptId: string) {
    const images = uploadedImagesFor[titleId] || [];
    const videos = uploadedVideosFor[titleId] || [];

    if (images.length === 0 && videos.length === 0) {
      return;
    }

    try {
      setUploadingFor(titleId);

      const formData = new FormData();
      formData.append('scheduleId', scheduleId);
      formData.append('scriptId', scriptId);

      // 동영상 파일 먼저 추가 (scene_0부터 시작)
      videos.forEach((file) => {
        formData.append(`media`, file);
      });

      // 이미지 파일 나중에 추가
      images.forEach((file) => {
        formData.append(`media`, file);
      });

      const response = await fetch('/api/automation/upload-media', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        // 업로드 박스 닫기
        setUploadBoxOpenFor(prev => ({ ...prev, [titleId]: false }));

        // 업로드된 미디어 초기화
        setUploadedImagesFor(prev => {
          const newState = { ...prev };
          delete newState[titleId];
          return newState;
        });
        setUploadedVideosFor(prev => {
          const newState = { ...prev };
          delete newState[titleId];
          return newState;
        });

        // 로그창 자동 열기
        setExpandedLogsFor(titleId);

        await fetchData();
        setQueueTab('processing'); // 업로드 성공 후 바로 진행 큐로 전환

        // 영상 제작 시작 (대본 작성/이미지 생성 건너뛰고 바로 영상 생성)
        const titleInfo = titles.find((t: any) => t.id === titleId);
        if (titleInfo) {
          console.log('📹 [영상 제작] 시작:', titleId);

          // 1. story.json 가져오기
          const storyRes = await fetch(`/api/automation/get-story?scriptId=${scriptId}`, {
            credentials: 'include'
          });
          if (!storyRes.ok) {
            console.error('❌ story.json 읽기 실패');
            return;
          }
          const { storyJson } = await storyRes.json();

          // 2. 스케줄 상태를 'processing'으로 변경
          const updateRes = await fetch(`/api/automation/schedules`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              id: scheduleId,
              status: 'processing'
            })
          });

          if (!updateRes.ok) {
            console.error('❌ 스케줄 상태 업데이트 실패');
          } else {
            console.log('✅ 스케줄 상태를 processing으로 변경');
          }

          await fetchData(); // 상태 업데이트 후 데이터 새로고침

          // ⭐ 최신 데이터 재조회 (DB에서 최신 media_mode 읽기)
          const latestTitlesRes = await fetch('/api/automation/titles', {
            credentials: 'include'
          });
          const latestTitles = latestTitlesRes.ok ? (await latestTitlesRes.json()).titles : [];
          const latestTitleInfo = latestTitles.find((t: any) => t.id === titleId) || titleInfo;

          // 3. 영상 생성 API 호출 (내부 요청 형식)
          const imageSource = latestTitleInfo.media_mode === 'upload' ? 'none' : latestTitleInfo.media_mode;
          console.log(`📹 [영상 생성] 설정: mediaMode=${latestTitleInfo.media_mode}, imageSource=${imageSource}`);

          const videoRes = await fetch('/api/generate-video-upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Request': 'automation-system'
            },
            body: JSON.stringify({
              storyJson,
              userId: latestTitleInfo.user_id,
              imageSource,
              imageModel: latestTitleInfo.model || 'dalle3',
              videoFormat: latestTitleInfo.type || 'shortform',
              ttsVoice: 'ko-KR-SoonBokNeural',
              title: latestTitleInfo.title,
              scriptId
            })
          });

          const videoData = await videoRes.json();
          if (videoRes.ok) {
            console.log('✅ [영상 제작] 성공:', videoData.jobId);
          } else {
            console.error('❌ [영상 제작] 실패:', videoData.error);

            // 영상 제작 실패 시 스케줄 상태를 failed로 변경
            try {
              await fetch(`/api/automation/schedules`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  id: scheduleId,
                  status: 'failed'
                })
              });
              await fetchData();
              setQueueTab('failed'); // 실패 탭으로 전환
            } catch (updateError) {
              console.error('❌ 상태 업데이트 실패:', updateError);
            }
          }
        }
      } else {
        console.error('❌ 업로드 실패:', data.error || '알 수 없는 오류');

        // 미디어 업로드 실패 시 스케줄 상태를 failed로 변경
        try {
          await fetch(`/api/automation/schedules`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              id: scheduleId,
              status: 'failed'
            })
          });
          await fetchData();
          setQueueTab('failed'); // 실패 탭으로 전환
        } catch (updateError) {
          console.error('❌ 상태 업데이트 실패:', updateError);
        }
      }
    } catch (error) {
      console.error('❌ Image upload error:', error);

      // 예외 발생 시 스케줄 상태를 failed로 변경
      try {
        await fetch(`/api/automation/schedules`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: scheduleId,
            status: 'failed'
          })
        });
        await fetchData();
        setQueueTab('failed'); // 실패 탭으로 전환
      } catch (updateError) {
        console.error('❌ 상태 업데이트 실패:', updateError);
      }
    } finally {
      setUploadingFor(null);
    }
  }

  if (loading) {
    return <div className="p-8">로딩 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 - 스케줄러 상태 */}
        <div className="flex justify-between items-center mb-8">
          <div></div>
          <div className="flex items-center gap-4">
            {/* 자동 제목 생성 토글 */}
            <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-2 border border-slate-700">
              <span className="text-slate-300 text-sm font-medium">🤖 자동 제목 생성</span>
              <div className={`flex items-center gap-2 ${
                settings?.auto_title_generation === 'true'
                  ? 'text-green-400'
                  : 'text-gray-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  settings?.auto_title_generation === 'true'
                    ? 'bg-green-500'
                    : 'bg-gray-500'
                }`}></div>
                <span className="text-sm font-semibold">
                  {settings?.auto_title_generation === 'true' ? '활성화 중' : '꺼짐'}
                </span>
              </div>
              <button
                onClick={async () => {
                  const newValue = settings?.auto_title_generation !== 'true';
                  try {
                    const response = await fetch('/api/automation/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ auto_title_generation: newValue ? 'true' : 'false' })
                    });
                    if (response.ok) {
                      await fetchData();
                    }
                  } catch (error) {
                    console.error('Failed to toggle auto title generation:', error);
                  }
                }}
                className={`px-3 py-1 rounded text-sm font-semibold transition ${
                  settings?.auto_title_generation === 'true'
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {settings?.auto_title_generation === 'true' ? '끄기' : '켜기'}
              </button>
              <button
                onClick={() => {
                  setTestModalOpen(true);
                  setTestLogs([]);
                  setTestInProgress(true);

                  // 실시간 로그를 받아오는 함수
                  const runTest = async () => {
                    try {
                      const response = await fetch('/api/automation/test-generate-stream', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });

                      if (!response.ok) {
                        const error = await response.json();
                        setTestLogs(prev => [...prev, `❌ 에러: ${error.error}`]);
                        setTestInProgress(false);
                        return;
                      }

                      const reader = response.body?.getReader();
                      const decoder = new TextDecoder();

                      if (!reader) {
                        setTestLogs(prev => [...prev, '❌ 스트림을 읽을 수 없습니다']);
                        setTestInProgress(false);
                        return;
                      }

                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const text = decoder.decode(value);
                        const lines = text.split('\n').filter(line => line.trim());

                        for (const line of lines) {
                          if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                              setTestInProgress(false);
                              setTestLogs(prev => [...prev, '\n✅ 테스트 완료']);
                              await fetchData(); // 데이터 새로고침
                            } else {
                              setTestLogs(prev => [...prev, data]);
                            }
                          }
                        }
                      }
                    } catch (error: any) {
                      console.error('Failed to test title generation:', error);
                      setTestLogs(prev => [...prev, `❌ 테스트 실패: ${error.message}`]);
                      setTestInProgress(false);
                    }
                  };

                  runTest();
                }}
                className="px-3 py-1 rounded text-sm font-semibold transition bg-purple-600 hover:bg-purple-500 text-white"
                disabled={testInProgress}
              >
                {testInProgress ? '테스트 중...' : '테스트'}
              </button>
            </div>

            {/* 스케줄러 상태 */}
            <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-2 border border-slate-700">
              <div className={`w-3 h-3 rounded-full ${schedulerStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-slate-300 text-sm">
                {schedulerStatus?.isRunning ? '실행 중' : '중지됨'}
              </span>
              <button
                onClick={toggleScheduler}
                className={`px-3 py-1 rounded text-sm font-semibold transition ${
                  schedulerStatus?.isRunning
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {schedulerStatus?.isRunning ? '중지' : '시작'}
              </button>
            </div>
          </div>
        </div>

        {/* 채널 연결 상태 */}
        {channels.length === 0 && (
          <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg px-4 py-2 flex items-center gap-3 mb-8">
            <span className="text-yellow-300 text-sm">⚠️ 연결된 유튜브 채널이 없습니다</span>
            <button
              onClick={() => router.push('/settings/youtube')}
              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm font-semibold transition"
            >
              채널 연결하기
            </button>
          </div>
        )}

        {/* 제목 리스트 관리 */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <h2 className="text-2xl font-semibold text-white mb-4">제목 리스트</h2>

          {/* 제목 추가 버튼/폼 */}
          {!showAddForm ? (
            <button
              onClick={() => {
                setShowAddForm(true);
                // 폼 열 때 기본 스케줄 시간 설정
                setNewTitle(prev => ({ ...prev, scheduleTime: getDefaultScheduleTime() }));
              }}
              className="mb-6 w-full px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition"
            >
              + 새 제목 추가
            </button>
          ) : (
            <div className="mb-6 p-4 bg-slate-700 rounded-lg border-2 border-green-500">
              <h3 className="text-lg font-semibold text-white mb-3">새 제목 추가</h3>
              <div className="space-y-4 mb-4">
                <div>
                  <input
                    type="text"
                    placeholder="제목"
                    value={newTitle.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className={`w-full px-4 py-2 bg-slate-600 text-white rounded-lg border focus:outline-none ${
                      titleError ? 'border-red-500' : 'border-slate-500 focus:border-blue-500'
                    }`}
                  />
                  {titleError && (
                    <p className="text-red-400 text-xs mt-1">⚠️ {titleError}</p>
                  )}
                </div>

                {/* 최근 제목 4개 */}
                {recentTitles.length > 0 && (
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-400">
                      📝 최근 사용한 제목 (클릭하여 재사용)
                    </label>
                    <div className="max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
                      <div className="flex flex-wrap gap-2">
                        {recentTitles.map((title, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleTitleChange(title)}
                            className="rounded-md bg-emerald-600/20 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-600/40 hover:text-emerald-100"
                            title={title}
                          >
                            {title.length > 30 ? title.substring(0, 30) + '...' : title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <select
                    value={newTitle.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      const model = getDefaultModelByType(type); // ✅ 통일된 함수 사용
                      setNewTitle(prev => ({ ...prev, type, model }));
                      localStorage.setItem('automation_selected_type', type);
                      localStorage.setItem('automation_selected_model', model);
                    }}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                  >
                    <option value="longform">롱폼</option>
                    <option value="shortform">숏폼</option>
                    <option value="product">상품</option>
                  </select>
                  <select
                    value={newTitle.category}
                    onChange={(e) => {
                      const category = e.target.value;
                      setNewTitle(prev => ({ ...prev, category }));
                      localStorage.setItem('automation_selected_category', category);
                    }}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">🎭 카테고리 선택 (선택)</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="태그 (쉼표로 구분)"
                    value={newTitle.tags}
                    onChange={(e) => setNewTitle({ ...newTitle, tags: e.target.value })}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {newTitle.type === 'product' && (
                  <>
                    {/* 상품 선택 드롭다운 - currentProductData가 없을 때만 표시 */}
                    {!currentProductData && (
                      <div className="flex flex-col gap-2">
                        <label className="text-xs text-slate-400 block">상품 선택 (카테고리 기반)</label>
                        <select
                          value={newTitle.productUrl || ''}
                          onChange={(e) => {
                            const selectedProductUrl = e.target.value;
                            const selectedProduct = availableProducts.find(p => p.productUrl === selectedProductUrl);

                            if (selectedProduct) {
                              const productInfo = {
                                productName: selectedProduct.productName,
                                productPrice: selectedProduct.productPrice,
                                productImage: selectedProduct.productImage,
                                productUrl: selectedProduct.productUrl,
                                productId: selectedProduct.productId
                              };
                              setCurrentProductData(productInfo);
                              setNewTitle(prev => ({
                                ...prev,
                                title: `[광고] ${selectedProduct.productName}`,
                                productUrl: selectedProduct.productUrl
                              }));
                            } else {
                              setCurrentProductData(null);
                              setNewTitle(prev => ({ ...prev, productUrl: '' }));
                            }
                          }}
                          className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                          disabled={fetchingProducts}
                        >
                          <option value="">{fetchingProducts ? '상품 로딩 중...' : '--- 상품을 선택하세요 ---'}</option>
                          {availableProducts.map((product) => (
                            <option key={product.productId} value={product.productUrl}>
                              {product.productName} ({product.productPrice?.toLocaleString()}원)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 상품정보가 없을 때만 URL 입력 필드 표시 */}
                    {!currentProductData && (
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="쿠팡 상품 URL 입력"
                          value={newTitle.productUrl}
                          onChange={(e) => setNewTitle({ ...newTitle, productUrl: e.target.value })}
                          className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                          disabled={!!currentProductData} // Disable if a product is already selected
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!newTitle.productUrl) {
                              alert('상품 URL을 입력해주세요');
                              return;
                            }

                            try {
                              const response = await fetch('/api/coupang/deeplink', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: newTitle.productUrl })
                              });

                              if (!response.ok) {
                                throw new Error('상품 정보를 가져올 수 없습니다');
                              }

                              const data = await response.json();

                              if (data.success && data.data) {
                                const productInfo = {
                                  productName: data.data.productName || newTitle.title,
                                  productPrice: data.data.productPrice,
                                  productImage: data.data.productImage,
                                  productUrl: data.data.shortenUrl || newTitle.productUrl,
                                  productId: data.data.productId
                                };

                                setCurrentProductData(productInfo);
                                setNewTitle({
                                  ...newTitle,
                                  title: data.data.productName || newTitle.title,
                                  productUrl: data.data.shortenUrl || newTitle.productUrl
                                });
                                alert('✅ 상품 정보를 가져왔습니다');
                              } else {
                                throw new Error('상품 정보가 없습니다');
                              }
                            } catch (error: any) {
                              console.error('상품 정보 가져오기 실패:', error);
                              alert(`❌ 상품 정보 가져오기 실패: ${error.message}`);
                            }
                          }}
                          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition whitespace-nowrap"
                          disabled={!!currentProductData} // Disable if a product is already selected
                        >
                          🛍️ 상품 정보 가져오기
                        </button>
                      </div>
                    )}

                    {/* 상품정보 미리보기 */}
                    {currentProductData && (
                      <div className="rounded-lg bg-emerald-900/30 border border-emerald-500/50 p-4">
                        <div className="flex justify-between items-start mb-3">
                          <p className="text-sm font-semibold text-emerald-400">🛍️ 상품 정보</p>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentProductData(null);
                              setNewTitle({ ...newTitle, productUrl: '' });
                            }}
                            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded"
                          >
                            초기화
                          </button>
                        </div>
                        <div className="flex gap-3">
                          {currentProductData.productImage && (
                            <img
                              src={currentProductData.productImage}
                              alt="상품 이미지"
                              className="w-20 h-20 object-cover rounded border border-emerald-500"
                            />
                          )}
                          <div className="flex-1 min-w-0 space-y-1 text-xs">
                            {currentProductData.productName && (
                              <p className="text-slate-200 font-semibold">
                                {currentProductData.productName}
                              </p>
                            )}
                            {currentProductData.productPrice && (
                              <p className="text-emerald-300">
                                {currentProductData.productPrice}
                              </p>
                            )}
                            {currentProductData.productUrl && (
                              <a
                                href={currentProductData.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline block truncate"
                              >
                                {currentProductData.productUrl}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 채널, 대본 생성, 미디어 생성 방식 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">채널</label>
                    {channels.length > 0 ? (
                      <select
                        value={newTitle.channel || channels[0].id}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          setNewTitle({ ...newTitle, channel: selectedId });
                          // localStorage에 선택한 채널 저장
                          localStorage.setItem('automation_selected_channel', selectedId);
                          console.log('💾 채널 선택 저장:', selectedId);
                        }}
                        className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                      >
                        {channels.map((ch: any) => (
                          <option key={ch.id} value={ch.id} className="bg-slate-700 text-white">
                            {ch.channelTitle || ch.title || ch.id}
                            {ch.isDefault && ' ⭐'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full px-4 py-2 bg-red-900/30 text-red-300 rounded-lg border border-red-500 text-sm">
                        ⚠️ 채널 없음
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">대본 생성</label>
                    <select
                      value={newTitle.scriptMode}
                      onChange={(e) => setNewTitle({ ...newTitle, scriptMode: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="chrome">크롬창</option>
                      <option value="api">API</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">미디어 생성</label>
                    <select
                      value={newTitle.mediaMode}
                      onChange={(e) => {
                        const mediaMode = e.target.value;
                        setNewTitle({ ...newTitle, mediaMode });
                        localStorage.setItem('automation_selected_media_mode', mediaMode);
                      }}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="upload">직접 업로드</option>
                      <option value="dalle">DALL-E</option>
                      <option value="imagen3">Imagen 3</option>
                      <option value="sora2">SORA 2</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">🤖 AI 모델</label>
                    <select
                      value={newTitle.model}
                      onChange={(e) => {
                        const model = e.target.value;
                        setNewTitle(prev => ({ ...prev, model }));
                        localStorage.setItem('automation_selected_model', model);
                      }}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="claude">Claude (기본)</option>
                      <option value="chatgpt">ChatGPT</option>
                      <option value="gemini">Gemini</option>
                      <option value="grok">Grok</option>
                    </select>
                  </div>
                </div>

                {/* 유튜브 업로드 설정 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">유튜브 업로드</label>
                    <select
                      value={newTitle.youtubeSchedule}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'scheduled') {
                          // 현재 시간 + 3분을 기본값으로 설정 (로컬 시간)
                          const now = new Date(Date.now() + 3 * 60 * 1000);
                          const year = now.getFullYear();
                          const month = String(now.getMonth() + 1).padStart(2, '0');
                          const day = String(now.getDate()).padStart(2, '0');
                          const hours = String(now.getHours()).padStart(2, '0');
                          const minutes = String(now.getMinutes()).padStart(2, '0');
                          const defaultTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                          setNewTitle(prev => ({ ...prev, youtubeSchedule: value, youtubePublishAt: defaultTime }));
                        } else {
                          setNewTitle(prev => ({ ...prev, youtubeSchedule: value }));
                        }
                      }}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="immediate">즉시 업로드</option>
                      <option value="scheduled">예약 업로드</option>
                    </select>
                    {newTitle.youtubeSchedule === 'immediate' && (
                      <p className="text-xs text-slate-400 mt-1">영상 생성 완료 후 즉시 유튜브에 업로드됩니다</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">공개 설정</label>
                    <select
                      value={newTitle.youtubePrivacy}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewTitle(prev => ({ ...prev, youtubePrivacy: value }));
                        localStorage.setItem('automation_selected_privacy', value);
                      }}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="public">🌐 공개 (Public)</option>
                      <option value="unlisted">🔗 링크 공유 (Unlisted)</option>
                      <option value="private">🔒 비공개 (Private)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      {newTitle.youtubePrivacy === 'public' && '누구나 검색하고 볼 수 있습니다'}
                      {newTitle.youtubePrivacy === 'unlisted' && '링크가 있는 사람만 볼 수 있습니다'}
                      {newTitle.youtubePrivacy === 'private' && '본인만 볼 수 있습니다'}
                    </p>
                  </div>
                </div>

                {newTitle.youtubeSchedule === 'scheduled' && (
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">유튜브 공개 예약 시간</label>
                    <input
                      type="datetime-local"
                      value={newTitle.youtubePublishAt}
                      onChange={(e) => setNewTitle(prev => ({ ...prev, youtubePublishAt: e.target.value }))}
                      min={new Date(Date.now() + 3 * 60 * 1000).toISOString().slice(0, 16)}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-yellow-400 mt-1">⚠️ 비디오는 즉시 업로드되고 private 상태로 유지되다가 설정한 시간에 공개됩니다 (최소 3분 이후)</p>
                  </div>
                )}

                {/* 스케줄 시간 입력 */}
                <div>
                  <label className="text-sm text-slate-300 block mb-2">📅 스케줄 (선택)</label>
                  <input
                    type="datetime-local"
                    value={newTitle.scheduleTime}
                    min={getCurrentTimeForInput()}
                    onChange={(e) => setNewTitle({ ...newTitle, scheduleTime: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">비워두면 제목만 추가됩니다 (과거 시간은 선택 불가)</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addTitle()}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition"
                >
                  {isSubmitting ? '추가 중...' : '추가'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setCurrentProductData(null); // 상품정보 초기화
                    // 채널 선택은 유지 (localStorage 기반)
                    const currentChannel = newTitle.channel;
                    setNewTitle({
                      title: '',
                      type: getSelectedType(), // localStorage에서 불러온 타입 유지
                      category: getSelectedCategory(), // localStorage에서 불러온 카테고리 유지
                      tags: '',
                      productUrl: '',
                      scheduleTime: '',
                      channel: currentChannel, // 현재 선택된 채널 유지
                      scriptMode: 'chrome',
                      mediaMode: getSelectedMediaMode(), // localStorage에서 불러온 미디어 모드 유지
                      model: getSelectedModel(), // localStorage에서 불러온 모델 유지
                      youtubeSchedule: 'immediate',
                      youtubePublishAt: '',
                      youtubePrivacy: getSelectedPrivacy() // localStorage에서 불러온 공개 설정 유지
                    });
                  }}
                  className="flex-1 px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 메인 탭 */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <button
              onClick={() => setMainTab('queue')}
              className={`py-4 px-6 rounded-lg font-bold text-lg transition ${
                mainTab === 'queue'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              📋 자동화 큐
            </button>
            <button
              onClick={() => setMainTab('schedule-management')}
              className={`py-4 px-6 rounded-lg font-bold text-lg transition ${
                mainTab === 'schedule-management'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              📆 채널별 주기관리
            </button>
            <button
              onClick={() => setMainTab('monitoring')}
              className={`py-4 px-6 rounded-lg font-bold text-lg transition ${
                mainTab === 'monitoring'
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              📊 실시간 현황판
            </button>
            <button
              onClick={() => setMainTab('title-pool')}
              className={`py-4 px-6 rounded-lg font-bold text-lg transition ${
                mainTab === 'title-pool'
                  ? 'bg-orange-600 text-white shadow-lg'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              🎯 제목 풀
            </button>
          </div>

          {/* 큐 서브 탭 */}
          {mainTab === 'queue' && (
            <div>
              <div className="grid grid-cols-5 gap-2 mb-2">
                <button
                  onClick={() => setQueueTab('scheduled')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    queueTab === 'scheduled'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  📅 예약 큐 ({titles.filter((t: any) => t.status === 'scheduled' || t.status === 'pending').length})
                </button>
                <button
                  onClick={() => setQueueTab('processing')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    queueTab === 'processing'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  ⏳ 진행 큐 ({titles.filter((t: any) => t.status === 'processing').length})
                </button>
                <button
                  onClick={() => setQueueTab('waiting_upload')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    queueTab === 'waiting_upload'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  📤 업로드 대기 ({titles.filter((t: any) => t.status === 'waiting_for_upload').length})
                </button>
                <button
                  onClick={() => setQueueTab('failed')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    queueTab === 'failed'
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  ❌ 실패 큐 ({titles.filter((t: any) => t.status === 'failed').length})
                </button>
                <button
                  onClick={() => setQueueTab('completed')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    queueTab === 'completed'
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  ✅ 완료 큐 ({titles.filter((t: any) => t.status === 'completed').length})
                </button>
              </div>
              {/* 전체 삭제 버튼 */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={async () => {
                    const currentTitles = titles.filter((t: any) => {
                      if (queueTab === 'scheduled') return t.status === 'scheduled' || t.status === 'pending';
                      if (queueTab === 'processing') return t.status === 'processing';
                      if (queueTab === 'waiting_upload') return t.status === 'waiting_for_upload';
                      if (queueTab === 'failed') return t.status === 'failed';
                      if (queueTab === 'completed') return t.status === 'completed';
                      return false;
                    });

                    if (currentTitles.length === 0) {
                      alert('삭제할 항목이 없습니다.');
                      return;
                    }

                    const queueName = queueTab === 'scheduled' ? '예약 큐' :
                                     queueTab === 'processing' ? '진행 큐' :
                                     queueTab === 'waiting_upload' ? '업로드 대기' :
                                     queueTab === 'failed' ? '실패 큐' : '완료 큐';

                    if (!confirm(`${queueName}의 모든 항목(${currentTitles.length}개)을 삭제하시겠습니까?`)) {
                      return;
                    }

                    try {
                      for (const title of currentTitles) {
                        await fetch(`/api/automation/titles?id=${title.id}`, {
                          method: 'DELETE'
                        });
                      }
                      await fetchData();
                      alert(`✅ ${currentTitles.length}개 항목이 삭제되었습니다.`);
                    } catch (error) {
                      console.error('전체 삭제 실패:', error);
                      alert('❌ 삭제 중 오류가 발생했습니다.');
                    }
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition"
                >
                  🗑️ 현재 큐 전체 삭제
                </button>
              </div>
            </div>
          )}

          {/* 채널별 주기관리 탭 */}
          {mainTab === 'schedule-management' && (
            <div>
              {/* 주기관리 서브 탭 */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  onClick={() => setScheduleManagementTab('channel-settings')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    scheduleManagementTab === 'channel-settings'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  ⚙️ 채널 설정
                </button>
                <button
                  onClick={() => setScheduleManagementTab('category-management')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    scheduleManagementTab === 'category-management'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                  id="category-management"
                >
                  🏷️ 카테고리 관리
                </button>
                <button
                  onClick={() => setScheduleManagementTab('calendar')}
                  className={`py-3 px-4 rounded-lg font-semibold transition ${
                    scheduleManagementTab === 'calendar'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  📆 달력
                </button>
              </div>

              {/* 채널 설정 */}
              {scheduleManagementTab === 'channel-settings' && (
                <div>
                  <ChannelSettings />
                </div>
              )}

              {/* 카테고리 관리 */}
              {scheduleManagementTab === 'category-management' && (
                <div>
                  <CategoryManagement onCategoryChange={fetchCategories} />
                </div>
              )}

              {/* 스케줄 달력 */}
              {scheduleManagementTab === 'calendar' && (
                <div>
                  <ScheduleCalendar />
                </div>
              )}
            </div>
          )}

          {/* 실시간 현황판 */}
          {mainTab === 'monitoring' && (
            <div>
              <GenerationDashboard />
            </div>
          )}

          {/* 제목 풀 */}
          {mainTab === 'title-pool' && (
            <div className="space-y-4">
              {/* 통계 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {poolStats.map((stat: any) => (
                  <div key={stat.category} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                    <div className="text-sm text-white mb-2">{stat.category}</div>
                    <div className="text-3xl font-bold text-white mb-2">{stat.total}</div>
                    <div className="text-sm text-slate-200">
                      미사용: {stat.unused}개 | 평균: {stat.avg_score.toFixed(1)}점
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      최고: {stat.max_score}점
                    </div>
                  </div>
                ))}
              </div>

              {/* 제목 생성 버튼 */}
              <div className="flex justify-end">
                <button
                  onClick={() => generateTitlePool()}
                  disabled={isGenerating}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white rounded-lg font-bold transition"
                >
                  {isGenerating ? '⏳ 생성 중...' : '🔄 Ollama로 제목 생성'}
                </button>
              </div>

              {/* 필터 */}
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm text-white mb-2">카테고리</label>
                    <select
                      value={poolCategory}
                      onChange={(e) => setPoolCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    >
                      <option value="all">전체</option>
                      {poolStats.map((stat: any) => (
                        <option key={stat.category} value={stat.category}>
                          {stat.category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm text-white mb-2">최소 점수</label>
                    <input
                      type="number"
                      value={poolMinScore}
                      onChange={(e) => setPoolMinScore(Number(e.target.value))}
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                  </div>

                  <button
                    onClick={() => fetchTitlePool()}
                    disabled={poolLoading}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded-lg font-semibold transition"
                  >
                    {poolLoading ? '조회 중...' : '🔍 조회'}
                  </button>
                </div>
              </div>

              {/* 제목 목록 */}
              <div className="bg-slate-800 rounded-lg border border-slate-700">
                <div className="p-4 border-b border-slate-700">
                  <h2 className="text-xl font-bold text-white">
                    제목 목록 ({poolTitles.length}개)
                  </h2>
                </div>

                {poolLoading ? (
                  <div className="p-8 text-center text-white">로딩 중...</div>
                ) : poolTitles.length === 0 ? (
                  <div className="p-8 text-center text-white">
                    제목 풀이 비어있습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">점수</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">카테고리</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">제목</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">상태</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">생성일</th>
                        </tr>
                      </thead>
                      <tbody className="bg-slate-800">
                        {poolTitles.map((title: any) => (
                          <tr key={title.id} className="border-b border-slate-700 hover:bg-slate-700">
                            <td className="px-4 py-3">
                              <span className={`font-bold ${
                                title.score >= 95 ? 'text-green-400' :
                                title.score >= 90 ? 'text-blue-400' :
                                'text-yellow-400'
                              }`}>
                                {title.score}점
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-white">
                              {title.category}
                            </td>
                            <td className="px-4 py-3 text-white">
                              {title.title}
                            </td>
                            <td className="px-4 py-3">
                              {title.used === 1 ? (
                                <span className="text-xs bg-slate-600 text-slate-300 px-2 py-1 rounded">
                                  사용됨
                                </span>
                              ) : (
                                <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                                  미사용
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-white">
                              {new Date(title.created_at).toLocaleString('ko-KR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 생성된 제목 목록 (video_titles) */}
              <div className="bg-slate-800 rounded-lg border border-slate-700">
                <div className="p-4 border-b border-slate-700">
                  <h2 className="text-xl font-bold text-white">
                    생성된 제목 ({titles.length}개)
                  </h2>
                </div>

                {titles.length === 0 ? (
                  <div className="p-8 text-center text-white">생성된 제목이 없습니다.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">제목</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">카테고리</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">상태</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">모델</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-white">생성일</th>
                        </tr>
                      </thead>
                      <tbody className="bg-slate-800">
                        {titles.slice(0, 50).map((title: any) => (
                          <tr key={title.id} className="border-b border-slate-700 hover:bg-slate-700">
                            <td className="px-4 py-3 text-white">{title.title}</td>
                            <td className="px-4 py-3 text-sm text-white">{title.category}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs text-white px-2 py-1 rounded ${
                                title.status === 'completed' ? 'bg-green-600' :
                                title.status === 'processing' ? 'bg-blue-600' :
                                title.status === 'scheduled' ? 'bg-yellow-600' :
                                title.status === 'failed' ? 'bg-red-600' :
                                'bg-slate-600'
                              }`}>
                                {title.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-white">{title.model}</td>
                            <td className="px-4 py-3 text-sm text-white">
                              {new Date(title.created_at).toLocaleString('ko-KR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 제목 리스트 */}
          {mainTab === 'queue' && (
            <div className="space-y-3">
              {titles.length === 0 ? (
                <p className="text-slate-400">등록된 제목이 없습니다</p>
              ) : (
                titles
                  .filter((title: any) => {
                    if (queueTab === 'scheduled') {
                      return title.status === 'scheduled' || title.status === 'pending';
                    } else if (queueTab === 'processing') {
                      return title.status === 'processing';
                    } else if (queueTab === 'waiting_upload') {
                      return title.status === 'waiting_for_upload';
                    } else if (queueTab === 'failed') {
                      return title.status === 'failed';
                    } else if (queueTab === 'completed') {
                      return title.status === 'completed';
                    }
                    return true;
                  })
                .map((title) => {
                const titleSchedules = schedules.filter(s => s.title_id === title.id);
                const isEditing = editingId === title.id;

                if (isEditing) {
                  return (
                    <div key={title.id} className="p-4 bg-slate-700 rounded-lg border-2 border-blue-500">
                      {/* 제목 수정 폼 */}
                      <h3 className="text-white font-semibold mb-3">제목 수정</h3>
                      <div className="space-y-3 mb-4">
                        {/* 제목 */}
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">제목</label>
                          <input
                            type="text"
                            value={editForm.title || ''}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        {/* 타입, 카테고리, 태그 */}
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">타입</label>
                            <select
                              value={editForm.type || 'longform'}
                              onChange={(e) => {
                                const type = e.target.value;
                                const model = getDefaultModelByType(type); // ✅ 통일된 함수 사용
                                setEditForm({ ...editForm, type, model });
                              }}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="longform">롱폼</option>
                              <option value="shortform">숏폼</option>
                              <option value="product">상품</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">카테고리</label>
                            <select
                              value={editForm.category || ''}
                              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="">선택 안함</option>
                              {categories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">태그</label>
                            <input
                              type="text"
                              placeholder="태그"
                              value={editForm.tags || ''}
                              onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        {/* ⚠️ CRITICAL: 수정 폼 - 상품 정보 표시 (product 타입) - 제거하면 안됩니다! */}
                        {/* 이 코드는 상품관리에서 자동화로 넘어온 상품 정보를 수정 모드에서 보여주는 핵심 기능입니다 */}
                        {editForm.type === 'product' && (
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">상품 정보</label>
                            {editForm.product_data ? (
                              <div className="w-full px-4 py-3 bg-emerald-900/30 text-emerald-200 rounded-lg border border-emerald-500/50">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-emerald-400 font-semibold">상품명:</span>
                                    <p className="text-white mt-1">{editForm.product_data.productName || editForm.product_data.title || editForm.title}</p>
                                  </div>
                                  {editForm.product_data.productPrice && (
                                    <div>
                                      <span className="text-emerald-400 font-semibold">가격:</span>
                                      <p className="text-white mt-1">{editForm.product_data.productPrice}</p>
                                    </div>
                                  )}
                                  {(editForm.product_data.productImage || editForm.product_data.thumbnail) && (
                                    <div className="col-span-2">
                                      <span className="text-emerald-400 font-semibold">이미지:</span>
                                      <img
                                        src={editForm.product_data.productImage || editForm.product_data.thumbnail}
                                        alt="상품 이미지"
                                        className="mt-2 w-32 h-32 object-cover rounded border border-emerald-500"
                                      />
                                    </div>
                                  )}
                                  {(editForm.product_data.deepLink || editForm.product_data.productUrl || editForm.product_data.product_link) && (
                                    <div className="col-span-2">
                                      <span className="text-emerald-400 font-semibold">URL (딥링크):</span>
                                      <a
                                        href={editForm.product_data.deepLink || editForm.product_data.productUrl || editForm.product_data.product_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 mt-1 text-xs break-all block underline"
                                      >
                                        {editForm.product_data.deepLink || editForm.product_data.productUrl || editForm.product_data.product_link}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="w-full px-4 py-2 bg-slate-700 text-slate-400 rounded-lg border border-slate-600 text-sm">
                                상품 정보가 없습니다
                              </div>
                            )}
                          </div>
                        )}

                        {/* ⚠️ CRITICAL: 수정 폼 - 상품 정보 표시 (product-info 타입) - 제거하면 안됩니다! */}
                        {editForm.type === 'product-info' && (
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">상품 정보</label>
                            {editForm.product_data ? (
                              <div className="w-full px-4 py-3 bg-emerald-900/30 text-emerald-200 rounded-lg border border-emerald-500/50">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-emerald-400 font-semibold">상품명:</span>
                                    <p className="text-white mt-1">{editForm.product_data.productName || editForm.product_data.title || editForm.title}</p>
                                  </div>
                                  {editForm.product_data.productPrice && (
                                    <div>
                                      <span className="text-emerald-400 font-semibold">가격:</span>
                                      <p className="text-white mt-1">{editForm.product_data.productPrice}</p>
                                    </div>
                                  )}
                                  {(editForm.product_data.productImage || editForm.product_data.thumbnail) && (
                                    <div className="col-span-2">
                                      <span className="text-emerald-400 font-semibold">이미지:</span>
                                      <img
                                        src={editForm.product_data.productImage || editForm.product_data.thumbnail}
                                        alt="상품 이미지"
                                        className="mt-2 w-32 h-32 object-cover rounded border border-emerald-500"
                                      />
                                    </div>
                                  )}
                                  {(editForm.product_data.deepLink || editForm.product_data.productUrl || editForm.product_data.product_link) && (
                                    <div className="col-span-2">
                                      <span className="text-emerald-400 font-semibold">URL (딥링크):</span>
                                      <p className="text-white mt-1 text-xs break-all">{editForm.product_data.deepLink || editForm.product_data.productUrl || editForm.product_data.product_link}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="w-full px-4 py-2 bg-slate-700 text-slate-400 rounded-lg border border-slate-600 text-sm">
                                상품 정보가 없습니다
                              </div>
                            )}
                          </div>
                        )}

                        {/* 채널, 대본 생성, 미디어 생성, AI 모델 */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">채널</label>
                            {channels.length > 0 ? (
                              <select
                                value={editForm.channel_id || channels[0].channelId}
                                onChange={(e) => setEditForm({ ...editForm, channel_id: e.target.value })}
                                className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                              >
                                {channels.map((ch: any) => (
                                  <option key={ch.id} value={ch.channelId} className="bg-slate-700 text-white">
                                    {ch.channelTitle || ch.title || ch.channelId}
                                    {ch.isDefault && ' ⭐'}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="w-full px-4 py-2 bg-red-900/30 text-red-300 rounded-lg border border-red-500 text-xs">
                                ⚠️ 채널 없음
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">🤖 AI 모델</label>
                            <select
                              value={editForm.model || 'claude'}
                              onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="chatgpt">ChatGPT</option>
                              <option value="gemini">Gemini</option>
                              <option value="claude">Claude</option>
                              <option value="groq">Groq</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">대본 생성</label>
                            <select
                              value={editForm.script_mode || 'chrome'}
                              onChange={(e) => setEditForm({ ...editForm, script_mode: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="chrome">크롬창</option>
                              <option value="api">API</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">미디어 생성</label>
                            <select
                              value={editForm.media_mode || 'imagen3'}
                              onChange={(e) => setEditForm({ ...editForm, media_mode: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            >
                              <option value="upload">직접 업로드</option>
                              <option value="dalle">DALL-E</option>
                              <option value="imagen3">Imagen 3</option>
                              <option value="sora2">SORA 2</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* 스케줄 목록 */}
                      {titleSchedules.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm text-slate-300 font-semibold mb-2">스케줄:</h4>
                          {titleSchedules.map(schedule => (
                            <div key={schedule.id} className="bg-slate-600 rounded p-2 mb-2">
                              {editingScheduleId === schedule.id ? (
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="datetime-local"
                                    id={`edit-schedule-${schedule.id}`}
                                    min={getCurrentTimeForInput()}
                                    defaultValue={(() => {
                                      const date = new Date(schedule.scheduled_time);
                                      const year = date.getFullYear();
                                      const month = String(date.getMonth() + 1).padStart(2, '0');
                                      const day = String(date.getDate()).padStart(2, '0');
                                      const hours = String(date.getHours()).padStart(2, '0');
                                      const minutes = String(date.getMinutes()).padStart(2, '0');
                                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                                    })()}
                                    className="flex-1 px-2 py-1 bg-slate-700 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-xs"
                                  />
                                  <button
                                    onClick={() => {
                                      const inputElement = document.getElementById(`edit-schedule-${schedule.id}`) as HTMLInputElement;
                                      if (inputElement && inputElement.value) {
                                        updateSchedule(schedule.id, inputElement.value);
                                        setEditingScheduleId(null);
                                      }
                                    }}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingScheduleId(null)}
                                    className="px-2 py-1 bg-slate-500 hover:bg-slate-400 text-white rounded text-xs"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center">
                                  <div className="text-xs text-slate-200">
                                    {new Date(schedule.scheduled_time).toLocaleString('ko-KR')}
                                  </div>
                                  {new Date(schedule.scheduled_time) > new Date() && (
                                    <button
                                      onClick={() => setEditingScheduleId(schedule.id)}
                                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                    >
                                      수정
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 로그 표시 - 진행중이면 항상, 나머지는 로그 버튼 눌렀을 때만 */}
                      {(title.status === 'processing' || expandedLogsFor === title.id) && (
                        <div id={`log-container-${title.id}`} className="mb-3 max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                          {!logsMap[title.id] || logsMap[title.id].length === 0 ? (
                            <div className="text-center text-slate-400 py-4 text-sm">
                              {title.status === 'processing' ? (
                                <div className="flex items-center justify-center gap-2">
                                  <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                                  <span>로그 로딩 중...</span>
                                </div>
                              ) : (
                                '로그가 없습니다'
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {logsMap[title.id].map((log: any, idx: number) => {
                                const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                                const logTimestamp = typeof log === 'object' && log !== null && log.timestamp ? log.timestamp : new Date().toISOString();

                                // API 사용 여부 감지
                                const isUsingAPI = logMessage.includes('Claude API') ||
                                                  logMessage.includes('API 호출') ||
                                                  logMessage.includes('Using Claude API') ||
                                                  logMessage.includes('💰');
                                const isUsingLocal = logMessage.includes('로컬 Claude') ||
                                                    logMessage.includes('Local Claude') ||
                                                    logMessage.includes('python') ||
                                                    logMessage.includes('🖥️');

                                return (
                                  <div
                                    key={idx}
                                    className="text-sm text-slate-300 font-mono"
                                  >
                                    <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                    {isUsingAPI && <span className="font-bold text-red-500 mr-1">[💰 API]</span>}
                                    {isUsingLocal && <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>}
                                    {logMessage}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 버튼 */}
                      <div className="flex gap-2">
                        {/* 중지 버튼 (processing 상태일 때만) */}
                        {title.status === 'processing' && (
                          <button
                            onClick={async () => {
                              if (confirm('작업을 중지하시겠습니까?')) {
                                try {
                                  const response = await fetch(`/api/automation/stop`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ titleId: title.id })
                                  });

                                  if (response.ok) {
                                    alert('✅ 작업이 중지되었습니다');
                                    await fetchData();
                                  } else {
                                    const error = await response.json();
                                    alert(`❌ 중지 실패: ${error.error}`);
                                  }
                                } catch (error) {
                                  console.error('중지 오류:', error);
                                  alert('❌ 중지 실패');
                                }
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-semibold transition"
                            title="작업 중지"
                          >
                            ⏹️ 중지
                          </button>
                        )}
                        {/* 로그 버튼 - 항상 표시 */}
                        <button
                          onClick={() => toggleLogs(title.id)}
                          className={`px-3 py-1.5 rounded text-sm transition ${
                            expandedLogsFor === title.id
                              ? 'bg-purple-700 text-white'
                              : title.status === 'processing' || title.status === 'scheduled'
                              ? 'bg-green-600 hover:bg-green-500 text-white'
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          }`}
                          title="로그 보기/닫기"
                        >
                          {expandedLogsFor === title.id ? '📋 닫기' : '📋 로그'}
                        </button>
                        <button
                          onClick={saveEdit}
                          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition"
                        >
                          저장
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => deleteTitle(title.id)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={title.id}
                    className="p-4 bg-slate-700 rounded-lg"
                  >
                    {/* 카드 헤더: 제목 + 타입/상태 뱃지 */}
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <h4 className="text-white font-semibold text-lg line-clamp-2 break-words flex-1 min-w-0">{title.title}</h4>

                      {/* 상태 뱃지 (최소한의 정보만) */}
                      <div className="flex gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                          title.type === 'longform' ? 'bg-blue-600/30 text-blue-300' :
                          title.type === 'shortform' ? 'bg-purple-600/30 text-purple-300' :
                          'bg-orange-600/30 text-orange-300'
                        }`}>
                          {title.type === 'longform' ? '롱폼' : title.type === 'shortform' ? '숏폼' : '상품'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                          title.status === 'processing' ? 'bg-yellow-600/30 text-yellow-300 animate-pulse' :
                          title.status === 'completed' ? 'bg-green-600/30 text-green-300' :
                          title.status === 'failed' ? 'bg-red-600/30 text-red-300' :
                          title.status === 'scheduled' ? 'bg-blue-600/30 text-blue-300' :
                          title.status === 'waiting_for_upload' ? 'bg-purple-600/30 text-purple-300 animate-pulse' :
                          'bg-slate-600 text-slate-300'
                        }`}>
                          {title.status === 'processing' && '⏳'}
                          {title.status === 'failed' && '❌'}
                          {title.status === 'scheduled' && '📅'}
                          {title.status === 'waiting_for_upload' && '📤'}
                          {!['processing', 'completed'].includes(title.status) && (title.status === 'failed' ? '실패' : title.status === 'scheduled' ? '예약' : title.status === 'waiting_for_upload' ? '대기' : '')}
                        </span>
                      </div>
                    </div>

                    {/* 부가 정보: 카테고리, 채널, 진행률 */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {title.category && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-600/30 text-green-300">
                          {title.category}
                        </span>
                      )}
                      {title.channel && (
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300">
                          📺 {(() => {
                            const channel = channels.find(c => c.channelId === title.channel || c.id === title.channel);
                            return channel ? channel.channelTitle : '';
                          })()}
                        </span>
                      )}
                      {progressMap[title.id]?.scriptProgress !== undefined && (
                        <span className="text-xs px-2 py-0.5 rounded bg-cyan-600/30 text-cyan-300">
                          📝 {progressMap[title.id].scriptProgress}%
                        </span>
                      )}
                      {progressMap[title.id]?.videoProgress !== undefined && (
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300">
                          🎬 {progressMap[title.id].videoProgress}%
                        </span>
                      )}
                    </div>

                    {/* 액션 버튼 영역 */}
                    <div className="flex gap-2 flex-shrink-0 mb-3">
                        {/* 강제실행/재시도/중지 버튼 */}
                        {title.status === 'processing' && (
                          <button
                            onClick={async () => {
                              if (confirm('작업을 중지하시겠습니까?')) {
                                try {
                                  const response = await fetch(`/api/automation/stop`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ titleId: title.id })
                                  });

                                  if (response.ok) {
                                    alert('✅ 작업이 중지되었습니다');
                                    await fetchData();
                                  } else {
                                    const error = await response.json();
                                    alert(`❌ 중지 실패: ${error.error}`);
                                  }
                                } catch (error) {
                                  console.error('중지 오류:', error);
                                  alert('❌ 중지 실패');
                                }
                              }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-semibold transition"
                            title="작업 중지"
                          >
                            ⏹️ 중지
                          </button>
                        )}
                        {/* 로그 버튼 - 항상 표시 */}
                        <button
                          onClick={() => toggleLogs(title.id)}
                          className={`px-3 py-1.5 rounded text-sm transition ${
                            expandedLogsFor === title.id
                              ? 'bg-purple-700 text-white'
                              : title.status === 'processing' || title.status === 'scheduled'
                              ? 'bg-green-600 hover:bg-green-500 text-white'
                              : 'bg-purple-600 hover:bg-purple-500 text-white'
                          }`}
                          title="로그 보기/닫기"
                        >
                          {expandedLogsFor === title.id ? '📋 닫기' : '📋 로그'}
                        </button>
                        {/* 수정 버튼 (완료/업로드 대기 상태가 아닐 때만) */}
                        {title.status !== 'waiting_for_upload' && title.status !== 'completed' && (
                          <button
                            onClick={() => startEdit(title)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition"
                          >
                            수정
                          </button>
                        )}
                        <button
                          onClick={() => deleteTitle(title.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm transition"
                        >
                          삭제
                        </button>
                        {/* 즉시 실행/재시도 버튼 */}
                        {(title.status === 'scheduled' || title.status === 'pending') && (
                          <button
                            onClick={() => forceExecute(title.id, title.title)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm transition"
                          >
                            ▶️ 즉시 실행
                          </button>
                        )}
                        {title.status === 'failed' && (
                          <button
                            onClick={() => retryFailed(title.id, title)}
                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm transition"
                          >
                            🔄 재시도
                          </button>
                        )}
                        {/* 폴더 버튼 - script_id나 video_id가 있을 때만 표시 */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.script_id || s.video_id);
                          return schedule && (title.status === 'processing' || title.status === 'waiting_for_upload' || title.status === 'failed' || title.status === 'completed') && (
                            <button
                              onClick={() => {
                                handleOpenFolder(schedule.video_id || null, schedule.script_id || null, title.status);
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition cursor-pointer"
                              title="폴더 열기"
                            >
                              📁 폴더
                            </button>
                          );
                        })()}
                        {/* 대본/영상 버튼 (완료 상태일 때만) */}
                        {title.status === 'completed' && (() => {
                          const scriptId = titleSchedules.find((s: any) => s.script_id)?.script_id;
                          const videoId = titleSchedules.find((s: any) => s.video_id)?.video_id;
                          return (
                            <>
                              {scriptId && (
                                <button
                                  onClick={() => {
                                    window.location.href = `/my-content?tab=scripts&id=${scriptId}`;
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition"
                                  title="대본 보기"
                                >
                                  📄 대본
                                </button>
                              )}
                              {videoId && (
                                <button
                                  onClick={() => {
                                    window.location.href = `/my-content?tab=videos&id=${videoId}`;
                                  }}
                                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm transition"
                                  title="영상 보기"
                                >
                                  🎬 영상
                                </button>
                              )}
                              {/* 다운로드 버튼 */}
                              {scriptId && (
                                <div className="relative inline-block">
                                  <button
                                    onClick={() => setDownloadMenuFor(prev => ({ ...prev, [title.id]: !prev[title.id] }))}
                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm transition"
                                  >
                                    📥 다운로드
                                  </button>
                                  {downloadMenuFor[title.id] && (
                                    <div className="absolute right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[120px]">
                                      <button
                                        onClick={() => {
                                          handleDownload(scriptId, 'video', title.title);
                                          setDownloadMenuFor(prev => ({ ...prev, [title.id]: false }));
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700 rounded-t-lg"
                                      >
                                        🎬 영상만
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleDownload(scriptId, 'script', title.title);
                                          setDownloadMenuFor(prev => ({ ...prev, [title.id]: false }));
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700"
                                      >
                                        📄 대본만
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleDownload(scriptId, 'materials', title.title);
                                          setDownloadMenuFor(prev => ({ ...prev, [title.id]: false }));
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700"
                                      >
                                        🖼️ 소재만
                                      </button>
                                      <button
                                        onClick={() => {
                                          handleDownload(scriptId, 'all', title.title);
                                          setDownloadMenuFor(prev => ({ ...prev, [title.id]: false }));
                                        }}
                                        className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-slate-700 rounded-b-lg"
                                      >
                                        📦 전체
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {/* YouTube 업로드 버튼 (processing 상태이면서 영상 제작 완료, 아직 업로드 안 됨) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.video_id);
                          const hasVideo = !!schedule?.video_id;
                          const hasYouTubeUrl = !!schedule?.youtube_url;

                          return title.status === 'processing' && hasVideo && !hasYouTubeUrl && (
                            <button
                              onClick={() => {
                                // 영상 페이지로 이동하여 YouTube 업로드
                                window.location.href = `/my-content?tab=videos&id=${schedule.video_id}`;
                              }}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-semibold transition"
                              title="YouTube에 업로드"
                            >
                              📺 YouTube 업로드
                            </button>
                          );
                        })()}
                        {/* 이미지 크롤링 버튼 (waiting_for_upload 상태이고 script_id가 있을 때만) */}
                        {(() => {
                          const scriptId = titleSchedules.find((s: any) => s.script_id)?.script_id;
                          return title.status === 'waiting_for_upload' && scriptId && (
                            <button
                              onClick={() => handleImageCrawling(scriptId, title.id, title.title)}
                              disabled={crawlingFor === title.id}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-500 text-white rounded text-sm font-semibold transition"
                              title="이미지 크롤링 시작"
                            >
                              {crawlingFor === title.id ? '🔄 크롤링 중...' : '🖼️ 이미지 크롤링'}
                            </button>
                          );
                        })()}
                        {/* 업로드 버튼 (waiting_for_upload 또는 failed 상태이고 script_id가 있을 때만) */}
                        {(() => {
                          const scriptId = titleSchedules.find((s: any) => s.script_id)?.script_id;
                          return (title.status === 'waiting_for_upload' || title.status === 'failed') && scriptId && (
                            <button
                              onClick={() => setUploadBoxOpenFor(prev => ({ ...prev, [title.id]: !prev[title.id] }))}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm transition"
                            >
                              {uploadBoxOpenFor[title.id] ? '📤 닫기' : '📤 업로드'}
                            </button>
                          );
                        })()}
                        {/* 대본 재생성 버튼 (failed 상태이고 script_id가 있을 때만) */}
                        {(() => {
                          const scriptId = titleSchedules.find((s: any) => s.script_id)?.script_id;
                          return title.status === 'failed' && scriptId && (
                            <button
                              onClick={() => handleRegenerateScript(scriptId, title.id, title.title)}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition"
                              title="대본 재생성"
                            >
                              🔄 대본
                            </button>
                          );
                        })()}
                        {/* YouTube 업로드 버튼 (failed 상태이면서 영상 완료, 아직 업로드 안 됨) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.video_id);
                          const hasVideo = !!schedule?.video_id;
                          const hasYouTubeUrl = !!schedule?.youtube_url;

                          return title.status === 'failed' && hasVideo && !hasYouTubeUrl && (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch('/api/youtube/upload', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({
                                      videoPath: schedule.video_path || '',
                                      title: title.title,
                                      channelId: schedule.channel,
                                      jobId: schedule.video_id,
                                      privacy: schedule.youtube_privacy || 'public',
                                      type: title.type
                                    })
                                  });

                                  const data = await res.json();

                                  if (data.success) {
                                    alert(`✅ YouTube 업로드 시작!\n\nVideo ID: ${data.videoId}`);
                                    await fetchData();
                                  } else {
                                    alert(`❌ 업로드 실패: ${data.error || '알 수 없는 오류'}`);
                                  }
                                } catch (error: any) {
                                  alert(`❌ 업로드 중 오류: ${error.message}`);
                                }
                              }}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-semibold transition"
                              title="YouTube에 업로드"
                            >
                              📺 YouTube 업로드
                            </button>
                          );
                        })()}
                        {/* 영상 재생성 버튼 (failed 상태이고 video_id가 있을 때만) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.script_id || s.video_id);
                          const videoId = schedule?.video_id;
                          const scriptId = schedule?.script_id;
                          return title.status === 'failed' && (videoId || scriptId) && (
                            <button
                              onClick={() => handleRegenerateVideo(videoId || null, scriptId || null, title.title)}
                              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm transition"
                              title="영상 재생성"
                            >
                              🔄 영상
                            </button>
                          );
                        })()}
                    </div>

                    {/* ⚠️ CRITICAL: 상품 정보 표시 - 제거하면 안됩니다! */}
                    {title.product_data && (
                      <div className="mb-3 p-2 bg-slate-700/50 rounded border border-slate-600">
                        <p className="text-xs font-semibold text-emerald-400 mb-1">🛍️ 상품 정보</p>
                        {(title.product_data.productName || title.product_data.title) && (
                          <p className="text-xs text-slate-300">
                            제목: {title.product_data.productName || title.product_data.title}
                          </p>
                        )}
                        {title.product_data.productPrice && (
                          <p className="text-xs text-emerald-300">가격: {title.product_data.productPrice}</p>
                        )}
                        {(title.product_data.productImage || title.product_data.thumbnail) && (
                          <div className="mt-1">
                            <img
                              src={title.product_data.productImage || title.product_data.thumbnail}
                              alt="상품 썸네일"
                              className="w-24 h-24 object-cover rounded border border-slate-500"
                            />
                          </div>
                        )}
                        {(title.product_data.deepLink || title.product_data.productUrl || title.product_data.product_link) && (
                          <p className="text-xs truncate">
                            딥링크: <a
                              href={title.product_data.deepLink || title.product_data.productUrl || title.product_data.product_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              {title.product_data.deepLink || title.product_data.productUrl || title.product_data.product_link}
                            </a>
                          </p>
                        )}
                        {title.product_data.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">설명: {title.product_data.description}</p>
                        )}
                      </div>
                    )}
                    {title.tags && (
                      <p className="text-xs text-slate-500 mb-3">🏷️ {title.tags}</p>
                    )}
                    {/* YouTube 정보 (완료 상태일 때만 표시) */}
                    {title.status === 'completed' && (() => {
                      const schedule = titleSchedules.find((s: any) => s.youtube_url || s.youtube_upload_id);
                      if (!schedule) return null;

                      // 채널 ID로 채널 이름 찾기
                      const channelInfo = channels.find((ch: any) => ch.channelId === title.channel || ch.id === title.channel);
                      const channelName = channelInfo?.channelTitle || '채널 정보 없음';

                      return (
                        <div className="mb-3 p-2 bg-red-900/30 rounded border border-red-500/30">
                          <p className="text-xs font-semibold text-red-400 mb-1">📺 YouTube</p>
                          {title.channel && (
                            <p className="text-xs text-slate-300">채널: {channelName}</p>
                          )}
                          {schedule.youtube_url && (
                            <p className="text-xs truncate">
                              링크: <a
                                href={schedule.youtube_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-400 hover:text-red-300 underline"
                              >
                                {schedule.youtube_url}
                              </a>
                            </p>
                          )}
                          {schedule.youtube_upload_id && !schedule.youtube_url && (
                            <p className="text-xs text-slate-400">업로드 ID: {schedule.youtube_upload_id}</p>
                          )}
                        </div>
                      );
                    })()}

                    {/* 이미지 업로드 섹션 (업로드 버튼을 눌렀을 때만 표시) */}
                    {uploadBoxOpenFor[title.id] && (title.status === 'waiting_for_upload' || title.status === 'failed') && titleSchedules.find((s: any) => s.script_id)?.script_id && (
                      <div className="mb-3 p-6 bg-purple-900/30 border-2 border-purple-500 rounded-lg">
                        <h5 className="text-purple-300 font-bold text-lg mb-3 flex items-center gap-2">
                          <span className="text-3xl">📤</span>
                          <span>미디어 업로드가 필요합니다</span>
                        </h5>
                        <p className="text-sm text-slate-300 mb-4">
                          대본 생성이 완료되었습니다. 영상 제작을 위해 이미지 또는 동영상을 업로드해주세요.
                        </p>

                        {/* 미디어 업로드 박스 (이미지 + 동영상) */}
                        <div className="mb-4">
                          <MediaUploadBox
                            uploadedImages={uploadedImagesFor[title.id] || []}
                            uploadedVideos={uploadedVideosFor[title.id] || []}
                            onImagesChange={(files) => {
                              setUploadedImagesFor(prev => ({ ...prev, [title.id]: files }));
                            }}
                            onVideosChange={(files) => {
                              setUploadedVideosFor(prev => ({ ...prev, [title.id]: files }));
                            }}
                            acceptJson={false}
                            acceptImages={true}
                            acceptVideos={true}
                            mode={title.type === 'longform' ? 'longform' : 'shortform'}
                            maxImages={50}
                          />

                          {/* 업로드 버튼 */}
                          {((uploadedImagesFor[title.id] && uploadedImagesFor[title.id].length > 0) || (uploadedVideosFor[title.id] && uploadedVideosFor[title.id].length > 0)) && (() => {
                            // 현재 title에 대한 대본 생성 schedule 찾기 (script_id가 있는 가장 최신 것)
                            const schedulesWithScript = titleSchedules
                              .filter((s: any) => s.script_id)
                              .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                            const scriptSchedule = schedulesWithScript[0];

                            // 디버그 로그
                            console.log('[Upload Button] Title:', title.id, title.title);
                            console.log('[Upload Button] All titleSchedules:', titleSchedules);
                            console.log('[Upload Button] Schedules with script_id:', schedulesWithScript);
                            console.log('[Upload Button] Selected schedule:', scriptSchedule);

                            if (!scriptSchedule?.script_id) {
                              return (
                                <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-sm text-red-200">
                                  <div className="font-bold mb-2">⚠️ script_id를 찾을 수 없습니다</div>
                                  <div className="text-xs">대본 생성이 완료되지 않았거나, 스케줄에 script_id가 저장되지 않았을 수 있습니다.</div>
                                  <div className="text-xs mt-2 font-mono bg-black/30 p-2 rounded">
                                    디버그: {titleSchedules.length}개 스케줄 중 script_id 있는 것: {schedulesWithScript.length}개
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <button
                                onClick={() => {
                                  uploadImages(title.id, scriptSchedule.id, scriptSchedule.script_id);
                                }}
                                disabled={uploadingFor === title.id}
                                className={`w-full px-4 py-3 rounded-lg font-bold text-lg transition mt-4 ${
                                  uploadingFor === title.id
                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
                                }`}
                              >
                                {uploadingFor === title.id ? '⏳ 업로드 중...' : '🚀 영상 제작'}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* 스케줄 목록 */}
                    {titleSchedules.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-slate-400 font-semibold mb-2">📅 등록된 스케줄:</p>
                        <div className="space-y-1">
                          {titleSchedules.map((schedule: any) => (
                            <div key={schedule.id} className="bg-slate-600 rounded px-3 py-2">
                              {editingScheduleId === schedule.id ? (
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="datetime-local"
                                    id={`edit-schedule-regular-${schedule.id}`}
                                    min={getCurrentTimeForInput()}
                                    defaultValue={(() => {
                                      const date = new Date(schedule.scheduled_time);
                                      const year = date.getFullYear();
                                      const month = String(date.getMonth() + 1).padStart(2, '0');
                                      const day = String(date.getDate()).padStart(2, '0');
                                      const hours = String(date.getHours()).padStart(2, '0');
                                      const minutes = String(date.getMinutes()).padStart(2, '0');
                                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                                    })()}
                                    className="flex-1 px-2 py-1 bg-slate-700 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-xs"
                                  />
                                  <button
                                    onClick={() => {
                                      const inputElement = document.getElementById(`edit-schedule-regular-${schedule.id}`) as HTMLInputElement;
                                      if (inputElement && inputElement.value) {
                                        updateSchedule(schedule.id, inputElement.value);
                                      }
                                    }}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingScheduleId(null)}
                                    className="px-2 py-1 bg-slate-500 hover:bg-slate-400 text-white rounded text-xs"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-green-400">
                                    {new Date(schedule.scheduled_time).toLocaleString('ko-KR')}
                                    {schedule.status !== 'pending' && ` (${schedule.status})`}
                                  </span>
                                  {new Date(schedule.scheduled_time) > new Date() && (
                                    <button
                                      onClick={() => setEditingScheduleId(schedule.id)}
                                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                    >
                                      수정
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 로그 표시 - 진행중이면 항상, 나머지는 로그 버튼 눌렀을 때만 */}
                    {(title.status === 'processing' || expandedLogsFor === title.id) && (
                      <div id={`log-container-${title.id}`} className="max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                        {!logsMap[title.id] || logsMap[title.id].length === 0 ? (
                          <div className="text-center text-slate-400 py-4 text-sm">
                            {title.status === 'processing' ? (
                              <div className="flex items-center justify-center gap-2">
                                <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                                <span>로그 로딩 중...</span>
                              </div>
                            ) : title.status === 'scheduled' ? (
                              '예약됨 - 실행 대기 중'
                            ) : (
                              '로그가 없습니다'
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {logsMap[title.id].map((log: any, idx: number) => {
                              const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                              const logTimestamp = typeof log === 'object' && log !== null && log.timestamp ? log.timestamp : new Date().toISOString();

                              // API 사용 여부 감지
                              const isUsingAPI = logMessage.includes('Claude API') ||
                                                logMessage.includes('API 호출') ||
                                                logMessage.includes('Using Claude API') ||
                                                logMessage.includes('💰');
                              const isUsingLocal = logMessage.includes('로컬 Claude') ||
                                                  logMessage.includes('Local Claude') ||
                                                  logMessage.includes('python') ||
                                                  logMessage.includes('🖥️');

                              return (
                                <div
                                  key={idx}
                                  className="text-sm text-slate-300 font-mono"
                                >
                                  <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                  {isUsingAPI && <span className="font-bold text-red-500 mr-1">[💰 API]</span>}
                                  {isUsingLocal && <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>}
                                  {logMessage}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            </div>
          )}
        </div>

      </div>

      {/* 제목 생성 로그 모달 */}
      {generateModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg shadow-2xl border border-slate-700 max-w-4xl w-full max-h-[80vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">🔄 Ollama 제목 생성</h3>
              <button
                onClick={() => setGenerateModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* 로그 영역 */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-sm">
              {generateLogs.length === 0 && isGenerating && (
                <div className="flex items-center gap-2 text-slate-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                  <span>제목 생성 시작 중...</span>
                </div>
              )}
              {generateLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`mb-1 ${
                    log.includes('❌') || log.includes('실패')
                      ? 'text-red-400'
                      : log.includes('✅') || log.includes('완료') || log.includes('성공')
                      ? 'text-green-400'
                      : log.includes('⚠️')
                      ? 'text-yellow-400'
                      : log.includes('🎯') || log.includes('💾')
                      ? 'text-cyan-400'
                      : log.includes('📂') || log.includes('📊')
                      ? 'text-blue-400'
                      : log.includes('━')
                      ? 'text-slate-600'
                      : log.includes('🚀') || log.includes('🎉')
                      ? 'text-purple-400'
                      : 'text-slate-300'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>

            {/* 모달 푸터 */}
            <div className="p-4 border-t border-slate-700 flex justify-between items-center">
              <div className="text-sm text-slate-400">
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-500"></div>
                    제목 생성 진행 중...
                  </span>
                ) : (
                  <span>제목 생성 완료</span>
                )}
              </div>
              <div className="flex gap-2">
                {!isGenerating && (
                  <button
                    onClick={() => {
                      setGenerateModalOpen(false);
                      fetchTitlePool(); // 새로고침
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition"
                  >
                    새로고침
                  </button>
                )}
                <button
                  onClick={() => setGenerateModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 테스트 로그 모달 */}
      {testModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-lg shadow-2xl border border-slate-700 max-w-4xl w-full max-h-[80vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">🧪 자동 제목 생성 테스트</h3>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* 로그 영역 */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-sm">
              {testLogs.length === 0 && testInProgress && (
                <div className="flex items-center gap-2 text-slate-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span>테스트 시작 중...</span>
                </div>
              )}
              {testLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`mb-1 ${
                    log.includes('❌') || log.includes('실패')
                      ? 'text-red-400'
                      : log.includes('✅') || log.includes('성공')
                      ? 'text-green-400'
                      : log.includes('⚠️')
                      ? 'text-yellow-400'
                      : log.includes('🔍') || log.includes('📋')
                      ? 'text-blue-400'
                      : log.includes('🤖')
                      ? 'text-purple-400'
                      : 'text-slate-300'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>

            {/* 모달 푸터 */}
            <div className="p-4 border-t border-slate-700 flex justify-between items-center">
              <div className="text-sm text-slate-400">
                {testInProgress ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                    테스트 진행 중...
                  </span>
                ) : (
                  <span>테스트 완료</span>
                )}
              </div>
              <button
                onClick={() => setTestModalOpen(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AutomationPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
      <AutomationPageContent />
    </Suspense>
  );
}
