'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';
import YouTubeUploadButton from '@/components/YouTubeUploadButton';
import { parseJsonSafely } from '@/lib/json-utils';
import { safeJsonResponse } from '@/lib/fetch-utils';

interface Script {
  id: string;
  title: string;
  originalTitle?: string;
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  type?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';
  useClaudeLocal?: boolean; // 로컬 Claude 사용 여부 (true) vs API Claude (false)
  logs?: string[];
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
  sourceContentId?: string;  // 원본 컨텐츠 ID (변환된 경우)
  conversionType?: string;    // 변환 타입 (예: 'longform-to-sora2')
  isRegenerated?: boolean;    // 재생성 여부
  createdAt: string;
  updatedAt: string;
  automationQueue?: {         // 자동화 큐 정보
    inQueue: boolean;
    queueStatus: string;
    scheduledTime?: string;
  };
}

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step: string;
  videoPath?: string;
  thumbnailPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  type?: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info';
  logs?: string[];
  sourceContentId?: string;  // 원본 대본 ID
}

type TabType = 'all' | 'videos' | 'scripts' | 'coupang' | 'published' | 'settings';

interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  thumbnails: {
    default: { url: string };
    medium: { url: string };
    high: { url: string };
  };
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
}

interface YouTubeUpload {
  id: string;
  userId: string;
  jobId?: string;
  videoId: string;
  videoUrl: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  channelId: string;
  channelTitle?: string;
  privacyStatus?: string;
  publishedAt: string;
  createdAt: string;
}

// Coupang 인터페이스들
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
  productName: string;
  shortUrl: string;
  productUrl?: string;
  imageUrl?: string;
  category?: string;
  price?: number;
  clicks: number;
  createdAt: string;
}

type CoupangSubTabType = 'bestsellers' | 'links' | 'search';

// 복사 가능한 에러 메시지 컴포넌트
function ErrorMessage({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group mt-3 rounded-lg bg-red-500/20 border border-red-500/30 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <pre className="flex-1 text-red-300 whitespace-pre-wrap break-words font-mono text-xs select-text">
          {message}
        </pre>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 rounded px-2 py-1 text-xs bg-red-500/30 hover:bg-red-500/50 text-red-200 transition-colors"
          title="에러 메시지 복사"
        >
          {copied ? '✓ 복사됨' : '📋 복사'}
        </button>
      </div>
    </div>
  );
}

export default function MyContentPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [user, setUser] = useState<{ id: string; email: string; isAdmin?: boolean } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // URL 파라미터에서 탭 읽기
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab') as TabType;
    if (tab && ['all', 'videos', 'scripts', 'coupang', 'published', 'settings'].includes(tab)) {
      setActiveTab(tab);
    }
  }, []);

  // 모바일 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 탭 변경 핸들러 (URL 업데이트)
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({}, '', url.toString());
  };

  // Scripts state
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [expandedScriptId, setExpandedScriptId] = useState<string | null>(null);
  const [expandedScriptLogId, setExpandedScriptLogId] = useState<string | null>(null);
  const scriptContentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scriptLogRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scriptLastLogRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [formattingScriptIds, setFormattingScriptIds] = useState<Set<string>>(() => new Set());

  // Scripts pagination
  const [scriptsOffset, setScriptsOffset] = useState(0);
  const [scriptsTotal, setScriptsTotal] = useState(0);
  const [scriptsHasMore, setScriptsHasMore] = useState(false);
  const [isLoadingMoreScripts, setIsLoadingMoreScripts] = useState(false);

  // Pagination states for each tab
  const [allTabLimit, setAllTabLimit] = useState(20);
  const [scriptsTabLimit, setScriptsTabLimit] = useState(20);

  // Videos state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<'all' | 'active'>('all');
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [expandedLogJobId, setExpandedLogJobId] = useState<string | null>(null);

  // Published (YouTube uploads) state
  const [youtubeUploads, setYoutubeUploads] = useState<YouTubeUpload[]>([]);
  const [isLoadingUploads, setIsLoadingUploads] = useState(false);
  const [uploadingJobs, setUploadingJobs] = useState<Map<string, {
    status: 'uploading' | 'success' | 'error';
    title: string;
    videoUrl?: string;
    error?: string;
  }>>(new Map());
  const [convertingJobs, setConvertingJobs] = useState<Set<string>>(new Set());

  // Published pagination
  const [publishedOffset, setPublishedOffset] = useState(0);
  const [publishedTotal, setPublishedTotal] = useState(0);
  const [publishedHasMore, setPublishedHasMore] = useState(false);
  const [isLoadingMorePublished, setIsLoadingMorePublished] = useState(false);

  // Videos pagination
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // 입력 중인 검색어
  const [activeSearchQuery, setActiveSearchQuery] = useState(''); // 실제 검색에 사용되는 검색어
  const jobLogRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const jobLastLogRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Modal state
  const [showModal, setShowModal] = useState(false);

  // YouTube state
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmColor?: string;
  } | null>(null);

  // 대본 변환 모달 상태
  const [conversionModal, setConversionModal] = useState<{
    scriptId: string;
    title: string;
    options: { value: string; label: string }[];
  } | null>(null);

  // TTS (읽어보기) 상태
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Coupang Settings state
  const [coupangSettings, setCoupangSettings] = useState<CoupangSettings>({
    accessKey: '',
    secretKey: '',
    trackingId: '',
    isConnected: false
  });
  const [isSavingCoupang, setIsSavingCoupang] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Coupang Products state
  const [bestsellerProducts, setBestsellerProducts] = useState<Product[]>([]);
  const [isFetchingBestsellers, setIsFetchingBestsellers] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Coupang Links state
  const [generatedLinks, setGeneratedLinks] = useState<ShortLink[]>([]);

  // Coupang Tab state
  const [coupangSubTab, setCoupangSubTab] = useState<CoupangSubTabType>('bestsellers');

  // 이미지 크롤링 상태
  const imageCrawlingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isImageCrawling, setIsImageCrawling] = useState(false);

  // 대본 편집 상태 (관리자 전용)
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>('');
  const [isSavingScript, setIsSavingScript] = useState(false);

  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  const getAuthHeaders = (): HeadersInit => {
    return {}; // 빈 객체 반환 (쿠키가 자동으로 전송됨)
  };

  // Modal helper
  const showConfirmModal = (title: string, message: string, onConfirm: () => void, confirmText = '확인', confirmColor = 'bg-red-600 hover:bg-red-500') => {
    setModalConfig({ title, message, onConfirm, confirmText, confirmColor });
    setShowModal(true);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // 초기 로딩 시 모든 탭의 카운트 가져오기
  useEffect(() => {
    if (user) {
      fetchAllCounts();
    }
  }, [user]);

  const fetchAllCounts = async () => {
    try {
      // 병렬로 모든 카운트 가져오기
      const [scriptsRes, videosRes, publishedRes] = await Promise.all([
        fetch('/api/my-scripts?limit=0&offset=0', { credentials: 'include' }),
        fetch('/api/my-videos?filter=all&limit=0&offset=0', { credentials: 'include' }),
        fetch('/api/youtube/published?limit=0&offset=0', { credentials: 'include' })
      ]);

      const [scriptsData, videosData, publishedData] = await Promise.all([
        scriptsRes.json(),
        videosRes.json(),
        publishedRes.json()
      ]);

      // 카운트만 설정
      if (scriptsRes.ok) setScriptsTotal(scriptsData.total || 0);
      if (videosRes.ok) setTotal(videosData.total || 0);
      if (publishedRes.ok) setPublishedTotal(publishedData.total || 0);
    } catch (error) {
      console.error('카운트 가져오기 실패:', error);
    }
  };

  useEffect(() => {
    if (user) {
      if (activeTab === 'scripts') {
        setScripts([]);
        setScriptsOffset(0);
        fetchScripts(true);
      } else if (activeTab === 'videos') {
        setJobs([]);
        setOffset(0);
        fetchJobs(true);
      } else if (activeTab === 'all') {
        setScripts([]);
        setScriptsOffset(0);
        fetchScripts(true);
        setJobs([]);
        setOffset(0);
        fetchJobs(true);
      } else if (activeTab === 'published') {
        setYoutubeUploads([]);
        setPublishedOffset(0);
        fetchYouTubeUploads(true);
      }
    }
  }, [user, activeTab, filter, activeSearchQuery]);

  // 진행 중인 대본 자동 스크롤
  useEffect(() => {
    scripts.forEach(script => {
      if (script.status === 'processing' && script.content) {
        const ref = scriptContentRefs.current.get(script.id);
        if (ref) {
          ref.scrollTop = ref.scrollHeight;
        }
      }
    });
  }, [scripts]);

  // 진행 중인 영상 로그 자동 스크롤 (DOM 업데이트 후 실행)
  useEffect(() => {
    jobs.forEach(job => {
      if ((job.status === 'processing' || job.status === 'pending') && job.logs && expandedLogJobId === job.id) {
        // DOM 업데이트를 기다린 후 스크롤
        setTimeout(() => {
          const ref = jobLogRefs.current.get(job.id);
          if (ref) {
            ref.scrollTop = ref.scrollHeight;
          }
        }, 50);
      }
    });
  }, [jobs, expandedLogJobId]);

  // 진행 중인 대본 로그 자동 스크롤 - 마지막 항목으로 스크롤
  useEffect(() => {
    scripts.forEach(script => {
      if ((script.status === 'processing' || script.status === 'pending') && script.logs && script.logs.length > 0 && expandedScriptLogId === script.id) {
        // DOM 업데이트를 기다린 후 마지막 로그 항목으로 스크롤
        setTimeout(() => {
          const lastLogRef = scriptLastLogRefs.current.get(script.id);
          if (lastLogRef) {
            lastLogRef.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
      }
    });
  }, [scripts, expandedScriptLogId]);

  // 진행 중인 작업 로그 자동 스크롤 - 마지막 항목으로 스크롤
  useEffect(() => {
    jobs.forEach(job => {
      if ((job.status === 'processing' || job.status === 'pending') && job.logs && job.logs.length > 0 && expandedLogJobId === job.id) {
        // DOM 업데이트를 기다린 후 마지막 로그 항목으로 스크롤
        setTimeout(() => {
          const lastLogRef = jobLastLogRefs.current.get(job.id);
          if (lastLogRef) {
            lastLogRef.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
      }
    });
  }, [jobs, expandedLogJobId]);

  // 진행 중인 대본만 개별적으로 폴링 (메인 페이지 방식)
  useEffect(() => {
    if (!user) return;

    const processingScripts = scripts.filter(
      script => script.status === 'pending' || script.status === 'processing'
    );

    if (processingScripts.length === 0) return;

    const intervals: NodeJS.Timeout[] = [];

    processingScripts.forEach(script => {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/script-status?scriptId=${script.id}`, {
            headers: getAuthHeaders()
          });
          const statusData = await safeJsonResponse(response);

          if (statusData.status === 'completed' || statusData.status === 'failed') {
            clearInterval(interval);
            // 전체 목록 새로고침 (완료되었으므로)
            setScripts([]);
            setScriptsOffset(0);
            fetchScripts(true);
          } else {
            // 진행 중인 대본만 업데이트 (scripts 배열에서 해당 항목만 교체)
            setScripts(prev => prev.map(s =>
              s.id === script.id ? {
                ...s,
                status: statusData.status,
                progress: statusData.progress,
                content: statusData.content,
                logs: statusData.logs,
                error: statusData.error
              } : s
            ));
          }
        } catch (error) {
          console.error('Script status check error:', error);
        }
      }, 5000); // 2초 → 5초로 변경 (서버 로그 스팸 방지)

      intervals.push(interval);
    });

    return () => {
      intervals.forEach(interval => clearInterval(interval));
    };
  }, [user, scripts.map(s => s.id).join(',')]); // scripts.id 배열이 변경될 때만 재실행

  // 진행 중인 영상 작업만 개별적으로 폴링 (스크립트와 동일한 방식)
  useEffect(() => {
    if (!user) return;

    const processingJobs = jobs.filter(
      job => job.status === 'pending' || job.status === 'processing'
    );

    if (processingJobs.length === 0) return;

    const intervals: NodeJS.Timeout[] = [];

    processingJobs.forEach(job => {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/generate-video-upload?jobId=${job.id}`, {
            headers: getAuthHeaders()
          });
          const statusData = await safeJsonResponse(response);

          if (statusData.status === 'completed' || statusData.status === 'failed') {
            clearInterval(interval);
            // 전체 목록 새로고침 (완료되었으므로)
            fetchJobs(true);
          } else {
            // 진행 중인 작업만 업데이트 (jobs 배열에서 해당 항목만 교체)
            setJobs(prev => prev.map(j =>
              j.id === job.id ? {
                ...j,
                status: statusData.status,
                progress: statusData.progress,
                step: statusData.step,
                logs: statusData.logs,
                error: statusData.error
              } : j
            ));
          }
        } catch (error) {
          console.error('Job status check error:', error);
        }
      }, 5000); // 2초 → 5초로 변경 (서버 로그 스팸 방지)

      intervals.push(interval);
    });

    return () => {
      intervals.forEach(interval => clearInterval(interval));
    };
  }, [user, jobs.map(j => j.id).join(',')]); // jobs.id 배열이 변경될 때만 재실행

  // 이미지 크롤링 interval cleanup (컴포넌트 unmount 시)
  useEffect(() => {
    return () => {
      if (imageCrawlingIntervalRef.current) {
        clearInterval(imageCrawlingIntervalRef.current);
        imageCrawlingIntervalRef.current = null;
      }
    };
  }, []);

  // 새로 생성된 대본/영상 자동 감지 (백그라운드에서 조용히 확인)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      try {
        // 백그라운드에서 조용히 새 항목 확인 (로딩 상태 변경 없이)
        if (activeTab === 'scripts' || activeTab === 'all') {
          const response = await fetch('/api/my-scripts?limit=1&offset=0', {
            headers: getAuthHeaders(),
            credentials: 'include'
          });
          const data = await response.json();

          // 첫 번째 항목이 현재 목록에 없으면 새로고침
          if (data.scripts.length > 0 && scripts.length > 0) {
            const latestId = data.scripts[0].id;
            if (!scripts.find(s => s.id === latestId)) {
              console.log('📋 [새 대본 감지] 목록 갱신');
              fetchScripts(true);
            }
          }
        }

        if (activeTab === 'videos' || activeTab === 'all') {
          const response = await fetch('/api/my-videos?filter=all&limit=1&offset=0', {
            headers: getAuthHeaders(),
            credentials: 'include'
          });
          const data = await response.json();

          // 첫 번째 항목이 현재 목록에 없으면 새로고침
          if (data.jobs.length > 0 && jobs.length > 0) {
            const latestId = data.jobs[0].id;
            if (!jobs.find(j => j.id === latestId)) {
              console.log('🎬 [새 영상 감지] 목록 갱신');
              fetchJobs(true);
            }
          }
        }
      } catch (error) {
        console.error('백그라운드 확인 오류:', error);
      }
    }, 10000); // 10초마다 확인

    return () => clearInterval(interval);
  }, [user, activeTab, scripts, jobs]);

  // Load Coupang settings and links when user is loaded or activeTab changes to coupang
  useEffect(() => {
    if (user && activeTab === 'coupang') {
      loadCoupangSettings();
      loadCoupangLinks();
    }
  }, [user, activeTab]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await safeJsonResponse(response);

      if (!data.user) {
        router.push('/auth');
        return;
      }

      setUser(data.user);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  // ===== 대본 관련 함수 =====
  const fetchScripts = async (reset = false) => {
    const currentOffset = reset ? 0 : scriptsOffset;

    if (reset) {
      setIsLoadingScripts(true);
    } else {
      setIsLoadingMoreScripts(true);
    }

    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: currentOffset.toString(),
        ...(activeSearchQuery && { search: activeSearchQuery })
      });

      const response = await fetch(`/api/my-scripts?${params}`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      // safeJsonResponse: 응답 상태 확인 후 JSON 파싱 (HTML 에러 페이지 파싱 방지)
      const data = await safeJsonResponse(response);

      if (response.ok) {
        // 개발 완료 - 디버깅 로그 제거 (개발가이드 9. 로그 관리)
        // console.log('[fetchScripts] 응답:', {
        //   reset,
        //   currentOffset,
        //   받은데이터: data.scripts.length,
        //   total: data.total,
        //   hasMore: data.hasMore,
        //   새offset: currentOffset + data.scripts.length
        // });

        if (reset) {
          setScripts(data.scripts);
        } else {
          // 중복 제거
          setScripts(prev => {
            const existingIds = new Set(prev.map((s: Script) => s.id));
            const newScripts = data.scripts.filter((s: Script) => !existingIds.has(s.id));
            console.log('[fetchScripts] 중복 제거:', {
              기존개수: prev.length,
              받은개수: data.scripts.length,
              중복제거후: newScripts.length,
              중복된ID들: data.scripts.filter((s: Script) => existingIds.has(s.id)).map((s: Script) => s.id)
            });
            return [...prev, ...newScripts];
          });
        }
        setScriptsTotal(data.total);
        setScriptsHasMore(data.hasMore);
        setScriptsOffset(currentOffset + data.scripts.length);
      } else {
        console.error('❌ 대본 가져오기 실패:', data.error);
        toast.error(data.error || '대본을 불러올 수 없습니다.');
      }
    } catch (error) {
      console.error('❌ Error fetching scripts:', error);
      toast.error('대본 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingScripts(false);
      setIsLoadingMoreScripts(false);
    }
  };

  const loadMoreScripts = () => {
    console.log('[loadMoreScripts] 호출:', {
      isLoadingMoreScripts,
      scriptsHasMore,
      현재offset: scriptsOffset,
      현재scripts개수: scripts.length,
      total: scriptsTotal
    });

    if (!isLoadingMoreScripts && scriptsHasMore) {
      console.log('[loadMoreScripts] fetchScripts 호출 시작');
      fetchScripts(false);
    } else {
      console.log('[loadMoreScripts] fetchScripts 호출 스킵:', {
        이유: isLoadingMoreScripts ? '이미 로딩 중' : '더 이상 없음'
      });
    }
  };

  const handleDownload = async (scriptId: string) => {
    try {
      const response = await fetch(`/api/download-script?scriptId=${scriptId}`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const contentDisposition = response.headers.get('Content-Disposition');
        const fileNameMatch = contentDisposition?.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?;?/);
        const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : 'script.txt';

        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const data = await safeJsonResponse(response);
        alert('다운로드 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleCancelScript = async (scriptId: string, title: string) => {
    console.log('🛑 대본 생성 취소 버튼 클릭:', { scriptId, title });
    showConfirmModal(
      '대본 생성 취소',
      `"${title}" 대본 생성을 취소하시겠습니까?`,
      async () => {
        console.log('✅ 취소 확인됨, API 호출 시작');
        try {
          const response = await fetch(`/api/my-scripts?scriptId=${scriptId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            credentials: 'include'
          });

          const data = await safeJsonResponse(response);

          if (response.ok) {
            toast.success('대본 생성이 취소되었습니다.');
            fetchScripts(true);
          } else {
            toast.error('취소 실패: ' + (data.error || '알 수 없는 오류'));
          }
        } catch (error) {
          console.error('Cancel script error:', error);
          toast.error('취소 중 오류가 발생했습니다.');
        }
      }
    );
  };

  const handleDeleteScript = async (scriptId: string, title: string) => {
    console.log('🗑️ 삭제 버튼 클릭:', { scriptId, title });
    showConfirmModal(
      '대본 삭제',
      `"${title}" 대본을 삭제하시겠습니까?`,
      async () => {
        console.log('✅ 삭제 확인됨, API 호출 시작');
        try {
          const response = await fetch(`/api/my-scripts?scriptId=${scriptId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            credentials: 'include'
          });

          console.log('📡 DELETE 응답:', response.status);
          const data = await safeJsonResponse(response);
          console.log('📦 응답 데이터:', data);

          if (response.ok) {
            toast.success('대본이 삭제되었습니다.');
            // 전체 목록 다시 로드하지 않고 삭제된 항목만 state에서 제거
            setScripts(prev => prev.filter(s => s.id !== scriptId));
            // total count 감소
            setScriptsTotal(prev => Math.max(0, prev - 1));
          } else {
            toast.error('삭제 실패: ' + (data.error || '알 수 없는 오류'));
          }
        } catch (error) {
          console.error('Delete error:', error);
          toast.error('삭제 중 오류가 발생했습니다.');
        }
      }
    );
  };

  const toggleContent = (scriptId: string) => {
    setExpandedScriptId(expandedScriptId === scriptId ? null : scriptId);
  };

  // ===== Coupang 관련 함수 =====
  const getSessionId = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  };


  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('클립보드에 복사되었습니다!');
  };

  const loadCoupangSettings = async () => {
    try {
      const response = await fetch('/api/coupang/settings', {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setCoupangSettings(data.settings || coupangSettings);
      }
    } catch (error) {
      console.error('쿠팡 설정 로드 실패:', error);
    }
  };

  const saveCoupangSettings = async () => {
    setIsSavingCoupang(true);
    try {
      const response = await fetch('/api/coupang/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(coupangSettings)
      });

      if (response.ok) {
        toast.success('쿠팡 설정이 저장되었습니다.');
      } else {
        throw new Error('저장 실패');
      }
    } catch (error) {
      toast.error('쿠팡 설정 저장에 실패했습니다.');
    } finally {
      setIsSavingCoupang(false);
    }
  };

  const testCoupangConnection = async () => {
    setTestingConnection(true);
    try {
      const response = await fetch('/api/coupang/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(coupangSettings)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const updatedSettings = { ...coupangSettings, isConnected: true, lastChecked: new Date().toISOString() };
        setCoupangSettings(updatedSettings);

        try {
          const saveResponse = await fetch('/api/coupang/settings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify(updatedSettings)
          });

          if (saveResponse.ok) {
            toast.success('✅ 연결 성공 및 자동 저장 완료!');
          } else {
            toast.success('✅ 연결 성공! (자동 저장 실패 - 수동으로 저장하세요)');
          }
        } catch {
          toast.success('✅ 연결 성공! (자동 저장 실패 - 수동으로 저장하세요)');
        }
      } else {
        throw new Error(data.error || '연결 실패');
      }
    } catch (error: any) {
      toast.error('❌ 연결 실패: ' + error.message);
    } finally {
      setTestingConnection(false);
    }
  };

  const fetchBestsellers = async (categoryId: string = '1001') => {
    if (!coupangSettings.isConnected) {
      toast.error('먼저 쿠팡 API를 연결하세요.');
      return;
    }

    setIsFetchingBestsellers(true);
    try {
      const response = await fetch(`/api/coupang/products?categoryId=${categoryId}`, {
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setBestsellerProducts(data.products || []);
        toast.success(`✅ 베스트셀러 ${data.products.length}개 상품을 가져왔습니다!`);
      } else {
        throw new Error(data.error || '상품 조회 실패');
      }
    } catch (error: any) {
      toast.error('❌ 베스트셀러 조회 실패: ' + error.message);
    } finally {
      setIsFetchingBestsellers(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const sendSelectedToProductManagement = async () => {
    if (selectedProducts.size === 0) {
      toast.error('선택한 상품이 없습니다.');
      return;
    }

    const selectedProductList = bestsellerProducts.filter(p => selectedProducts.has(p.productId));

    try {
      const response = await fetch('/api/coupang/products/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ products: selectedProductList })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(data.message);
        setSelectedProducts(new Set());
        loadCoupangLinks();
      } else {
        throw new Error(data.error || '상품 전송 실패');
      }
    } catch (error: any) {
      toast.error('❌ 상품 전송 실패: ' + error.message);
    }
  };

  const searchCoupangProducts = async () => {
    if (!searchKeyword.trim()) {
      toast.error('검색어를 입력하세요.');
      return;
    }

    if (!coupangSettings.isConnected) {
      toast.error('먼저 API 키를 연결하세요.');
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
        toast.success(`${data.products?.length || 0}개의 상품을 찾았습니다.`);
      } else {
        throw new Error(data.error || '검색 실패');
      }
    } catch (error: any) {
      toast.error('검색 실패: ' + error.message);
    } finally {
      setIsSearching(false);
    }
  };

  const loadCoupangLinks = async () => {
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

  // ===== 영상 관련 함수 =====
  const fetchJobs = async (reset = false, forceFilter?: 'all' | 'active') => {
    const currentOffset = reset ? 0 : offset;

    if (reset) {
      setIsLoadingVideos(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      // 전체 탭에서는 무조건 'all' 필터 사용
      const actualFilter = forceFilter || (activeTab === 'all' ? 'all' : filter);

      const params = new URLSearchParams({
        filter: actualFilter,
        limit: '20',
        offset: currentOffset.toString(),
        ...(activeSearchQuery && { search: activeSearchQuery })
      });

      const response = await fetch(`/api/my-videos?${params}`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await safeJsonResponse(response);

      if (response.ok) {
        if (reset) {
          setJobs(data.jobs);
        } else {
          // 중복 제거
          setJobs(prev => {
            const existingIds = new Set(prev.map((j: Job) => j.id));
            const newJobs = data.jobs.filter((j: Job) => !existingIds.has(j.id));
            console.log('[fetchJobs] 중복 제거:', {
              기존개수: prev.length,
              받은개수: data.jobs.length,
              중복제거후: newJobs.length,
              중복된ID들: data.jobs.filter((j: Job) => existingIds.has(j.id)).map((j: Job) => j.id)
            });
            return [...prev, ...newJobs];
          });
        }
        setTotal(data.total);
        setHasMore(data.hasMore);
        setOffset(currentOffset + data.jobs.length);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setIsLoadingVideos(false);
      setIsLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchJobs(false);
    }
  };

  // YouTube 업로드 기록 가져오기
  const fetchYouTubeUploads = async (reset = false) => {
    const currentOffset = reset ? 0 : publishedOffset;

    if (reset) {
      setIsLoadingUploads(true);
    } else {
      setIsLoadingMorePublished(true);
    }

    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: currentOffset.toString()
      });

      const response = await fetch(`/api/youtube/published?${params}`, {
        credentials: 'include'
      });
      const data = await safeJsonResponse(response);

      if (response.ok) {
        if (reset) {
          setYoutubeUploads(data.uploads || []);
        } else {
          // 중복 제거: 이미 있는 ID는 추가하지 않음
          setYoutubeUploads(prev => {
            const existingIds = new Set(prev.map((u: YouTubeUpload) => u.id));
            const newUploads = (data.uploads || []).filter((u: YouTubeUpload) => !existingIds.has(u.id));
            console.log('[fetchYouTubeUploads] 중복 제거:', {
              기존개수: prev.length,
              받은개수: data.uploads?.length || 0,
              중복제거후: newUploads.length,
              중복된ID들: (data.uploads || []).filter((u: YouTubeUpload) => existingIds.has(u.id)).map((u: YouTubeUpload) => u.id)
            });
            return [...prev, ...newUploads];
          });
        }
        setPublishedTotal(data.total || 0);
        setPublishedHasMore(data.hasMore || false);
        setPublishedOffset(currentOffset + (data.uploads?.length || 0));
      }
    } catch (error) {
      console.error('YouTube 업로드 기록 조회 실패:', error);
    } finally {
      setIsLoadingUploads(false);
      setIsLoadingMorePublished(false);
    }
  };

  const loadMorePublished = () => {
    if (!isLoadingMorePublished && publishedHasMore) {
      fetchYouTubeUploads(false);
    }
  };

  // YouTube 업로드 기록 삭제
  const handleDeleteUpload = async (uploadId: string) => {
    try {
      const response = await fetch(`/api/youtube/published?id=${uploadId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('삭제되었습니다');
        // 전체 목록 다시 로드하지 않고 삭제된 항목만 state에서 제거
        setYoutubeUploads(prev => prev.filter(u => u.id !== uploadId));
        // total count 감소
        setPublishedTotal(prev => Math.max(0, prev - 1));
      } else {
        toast.error('삭제 실패');
      }
    } catch (error) {
      console.error('삭제 실패:', error);
      toast.error('삭제 실패');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    showConfirmModal(
      '영상 생성 취소',
      '정말로 영상 생성을 취소하시겠습니까?',
      async () => {
        try {
          const response = await fetch(`/api/generate-video-upload?jobId=${jobId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            credentials: 'include'
          });

          const data = await safeJsonResponse(response);

          if (response.ok) {
            toast.success('영상 생성이 취소되었습니다.');
            fetchJobs(true);
          } else {
            toast.error('취소 실패: ' + (data.error || '알 수 없는 오류'));
          }
        } catch (error) {
          console.error('Cancel error:', error);
          toast.error('취소 중 오류가 발생했습니다.');
        }
      }
    );
  };

  const handleDeleteVideo = async (jobId: string, title: string) => {
    showConfirmModal(
      '영상 삭제',
      `"${title}" 영상을 삭제하시겠습니까?`,
      async () => {
        try {
          const response = await fetch(`/api/my-videos?jobId=${jobId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            credentials: 'include'
          });

          const data = await safeJsonResponse(response);

          if (response.ok) {
            toast.success('영상이 삭제되었습니다.');
            // 전체 목록 다시 로드하지 않고 삭제된 항목만 state에서 제거
            setJobs(prev => prev.filter(j => j.id !== jobId));
            // total count 감소
            setTotal(prev => Math.max(0, prev - 1));
          } else {
            toast.error('삭제 실패: ' + (data.error || '알 수 없는 오류'));
          }
        } catch (error) {
          console.error('Delete video error:', error);
          toast.error('삭제 중 오류가 발생했습니다.');
        }
      }
    );
  };

  const handleRestartVideo = async (jobId: string) => {
    if (!confirm('이 작업을 재시작하시겠습니까?\n\n크레딧이 다시 차감됩니다.')) {
      return;
    }

    try {
      const response = await fetch('/api/restart-video', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ jobId })
      });

      const data = await safeJsonResponse(response);

      if (response.ok) {
        alert('작업이 재시작되었습니다.\n\n새로운 작업이 생성되어 처리 중입니다.');
        // 비디오 탭으로 전환
        setActiveTab('videos');
        // 목록 새로고침
        await fetchJobs(true);
        // 새로운 jobId의 로그를 자동으로 열기
        if (data.jobId) {
          setExpandedLogJobId(data.jobId);
        }
      } else {
        alert('재시작 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('Restart error:', error);
      alert('재시작 중 오류가 발생했습니다.');
    }
  };

  const handleConvertToShorts = async (jobId: string, title: string) => {
    // 이미 변환 중이면 무시
    if (convertingJobs.has(jobId)) {
      toast.error('이미 변환 중입니다.');
      return;
    }

    showConfirmModal(
      '⚡ 쇼츠로 변환',
      `"${title}"\n\n━━━━━━━━━━━━━━━━━━━━━━\n💰 크레딧 차감: 200 크레딧\n━━━━━━━━━━━━━━━━━━━━━━\n\n📝 대본을 AI가 분석하여 하이라이트만 추출\n🎬 4개 씬 구성 (약 60초)\n🖼️ 9:16 세로 이미지 자동 생성\n\n영상을 1분 쇼츠로 변환하시겠습니까?`,
      async () => {
        // 즉시 변환 중 상태로 설정
        setConvertingJobs(prev => new Set(prev).add(jobId));

        // 즉시 토스트 표시
        const toastId = toast.loading('🎬 쇼츠 변환 시작 중...');

        try {
          const response = await fetch(`/api/jobs/${jobId}/convert-to-shorts`, {
            method: 'POST',
            headers: {
              ...getAuthHeaders(),
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });

          const data = await safeJsonResponse(response);

          if (response.ok) {
            toast.success('✅ 쇼츠 변환이 시작되었습니다!\n비디오 탭에서 진행 상황을 확인하세요.', { id: toastId, duration: 3000 });
            // 비디오 탭으로 전환
            setActiveTab('videos');
            // 목록 새로고침
            await fetchJobs(true);
            // 새로운 jobId의 로그를 자동으로 열기
            if (data.jobId) {
              setExpandedLogJobId(data.jobId);
            }
          } else {
            toast.error('❌ 쇼츠 변환 실패: ' + (data.error || '알 수 없는 오류'), { id: toastId });
          }
        } catch (error) {
          console.error('Convert to shorts error:', error);
          toast.error('❌ 쇼츠 변환 중 오류가 발생했습니다.', { id: toastId });
        } finally {
          // 변환 중 상태 제거
          setConvertingJobs(prev => {
            const newSet = new Set(prev);
            newSet.delete(jobId);
            return newSet;
          });
        }
      },
      '변환 시작',
      'bg-purple-600 hover:bg-purple-500'
    );
  };

  const handleConvertToShortform = async (jobId: string, title: string) => {
    // 이미 변환 중이면 무시
    if (convertingJobs.has(jobId)) {
      toast.error('이미 변환 중입니다.');
      return;
    }

    showConfirmModal(
      '⚡ 숏폼으로 변환',
      `"${title}"\n\n━━━━━━━━━━━━━━━━━━━━━━\n💰 크레딧 차감: 200 크레딧\n━━━━━━━━━━━━━━━━━━━━━━\n\n📝 대본을 요약하여 3분 분량으로 압축\n🎬 씬 개수 유지 (원본과 동일)\n🖼️ 원본 이미지를 9:16으로 자동 변환\n\n영상을 3분 숏폼으로 변환하시겠습니까?`,
      async () => {
        // 즉시 변환 중 상태로 설정
        setConvertingJobs(prev => new Set(prev).add(jobId));

        // 즉시 토스트 표시
        const toastId = toast.loading('🎬 숏폼 변환 시작 중...');

        try {
          // localStorage에서 AI 설정 가져오기
          const selectedAI = localStorage.getItem('selectedAI') || 'chatgpt';
          const aiModel = localStorage.getItem('aiModel') || '';

          const response = await fetch(`/api/jobs/${jobId}/convert-to-shortform`, {
            method: 'POST',
            headers: {
              ...getAuthHeaders(),
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
              agentName: selectedAI,
              modelName: aiModel
            })
          });

          const data = await safeJsonResponse(response);

          if (response.ok) {
            toast.success('✅ 숏폼 변환이 시작되었습니다!\n비디오 탭에서 진행 상황을 확인하세요.', { id: toastId, duration: 3000 });
            // 비디오 탭으로 전환
            setActiveTab('videos');
            // 목록 새로고침
            await fetchJobs(true);
            // 새로운 jobId의 로그를 자동으로 열기
            if (data.jobId) {
              setExpandedLogJobId(data.jobId);
            }
          } else {
            toast.error('❌ 숏폼 변환 실패: ' + (data.error || '알 수 없는 오류'), { id: toastId });
          }
        } catch (error) {
          console.error('Convert to shortform error:', error);
          toast.error('❌ 숏폼 변환 중 오류가 발생했습니다.', { id: toastId });
        } finally {
          // 변환 중 상태 제거
          setConvertingJobs(prev => {
            const newSet = new Set(prev);
            newSet.delete(jobId);
            return newSet;
          });
        }
      },
      '변환 시작',
      'bg-blue-600 hover:bg-blue-500'
    );
  };

  const handleRestartScript = async (scriptId: string, title: string) => {
    // 스크립트 정보를 찾아서 메인 페이지로 이동
    const script = scripts.find(s => s.id === scriptId);
    if (!script) {
      toast.error('스크립트 정보를 찾을 수 없습니다.');
      return;
    }

    // 메인 페이지로 이동하면서 제목과 타입 정보 전달
    const params = new URLSearchParams();
    params.set('retryTitle', script.title);
    if (script.type) {
      params.set('retryType', script.type);
    }

    // 상품 대본인 경우 DB에 저장된 productInfo를 localStorage에 저장
    if ((script.type === 'product' || script.type === 'product-info') && (script as any).productInfo) {
      try {
        const productInfo = (script as any).productInfo;
        localStorage.setItem('product_video_info', JSON.stringify(productInfo));
        localStorage.setItem('current_product_info', JSON.stringify(productInfo));
        console.log('✅ 재시도 시 DB의 상품 정보를 localStorage에 저장:', productInfo);
      } catch (error) {
        console.warn('⚠️ 재시도 시 상품 정보 저장 실패:', error);
      }
    }

    window.location.href = `/?${params.toString()}`;
  };

  // 기존 API 방식의 재시도 함수 (백업용)
  const handleRestartScriptAPI = async (scriptId: string, title: string) => {
    showConfirmModal(
      '대본 재생성',
      `"${title}" 대본을 다시 생성하시겠습니까?\n\n크레딧이 다시 차감됩니다.`,
      async () => {
        try {
          const response = await fetch('/api/restart-script', {
            method: 'POST',
            headers: {
              ...getAuthHeaders(),
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ scriptId, title })
          });

          const data = await safeJsonResponse(response);

          if (response.ok) {
            toast.success('대본이 재생성되었습니다.\n\n새로운 대본이 생성 중입니다.');
            // 대본 탭으로 전환
            setActiveTab('scripts');
            // 목록 새로고침
            fetchScripts(true);
            // 새로운 scriptId의 로그를 자동으로 열기
            if (data.scriptId) {
              setExpandedScriptLogId(data.scriptId);
            }
          } else {
            toast.error('재시작 실패: ' + (data.error || '알 수 없는 오류'));
          }
        } catch (error) {
          console.error('Restart script error:', error);
          toast.error('대본 재시작 중 오류가 발생했습니다.');
        }
      }
    );
  };

  // 안전한 클립보드 복사 유틸리티 함수
  const safeCopyToClipboard = async (text: string): Promise<boolean> => {
    console.log('[COPY] 복사 시도:', text.substring(0, 100) + '...');

    try {
      // Clipboard API 사용 가능 여부 확인
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        console.log('[COPY] navigator.clipboard API 사용');
        await navigator.clipboard.writeText(text);
        console.log('[COPY] 복사 성공 (clipboard API)');
        return true;
      } else {
        // 폴백: document.execCommand 사용
        console.log('[COPY] execCommand 폴백 사용');
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        console.log('[COPY] execCommand 결과:', successful);
        return successful;
      }
    } catch (error) {
      console.error('[COPY] 복사 실패:', error);
      // 폴백도 실패한 경우 한 번 더 시도
      try {
        console.log('[COPY] 최종 폴백 시도');
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        console.log('[COPY] 최종 폴백 결과:', successful);
        return successful;
      } catch (err) {
        console.error('[COPY] 최종 폴백도 실패:', err);
        return false;
      }
    }
  };

  // TTS 나레이션 추출 함수
  const extractNarration = (content: string): string => {
    try {
      // JSON 파싱
      const parseResult = parseJsonSafely(content);
      if (!parseResult.success || !parseResult.data) {
        return content; // 파싱 실패 시 전체 텍스트 반환
      }

      const data = parseResult.data;
      const narrations: string[] = [];

      // scenes 배열에서 narration 추출
      if (data.scenes && Array.isArray(data.scenes)) {
        data.scenes.forEach((scene: any, index: number) => {
          const narration = scene.narration || scene.voiceover || '';
          if (narration) {
            narrations.push(`씬 ${index + 1}: ${narration}`);
          }
        });
      }

      return narrations.length > 0 ? narrations.join('\n\n') : content;
    } catch (error) {
      console.error('Narration extraction error:', error);
      return content; // 에러 시 전체 텍스트 반환
    }
  };

  // TTS 읽어보기 시작
  const handleSpeak = (id: string, content: string) => {
    // 브라우저 지원 확인
    if (!('speechSynthesis' in window)) {
      toast.error('이 브라우저는 음성 합성을 지원하지 않습니다.');
      return;
    }

    // 이미 읽고 있으면 정지
    if (speakingId === id) {
      if (isPaused) {
        // 일시정지 상태면 재개
        window.speechSynthesis.resume();
        setIsPaused(false);
        toast('▶️ 재생');
      } else {
        // 읽고 있으면 정지
        window.speechSynthesis.cancel();
        setSpeakingId(null);
        setIsPaused(false);
        utteranceRef.current = null;
        toast('⏹️ 중지됨');
      }
      return;
    }

    // 다른 음성이 읽고 있으면 정지
    window.speechSynthesis.cancel();

    // 나레이션 추출
    const narrationText = extractNarration(content);

    if (!narrationText || narrationText.trim().length === 0) {
      toast.error('읽을 내용이 없습니다.');
      return;
    }

    // 텍스트 길이 제한 (일부 브라우저에서 긴 텍스트 문제)
    const maxLength = 5000;
    const textToSpeak = narrationText.length > maxLength
      ? narrationText.substring(0, maxLength) + '... (내용이 너무 길어 일부만 재생됩니다)'
      : narrationText;

    console.log('🔊 TTS 시작:', {
      originalLength: narrationText.length,
      speakLength: textToSpeak.length,
      preview: textToSpeak.substring(0, 100)
    });

    // 최고 품질의 한국어 음성 선택 (Google 1번 음성)
    const voices = window.speechSynthesis.getVoices();
    console.log('🎤 사용 가능한 음성 목록:', voices.map((v, idx) => ({
      index: idx,
      name: v.name,
      lang: v.lang,
      local: v.localService
    })));

    // 한국어 음성 필터링
    const koreanVoices = voices.filter(voice =>
      voice.lang.includes('ko') || voice.lang.includes('KR')
    );

    console.log('🇰🇷 한국어 음성:', koreanVoices.map((v, idx) => `[${idx}] ${v.name}`));

    // Google 한국어 음성만 선택 (1번 - 첫 번째)
    let selectedVoice = null;

    // Google 한국어 음성 찾기
    const googleVoices = koreanVoices.filter(voice =>
      voice.name.includes('Google') || voice.name.toLowerCase().includes('google')
    );

    if (googleVoices.length > 0) {
      // 첫 번째 Google 한국어 음성 사용
      selectedVoice = googleVoices[0];
      console.log('✅ Google 한국어 음성 선택:', selectedVoice.name);
    } else {
      // Google 음성이 없으면 첫 번째 한국어 음성 사용
      if (koreanVoices.length > 0) {
        selectedVoice = koreanVoices[0];
        console.log('⚠️ Google 음성 없음. 대체 음성 선택:', selectedVoice.name);
      }
    }

    console.log('✅ 최종 선택된 음성:', selectedVoice ? selectedVoice.name : '기본 음성');

    // 새로운 음성 합성
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'ko-KR';

    // 선택된 음성 설정
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // 속도와 피치 최적화 (더 자연스럽게)
    utterance.rate = 0.95; // 약간 느리게 (더 명확함)
    utterance.pitch = 1.0; // 기본 음높이
    utterance.volume = 1.0; // 최대 볼륨

    utterance.onstart = () => {
      console.log('🔊 TTS 재생 시작됨');
    };

    utterance.onend = () => {
      console.log('✅ TTS 재생 완료');
      setSpeakingId(null);
      setIsPaused(false);
      utteranceRef.current = null;
      toast('✅ 재생 완료');
    };

    utterance.onerror = (event) => {
      // ⛔ CRITICAL FEATURE: TTS 중지 에러 처리
      // 버그 이력: 2025-01-12 - 사용자가 중지하면 콘솔에 에러 출력됨
      // ❌ 이 조건문 제거 금지! (interrupted/canceled는 에러가 아님)
      // 관련 문서: CRITICAL_FEATURES.md
      if (event.error === 'interrupted' || event.error === 'canceled') {
        console.log('ℹ️ TTS stopped by user');
        return;
      }

      console.error('❌ TTS error:', {
        error: event.error,
        message: event.type,
        charIndex: event.charIndex,
        elapsedTime: event.elapsedTime
      });

      let errorMessage = '음성 재생 중 오류가 발생했습니다.';
      if (event.error === 'not-allowed') {
        errorMessage = '음성 재생 권한이 없습니다. 브라우저 설정을 확인해주세요.';
      } else if (event.error === 'network') {
        errorMessage = '네트워크 오류로 음성을 재생할 수 없습니다.';
      } else if (event.error === 'synthesis-failed') {
        errorMessage = '음성 합성에 실패했습니다.';
      } else if (event.error === 'synthesis-unavailable') {
        errorMessage = '음성 합성을 사용할 수 없습니다.';
      } else if (event.error === 'text-too-long') {
        errorMessage = '텍스트가 너무 깁니다.';
      } else if (event.error === 'invalid-argument') {
        errorMessage = '잘못된 입력입니다.';
      }

      toast.error(errorMessage);
      setSpeakingId(null);
      setIsPaused(false);
      utteranceRef.current = null;
    };

    utteranceRef.current = utterance;

    // 음성 목록이 로드될 때까지 대기 (일부 브라우저 필요)
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        window.speechSynthesis.speak(utterance);
      }, { once: true });
    } else {
      window.speechSynthesis.speak(utterance);
    }

    setSpeakingId(id);
    setIsPaused(false);
    toast.success('🔊 나레이션 읽기 시작');
  };

  // TTS 일시정지
  const handlePause = () => {
    if (speakingId && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      toast('⏸️ 일시정지');
    }
  };

  // 컴포넌트 언마운트 시 TTS 정리
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // 이미지크롤링 핸들러 (Python 자동화)
  const isScriptFormatting = (scriptId: string) => formattingScriptIds.has(scriptId);

  const updateFormattingState = (scriptId: string, isProcessing: boolean) => {
    setFormattingScriptIds(prev => {
      const next = new Set(prev);
      if (isProcessing) {
        next.add(scriptId);
      } else {
        next.delete(scriptId);
      }
      return next;
    });
  };


  const tryFormatScriptLocally = (rawContent: string): { formatted: string; scriptJson: any } | null => {
    try {
      if (!rawContent || rawContent.trim().length === 0) {
        return null;
      }

      // 유연한 JSON 파싱 사용 (제어 문자 자동 이스케이프)
      // 상품정보일 수 있으므로 에러 로그는 나중에 출력
      const result = parseJsonSafely(rawContent, { logErrors: false });

      if (!result.success) {
        // JSON이 아닌 경우, 상품정보 텍스트인지 확인
        // ✅로 시작하는 항목들이 여러 개 있으면 상품정보로 간주
        const checkMarkCount = (rawContent.match(/✅/g) || []).length;

        if (checkMarkCount >= 3) {
          // 상품정보 텍스트로 판단 - 적절한 줄바꿈 추가
          console.log('✅ 상품정보 텍스트 포맷팅 시작...');

          let formatted = rawContent.trim();

          // 1. 일단 모든 연속된 공백/줄바꿈을 공백 하나로 통일
          formatted = formatted.replace(/\s+/g, ' ');

          // 2. 문장 끝(!,?,.) 뒤에 줄바꿈 추가
          formatted = formatted.replace(/([!?.])\s+/g, '$1\n');

          // 3. ✅ 항목들 줄바꿈 (빈 줄 없이 바로 다음 줄)
          formatted = formatted.replace(/\s*✅\s+/g, '\n✅ ');

          // 4. 🛒 구매하기 앞에 빈 줄 하나
          formatted = formatted.replace(/\s*(🛒\s*구매하기)/g, '\n\n$1');
          // 구매하기 뒤 URL 앞에 줄바꿈
          formatted = formatted.replace(/(🛒\s*구매하기)\s+(http)/g, '$1\n$2');

          // 5. 🏠 홈 사이트 앞에 빈 줄 하나
          formatted = formatted.replace(/\s*(🏠)/g, '\n\n$1');
          // 홈 사이트 라벨과 URL 사이 줄바꿈
          formatted = formatted.replace(/(🏠[^http\n]+?)\s+(http)/g, '$1\n$2');

          // 6. 해시태그 섹션 처리
          // 먼저 해시태그들 사이의 줄바꿈을 공백으로 변경 (여러 번 반복)
          let prevFormatted = '';
          while (prevFormatted !== formatted) {
            prevFormatted = formatted;
            formatted = formatted.replace(/(#[가-힣a-zA-Z0-9_]+)\s*\n\s*(#[가-힣a-zA-Z0-9_]+)/g, '$1 $2');
          }
          // 첫 번째 해시태그 앞에만 빈 줄 추가
          formatted = formatted.replace(/([^\n])\s*(#[가-힣a-zA-Z0-9_]+)/, '$1\n\n$2');

          // 7. 📢 파트너스 안내 앞에 빈 줄 하나
          formatted = formatted.replace(/\s*(📢)/g, '\n\n$1');

          // 8. 맨 앞 ✅ 앞의 줄바꿈 제거
          formatted = formatted.replace(/^\n+✅/, '✅');

          // 9. 연속된 빈 줄을 하나로 (최대 빈 줄 1개)
          formatted = formatted.replace(/\n{3,}/g, '\n\n');

          // 10. 앞뒤 공백 제거
          formatted = formatted.trim();

          console.log('✅ 상품정보 텍스트 포맷팅 완료');
          return { formatted, scriptJson: null };
        }

        // 상품정보도 아니면 진짜 JSON 파싱 에러
        console.error('❌ JSON 파싱 실패:', result.error);
        return null;
      }

      const scriptJson = result.data;
      const formatted = JSON.stringify(scriptJson, null, 2);

      return { formatted, scriptJson };
    } catch (error) {
      // 에러는 로그 유지 (개발가이드: 에러 로그는 유지)
      console.error('로컬 JSON 포맷팅 실패:', error);
      return null;
    }
  };

  const formatScriptContent = async (
    scriptId: string,
    currentContent: string,
    options: { showToast?: boolean } = {}
  ): Promise<string> => {
    const { showToast = true } = options;
    const toastId = showToast ? `format-${scriptId}` : undefined;

    updateFormattingState(scriptId, true);

    // 상품정보 텍스트인지 확인 (✅가 3개 이상 있으면)
    const checkMarkCount = (currentContent.match(/✅/g) || []).length;
    const isProductInfo = checkMarkCount >= 3;

    if (toastId) {
      toast.loading(isProductInfo ? '텍스트 포맷팅 중...' : 'JSON 포맷팅 중...', { id: toastId });
    }

    const localFormatResult = tryFormatScriptLocally(currentContent);
    const payload: Record<string, any> = { scriptId };

    if (localFormatResult?.formatted) {
      payload.formattedContent = localFormatResult.formatted;
    }

    try {
      const response = await fetch('/api/scripts/format', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await safeJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || (isProductInfo ? '텍스트 포맷팅에 실패했습니다.' : 'JSON 포맷팅에 실패했습니다.'));
      }

      const formattedContent =
        data.formattedContent || localFormatResult?.formatted || currentContent;

      setScripts(prev =>
        prev.map(script =>
          script.id === scriptId ? { ...script, content: formattedContent } : script
        )
      );

      if (toastId) {
        toast.success(isProductInfo ? '텍스트 포맷팅 완료!' : 'JSON 포맷팅 완료!', { id: toastId });
      }

      return formattedContent;
    } catch (error) {
      console.error('포맷팅 실패:', error);
      if (toastId) {
        toast.error(`포맷팅 실패: ${(error as Error).message}`, { id: toastId });
      }
      throw error;
    } finally {
      updateFormattingState(scriptId, false);
    }
  };


  const handleImageCrawling = async (scriptId: string, jobId?: string) => {
    // 이미 실행 중이면 리턴 (중복 실행 방지)
    if (isImageCrawling) {
      toast.error('이미 이미지 생성이 진행 중입니다.');
      return;
    }

    // 기존 폴링 인터벌이 있으면 정리
    if (imageCrawlingIntervalRef.current) {
      clearInterval(imageCrawlingIntervalRef.current);
      imageCrawlingIntervalRef.current = null;
    }

    setIsImageCrawling(true);

    try {
      // scriptId로 대본 가져오기
      const script = scripts.find(s => s.id === scriptId);
      if (!script || !script.content) {
        toast.error('대본을 찾을 수 없습니다.');
        setIsImageCrawling(false);
        return;
      }

      const scriptContent = script.content;

      // JSON 파싱
      const parseResult = parseJsonSafely(scriptContent);
      if (!parseResult.success || !parseResult.data || !parseResult.data.scenes || !Array.isArray(parseResult.data.scenes)) {
        toast.error('대본 형식이 올바르지 않습니다.');
        setIsImageCrawling(false);
        return;
      }

      const scriptData = parseResult.data;
      const scenes = scriptData.scenes;
      if (scenes.length === 0) {
        toast.error('씬이 없습니다.');
        setIsImageCrawling(false);
        return;
      }

      toast.success(`🤖 자동 이미지 생성 시작... (${scenes.length}개 씬)`);

      // API 호출 (credentials 추가)
      const response = await fetch('/api/images/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        credentials: 'include', // 쿠키 자동 전송
        body: JSON.stringify({
          scenes,
          contentId: scriptId
        })
      });

      // 응답 파싱 (HTML 오류 대응)
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await safeJsonResponse(response);
      } else {
        // HTML이나 다른 형식이 반환된 경우
        const text = await response.text();
        console.error('❌ JSON이 아닌 응답:', text.substring(0, 200));
        throw new Error('이미지 크롤링 API가 존재하지 않거나 오류가 발생했습니다.');
      }

      if (!response.ok) {
        throw new Error(data.error || '이미지 크롤링 API 호출 실패');
      }

      const taskId = data.taskId;
      toast.success(`✅ 이미지 생성 작업 시작! (작업 ID: ${taskId})`);

      // 작업 상태 폴링
      imageCrawlingIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/images/crawl?taskId=${taskId}`, {
            headers: getAuthHeaders(),
            credentials: 'include' // 쿠키 자동 전송
          });

          if (!statusRes.ok) {
            if (imageCrawlingIntervalRef.current) {
              clearInterval(imageCrawlingIntervalRef.current);
              imageCrawlingIntervalRef.current = null;
            }
            setIsImageCrawling(false);
            if (statusRes.status === 401) {
              toast.error('인증이 만료되었습니다. 다시 로그인해주세요.');
            }
            return;
          }

          const status = await statusRes.json();

          if (status.status === 'completed') {
            if (imageCrawlingIntervalRef.current) {
              clearInterval(imageCrawlingIntervalRef.current);
              imageCrawlingIntervalRef.current = null;
            }
            setIsImageCrawling(false);
            toast.success('✅ 모든 이미지 생성 완료!');
          } else if (status.status === 'failed') {
            if (imageCrawlingIntervalRef.current) {
              clearInterval(imageCrawlingIntervalRef.current);
              imageCrawlingIntervalRef.current = null;
            }
            setIsImageCrawling(false);
            toast.error(`❌ 이미지 생성 실패: ${status.error}`);
          } else if (status.status === 'processing') {
            // 진행 상태 표시
            if (status.logs && status.logs.length > 0) {
              const lastLog = status.logs[status.logs.length - 1];
              console.log(`[이미지 크롤링] ${lastLog}`);
            }
          }
        } catch (error) {
          console.error('작업 상태 조회 오류:', error);
        }
      }, 2000); // 2초마다 상태 확인

      // 5분 후 자동 종료
      setTimeout(() => {
        if (imageCrawlingIntervalRef.current) {
          clearInterval(imageCrawlingIntervalRef.current);
          imageCrawlingIntervalRef.current = null;
        }
        setIsImageCrawling(false);
      }, 5 * 60 * 1000);

    } catch (error: any) {
      console.error('이미지크롤링 에러:', error);
      toast.error(error?.message || '이미지 생성 중 오류가 발생했습니다.');
      setIsImageCrawling(false);

      // 에러 시 폴링 정리
      if (imageCrawlingIntervalRef.current) {
        clearInterval(imageCrawlingIntervalRef.current);
        imageCrawlingIntervalRef.current = null;
      }
    }
  };

  const handleCopyScript = async (content: string, title: string) => {
    console.log('[COPY] handleCopyScript 호출됨');
    console.log('[COPY] content type:', typeof content);
    console.log('[COPY] content:', content);

    if (!content) {
      console.log('[COPY] content가 비어있음');
      toast.error('복사할 대본 내용이 없습니다.');
      return;
    }

    // content가 객체인 경우 JSON.stringify
    let textToCopy = content;
    if (typeof content === 'object') {
      console.log('[COPY] content가 객체입니다, JSON.stringify 시도');
      try {
        textToCopy = JSON.stringify(content, null, 2);
      } catch (e) {
        console.error('[COPY] JSON stringify error:', e);
        textToCopy = String(content);
      }
    } else {
      textToCopy = String(content);
    }

    console.log('[COPY] 최종 복사할 텍스트 길이:', textToCopy.length);

    if (textToCopy.trim().length === 0) {
      console.log('[COPY] 복사할 텍스트가 비어있음');
      toast.error('복사할 대본 내용이 비어있습니다.');
      return;
    }

    console.log('[COPY] safeCopyToClipboard 호출');
    const success = await safeCopyToClipboard(textToCopy);
    console.log('[COPY] 복사 결과:', success);

    if (success) {
      toast.success('대본이 클립보드에 복사되었습니다!');
    } else {
      toast.error('복사 중 오류가 발생했습니다. 브라우저 콘솔을 확인하세요.');
    }
  };

  // 대본 편집 시작 (관리자 전용)
  const handleEditScript = (scriptId: string, currentContent: string) => {
    setEditingScriptId(scriptId);
    setEditedContent(currentContent);
    setExpandedScriptId(scriptId); // 편집 모드 진입 시 대본 펼치기
  };

  // 대본 편집 취소
  const handleCancelEdit = () => {
    setEditingScriptId(null);
    setEditedContent('');
  };

  // 대본 저장 (관리자 전용)
  const handleSaveScript = async (scriptId: string) => {
    if (!editedContent.trim()) {
      toast.error('대본 내용이 비어있습니다.');
      return;
    }

    setIsSavingScript(true);

    try {
      const response = await fetch(`/api/scripts/${scriptId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        credentials: 'include',
        body: JSON.stringify({
          content: editedContent
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '대본 저장에 실패했습니다.');
      }

      // 로컬 상태 업데이트
      setScripts(prevScripts =>
        prevScripts.map(script =>
          script.id === scriptId
            ? { ...script, content: editedContent, updatedAt: new Date().toISOString() }
            : script
        )
      );

      toast.success('대본이 저장되었습니다!');
      setEditingScriptId(null);
      setEditedContent('');

    } catch (error: any) {
      console.error('대본 저장 오류:', error);
      toast.error(error?.message || '대본 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingScript(false);
    }
  };

  const handleCopyLogs = async (logs: string[] | undefined) => {
    if (!logs || logs.length === 0) {
      toast.error('복사할 로그가 없습니다.');
      return;
    }

    const logsText = logs.join('\n');
    const success = await safeCopyToClipboard(logsText);

    if (success) {
      toast.success('로그가 클립보드에 복사되었습니다.');
    } else {
      toast.error('로그 복사 중 오류가 발생했습니다.');
    }
  };

  const handleOpenFolder = async (jobId: string) => {
    console.log('📁 폴더 열기 버튼 클릭됨, jobId:', jobId);

    try {
      const response = await fetch(`/api/open-folder?jobId=${jobId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await safeJsonResponse(response);
      console.log('📁 폴더 열기 응답:', data);

      if (response.ok) {
        toast.success('폴더를 열었습니다.');
      } else {
        toast.error('폴더 열기 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('❌ 폴더 열기 오류:', error);
      toast.error('폴더 열기 중 오류가 발생했습니다.');
    }
  };

  // 대본 변환 함수
  const handleConvertScript = (scriptId: string, currentType: string, title: string) => {
    console.log('🔄 대본 변환 버튼 클릭됨, scriptId:', scriptId, 'currentType:', currentType);

    // 변환 가능한 타입 결정
    const conversionOptions: { value: string; label: string }[] = [];

    if (currentType === 'longform') {
      conversionOptions.push(
        { value: 'shortform', label: '숏폼 (60초)' },
        { value: 'sora2', label: 'SORA2 (3분)' }
      );
    } else if (currentType === 'shortform') {
      conversionOptions.push({ value: 'sora2', label: 'SORA2 (30초)' });
    } else {
      toast.error('이 대본은 변환할 수 없습니다.');
      return;
    }

    // 변환 모달 열기
    setConversionModal({
      scriptId,
      title,
      options: conversionOptions
    });
  };

  // 대본 변환 실행
  const executeConversion = async (targetFormat: string) => {
    if (!conversionModal) return;

    const { scriptId } = conversionModal;

    // 모달 닫기
    setConversionModal(null);

    try {
      const response = await fetch('/api/convert-format', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        credentials: 'include',
        body: JSON.stringify({
          scriptId,
          targetFormat
        })
      });

      const data = await safeJsonResponse(response);

      if (response.ok) {
        toast.success(`대본 변환이 시작되었습니다! (${targetFormat})`);

        // 목록 새로고침
        setTimeout(() => {
          fetchScripts(true);
        }, 1000);
      } else {
        toast.error('대본 변환 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('❌ 대본 변환 오류:', error);
      toast.error('대본 변환 중 오류가 발생했습니다.');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-300',
      processing: 'bg-blue-500/20 text-blue-300',
      completed: 'bg-green-500/20 text-green-300',
      failed: 'bg-red-500/20 text-red-300',
      cancelled: 'bg-gray-500/20 text-gray-300'
    };

    const labels = {
      pending: '대기 중',
      processing: '진행 중',
      completed: '완료',
      failed: '실패',
      cancelled: '취소됨'
    };

    return (
      <span className={`rounded px-2 py-1 text-xs font-semibold ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  // YouTube 설정 컴포넌트
  // YouTube 설정 컴포넌트 (다중 채널 지원)
  const YouTubeSettings = () => {
    const [channels, setChannels] = useState<any[]>([]);
    const [hasCredentials, setHasCredentials] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);

    useEffect(() => {
      loadChannels();
    }, []);

    const loadChannels = async () => {
      try {
        setIsLoading(true);
        console.log('[YouTube Settings] Loading channels...');
        const res = await fetch('/api/youtube/channels');
        console.log('[YouTube Settings] Response status:', res.status);
        const data = await res.json();
        console.log('[YouTube Settings] Response data:', data);

        if (data.channels) {
          console.log('[YouTube Settings] Found channels:', data.channels.length);
          setChannels(data.channels);
          setHasCredentials(data.hasCredentials || false);
        } else if (data.error) {
          console.error('[YouTube Settings] API error:', data.error);
        }
      } catch (error) {
        console.error('[YouTube Settings] 채널 목록 로드 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const handleAddChannel = async () => {
      if (!hasCredentials) {
        toast.error('관리자가 YouTube API Credentials를 설정하지 않았습니다.');
        return;
      }

      try {
        setIsConnecting(true);
        toast.loading('YouTube 인증 페이지로 이동 중...', { id: 'connect' });

        // OAuth URL 가져오기
        const res = await fetch('/api/youtube/oauth-start');
        const data = await res.json();

        if (data.success && data.authUrl) {
          // 현재 창에서 OAuth URL로 이동
          window.location.href = data.authUrl;
        } else {
          throw new Error(data.error || 'OAuth URL 생성 실패');
        }
      } catch (error: any) {
        toast.error(`연결 실패: ${error.message}`, { id: 'connect' });
        setIsConnecting(false);
      }
    };

    const handleRemoveChannel = async (channelId: string) => {
      if (!confirm('정말로 이 YouTube 채널 연결을 해제하시겠습니까?')) {
        return;
      }

      try {
        toast.loading('연결 해제 중...', { id: 'disconnect' });
        const res = await fetch(`/api/youtube/channels?channelId=${channelId}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
          toast.success('YouTube 연결 해제 완료', { id: 'disconnect' });
          await loadChannels();
        } else {
          throw new Error(data.error || '연결 해제 실패');
        }
      } catch (error: any) {
        toast.error(`연결 해제 실패: ${error.message}`, { id: 'disconnect' });
      }
    };

    const handleSetDefault = async (channelId: string) => {
      try {
        toast.loading('기본 채널 설정 중...', { id: 'default' });
        const res = await fetch(`/api/youtube/channels?channelId=${channelId}`, { method: 'PATCH' });
        const data = await res.json();

        if (data.success) {
          toast.success('기본 채널로 설정되었습니다', { id: 'default' });
          await loadChannels();
        } else {
          throw new Error(data.error || '설정 실패');
        }
      } catch (error: any) {
        toast.error(`설정 실패: ${error.message}`, { id: 'default' });
      }
    };

    if (isLoading) {
      return (
        <div className="p-8">
          <h2 className="text-2xl font-bold text-white mb-6">YouTube 설정</h2>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            <span className="ml-4 text-slate-300">로딩 중...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">YouTube 채널 관리</h2>
          <button
            onClick={handleAddChannel}
            disabled={!hasCredentials || isConnecting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {isConnecting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>연결 중...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                <span>채널 추가</span>
              </>
            )}
          </button>
        </div>

        {!hasCredentials && (
          <div className="p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-bold text-yellow-400 mb-2">관리자 설정 필요</h3>
                <p className="text-yellow-300/90 text-sm mb-3">
                  YouTube API Credentials가 설정되지 않았습니다.<br />
                  관리자에게 문의하여 공통 Credentials를 설정해야 YouTube 채널 연결이 가능합니다.
                </p>
                <p className="text-xs text-yellow-300/70">
                  💡 관리자는 관리자 대시보드 → YouTube Credentials 메뉴에서 설정할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {channels.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/50 rounded-lg border border-slate-700">
            <svg className="w-16 h-16 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-lg text-slate-300 mb-2">연결된 YouTube 채널이 없습니다</p>
            <p className="text-sm text-slate-400">위의 "채널 추가" 버튼을 클릭하여 YouTube 채널을 연결하세요</p>
          </div>
        ) : (
          <div className="space-y-4">
            {channels.map((channel) => (
              <div
                key={channel.id}
                className={`p-6 rounded-lg border transition ${
                  channel.isDefault
                    ? 'bg-purple-500/10 border-purple-500/50'
                    : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start gap-4">
                  {channel.thumbnailUrl && (
                    <img
                      src={channel.thumbnailUrl}
                      alt={channel.channelTitle}
                      className="w-16 h-16 rounded-full border-2 border-purple-500"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-white">{channel.channelTitle}</h3>
                      {channel.isDefault && (
                        <span className="px-2 py-0.5 bg-purple-600 text-white text-xs font-semibold rounded">
                          기본 채널
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mb-2">
                      구독자 {channel.subscriberCount?.toLocaleString() || '0'}명
                    </p>
                    {channel.description && (
                      <p className="text-sm text-slate-300 line-clamp-2">{channel.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`https://www.youtube.com/channel/${channel.channelId || channel.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      채널로 이동
                    </a>
                    {!channel.isDefault && (
                      <button
                        onClick={() => handleSetDefault(channel.id)}
                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        기본으로 설정
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveChannel(channel.id)}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      연결 해제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-400 mb-3">📖 사용 방법</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>• <strong className="text-white">채널 추가:</strong> "채널 추가" 버튼을 클릭하여 여러 YouTube 채널을 연결할 수 있습니다.</p>
            <p>• <strong className="text-white">기본 채널:</strong> 영상 업로드 시 기본적으로 사용될 채널을 설정할 수 있습니다.</p>
            <p>• <strong className="text-white">채널 선택:</strong> 영상 업로드 시 원하는 채널을 선택하여 업로드할 수 있습니다.</p>
          </div>
        </div>
      </div>
    );
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-6xl">
        {/* 탭 */}
        <div className="mb-6 flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => handleTabChange('all')}
            className={`rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📂 전체 {(total + scriptsTotal) > 0 && `(${total + scriptsTotal})`}
          </button>
          <button
            onClick={() => handleTabChange('videos')}
            className={`rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
              activeTab === 'videos'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            🎬 영상 {total > 0 && `(${total})`}
          </button>
          <button
            onClick={() => handleTabChange('scripts')}
            className={`rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
              activeTab === 'scripts'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📝 대본 {scriptsTotal > 0 && `(${scriptsTotal})`}
          </button>
          <button
            onClick={() => handleTabChange('coupang')}
            className={`rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
              activeTab === 'coupang'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            🛒 쿠팡상품 {generatedLinks.length > 0 && `(${generatedLinks.length})`}
          </button>
          <button
            onClick={() => handleTabChange('published')}
            className={`rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
              activeTab === 'published'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📺 퍼블리시 {publishedTotal > 0 && `(${publishedTotal})`}
          </button>
          <button
            onClick={() => handleTabChange('settings')}
            className={`rounded-lg px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            🎥 YouTube 설정
          </button>
        </div>

        {/* 전체 탭 콘텐츠 */}
        {activeTab === 'all' && (
          <>
            {/* 검색 */}
            <div className="mb-4 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="영상 제목, ID, 상태로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setActiveSearchQuery(searchQuery);
                    setJobs([]);
                    setOffset(0);
                    fetchJobs(true);
                  }
                }}
                className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-white placeholder-slate-400 border border-white/20 focus:border-purple-500 focus:outline-none transition"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setActiveSearchQuery(searchQuery);
                    setJobs([]);
                    setOffset(0);
                    fetchJobs(true);
                  }}
                  className="flex-1 sm:flex-none rounded-lg bg-purple-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                >
                  검색
                </button>
                {activeSearchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setActiveSearchQuery('');
                      setJobs([]);
                      setOffset(0);
                      fetchJobs(true);
                    }}
                    className="flex-1 sm:flex-none rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-500"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {/* 필터 */}
            <div className="mb-6 flex flex-wrap gap-2 sm:gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                  filter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                  filter === 'active'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                진행 중
              </button>
            </div>

            {(isLoadingScripts || isLoadingVideos) ? (
              <div className="text-center text-slate-400">로딩 중...</div>
            ) : (scripts.length === 0 && jobs.length === 0) ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
                <p className="text-slate-400">생성한 콘텐츠가 없습니다.</p>
                <Link
                  href="/"
                  className="mt-4 inline-block rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500"
                >
                  콘텐츠 생성하러 가기
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 영상과 대본을 섞어서 시간순으로 정렬 */}
                {(() => {
                  // 필터링: 진행 중 필터인 경우 pending/processing만 표시
                  const filteredJobs = filter === 'active'
                    ? jobs.filter(job => job.status === 'pending' || job.status === 'processing')
                    : jobs;
                  const filteredScripts = filter === 'active'
                    ? scripts.filter(script => script.status === 'pending' || script.status === 'processing')
                    : scripts;

                  const allItems = [
                    ...filteredJobs.map(job => ({ type: 'video' as const, data: job, date: job.createdAt })),
                    ...filteredScripts.map(script => ({ type: 'script' as const, data: script, date: script.createdAt }))
                  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  const displayedItems = allItems.slice(0, allTabLimit);
                  const hasMoreItems = allItems.length > allTabLimit;
                  const remainingItems = Math.max(0, allItems.length - allTabLimit);

                  // 개발 완료 - 디버깅 로그 제거 (개발가이드 9. 로그 관리)
                  // console.log('[전체 탭 더보기]', {
                  //   allItemsLength: allItems.length,
                  //   allTabLimit,
                  //   hasMoreItems,
                  //   remainingItems,
                  //   jobsLength: jobs.length,
                  //   scriptsLength: scripts.length
                  // });

                  return (
                    <>
                      {displayedItems.map((item) => (
                    <div
                      key={`${item.type}-${item.data.id}`}
                      id={item.type === 'video' ? `video-${item.data.id}` : `script-${item.data.id}`}
                      className="group rounded-xl border border-white/10 bg-white/5 backdrop-blur transition hover:bg-white/10 hover:border-purple-500/50 overflow-hidden"
                    >
                      {item.type === 'video' ? (
                        // 영상 카드 - 리스트 수평 레이아웃
                        <div className="flex flex-col md:flex-row gap-4 p-4">
                          {/* 썸네일 영역 - 왼쪽 */}
                          <div className="relative w-full md:w-64 h-36 flex-shrink-0 bg-slate-800/50 rounded-lg overflow-hidden">
                            {item.data.status === 'completed' && item.data.thumbnailPath ? (
                              <a
                                href={`/api/download-thumbnail?jobId=${item.data.id}`}
                                download
                                className="block w-full h-full cursor-pointer group/thumb relative"
                                title="클릭하여 썸네일 다운로드"
                              >
                                <img
                                  src={`/api/thumbnail?jobId=${item.data.id}`}
                                  alt="썸네일"
                                  className="w-full h-full object-cover"
                                />
                                {/* 다운로드 아이콘 오버레이 */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </div>
                              </a>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-500">
                                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            {/* 상태 오버레이 */}
                            {item.data.status === 'processing' && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <div className="text-center">
                                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto mb-1"></div>
                                  <p className="text-xs text-white font-semibold">{item.data.progress}%</p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 메타데이터 영역 - 중앙 */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div className="flex items-start gap-2 mb-2">
                                <h3 className="text-lg font-semibold text-white break-words line-clamp-2 flex-1">
                                  {item.data.title || item.data.id}
                                </h3>
                                {/* 타입 배지 */}
                                {item.data.type && (
                                  <span className={`px-2 py-1 rounded text-xs font-bold shadow-lg flex-shrink-0 ${
                                    item.data.type === 'shortform' ? 'bg-blue-500 text-white' :
                                    item.data.type === 'longform' ? 'bg-green-500 text-white' :
                                    item.data.type === 'product' ? 'bg-orange-500 text-white' :
                                    item.data.type === 'sora2' ? 'bg-purple-500 text-white' :
                                    'bg-gray-500 text-white'
                                  }`}>
                                    {item.data.type === 'shortform' ? '⚡ 숏폼' :
                                     item.data.type === 'longform' ? '📝 롱폼' :
                                     item.data.type === 'product' ? '🛍️ 상품' :
                                     item.data.type === 'product-info' ? '📝 상품정보' :
                                     item.data.type === 'sora2' ? '🎬 Sora2' :
                                     item.data.type}
                                  </span>
                                )}
                                {/* 재생성 배지 */}
                                {(item.data as any).isRegenerated && (
                                  <span className="px-2 py-1 rounded text-xs font-bold shadow-lg flex-shrink-0 bg-amber-500 text-white">
                                    🔄 재생성
                                  </span>
                                )}
                                {/* 상태 배지 */}
                                <div className="flex-shrink-0">
                                  {getStatusBadge(item.data.status)}
                                </div>
                              </div>
                              <div className="space-y-1 text-sm text-slate-400">
                                <p className="flex items-center gap-2">
                                  <span className="text-slate-500">•</span>
                                  <span>{item.data.step}</span>
                                </p>
                                <p className="flex items-center gap-2">
                                  <span className="text-slate-500">•</span>
                                  <span>{formatDate(item.data.createdAt)}</span>
                                </p>
                                {/* 카테고리 표시 */}
                                {(item.data as any).category && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span className="inline-flex items-center gap-1">
                                      <span className="text-purple-400">🎭</span>
                                      <span className="text-purple-300 font-medium">{(item.data as any).category}</span>
                                    </span>
                                  </p>
                                )}
                                {/* From 링크 (대본에서 생성된 영상인 경우) */}
                                {item.data.sourceContentId && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span>
                                      From:{' '}
                                      <button
                                        onClick={() => {
                                          // Scripts 탭으로 이동
                                          setActiveTab('scripts');
                                          // 약간의 지연 후 스크롤
                                          setTimeout(() => {
                                            const sourceElement = document.getElementById(`script-${item.data.sourceContentId}`);
                                            if (sourceElement) {
                                              sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                              sourceElement.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                              setTimeout(() => {
                                                sourceElement.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                              }, 2000);
                                            } else {
                                              toast.error('원본 대본을 찾을 수 없습니다.');
                                            }
                                          }, 100);
                                        }}
                                        className="text-purple-400 hover:text-purple-300 underline cursor-pointer transition"
                                      >
                                        원본 대본 보기 🔗
                                      </button>
                                    </span>
                                  </p>
                                )}
                                {/* 쇼츠 변환으로 생성된 경우 원본 영상 링크 */}
                                {(item.data as any).convertedFromJobId && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span>
                                      From:{' '}
                                      <button
                                        onClick={() => {
                                          const sourceElement = document.getElementById(`video-${(item.data as any).convertedFromJobId}`);
                                          if (sourceElement) {
                                            sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            sourceElement.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                            setTimeout(() => {
                                              sourceElement.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                            }, 2000);
                                          } else {
                                            toast.error('원본 영상을 찾을 수 없습니다.');
                                          }
                                        }}
                                        className="text-purple-400 hover:text-purple-300 underline cursor-pointer transition"
                                      >
                                        원본 롱폼 보기 🔗
                                      </button>
                                    </span>
                                  </p>
                                )}
                                {/* 영상 병합으로 생성된 경우 대본 보기 */}
                                {!item.data.sourceContentId && !(item.data as any).convertedFromJobId && item.data.videoPath && (item.data.videoPath.includes('output/merge_') || item.data.videoPath.includes('output\\merge_')) && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span>
                                      <button
                                        onClick={async () => {
                                          try {
                                            const res = await fetch(`/api/jobs/${item.data.id}/script`, {
                                              headers: getAuthHeaders()
                                            });

                                            if (!res.ok) {
                                              const error = await res.json();
                                              toast.error(error.error || '대본을 불러올 수 없습니다.');
                                              return;
                                            }

                                            const data = await res.json();

                                            // 대본을 새 창에 표시하거나 다운로드
                                            const blob = new Blob([data.script], { type: 'application/json' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `${data.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '_')}_story.json`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);

                                            toast.success('대본 다운로드 완료');
                                          } catch (error: any) {
                                            console.error('대본 조회 실패:', error);
                                            toast.error('대본을 불러올 수 없습니다.');
                                          }
                                        }}
                                        className="text-purple-400 hover:text-purple-300 underline cursor-pointer transition"
                                      >
                                        대본 다운로드 📥
                                      </button>
                                    </span>
                                  </p>
                                )}
                                {item.data.updatedAt !== item.data.createdAt && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span className="text-xs">업데이트: {formatDate(item.data.updatedAt)}</span>
                                  </p>
                                )}
                              </div>
                              {item.data.status === 'processing' && (
                                <div className="mt-3">
                                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                                    <span>{item.data.step}</span>
                                    <span>{item.data.progress}%</span>
                                  </div>
                                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                    <div
                                      className="h-full bg-purple-500 transition-all duration-300"
                                      style={{ width: `${item.data.progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              {item.data.error && (
                                <ErrorMessage message={item.data.error} />
                              )}
                            </div>

                            {/* 버튼 영역 - 하단 또는 오른쪽 */}
                            <div className="flex flex-wrap gap-2 mt-4">
                            {(item.data.status === 'pending' || item.data.status === 'processing') && (
                              <>
                                {user?.isAdmin && (
                                  <button
                                    onClick={() => handleOpenFolder(item.data.id)}
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer"
                                    title="폴더 열기"
                                  >
                                    📁 폴더
                                  </button>
                                )}
                                <button
                                  onClick={() => setExpandedLogJobId(expandedLogJobId === item.data.id ? null : item.data.id)}
                                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer"
                                >
                                  {expandedLogJobId === item.data.id ? '📋 닫기' : '📋 로그'}
                                </button>
                                <button
                                  onClick={() => handleCancelJob(item.data.id)}
                                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer"
                                >
                                  🛑 중지
                                </button>
                              </>
                            )}
                            {item.data.status === 'completed' && item.data.videoPath && (
                              <>
                                {/* === 보기 === */}
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedLogJobId(expandedLogJobId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                    title="로그 보기"
                                  >
                                    {expandedLogJobId === item.data.id ? '📋 닫기' : `📋 로그`}
                                  </button>
                                )}
                                {user?.isAdmin && (
                                  <button
                                    onClick={() => handleOpenFolder(item.data.id)}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                                    title="폴더 열기"
                                  >
                                    📁 폴더
                                  </button>
                                )}

                                {/* 구분선 */}
                                <div className="w-px h-8 bg-slate-600"></div>

                                {/* === 제작 === */}
                                <YouTubeUploadButton
                                  videoPath={item.data.videoPath}
                                  thumbnailPath={item.data.thumbnailPath}
                                  defaultTitle={item.data.title || ''}
                                  jobId={item.data.id}
                                />
                                {item.data.sourceContentId && (() => {
                                  const sourceScript = scripts.find(s => s.id === item.data.sourceContentId);
                                  return sourceScript && sourceScript.content ? (
                                    <button
                                      onClick={() => handleSpeak(item.data.id, sourceScript.content)}
                                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition cursor-pointer whitespace-nowrap ${
                                        speakingId === item.data.id
                                          ? 'bg-red-600 hover:bg-red-500'
                                          : 'bg-indigo-600 hover:bg-indigo-500'
                                      }`}
                                      title={speakingId === item.data.id ? '읽기 중지' : '나레이션 읽어보기'}
                                    >
                                      {speakingId === item.data.id ? '⏹️ 중지' : '🔊 읽어보기'}
                                    </button>
                                  ) : null;
                                })()}

                                {/* 구분선 */}
                                <div className="w-px h-8 bg-slate-600"></div>

                                {/* === 편집 === */}
                                <a
                                  href={`/api/download-video?jobId=${item.data.id}`}
                                  download
                                  className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                                  title="영상 다운로드"
                                >
                                  📥 다운로드
                                </a>
                                {/* 쇼츠 버튼: 롱폼 영상에만 표시 */}
                                {item.data.type === 'longform' && (
                                  <button
                                    onClick={() => handleConvertToShorts(item.data.id, item.data.title || '제목 없음')}
                                    disabled={convertingJobs.has(item.data.id)}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition whitespace-nowrap ${
                                      convertingJobs.has(item.data.id)
                                        ? 'bg-purple-400 cursor-not-allowed opacity-60'
                                        : 'bg-purple-600 hover:bg-purple-500 cursor-pointer'
                                    }`}
                                    title={convertingJobs.has(item.data.id) ? '변환 중...' : '쇼츠로 변환 (200 크레딧)'}
                                  >
                                    {convertingJobs.has(item.data.id) ? '⏳ 변환 중...' : '⚡ 쇼츠'}
                                  </button>
                                )}
                                {/* 숏폼 버튼: 롱폼 영상에만 표시 */}
                                {item.data.type === 'longform' && (
                                  <button
                                    onClick={() => handleConvertToShortform(item.data.id, item.data.title || '제목 없음')}
                                    disabled={convertingJobs.has(item.data.id)}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition whitespace-nowrap ${
                                      convertingJobs.has(item.data.id)
                                        ? 'bg-blue-400 cursor-not-allowed opacity-60'
                                        : 'bg-blue-600 hover:bg-blue-500 cursor-pointer'
                                    }`}
                                    title={convertingJobs.has(item.data.id) ? '변환 중...' : '숏폼으로 변환 (200 크레딧)'}
                                  >
                                    {convertingJobs.has(item.data.id) ? '⏳ 변환 중...' : '📱 숏폼'}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleRestartVideo(item.data.id)}
                                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-500 cursor-pointer whitespace-nowrap"
                                  title="영상 재생성"
                                >
                                  🔄 재시도
                                </button>
                                <button
                                  onClick={() => handleDeleteVideo(item.data.id, item.data.title || item.data.id)}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                                  title="영상 삭제"
                                >
                                  🗑️ 삭제
                                </button>
                              </>
                            )}
                            {(item.data.status === 'failed' || (item.data.status as any) === 'cancelled') && (
                              <>
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedLogJobId(expandedLogJobId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer"
                                    title="로그 보기"
                                  >
                                    {expandedLogJobId === item.data.id ? '📋 닫기' : '📋 로그'}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleRestartVideo(item.data.id)}
                                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer"
                                  title="재시도"
                                >
                                  🔄 재시도
                                </button>
                                <button
                                  onClick={() => handleDeleteVideo(item.data.id, item.data.title || item.data.id)}
                                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer"
                                >
                                  🗑️ 삭제
                                </button>
                              </>
                            )}
                            </div>

                            {/* 작은 로그창 제거 - 큰 로그창(3096 라인)만 사용 */}
                          </div>
                        </div>
                      ) : (
                        // 대본 카드 - 대본 탭과 동일한 레이아웃
                        <div className="p-4">
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div className="flex items-start gap-2 mb-2">
                                <span className="text-2xl flex-shrink-0">📝</span>
                                <h3 className="text-lg font-semibold text-white break-words line-clamp-2 flex-1">
                                  {item.data.title}
                                </h3>
                                {/* 타입 배지 */}
                                {item.data.type && (
                                  <span className={`px-2 py-1 rounded text-xs font-bold shadow-lg flex-shrink-0 ${
                                    item.data.type === 'shortform' ? 'bg-blue-500 text-white' :
                                    item.data.type === 'longform' ? 'bg-green-500 text-white' :
                                    item.data.type === 'product' ? 'bg-orange-500 text-white' :
                                    item.data.type === 'sora2' ? 'bg-purple-500 text-white' :
                                    'bg-gray-500 text-white'
                                  }`}>
                                    {item.data.type === 'shortform' ? '⚡ 숏폼' :
                                     item.data.type === 'longform' ? '📝 롱폼' :
                                     item.data.type === 'product' ? '🛍️ 상품' :
                                     item.data.type === 'product-info' ? '📝 상품정보' :
                                     item.data.type === 'sora2' ? '🎬 Sora2' :
                                     item.data.type}
                                  </span>
                                )}
                                {/* 재생성 배지 */}
                                {(item.data as any).isRegenerated && (
                                  <span className="px-2 py-1 rounded text-xs font-bold shadow-lg flex-shrink-0 bg-amber-500 text-white">
                                    🔄 재생성
                                  </span>
                                )}
                                {/* 상태 배지 */}
                                <div className="flex-shrink-0">
                                  {getStatusBadge(item.data.status)}
                                </div>
                                {/* 자동화 큐 배지 */}
                                {(item.data as Script).automationQueue?.inQueue && (
                                  <span className={`px-2 py-1 rounded text-xs font-bold shadow-lg flex-shrink-0 ${
                                    (item.data as Script).automationQueue?.queueStatus === 'pending' ? 'bg-yellow-500 text-black' :
                                    (item.data as Script).automationQueue?.queueStatus === 'processing' ? 'bg-blue-500 text-white' :
                                    (item.data as Script).automationQueue?.queueStatus === 'waiting_for_upload' ? 'bg-purple-500 text-white' :
                                    (item.data as Script).automationQueue?.queueStatus === 'cancelled' ? 'bg-gray-500 text-white' :
                                    'bg-green-500 text-white'
                                  }`}>
                                    {(item.data as Script).automationQueue?.queueStatus === 'pending' ? '⏳ 큐 대기' :
                                     (item.data as Script).automationQueue?.queueStatus === 'processing' ? '⚙️ 자동화 중' :
                                     (item.data as Script).automationQueue?.queueStatus === 'waiting_for_upload' ? '📤 업로드 대기' :
                                     (item.data as Script).automationQueue?.queueStatus === 'cancelled' ? '❌ 큐 취소됨' :
                                     '✅ 자동화 완료'}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1 text-sm text-slate-400">
                                <p className="flex items-center gap-2">
                                  <span className="text-slate-500">•</span>
                                  <span>대본 생성</span>
                                </p>
                                <p className="flex items-center gap-2">
                                  <span className="text-slate-500">•</span>
                                  <span>{formatDate(item.data.createdAt)}</span>
                                </p>
                                {/* 카테고리 표시 */}
                                {(item.data as any).category && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span className="inline-flex items-center gap-1">
                                      <span className="text-purple-400">🎭</span>
                                      <span className="text-purple-300 font-medium">{(item.data as any).category}</span>
                                    </span>
                                  </p>
                                )}
                                {/* From 링크 (변환된 대본인 경우) */}
                                {item.data.sourceContentId && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span>
                                      From:{' '}
                                      <button
                                        onClick={() => {
                                          // Scripts 탭으로 이동
                                          setActiveTab('scripts');
                                          // 약간의 지연 후 스크롤
                                          setTimeout(() => {
                                            const sourceElement = document.getElementById(`script-${item.data.sourceContentId}`);
                                            if (sourceElement) {
                                              sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                              sourceElement.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                              setTimeout(() => {
                                                sourceElement.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                              }, 2000);
                                            } else {
                                              toast.error('원본 대본을 찾을 수 없습니다.');
                                            }
                                          }, 100);
                                        }}
                                        className="text-purple-400 hover:text-purple-300 underline cursor-pointer transition"
                                      >
                                        원본 대본 보기 🔗
                                      </button>
                                      {item.data.conversionType && (
                                        <span className="ml-1 text-xs text-slate-500">
                                          ({item.data.conversionType})
                                        </span>
                                      )}
                                    </span>
                                  </p>
                                )}
                                {item.data.status === 'completed' && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span>길이: {item.data.content.length.toLocaleString()}자</span>
                                  </p>
                                )}
                              </div>

                              {/* 버튼 영역 - 길이 정보 바로 다음 */}
                              <div className="flex flex-wrap gap-2 mt-2">
                              {(item.data.status === 'pending' || item.data.status === 'processing') && (
                                <>
                                  <button
                                    onClick={() => setExpandedScriptLogId(expandedScriptLogId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                    title="로그 보기"
                                  >
                                    {expandedScriptLogId === item.data.id ? '📋 닫기' : '📋 로그'}
                                  </button>
                                  <button
                                    onClick={() => handleCancelScript(item.data.id, item.data.title)}
                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                                  >
                                    🛑 중지
                                  </button>
                                </>
                              )}
                              {item.data.status === 'completed' && (
                                <>
                                  {/* === 보기 === */}
                                  <button
                                    onClick={() => setExpandedScriptLogId(expandedScriptLogId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                    title="로그 보기"
                                  >
                                    {expandedScriptLogId === item.data.id ? '📋 닫기' : `📋 로그`}
                                  </button>
                                  <button
                                    onClick={() => toggleContent(item.data.id)}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                                  >
                                    {expandedScriptId === item.data.id ? '📄 닫기' : '📖 대본'}
                                  </button>
                                  <button
                                    onClick={() => handleSpeak(item.data.id, item.data.content)}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition cursor-pointer whitespace-nowrap ${
                                      speakingId === item.data.id
                                        ? 'bg-red-600 hover:bg-red-500'
                                        : 'bg-indigo-600 hover:bg-indigo-500'
                                    }`}
                                    title={speakingId === item.data.id ? '읽기 중지' : '나레이션 읽어보기'}
                                  >
                                    {speakingId === item.data.id ? '⏹️ 중지' : '🔊 읽어보기'}
                                  </button>

                                  {/* 구분선 */}
                                  <div className="w-px h-8 bg-slate-600"></div>

                                  {/* === 제작 === */}
                                  {user?.isAdmin && !isMobile && (
                                    <button
                                      onClick={() => handleImageCrawling(item.data.id, '')}
                                      className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-500 cursor-pointer whitespace-nowrap"
                                      title="이미지 생성"
                                    >
                                      🎨 이미지크롤링
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                      console.log('🎬 [내 콘텐츠] 영상 제작 버튼 클릭됨');
                                      console.log('📝 대본 제목:', item.data.title);

                                      // JSON 파싱 후 메인 페이지로 이동하며 파이프라인 시작
                                      try {
                                        // 마크다운 코드 블록 제거
                                        const formattedContent = await formatScriptContent(item.data.id, item.data.content, { showToast: false });
                                        let content = formattedContent
                                          .replace(/^```json\s*/i, '')
                                          .replace(/\s*```\s*$/i, '')
                                          .trim();

                                        // { 이전의 모든 텍스트 제거 (Claude가 추가한 설명 텍스트 제거)
                                        const jsonStart = content.indexOf('{');
                                        if (jsonStart > 0) {
                                          console.log('⚠️ JSON 시작 전 텍스트 발견, 제거 중...');
                                          content = content.substring(jsonStart);
                                        }

                                        console.log('📄 원본 content 길이:', item.data.content.length);
                                        console.log('📄 정제된 content 길이:', content.length);

                                        // JSON 파싱 (유틸리티 함수 사용)
                                        const parseResult = parseJsonSafely(content);

                                        if (!parseResult.success) {
                                          throw new Error(parseResult.error || 'JSON 파싱 실패');
                                        }

                                        const scriptJson = parseResult.data;

                                        if (parseResult.fixed) {
                                          console.log('⚠️ JSON 자동 수정이 적용되었습니다');
                                        }

                                        console.log('📦 파싱된 JSON:', {
                                          title: scriptJson.title,
                                          scenesCount: scriptJson.scenes?.length
                                        });

                                        // 로컬 스토리지에 저장 (포맷 타입 포함)
                                        const pipelineData = {
                                          title: item.data.title,
                                          content: scriptJson,
                                          type: item.data.type || 'longform' // 기본값은 longform
                                        };
                                        localStorage.setItem('pipelineScript', JSON.stringify(pipelineData));
                                        console.log('💾 localStorage에 저장 완료');
                                        console.log('📦 저장된 데이터:', pipelineData);

                                        // 메인 페이지로 이동
                                        console.log('🔄 메인 페이지로 이동 시작...');
                                        window.location.href = '/';
                                      } catch (error) {
                                        console.error('❌ 영상 제작 실패:', error);
                                        alert('JSON 파싱 오류: ' + error);
                                      }
                                    }}
                                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                  >
                                    🎬 영상제작
                                  </button>
                                  {item.data.type === 'product' && (
                                    <button
                                      onClick={() => {
                                        // 메인 페이지로 이동하면서 상품정보 대본 생성 트리거
                                        window.location.href = `/?promptType=product-info&generateProductInfo=${item.data.id}`;
                                      }}
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 cursor-pointer whitespace-nowrap"
                                      title="상품 기입 정보 생성 (YouTube/릴스용)"
                                    >
                                      🛍️ 상품정보
                                    </button>
                                  )}

                                  {/* 구분선 */}
                                  <div className="w-px h-8 bg-slate-600"></div>

                                  {/* === 편집 === */}
                                  <button
                                    onClick={() => handleCopyScript(item.data.content, item.data.title)}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                                    title="대본 복사"
                                  >
                                    📋 복사
                                  </button>
                                  <button
                                    onClick={() => formatScriptContent(item.data.id, item.data.content)}
                                    disabled={isScriptFormatting(item.data.id)}
                                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition whitespace-nowrap ${
                                      isScriptFormatting(item.data.id)
                                        ? 'bg-pink-600/60 cursor-not-allowed'
                                        : 'bg-pink-600 hover:bg-pink-500 cursor-pointer'
                                    }`}
                                    title="JSON 포멧팅"
                                  >
                                    {isScriptFormatting(item.data.id) ? '✨ 포멧팅 중...' : '✨ 포멧팅'}
                                  </button>
                                  <button
                                    onClick={() => handleDownload(item.data.id)}
                                    className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                                    title="대본 다운로드"
                                  >
                                    📥 다운로드
                                  </button>
                                  {/* 변환 버튼: longform/shortform 타입에만 표시 */}
                                  {(item.data.type === 'longform' || item.data.type === 'shortform') && (
                                    <button
                                      onClick={() => handleConvertScript(item.data.id, item.data.type || 'longform', item.data.title)}
                                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-500 cursor-pointer whitespace-nowrap"
                                      title={item.data.type === 'longform' ? '쇼츠로 변환' : '롱폼으로 변환'}
                                    >
                                      🔄 변환
                                    </button>
                                  )}
                                  {user?.isAdmin && (
                                    <button
                                      onClick={() => editingScriptId === item.data.id ? handleCancelEdit() : handleEditScript(item.data.id, item.data.content)}
                                      className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                      title={editingScriptId === item.data.id ? "편집 닫기" : "대본 편집 (관리자 전용)"}
                                    >
                                      {editingScriptId === item.data.id ? '✕ 닫기' : '✏️ 편집'}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleRestartScript(item.data.id, item.data.title)}
                                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-500 cursor-pointer whitespace-nowrap"
                                    title="대본 재생성"
                                  >
                                    🔄 재시도
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log('🔴 삭제 버튼 클릭됨 (All 탭)');
                                      handleDeleteScript(item.data.id, item.data.title);
                                    }}
                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                                    title="대본 삭제"
                                  >
                                    🗑️ 삭제
                                  </button>
                                </>
                              )}
                              {(item.data.status === 'failed' || (item.data.status as any) === 'cancelled') && (
                                <>
                                  <button
                                    onClick={() => setExpandedScriptLogId(expandedScriptLogId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                    title="로그 보기"
                                  >
                                    {expandedScriptLogId === item.data.id ? '📋 닫기' : '📋 로그'}
                                  </button>
                                  <button
                                    onClick={() => handleRestartScript(item.data.id, item.data.title)}
                                    className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                                    title="재시도"
                                  >
                                    🔄 재시도
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDeleteScript(item.data.id, item.data.title);
                                    }}
                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                                  >
                                    🗑️ 삭제
                                  </button>
                                </>
                              )}
                              {/* completed 상태 로그 표시 */}
                              {item.data.status === 'completed' && expandedScriptLogId === item.data.id && (
                                <div className="mb-3 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                                  {!item.data.logs || item.data.logs.length === 0 ? (
                                    <p className="text-sm text-slate-400">로그가 없습니다.</p>
                                  ) : (
                                    <div className="max-h-96 overflow-y-auto space-y-1">
                                      {item.data.logs.map((log: any, idx: number) => {
                                        const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                                        const logTimestamp = typeof log === 'object' && log !== null && log.timestamp ? log.timestamp : new Date().toISOString();

                                        return (
                                          <div key={idx} className="text-sm text-slate-300 font-mono">
                                            <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                            {logMessage}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* failed/cancelled 상태 로그 표시 */}
                              {(item.data.status === 'failed' || (item.data.status as any) === 'cancelled') && expandedScriptLogId === item.data.id && (
                                <div className="mb-3 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                                  {!item.data.logs || item.data.logs.length === 0 ? (
                                    <p className="text-sm text-slate-400">로그가 없습니다.</p>
                                  ) : (
                                    <div className="max-h-96 overflow-y-auto space-y-1">
                                      {item.data.logs.map((log: any, idx: number) => {
                                        const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                                        const logTimestamp = typeof log === 'object' && log !== null && log.timestamp ? log.timestamp : new Date().toISOString();

                                        return (
                                          <div key={idx} className="text-sm text-slate-300 font-mono">
                                            <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                            {logMessage}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                              {/* 진행 중 상태 표시 */}
                              {item.data.status === 'processing' && (
                              <>
                                <div className="mb-3">
                                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                                    <span>대본 생성 중...</span>
                                    <span>{item.data.progress}%</span>
                                  </div>
                                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                    <div
                                      className="h-full bg-emerald-500 transition-all duration-300"
                                      style={{ width: `${item.data.progress}%` }}
                                    />
                                  </div>
                                </div>

                                {/* 로그 표시 - 로그 버튼을 눌렀을 때만 표시 */}
                                {expandedScriptLogId === item.data.id && (
                                  <div className="mb-3 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                                    {!item.data.logs || item.data.logs.length === 0 ? (
                                      <p className="text-sm text-slate-400">로그가 없습니다.</p>
                                    ) : (
                                      <div
                                        ref={(el) => {
                                          if (el) {
                                            scriptLogRefs.current.set(item.data.id, el);
                                          } else {
                                            scriptLogRefs.current.delete(item.data.id);
                                          }
                                        }}
                                        className="max-h-96 overflow-y-auto space-y-1"
                                      >
                                        {item.data.logs.map((log: any, idx: number) => {
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
                                            ref={(el) => {
                                              // 마지막 로그 항목에만 ref 추가
                                              if (idx === item.data.logs!.length - 1 && el) {
                                                scriptLastLogRefs.current.set(item.data.id, el);
                                              }
                                            }}
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
                              </>
                              )}

                              {/* 에러 상태 */}
                              {item.data.error && (
                                <ErrorMessage message={item.data.error} />
                              )}
                            </div>
                        </div>
                          </div>
                      )}

                      {/* 대본 펼친 내용 또는 편집 모드 */}
                      {item.type === 'script' && expandedScriptId === item.data.id && (
                        <>
                          {editingScriptId === item.data.id ? (
                            /* 편집 모드 (확장 상태) */
                            <div className="mt-4 space-y-3">
                              <textarea
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                className="w-full h-96 rounded-lg border border-purple-500 bg-slate-900 p-4 text-sm text-slate-300 font-mono leading-relaxed focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-y"
                                placeholder="대본 내용을 입력하세요..."
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveScript(item.data.id)}
                                  disabled={isSavingScript}
                                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isSavingScript ? '⏳ 저장 중...' : '💾 저장'}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={isSavingScript}
                                  className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  ✕ 취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* 일반 전체보기 */
                            <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                              <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">
                                {item.data.content}
                              </pre>
                            </div>
                          )}
                        </>
                      )}

                      {/* 영상 로그 */}
                      {item.type === 'video' && expandedLogJobId === item.data.id && item.data.logs && item.data.logs.length > 0 && (
                        <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-300">📋 서버 로그</span>
                            <span className="text-sm text-slate-400">{item.data.logs.length}개 항목</span>
                          </div>
                          <div
                            ref={(el) => {
                              if (el) {
                                jobLogRefs.current.set(item.data.id, el);
                              } else {
                                jobLogRefs.current.delete(item.data.id);
                              }
                            }}
                            className="h-[500px] overflow-y-auto rounded bg-black/60 p-4 font-mono text-sm leading-relaxed"
                          >
                            {item.data.logs.map((log: any, idx: number) => (
                              <div key={idx} className="text-green-400 whitespace-pre-wrap break-all mb-2">
                                {typeof log === 'string' ? log : log.message || JSON.stringify(log)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 더보기 버튼 */}
                  {(hasMoreItems || hasMore || scriptsHasMore) && (
                    <div className="mt-6 text-center">
                      <button
                        onClick={() => {
                          console.log('[더보기 클릭] 전체 탭', {
                            이전limit: allTabLimit,
                            새limit: allTabLimit + 10,
                            hasMore,
                            scriptsHasMore,
                            jobsLength: jobs.length,
                            scriptsLength: scripts.length
                          });

                          // limit 증가
                          setAllTabLimit(prev => prev + 20);

                          // 서버에서 더 많은 데이터 가져오기
                          if (hasMore && !isLoadingMore) {
                            console.log('[전체 탭] 영상 더 가져오기');
                            fetchJobs(false);
                          }
                          if (scriptsHasMore && !isLoadingMoreScripts) {
                            console.log('[전체 탭] 대본 더 가져오기');
                            fetchScripts(false);
                          }
                        }}
                        disabled={isLoadingMore || isLoadingMoreScripts}
                        className="rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoadingMore || isLoadingMoreScripts ? '로딩 중...' : `더보기 (${displayedItems.length}/${scriptsTotal + total})`}
                      </button>
                    </div>
                  )}
                </>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* 대본 탭 콘텐츠 */}
        {activeTab === 'scripts' && (
          <>
            {/* 검색 */}
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                placeholder="대본 제목으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Enter 키로도 검색 가능
                    e.currentTarget.blur();
                  }
                }}
                className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-white placeholder-slate-400 border border-white/20 focus:border-purple-500 focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-500"
                >
                  초기화
                </button>
              )}
            </div>

            {/* 필터 */}
            <div className="mb-6 flex flex-wrap gap-2 sm:gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                  filter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                  filter === 'active'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                진행 중
              </button>
            </div>

            {(() => {
              const filteredScripts = scripts.filter(script => {
                if (filter === 'active') {
                  return script.status === 'pending' || script.status === 'processing';
                }
                return true;
              });

              if (isLoadingScripts) {
                return <div className="text-center text-slate-400">로딩 중...</div>;
              }

              if (filteredScripts.length === 0) {
                return (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
                    <p className="text-slate-400">
                      {filter === 'active' ? '진행 중인 대본이 없습니다.' : '생성한 대본이 없습니다.'}
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
                );
              }

              return (
                <div className="space-y-4">
                  {filteredScripts.slice(0, scriptsTabLimit).map((script) => (
                  <div
                    key={script.id}
                    id={`script-${script.id}`}
                    className="group rounded-xl border border-white/10 bg-white/5 backdrop-blur transition hover:bg-white/10 hover:border-purple-500/50 overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-2xl flex-shrink-0">📝</span>
                            <h3 className="text-lg font-semibold text-white break-words line-clamp-2 flex-1">
                              {script.title}
                            </h3>
                            {/* 타입 배지 */}
                            {script.type && (
                              <span className={`px-2 py-1 rounded text-xs font-bold shadow-lg flex-shrink-0 ${
                                script.type === 'shortform' ? 'bg-blue-500 text-white' :
                                script.type === 'longform' ? 'bg-green-500 text-white' :
                                script.type === 'product' ? 'bg-orange-500 text-white' :
                                'bg-purple-500 text-white'
                              }`}>
                                {script.type === 'shortform' ? '⚡ 숏폼' :
                                 script.type === 'longform' ? '📝 롱폼' :
                                 script.type === 'product' ? '🛍️ 상품' :
                                 script.type === 'product-info' ? '📝 상품정보' :
                                 '🎬 Sora2'}
                              </span>
                            )}
                            {/* 재생성 배지 */}
                            {script.isRegenerated && (
                              <span className="px-2 py-1 rounded text-xs font-bold shadow-lg flex-shrink-0 bg-amber-500 text-white">
                                🔄 재생성
                              </span>
                            )}
                            {/* 상태 배지 */}
                            <div className="flex-shrink-0">
                              {getStatusBadge(script.status)}
                            </div>
                          </div>
                          <div className="space-y-1 text-sm text-slate-400">
                            <p className="flex items-center gap-2">
                              <span className="text-slate-500">•</span>
                              <span>{formatDate(script.createdAt)}</span>
                            </p>
                            {/* 카테고리 표시 */}
                            {(script as any).category && (
                              <p className="flex items-center gap-2">
                                <span className="text-slate-500">•</span>
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-purple-400">🎭</span>
                                  <span className="text-purple-300 font-medium">{(script as any).category}</span>
                                </span>
                              </p>
                            )}
                            {/* From 링크 (변환된 대본인 경우) */}
                            {script.sourceContentId && (
                              <p className="flex items-center gap-2">
                                <span className="text-slate-500">•</span>
                                <span>
                                  From:{' '}
                                  <button
                                    onClick={() => {
                                      const sourceElement = document.getElementById(`script-${script.sourceContentId}`);
                                      if (sourceElement) {
                                        sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        sourceElement.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                        setTimeout(() => {
                                          sourceElement.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                        }, 2000);
                                      } else {
                                        toast.error('원본 대본을 찾을 수 없습니다.');
                                      }
                                    }}
                                    className="text-purple-400 hover:text-purple-300 underline cursor-pointer transition"
                                  >
                                    원본 대본 보기 🔗
                                  </button>
                                  {script.conversionType && (
                                    <span className="ml-1 text-xs text-slate-500">
                                      ({script.conversionType})
                                    </span>
                                  )}
                                </span>
                              </p>
                            )}
                            {script.status === 'completed' && (
                              <p className="flex items-center gap-2">
                                <span className="text-slate-500">•</span>
                                <span>길이: {script.content.length.toLocaleString()}자</span>
                              </p>
                            )}
                          </div>

                        {/* 버튼 영역 - 길이 정보 바로 다음 */}
                        <div className="flex flex-wrap gap-2 mt-2">
                        {(script.status === 'pending' || script.status === 'processing') && (
                          <>
                            {script.logs && script.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedScriptLogId(expandedScriptLogId === script.id ? null : script.id)}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                              >
                                {expandedScriptLogId === script.id ? '📋 로그 닫기' : '📋 로그'}
                              </button>
                            )}
                            <button
                              onClick={() => handleCancelScript(script.id, script.title)}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                            >
                              🛑 중지
                            </button>
                          </>
                        )}
                        {script.status === 'completed' && (
                          <>
                            {/* === 보기 === */}
                            {script.logs && script.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedScriptLogId(expandedScriptLogId === script.id ? null : script.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title="로그 보기"
                              >
                                {expandedScriptLogId === script.id ? '📋 닫기' : `📋 로그`}
                              </button>
                            )}
                            <button
                              onClick={() => toggleContent(script.id)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                            >
                              {expandedScriptId === script.id ? '📄 닫기' : '📖 대본'}
                            </button>
                            <button
                              onClick={() => handleSpeak(script.id, script.content)}
                              className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition cursor-pointer whitespace-nowrap ${
                                speakingId === script.id
                                  ? 'bg-red-600 hover:bg-red-500'
                                  : 'bg-indigo-600 hover:bg-indigo-500'
                              }`}
                              title={speakingId === script.id ? '읽기 중지' : '나레이션 읽어보기'}
                            >
                              {speakingId === script.id ? '⏹️ 중지' : '🔊 읽어보기'}
                            </button>

                            {/* 구분선 */}
                            <div className="w-px h-8 bg-slate-600"></div>

                            {/* === 제작 === */}
                            {user?.isAdmin && !isMobile && (
                              <button
                                onClick={() => handleImageCrawling(script.id, '')}
                                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-500 cursor-pointer whitespace-nowrap"
                                title="이미지 생성"
                              >
                                🎨 이미지크롤링
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                console.log('🎬 [대본 탭] 영상 제작 버튼 클릭됨');
                                console.log('📝 대본 제목:', script.title);

                                // JSON 파싱 후 메인 페이지로 이동하며 파이프라인 시작
                                try {
                                  // 마크다운 코드 블록 제거
                                  const formattedContent = await formatScriptContent(script.id, script.content, { showToast: false });
                                  let content = formattedContent
                                    .replace(/^```json\s*/i, '')
                                    .replace(/\s*```\s*$/i, '')
                                    .trim();

                                  // { 이전의 모든 텍스트 제거 (Claude가 추가한 설명 텍스트 제거)
                                  const jsonStart = content.indexOf('{');
                                  if (jsonStart > 0) {
                                    console.log('⚠️ JSON 시작 전 텍스트 발견, 제거 중...');
                                    content = content.substring(jsonStart);
                                  }

                                  console.log('📄 원본 content 길이:', script.content.length);
                                  console.log('📄 정제된 content 길이:', content.length);

                                  let scriptJson;
                                  try {
                                    scriptJson = JSON.parse(content);
                                    console.log('✅ JSON 파싱 성공 (첫 시도)');
                                  } catch (firstError) {
                                    console.warn('⚠️ JSON 파싱 실패, 자동 수정 시도 중...', firstError);

                                    try {
                                      // 0. 코드 블록 마커와 { 이전의 모든 텍스트 제거
                                      let fixed = content;

                                      // ```json 또는 json 같은 코드 블록 마커 제거
                                      fixed = fixed.replace(/^[\s\S]*?```json\s*/i, '');
                                      fixed = fixed.replace(/^[\s\S]*?```\s*/i, '');

                                      // {"title" 패턴을 찾아서 그 이전의 모든 텍스트 제거 (가장 정확한 방법)
                                      // \s*는 공백, 탭, 줄바꿈(\n, \r) 모두 포함
                                      const titleMatch = fixed.match(/\{\s*"title"/);
                                      if (titleMatch && titleMatch.index !== undefined && titleMatch.index > 0) {
                                        fixed = fixed.substring(titleMatch.index);
                                        console.log('✅ {"title" 패턴으로 JSON 시작점 발견 (위치:', titleMatch.index, ')');
                                      } else {
                                        // fallback: { 이전의 모든 텍스트 제거 (설명, "json", "I'll generate" 등)
                                        const firstBrace = fixed.indexOf('{');
                                        if (firstBrace > 0) {
                                          fixed = fixed.substring(firstBrace);
                                          console.log('⚠️ fallback: { 로 JSON 시작 (위치:', firstBrace, ')');
                                        }
                                      }

                                      // 마지막 } 이후의 모든 텍스트 제거 (``` 등)
                                      const lastBrace = fixed.lastIndexOf('}');
                                      if (lastBrace > 0 && lastBrace < fixed.length - 1) {
                                        fixed = fixed.substring(0, lastBrace + 1);
                                      }

                                      // 1. 이미 이스케이프된 따옴표를 임시 토큰으로 보호
                                      fixed = fixed.replace(/\\"/g, '__ESC_QUOTE__');

                                      // 2. title 필드의 값 내부에 있는 이스케이프 안 된 따옴표 수정
                                      fixed = fixed.replace(
                                        /"title"\s*:\s*"([^]*?)"\s*,/g,
                                        (match, value) => {
                                          const fixedValue = value.replace(/"/g, '\\"');
                                          return `"title": "${fixedValue}",`;
                                        }
                                      );

                                      // 3. narration 필드의 값 내부에 있는 이스케이프 안 된 따옴표 수정
                                      fixed = fixed.replace(
                                        /"narration"\s*:\s*"([^]*?)"\s*([,}\]])/g,
                                        (match, value, ending) => {
                                          const fixedValue = value.replace(/"/g, '\\"');
                                          return `"narration": "${fixedValue}"${ending}`;
                                        }
                                      );

                                      // 4. image_prompt 필드도 수정
                                      fixed = fixed.replace(
                                        /"image_prompt"\s*:\s*"([^]*?)"\s*,/g,
                                        (match, value) => {
                                          const fixedValue = value.replace(/"/g, '\\"');
                                          return `"image_prompt": "${fixedValue}",`;
                                        }
                                      );

                                      // 5. 보호한 임시 토큰을 다시 이스케이프된 따옴표로 복원
                                      fixed = fixed.replace(/__ESC_QUOTE__/g, '\\"');

                                      // 6. Trailing comma 제거 (객체/배열 마지막 요소 뒤의 쉼표)
                                      // 객체: ,}를 }로
                                      fixed = fixed.replace(/,(\s*})/g, '$1');
                                      // 배열: ,]를 ]로
                                      fixed = fixed.replace(/,(\s*\])/g, '$1');

                                      scriptJson = JSON.parse(fixed);
                                      console.log('✅ JSON 자동 수정 후 파싱 성공');
                                    } catch (secondError) {
                                      throw new Error(`JSON 자동 수정 실패: ${secondError}`);
                                    }
                                  }

                                  console.log('📦 파싱된 JSON:', {
                                    title: scriptJson.title,
                                    scenesCount: scriptJson.scenes?.length
                                  });

                                  // 로컬 스토리지에 저장 (포맷 타입 포함)
                                  const pipelineData = {
                                    title: script.title,
                                    content: scriptJson,
                                    type: script.type || 'longform' // 기본값은 longform
                                  };
                                  localStorage.setItem('pipelineScript', JSON.stringify(pipelineData));
                                  console.log('💾 localStorage에 저장 완료');
                                  console.log('📦 저장된 데이터:', pipelineData);

                                  // 메인 페이지로 이동
                                  console.log('🔄 메인 페이지로 이동 시작...');
                                  window.location.href = '/';
                                } catch (error) {
                                  console.error('❌ 영상 제작 실패:', error);
                                  alert('JSON 파싱 오류: ' + error);
                                }
                              }}
                              className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                            >
                              🎬 영상제작
                            </button>
                            {script.type === 'product' && (
                              <button
                                onClick={() => {
                                  // 메인 페이지로 이동하면서 상품정보 대본 생성 트리거
                                  window.location.href = `/?promptType=product-info&generateProductInfo=${script.id}`;
                                }}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 cursor-pointer whitespace-nowrap"
                                title="상품 기입 정보 생성 (YouTube/릴스용)"
                              >
                                🛍️ 상품정보
                              </button>
                            )}

                            {/* 구분선 */}
                            <div className="w-px h-8 bg-slate-600"></div>

                            {/* === 편집 === */}
                            <button
                              onClick={() => handleCopyScript(script.content, script.title)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                              title="대본 복사"
                            >
                              📋 복사
                            </button>
                            <button
                              onClick={() => formatScriptContent(script.id, script.content)}
                              disabled={isScriptFormatting(script.id)}
                              className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition whitespace-nowrap ${
                                isScriptFormatting(script.id)
                                  ? 'bg-pink-600/60 cursor-not-allowed'
                                  : 'bg-pink-600 hover:bg-pink-500 cursor-pointer'
                              }`}
                              title="JSON 포멧팅"
                            >
                              {isScriptFormatting(script.id) ? '✨ 포멧팅 중...' : '✨ 포멧팅'}
                            </button>
                            <button
                              onClick={() => handleDownload(script.id)}
                              className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                              title="대본 다운로드"
                            >
                              📥 다운로드
                            </button>
                            {/* 변환 버튼: longform/shortform 타입에만 표시 */}
                            {(script.type === 'longform' || script.type === 'shortform') && (
                              <button
                                onClick={() => handleConvertScript(script.id, script.type || 'longform', script.title)}
                                className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-500 cursor-pointer whitespace-nowrap"
                                title={script.type === 'longform' ? '쇼츠로 변환' : '롱폼으로 변환'}
                              >
                                🔄 변환
                              </button>
                            )}
                            {user?.isAdmin && (
                              <button
                                onClick={() => editingScriptId === script.id ? handleCancelEdit() : handleEditScript(script.id, script.content)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title={editingScriptId === script.id ? "편집 닫기" : "대본 편집 (관리자 전용)"}
                              >
                                {editingScriptId === script.id ? '✕ 닫기' : '✏️ 편집'}
                              </button>
                            )}
                            <button
                              onClick={() => handleRestartScript(script.id, script.title)}
                              className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-500 cursor-pointer whitespace-nowrap"
                              title="대본 재생성"
                            >
                              🔄 재시도
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('🔴 삭제 버튼 클릭됨 (Scripts 탭)');
                                handleDeleteScript(script.id, script.title);
                              }}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                              title="대본 삭제"
                            >
                              🗑️ 삭제
                            </button>
                          </>
                        )}
                        {(script.status === 'failed' || (script.status as any) === 'cancelled') && (
                          <>
                            {script.logs && script.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedScriptLogId(expandedScriptLogId === script.id ? null : script.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title="로그 보기"
                              >
                                {expandedScriptLogId === script.id ? '📋 닫기' : '📋 로그'}
                              </button>
                            )}
                            <button
                              onClick={() => handleRestartScript(script.id, script.title)}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                              title="재시도"
                            >
                              🔄 재시도
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteScript(script.id, script.title);
                              }}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                            >
                              🗑️ 삭제
                            </button>
                          </>
                        )}
                        </div>

                        {/* 진행 중 상태 표시 */}
                        {script.status === 'processing' && (
                          <>
                            <div className="mb-3">
                              <div className="mb-1 flex justify-between text-xs text-slate-400">
                                <span>대본 생성 중...</span>
                                <span>{script.progress}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-300"
                                  style={{ width: `${script.progress}%` }}
                                />
                              </div>
                            </div>

                            {/* 로그 표시 - 로그 버튼을 눌렀을 때만 표시 */}
                            {script.logs && script.logs.length > 0 && expandedScriptLogId === script.id && (
                              <div
                                ref={(el) => {
                                  if (el) {
                                    scriptLogRefs.current.set(script.id, el);
                                  } else {
                                    scriptLogRefs.current.delete(script.id);
                                  }
                                }}
                                className="max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4"
                              >
                                <div className="space-y-1">
                                  {script.logs.map((log: any, idx: number) => {
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
                                        ref={(el) => {
                                          // 마지막 로그 항목에만 ref 추가
                                          if (idx === script.logs!.length - 1 && el) {
                                            scriptLastLogRefs.current.set(script.id, el);
                                          }
                                        }}
                                      >
                                        <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                        {isUsingAPI && <span className="font-bold text-red-500 mr-1">[💰 API]</span>}
                                        {isUsingLocal && <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>}
                                        {logMessage}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* 대기 중 상태 */}
                        {script.status === 'pending' && (
                          <>
                            <div className="mb-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-300">
                              ⏳ 대본 생성 대기 중...
                            </div>

                            {/* 로그 표시 - 로그 버튼을 눌렀을 때만 표시 */}
                            {script.logs && script.logs.length > 0 && expandedScriptLogId === script.id && (
                              <div
                                ref={(el) => {
                                  if (el) {
                                    scriptLogRefs.current.set(script.id, el);
                                  } else {
                                    scriptLogRefs.current.delete(script.id);
                                  }
                                }}
                                className="max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4 mb-3"
                              >
                                <div className="space-y-1">
                                  {script.logs.map((log: any, idx: number) => {
                                    const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                                    const logTimestamp = typeof log === 'object' && log !== null && log.timestamp ? log.timestamp : new Date().toISOString();

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
                                        ref={(el) => {
                                          if (idx === script.logs!.length - 1 && el) {
                                            scriptLastLogRefs.current.set(script.id, el);
                                          }
                                        }}
                                      >
                                        <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                        {isUsingAPI && <span className="font-bold text-red-500 mr-1">[💰 API]</span>}
                                        {isUsingLocal && <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>}
                                        {logMessage}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* 에러 상태 */}
                        {script.error && (
                          <>
                            <ErrorMessage message={script.error} />

                            {/* 실패 시 로그 표시 */}
                            {script.logs && script.logs.length > 0 && (
                              <div
                                ref={(el) => {
                                  if (el) {
                                    scriptLogRefs.current.set(script.id, el);
                                  } else {
                                    scriptLogRefs.current.delete(script.id);
                                  }
                                }}
                                className="max-h-96 overflow-y-auto rounded-lg border border-red-600 bg-slate-900/80 p-4 mb-3"
                              >
                                <div className="space-y-1">
                                  {script.logs.map((log: any, idx: number) => {
                                    const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                                    const logTimestamp = typeof log === 'object' && log !== null && log.timestamp ? log.timestamp : new Date().toISOString();

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
                              </div>
                            )}
                          </>
                        )}
                        </div>
                      </div>
                    </div>

                    {/* 대본 펼친 내용 (전체보기) 또는 편집 모드 */}
                    {expandedScriptId === script.id && script.status === 'completed' && (
                      <>
                        {editingScriptId === script.id ? (
                          /* 편집 모드 (확장 상태) */
                          <div className="mt-4 space-y-3">
                            <textarea
                              value={editedContent}
                              onChange={(e) => setEditedContent(e.target.value)}
                              className="w-full h-96 rounded-lg border border-purple-500 bg-slate-900 p-4 text-sm text-slate-300 font-mono leading-relaxed focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-y"
                              placeholder="대본 내용을 입력하세요..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveScript(script.id)}
                                disabled={isSavingScript}
                                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSavingScript ? '⏳ 저장 중...' : '💾 저장'}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={isSavingScript}
                                className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ✕ 취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* 일반 전체보기 */
                          <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                            <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">
                              {script.content}
                            </pre>
                          </div>
                        )}
                      </>
                    )}

                    {/* 대본 로그 표시 (대본 탭) - 완료/실패/취소 상태일 때만 */}
                    {(script.status === 'completed' || script.status === 'failed' || (script.status as any) === 'cancelled') && expandedScriptLogId === script.id && script.logs && script.logs.length > 0 && (
                      <div
                        ref={(el) => {
                          if (el) {
                            scriptLogRefs.current.set(script.id, el);
                          } else {
                            scriptLogRefs.current.delete(script.id);
                          }
                        }}
                        className="max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4 mt-3"
                      >
                        <div className="space-y-1">
                          {script.logs.map((log: any, idx: number) => {
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
                                ref={(el) => {
                                  // 마지막 로그 항목에만 ref 추가
                                  if (idx === script.logs!.length - 1 && el) {
                                    scriptLastLogRefs.current.set(script.id, el);
                                  }
                                }}
                              >
                                <span className="text-blue-400">[{new Date(logTimestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                                {isUsingAPI && <span className="font-bold text-red-500 mr-1">[💰 API]</span>}
                                {isUsingLocal && <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>}
                                {logMessage}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* 더보기 버튼 */}
                {scriptsHasMore && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={loadMoreScripts}
                      disabled={isLoadingMoreScripts}
                      className="rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingMoreScripts ? '로딩 중...' : `더보기 (${scripts.length}/${scriptsTotal})`}
                    </button>
                  </div>
                )}
              </div>
            );
            })()}
          </>
        )}

        {/* 영상 탭 콘텐츠 */}
        {activeTab === 'videos' && (
          <>
            {/* 검색 */}
            <div className="mb-4 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="영상 제목, ID, 상태로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setActiveSearchQuery(searchQuery);
                    setJobs([]);
                    setOffset(0);
                    fetchJobs(true);
                  }
                }}
                className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-white placeholder-slate-400 border border-white/20 focus:border-purple-500 focus:outline-none transition"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setActiveSearchQuery(searchQuery);
                    setJobs([]);
                    setOffset(0);
                    fetchJobs(true);
                  }}
                  className="flex-1 sm:flex-none rounded-lg bg-purple-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                >
                  검색
                </button>
                {activeSearchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setActiveSearchQuery('');
                      setJobs([]);
                      setOffset(0);
                      fetchJobs(true);
                    }}
                    className="flex-1 sm:flex-none rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-500"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>

            {/* 필터 */}
            <div className="mb-6 flex flex-wrap gap-2 sm:gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                  filter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition whitespace-nowrap ${
                  filter === 'active'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                진행 중
              </button>
            </div>

            {/* 영상 목록 */}
            {(() => {
              if (isLoadingVideos) {
                return <div className="text-center text-slate-400">로딩 중...</div>;
              }

              if (jobs.length === 0) {
                return (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
                    <p className="text-slate-400">
                      {filter === 'active' ? '진행 중인 작업이 없습니다.' : '생성한 영상이 없습니다.'}
                    </p>
                  </div>
                );
              }

              return (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="group rounded-xl border border-white/10 bg-white/5 backdrop-blur transition hover:bg-white/10 hover:border-purple-500/50 overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row gap-4 p-4">
                      {/* 썸네일 영역 - 왼쪽 */}
                      <div className="relative w-full md:w-64 h-36 flex-shrink-0 bg-slate-800/50 rounded-lg overflow-hidden">
                        {job.status === 'completed' && job.thumbnailPath ? (
                          <a
                            href={`/api/download-thumbnail?jobId=${job.id}`}
                            download
                            className="block w-full h-full cursor-pointer group/thumb relative"
                            title="클릭하여 썸네일 다운로드"
                          >
                            <img
                              src={`/api/thumbnail?jobId=${job.id}`}
                              alt="썸네일"
                              className="w-full h-full object-cover"
                            />
                            {/* 다운로드 아이콘 오버레이 */}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </div>
                          </a>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500">
                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {/* 상태 오버레이 */}
                        {job.status === 'processing' && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="text-center">
                              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto mb-1"></div>
                              <p className="text-xs text-white font-semibold">{job.progress}%</p>
                            </div>
                          </div>
                        )}
                        {/* 타입 배지 */}
                        {job.type && (
                          <div className="absolute top-2 left-2">
                            <span className={`px-2 py-1 rounded text-xs font-bold shadow-lg ${
                              job.type === 'shortform' ? 'bg-blue-500 text-white' :
                              job.type === 'longform' ? 'bg-green-500 text-white' :
                              job.type === 'product' ? 'bg-orange-500 text-white' :
                              'bg-purple-500 text-white'
                            }`}>
                              {job.type === 'shortform' ? '⚡ 숏폼' :
                               job.type === 'longform' ? '📝 롱폼' :
                               job.type === 'product' ? '🛍️ 상품' :
                               job.type === 'product-info' ? '📝 상품정보' :
                               '🎬 Sora2'}
                            </span>
                          </div>
                        )}
                        {/* 재생성 배지 */}
                        {(job as any).isRegenerated && (
                          <div className="absolute bottom-2 left-2">
                            <span className="px-2 py-1 rounded text-xs font-bold shadow-lg bg-amber-500 text-white">
                              🔄 재생성
                            </span>
                          </div>
                        )}
                        {/* 상태 배지 */}
                        <div className="absolute top-2 right-2">
                          {getStatusBadge(job.status)}
                        </div>
                      </div>

                      {/* 메타데이터 영역 - 중앙 */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-2 break-words line-clamp-2">
                            {job.title || job.id}
                          </h3>
                          <div className="space-y-1 text-sm text-slate-400">
                            <p className="flex items-center gap-2">
                              <span className="text-slate-500">•</span>
                              <span>{job.step}</span>
                            </p>
                            <p className="flex items-center gap-2">
                              <span className="text-slate-500">•</span>
                              <span>{formatDate(job.createdAt)}</span>
                            </p>
                            {/* From 링크 (대본에서 생성된 영상인 경우) */}
                            {job.sourceContentId && (
                              <p className="flex items-center gap-2">
                                <span className="text-slate-500">•</span>
                                <span>
                                  From:{' '}
                                  <button
                                    onClick={() => {
                                      // Scripts 탭으로 이동
                                      setActiveTab('scripts');
                                      // 약간의 지연 후 스크롤
                                      setTimeout(() => {
                                        const sourceElement = document.getElementById(`script-${job.sourceContentId}`);
                                        if (sourceElement) {
                                          sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          sourceElement.classList.add('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                          setTimeout(() => {
                                            sourceElement.classList.remove('ring-2', 'ring-purple-500', 'ring-offset-2', 'ring-offset-slate-900');
                                          }, 2000);
                                        } else {
                                          toast.error('원본 대본을 찾을 수 없습니다.');
                                        }
                                      }, 100);
                                    }}
                                    className="text-purple-400 hover:text-purple-300 underline cursor-pointer transition"
                                  >
                                    원본 대본 보기 🔗
                                  </button>
                                </span>
                              </p>
                            )}
                            {job.updatedAt !== job.createdAt && (
                              <p className="flex items-center gap-2">
                                <span className="text-slate-500">•</span>
                                <span className="text-xs">업데이트: {formatDate(job.updatedAt)}</span>
                              </p>
                            )}
                          </div>
                          {job.status === 'processing' && (
                            <div className="mt-3">
                              <div className="mb-1 flex justify-between text-xs text-slate-400">
                                <span>{job.step}</span>
                                <span>{job.progress}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full bg-purple-500 transition-all duration-300"
                                  style={{ width: `${job.progress}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {job.error && (
                            <ErrorMessage message={job.error} />
                          )}
                        </div>

                        {/* 버튼 영역 - 하단 */}
                        <div className="flex flex-wrap gap-2 mt-4">
                        {(job.status === 'pending' || job.status === 'processing') && (
                          <>
                            {user?.isAdmin && (
                              <button
                                onClick={() => handleOpenFolder(job.id)}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                                title="폴더 열기"
                              >
                                📁 폴더
                              </button>
                            )}
                            {job.logs && job.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedLogJobId(expandedLogJobId === job.id ? null : job.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                              >
                                {expandedLogJobId === job.id ? '📋 닫기' : '📋 로그'}
                              </button>
                            )}
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                            >
                              🛑 중지
                            </button>
                          </>
                        )}
                        {job.status === 'completed' && job.videoPath && (
                          <>
                            {/* === 보기 === */}
                            {job.logs && job.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedLogJobId(expandedLogJobId === job.id ? null : job.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title="로그 보기"
                              >
                                {expandedLogJobId === job.id ? '📋 닫기' : `📋 로그`}
                              </button>
                            )}
                            {user?.isAdmin && (
                              <button
                                onClick={() => handleOpenFolder(job.id)}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                                title="폴더 열기"
                              >
                                📁 폴더
                              </button>
                            )}

                            {/* 구분선 */}
                            <div className="w-px h-8 bg-slate-600"></div>

                            {/* === 제작 === */}
                            <YouTubeUploadButton
                              videoPath={job.videoPath}
                              thumbnailPath={job.thumbnailPath}
                              defaultTitle={job.title || ''}
                              jobId={job.id}
                            />
                            {job.sourceContentId && (() => {
                              const sourceScript = scripts.find(s => s.id === job.sourceContentId);
                              return sourceScript && sourceScript.content ? (
                                <button
                                  onClick={() => handleSpeak(job.id, sourceScript.content)}
                                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition cursor-pointer whitespace-nowrap ${
                                    speakingId === job.id
                                      ? 'bg-red-600 hover:bg-red-500'
                                      : 'bg-indigo-600 hover:bg-indigo-500'
                                  }`}
                                  title={speakingId === job.id ? '읽기 중지' : '나레이션 읽어보기'}
                                >
                                  {speakingId === job.id ? '⏹️ 중지' : '🔊 읽어보기'}
                                </button>
                              ) : null;
                            })()}

                            {/* 구분선 */}
                            <div className="w-px h-8 bg-slate-600"></div>

                            {/* === 편집 === */}
                            <a
                              href={`/api/download-video?jobId=${job.id}`}
                              download
                              className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                              title="영상 다운로드"
                            >
                              📥 다운로드
                            </a>
                            {/* 쇼츠 버튼: 롱폼 영상에만 표시 */}
                            {job.type === 'longform' && (
                              <button
                                onClick={() => handleConvertToShorts(job.id, job.title || '제목 없음')}
                                disabled={convertingJobs.has(job.id)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition whitespace-nowrap ${
                                  convertingJobs.has(job.id)
                                    ? 'bg-purple-400 cursor-not-allowed opacity-60'
                                    : 'bg-purple-600 hover:bg-purple-500 cursor-pointer'
                                }`}
                                title={convertingJobs.has(job.id) ? '변환 중...' : '쇼츠로 변환 (200 크레딧)'}
                              >
                                {convertingJobs.has(job.id) ? '⏳ 변환 중...' : '⚡ 쇼츠'}
                              </button>
                            )}
                            <button
                              onClick={() => handleRestartVideo(job.id)}
                              className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-500 cursor-pointer whitespace-nowrap"
                              title="영상 재생성"
                            >
                              🔄 재시도
                            </button>
                            <button
                              onClick={() => handleDeleteVideo(job.id, job.title || job.id)}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                              title="영상 삭제"
                            >
                              🗑️ 삭제
                            </button>
                          </>
                        )}
                        {(job.status === 'failed' || job.status === 'cancelled') && (
                          <>
                            {job.logs && job.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedLogJobId(expandedLogJobId === job.id ? null : job.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title="로그 보기"
                              >
                                {expandedLogJobId === job.id ? '📋 닫기' : `📋 로그`}
                              </button>
                            )}
                            <button
                              onClick={() => handleRestartVideo(job.id)}
                              className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-500 cursor-pointer whitespace-nowrap"
                              title="재시도"
                            >
                              🔄 재시도
                            </button>
                            <button
                              onClick={() => handleDeleteVideo(job.id, job.title || job.id)}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                        </div>
                      </div>
                    </div>

                    {/* 로그 표시 영역 - 전체 탭과 동일한 큰 창 */}
                    {expandedLogJobId === job.id && job.logs && job.logs.length > 0 && (
                      <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-300">📋 서버 로그</span>
                          <span className="text-sm text-slate-400">{job.logs.length}개 항목</span>
                        </div>
                        <div
                          ref={(el) => {
                            if (el) {
                              jobLogRefs.current.set(job.id, el);
                            } else {
                              jobLogRefs.current.delete(job.id);
                            }
                          }}
                          className="h-[500px] overflow-y-auto rounded bg-black/60 p-4 font-mono text-sm leading-relaxed"
                        >
                          {job.logs.map((log: any, idx: number) => (
                            <div
                              key={idx}
                              className="text-green-400 whitespace-pre-wrap break-all mb-2"
                              ref={(el) => {
                                // 마지막 로그 항목에만 ref 추가
                                if (idx === job.logs!.length - 1 && el) {
                                  jobLastLogRefs.current.set(job.id, el);
                                }
                              }}
                            >
                              {typeof log === 'string' ? log : log.message || JSON.stringify(log)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* 더 보기 버튼 */}
                {hasMore && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingMore ? '로딩 중...' : `더보기 (${jobs.length}/${total})`}
                    </button>
                  </div>
                )}
              </div>
              );
            })()}
          </>
        )}

        {/* 퍼블리시 탭 콘텐츠 */}
        {activeTab === 'published' && (
          <div className="space-y-4">
            {isLoadingUploads ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
                <div className="text-center text-slate-400 py-12">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
                  <p className="text-lg">로딩 중...</p>
                </div>
              </div>
            ) : youtubeUploads.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
                <div className="text-center text-slate-400 py-12">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-lg font-semibold mb-2">퍼블리시된 영상 없음</p>
                  <p className="text-sm">YouTube에 업로드된 영상이 여기에 표시됩니다.</p>
                </div>
              </div>
            ) : (
              <>
                {youtubeUploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all"
                  >
                    <div className="flex flex-col md:flex-row gap-4 p-4">
                      {/* 썸네일 */}
                      <div className="relative w-full md:w-64 h-36 flex-shrink-0 bg-slate-800/50 rounded-lg overflow-hidden">
                        {upload.thumbnailUrl ? (
                          <img
                            src={upload.thumbnailUrl}
                            alt={upload.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {/* YouTube 배지 */}
                        <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded">
                          YouTube
                        </div>
                      </div>

                      {/* 정보 */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-2 break-words line-clamp-2">
                            {upload.title}
                          </h3>
                          <div className="flex flex-wrap gap-2 text-sm text-slate-400 mb-2">
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              {upload.channelTitle || '채널'}
                            </span>
                            <span>•</span>
                            <span>{new Date(upload.publishedAt).toLocaleString('ko-KR')}</span>
                            {upload.privacyStatus && (
                              <>
                                <span>•</span>
                                <span className="capitalize">{upload.privacyStatus}</span>
                              </>
                            )}
                          </div>
                          {upload.description && (
                            <p className="text-sm text-slate-400 line-clamp-2">{upload.description}</p>
                          )}
                        </div>

                        {/* 버튼 */}
                        <div className="flex flex-wrap gap-2 mt-4">
                          <a
                            href={upload.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                          >
                            YouTube에서 보기
                          </a>
                          <button
                            onClick={async () => {
                              const success = await safeCopyToClipboard(upload.videoUrl);
                              if (success) {
                                toast.success('URL 복사됨');
                              } else {
                                toast.error('URL 복사 실패');
                              }
                            }}
                            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
                          >
                            📋 URL 복사
                          </button>
                          <button
                            onClick={() => handleDeleteUpload(upload.id)}
                            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
                          >
                            🗑️ 삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* 더보기 버튼 */}
                {publishedHasMore && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={loadMorePublished}
                      disabled={isLoadingMorePublished}
                      className="rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingMorePublished ? '로딩 중...' : `더보기 (${youtubeUploads.length}/${publishedTotal})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 쿠팡 탭 콘텐츠 */}
        {activeTab === 'coupang' && (
          <div className="space-y-6">
            {/* Sub-tabs */}
            <div className="flex gap-3 border-b border-white/10 pb-4">
              <button
                onClick={() => setCoupangSubTab('bestsellers')}
                className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
                  coupangSubTab === 'bestsellers'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                🏆 베스트셀러
              </button>
              <button
                onClick={() => setCoupangSubTab('links')}
                className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
                  coupangSubTab === 'links'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                🔗 딥링크 목록
              </button>
              <button
                onClick={() => setCoupangSubTab('search')}
                className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${
                  coupangSubTab === 'search'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                🔍 상품 검색
              </button>
            </div>

            {/* API Settings Section (always visible) */}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">🔑 API 설정</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    쿠팡 파트너스 API 키를 등록하고 연결하세요
                  </p>
                </div>
                {coupangSettings.isConnected && (
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
                    ✓ 연결됨
                  </span>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-300">
                    Access Key
                  </label>
                  <input
                    type="text"
                    value={coupangSettings.accessKey}
                    onChange={(e) => setCoupangSettings({ ...coupangSettings, accessKey: e.target.value })}
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
                    value={coupangSettings.secretKey}
                    onChange={(e) => setCoupangSettings({ ...coupangSettings, secretKey: e.target.value })}
                    placeholder="쿠팡 파트너스 Secret Key"
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={saveCoupangSettings}
                  disabled={isSavingCoupang}
                  className="flex-1 rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
                >
                  {isSavingCoupang ? '저장 중...' : '💾 저장'}
                </button>
                <button
                  onClick={testCoupangConnection}
                  disabled={testingConnection || !coupangSettings.accessKey || !coupangSettings.secretKey}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {testingConnection ? '테스트 중...' : '🔌 연결 테스트'}
                </button>
              </div>
            </section>

            {/* Bestsellers Sub-tab */}
            {coupangSubTab === 'bestsellers' && (
              <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">🏆 베스트셀러 상품</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      카테고리별 베스트셀러를 가져와 등록하세요
                    </p>
                  </div>
                  <button
                    onClick={() => fetchBestsellers('1001')}
                    disabled={isFetchingBestsellers || !coupangSettings.isConnected}
                    className="rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
                  >
                    {isFetchingBestsellers ? '가져오는 중...' : '📥 베스트셀러 가져오기'}
                  </button>
                </div>

                {!coupangSettings.isConnected && (
                  <div className="rounded-lg bg-amber-500/20 p-3 text-sm text-amber-300">
                    ⚠️ 먼저 API 키를 연결하세요.
                  </div>
                )}

                {bestsellerProducts.length > 0 && (
                  <>
                    <div className="mb-4 flex items-center justify-between rounded-lg bg-blue-500/20 p-3">
                      <p className="text-sm text-blue-300">
                        {bestsellerProducts.length}개 상품 | {selectedProducts.size}개 선택됨
                      </p>
                      <button
                        onClick={sendSelectedToProductManagement}
                        disabled={selectedProducts.size === 0}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                      >
                        ✓ 선택한 상품 등록하기 ({selectedProducts.size})
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {bestsellerProducts.map((product) => (
                        <div
                          key={product.productId}
                          className={`flex gap-4 rounded-lg border p-4 transition cursor-pointer ${
                            selectedProducts.has(product.productId)
                              ? 'border-purple-500 bg-purple-500/20'
                              : 'border-white/10 bg-white/5 hover:bg-white/10'
                          }`}
                          onClick={() => toggleProductSelection(product.productId)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.productId)}
                            onChange={() => {}}
                            className="mt-1 h-5 w-5 cursor-pointer rounded border-white/20 bg-white/5 text-purple-600 focus:ring-2 focus:ring-purple-500"
                          />
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
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Links List Sub-tab */}
            {coupangSubTab === 'links' && (
              <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">🔗 전체 딥링크 목록</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      생성된 모든 쿠팡 파트너스 링크를 관리하세요
                    </p>
                  </div>
                  <span className="text-lg font-bold text-purple-400">총 {generatedLinks.length}개</span>
                </div>

                {generatedLinks.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-500 mb-4">아직 생성된 링크가 없습니다.</p>
                    <button
                      onClick={() => setCoupangSubTab('bestsellers')}
                      className="rounded-lg bg-purple-600 px-6 py-2 font-semibold text-white hover:bg-purple-500 transition"
                    >
                      베스트셀러에서 상품 추가하기
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {generatedLinks.map((link) => (
                      <div
                        key={link.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-6 hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/10"
                      >
                        <div className="flex gap-6">
                          {link.imageUrl && (
                            <img
                              src={link.imageUrl}
                              alt={link.productName}
                              className="h-32 w-32 rounded-lg object-cover flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-3">
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">
                                  {link.productName}
                                </h3>
                                <div className="flex items-center gap-3 flex-wrap">
                                  {link.category && (
                                    <span className="rounded-full bg-blue-500/20 px-3 py-1 text-sm font-semibold text-blue-300">
                                      {link.category}
                                    </span>
                                  )}
                                  {link.price && (
                                    <span className="text-lg font-bold text-emerald-400">
                                      ₩{link.price.toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-slate-400 w-24">단축링크:</span>
                                <input
                                  type="text"
                                  value={link.shortUrl}
                                  readOnly
                                  className="flex-1 rounded-lg bg-white/5 px-4 py-2.5 text-sm text-slate-300 border border-white/10 font-mono"
                                />
                                <button
                                  onClick={() => copyToClipboard(link.shortUrl)}
                                  className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 transition-colors flex-shrink-0"
                                >
                                  📋 복사
                                </button>
                              </div>

                              <div className="flex items-center gap-6 text-sm text-slate-400">
                                <span className="flex items-center gap-2">
                                  <span className="text-lg">👁️</span>
                                  <span className="font-semibold text-white">{link.clicks}</span>
                                  <span>클릭</span>
                                </span>
                                <span className="flex items-center gap-2">
                                  <span className="text-lg">📅</span>
                                  <span>{new Date(link.createdAt).toLocaleDateString('ko-KR', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Product Search Sub-tab */}
            {coupangSubTab === 'search' && (
              <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <h2 className="mb-4 text-xl font-bold text-white">🔍 상품 검색</h2>

                <div className="mb-4 flex gap-3">
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchCoupangProducts()}
                    placeholder="검색어를 입력하세요 (예: 노트북, 이어폰)"
                    className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                  />
                  <button
                    onClick={searchCoupangProducts}
                    disabled={isSearching || !coupangSettings.isConnected}
                    className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    {isSearching ? '검색 중...' : '검색'}
                  </button>
                </div>

                {!coupangSettings.isConnected && (
                  <div className="rounded-lg bg-amber-500/20 p-3 text-sm text-amber-300">
                    ⚠️ 상품을 검색하려면 먼저 API 키를 연결하세요.
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="mt-4 space-y-3 max-h-[600px] overflow-y-auto">
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
                          onClick={() => {
                            setSelectedProducts(new Set([product.productId]));
                            sendSelectedToProductManagement();
                          }}
                          className="self-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
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

        {/* 설정 탭 콘텐츠 */}
        {activeTab === 'settings' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
            <YouTubeSettings />
          </div>
        )}
      </div>

      {/* 맨 위로 플로팅 버튼 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 rounded-full bg-purple-600 p-4 text-white shadow-lg transition hover:bg-purple-500 hover:shadow-xl z-50"
        title="맨 위로"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>

      {/* 확인 모달 */}
      {showModal && modalConfig && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl border border-white/10 p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-white mb-4">{modalConfig.title}</h2>
            <p className="text-slate-300 mb-6">{modalConfig.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  modalConfig.onConfirm();
                  setShowModal(false);
                  setModalConfig(null);
                }}
                className={`flex-1 rounded-lg px-6 py-3 font-semibold text-white transition ${modalConfig.confirmColor || 'bg-red-600 hover:bg-red-500'}`}
              >
                {modalConfig.confirmText || '확인'}
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setModalConfig(null);
                }}
                className="flex-1 rounded-lg bg-slate-700 px-6 py-3 font-semibold text-white transition hover:bg-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 대본 변환 모달 */}
      {conversionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-slate-800 shadow-2xl">
            <div className="border-b border-slate-700 p-6">
              <h2 className="text-xl font-bold text-white">대본 변환</h2>
              <p className="mt-2 text-sm text-slate-300">
                "{conversionModal.title}"을(를) 어떤 형식으로 변환하시겠습니까?
              </p>
            </div>

            <div className="p-6 space-y-3">
              {conversionModal.options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => executeConversion(option.value)}
                  className="w-full rounded-lg bg-purple-600 px-6 py-4 text-left font-semibold text-white transition hover:bg-purple-700"
                >
                  <div className="flex items-center justify-between">
                    <span>{option.label}</span>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t border-slate-700 p-6">
              <button
                onClick={() => setConversionModal(null)}
                className="w-full rounded-lg bg-slate-700 px-6 py-3 font-semibold text-white transition hover:bg-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-center" />
    </div>
  );
}
