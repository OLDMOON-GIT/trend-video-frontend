"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { DateFilter, SortOption, VideoItem, VideoType } from "@/types/video";
import { parseJsonSafely, extractPureJson, parseJsonFile } from "@/lib/json-utils";

const fallbackVideos: VideoItem[] = [];

const typeOptions: { label: string; value: VideoType | "all" }[] = [
  { label: "전체", value: "all" },
  { label: "Video", value: "video" },
  { label: "Shorts", value: "shorts" },
  { label: "Live", value: "live" },
];

const dateOptions: { label: string; value: DateFilter }[] = [
  { label: "전체", value: "any" },
  { label: "오늘", value: "today" },
  { label: "이번 주", value: "week" },
  { label: "이번 달", value: "month" },
  { label: "최근 2달", value: "two_months" },
];

const sortOptions: { label: string; value: SortOption }[] = [
  { label: "조회수", value: "views" },
  { label: "VPH", value: "vph" },
  { label: "최신순", value: "recent" },
];

const CATEGORY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "1", label: "영화 & 애니" },
  { id: "2", label: "자동차" },
  { id: "10", label: "음악" },
  { id: "17", label: "스포츠" },
  { id: "20", label: "게임" },
  { id: "22", label: "인물 & 블로그" },
  { id: "23", label: "코미디" },
  { id: "24", label: "엔터테인먼트" },
  { id: "25", label: "뉴스 & 정치" },
  { id: "26", label: "교육" },
  { id: "27", label: "과학 & 기술" },
  { id: "28", label: "DIY & 라이프" },
];

const categoryLabelMap = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.id, option.label])
);

type StoredFilters = {
  viewRange: { min: number; max: number };
  subRange: { min: number; max: number };
  videoType: VideoType | "all";
  dateFilter: DateFilter;
  sortBy: SortOption;
  selectedCategories: string[];
  titleQuery: string;
  durationRange: { min: number; max: number };
  selectedModel: ModelOption;
};

interface PipelineResultItem {
  id: string;
  title: string;
  channelName: string;
  views: number;
  script: string;
  videoUrl: string;
  transcript?: string;
  funHighlights?: string[];
  thumbnailPrompt?: string;
}

type RunPipelinePayload = {
  results: PipelineResultItem[];
  pipelineModel: ModelOption;
  selectedVideos: VideoItem[];
};

const FILTER_STORAGE_KEY = 'trend-video-filters';

// 마크다운 코드 블록 제거 헬퍼 함수 (하위 호환성 유지, 실제로는 parseJsonSafely 사용 권장)
function stripMarkdownCodeBlock(text: string): string {
  // extractPureJson 사용하여 더 강력한 정리 수행
  return extractPureJson(text);
}

let cachedFilters: StoredFilters | null | undefined = undefined;
function loadStoredFilters(): StoredFilters | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (cachedFilters !== undefined) {
    return cachedFilters ?? null;
  }
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    cachedFilters = raw ? (JSON.parse(raw) as StoredFilters) : null;
  } catch {
    cachedFilters = null;
  }
  return cachedFilters;
}

const defaultViewRange = { min: 200_000, max: 100_000_000 };
const defaultSubRange = { min: 1, max: 10_000_000 };
const defaultDurationRange = { min: 0, max: 120 };

const modelOptions = [
  { label: 'GPT', value: 'gpt' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Claude', value: 'claude' },
  { label: 'Groq', value: 'groq' },
] as const;

type ModelOption = (typeof modelOptions)[number]['value'];

const numberFormatter = new Intl.NumberFormat("ko-KR");
const MAX_LOG_LINES = 50;

const renderCount = (value: number) => numberFormatter.format(value);

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [viewRange, setViewRange] = useState(defaultViewRange);
  const [subRange, setSubRange] = useState(defaultSubRange);
  const [videoType, setVideoType] = useState<VideoType | "all">("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [sortBy, setSortBy] = useState<SortOption>("views");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [titleQuery, setTitleQuery] = useState("");
  const [durationRange, setDurationRange] = useState(defaultDurationRange);
  const [selectedModel, setSelectedModel] = useState<ModelOption>('gpt');
  const [videos, setVideos] = useState<VideoItem[]>(fallbackVideos);
  const [isFetching, setIsFetching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isPipelineProcessing, setIsPipelineProcessing] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [transformedTitles, setTransformedTitles] = useState<{original: string; options: string[]; selected: number}[]>([]);
  const [isTransforming, setIsTransforming] = useState(false);
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [titleInputMode, setTitleInputMode] = useState<'copy' | 'generate' | 'generate-api' | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{step: string; progress: number} | null>(null);
  const [videoLogs, setVideoLogs] = useState<string[]>([]);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [uploadedJson, setUploadedJson] = useState<File | null>(null);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<File[]>([]);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [showJsonTextarea, setShowJsonTextarea] = useState(false);
  const [jsonTextareaValue, setJsonTextareaValue] = useState('');
  const [toast, setToast] = useState<{message: string; type: 'success' | 'info' | 'error'} | null>(null);
  const [isFilterExpanded, setIsFilterExpanded] = useState(() => {
    // 클라이언트에서만 localStorage 접근
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem('trend-video-filters');
      if (saved) {
        const filters = JSON.parse(saved);
        return filters.isFilterExpanded ?? false; // 기본값 false (접힌 상태)
      }
    } catch (e) {
      console.error('Failed to load isFilterExpanded:', e);
    }
    return false; // 기본값 false (접힌 상태)
  });
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [videoFormat, setVideoFormat] = useState<'longform' | 'shortform' | 'sora2' | 'product'>(() => {
    // 상품 프롬프트 타입인 경우 초기값을 product로 설정
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('promptType') === 'product') {
        return 'product';
      }
    }
    return 'longform';
  });
  const [productionMode, setProductionMode] = useState<'create' | 'merge'>('create'); // 영상제작 vs 영상병합
  const [sora2Script, setSora2Script] = useState<string>(''); // SORA2 대본
  const [showSora2Review, setShowSora2Review] = useState(false); // SORA2 대본 확인 모달
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [scriptProgress, setScriptProgress] = useState<{current: number; total: number; content?: string} | null>(null);
  const [showScriptConfirmModal, setShowScriptConfirmModal] = useState(false);
  const [scriptConfirmCallback, setScriptConfirmCallback] = useState<(() => void) | null>(null);
  const [scriptConfirmData, setScriptConfirmData] = useState<{cost: number; currentCredits: number; title: string; mode: 'generate' | 'generate-api'} | null>(null);
  const [completedScript, setCompletedScript] = useState<{title: string; content: string; scriptId: string} | null>(null);
  const [user, setUser] = useState<{id: string; email: string; credits: number; isAdmin: boolean} | null>(null);
  const [settings, setSettings] = useState<{aiScriptCost: number; videoGenerationCost: number} | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{cost: number; currentCredits: number; jsonName: string; imageCount: number} | null>(null);
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [isSuggestingTitles, setIsSuggestingTitles] = useState(false);
  const [selectedSuggestedTitle, setSelectedSuggestedTitle] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<'none' | 'dalle' | 'google'>('none');
  const [originalFormat, setOriginalFormat] = useState<'longform' | 'shortform' | 'sora2' | 'product' | null>(null); // 불러온 대본의 원본 포맷
  const [titleHistory, setTitleHistory] = useState<string[]>([]); // 제목 히스토리
  const [isInitialLoading, setIsInitialLoading] = useState(true); // 초기 로딩 상태

  // 대본 생성 로그 (기존 변수 유지)
  const [scriptGenerationLog, setScriptGenerationLog] = useState<string[]>([]);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null); // 현재 생성 중인 스크립트 ID
  const [scriptPollingInterval, setScriptPollingInterval] = useState<NodeJS.Timeout | null>(null); // 폴링 인터벌
  const [scriptGenerationLogs, setScriptGenerationLogs] = useState<Array<{timestamp: string; message: string}>>([]); // 로그 배열
  const [showScriptLogs, setShowScriptLogs] = useState(false); // 로그 표시 여부
  // 중국영상변환 관련 state
  const [showChineseConverter, setShowChineseConverter] = useState(false);
  const [chineseVideoFile, setChineseVideoFile] = useState<File | null>(null);
  const [chineseVideoTitle, setChineseVideoTitle] = useState<string>(''); // 상품 제목
  const [isConvertingChinese, setIsConvertingChinese] = useState(false);
  const [chineseConvertLogs, setChineseConvertLogs] = useState<Array<{timestamp: string; message: string}>>([]);
  const [chineseJobId, setChineseJobId] = useState<string | null>(null);
  const [chineseProgress, setChineseProgress] = useState<{step: string; progress: number} | null>(null);
  const chineseLogRef = useRef<HTMLDivElement>(null);
  const chineseConverterSectionRef = useRef<HTMLDivElement>(null);

  // Douyin 영상 크롤링 관련 state
  const [douyinUrl, setDouyinUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedVideo, setDownloadedVideo] = useState<string | null>(null);

  const [removeWatermark, setRemoveWatermark] = useState(() => {
    // localStorage에서 저장된 값 불러오기 (기본값: OFF)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('removeWatermark');
      return saved === 'true';
    }
    return false;
  });
  const scriptContentRef = useRef<HTMLDivElement>(null);
  const videoLogsRef = useRef<HTMLDivElement>(null);
  const pipelineLogsRef = useRef<HTMLDivElement>(null);
  const scriptGenerationLogRef = useRef<HTMLDivElement>(null);
  const uploadSectionRef = useRef<HTMLElement>(null);

  // 프롬프트 API URL 헬퍼 함수
  const getPromptApiUrl = () => {
    if (videoFormat === 'shortform') return '/api/shortform-prompt';
    if (videoFormat === 'product') return '/api/product-prompt';
    return '/api/prompt';
  };

  // 제목 히스토리에 추가 (DB에서 자동으로 로드되므로 별도 저장 불필요)
  const addToTitleHistory = (title: string) => {
    // DB에 저장되는 순간 자동으로 히스토리에 추가됨
    // 클라이언트 측에서는 아무것도 안 함
  };

  // 포맷 변경 핸들러 (대본이 로드된 경우 경고)
  const handleFormatChange = (newFormat: 'longform' | 'shortform' | 'sora2' | 'product') => {
    // 대본이 로드되어 있고, 원본 포맷과 다른 경우 경고
    if (originalFormat && originalFormat !== newFormat && uploadedJson) {
      const formatNames = {
        longform: '롱폼 (16:9 가로)',
        shortform: '숏폼 (9:16 세로)',
        sora2: 'Sora2 (AI 시네마틱)',
        product: '상품 (AI 마케팅)'
      };

      if (confirm(`⚠️ 포맷 변경 경고\n\n현재 불러온 대본은 ${formatNames[originalFormat]} 형식입니다.\n${formatNames[newFormat]}(으)로 변경하시겠습니까?\n\n대본 내용이 형식에 맞지 않을 수 있습니다.`)) {
        setVideoFormat(newFormat);
        console.log(`📝 포맷 변경: ${originalFormat} → ${newFormat}`);
      } else {
        console.log('📝 포맷 변경 취소됨');
      }
    } else {
      // 대본이 없거나 같은 포맷이면 바로 변경
      setVideoFormat(newFormat);
    }
  };

  // localStorage에서 필터 로드 (클라이언트에서만)
  useEffect(() => {
    const stored = loadStoredFilters();
    if (stored) {
      if (stored.viewRange) setViewRange(stored.viewRange);
      if (stored.subRange) setSubRange(stored.subRange);
      if (stored.videoType) setVideoType(stored.videoType);
      if (stored.dateFilter) setDateFilter(stored.dateFilter);
      if (stored.sortBy) setSortBy(stored.sortBy);
      if (stored.selectedCategories) setSelectedCategories(stored.selectedCategories);
      if (stored.titleQuery) setTitleQuery(stored.titleQuery);
      if (stored.durationRange) setDurationRange(stored.durationRange);
      if (stored.selectedModel) setSelectedModel(stored.selectedModel);
    }

    // 제목 히스토리는 checkAuth()에서 로드됨
    setIsMounted(true);
  }, []);

  // 상품 프롬프트 타입 감지 및 상품 정보 로드
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const promptType = urlParams.get('promptType');

      if (promptType === 'product') {
        // localStorage에서 상품 정보 로드
        const productInfoStr = localStorage.getItem('product_video_info');
        if (productInfoStr) {
          try {
            const productInfo = JSON.parse(productInfoStr);

            // 제목 자동 입력
            if (productInfo.title) {
              setManualTitle(productInfo.title);
              console.log('🛍️ 상품 제목 로드:', productInfo.title);
            }

            // 상품 정보를 state나 localStorage에 저장 (프롬프트 생성 시 사용)
            localStorage.setItem('current_product_info', productInfoStr);

            console.log('🛍️ 상품 정보 로드 완료:', productInfo);

            // AI 대본 생성 섹션 열기 및 스크롤
            setShowTitleInput(true);

            // 약간의 딜레이 후 스크롤 (DOM 렌더링 대기)
            setTimeout(() => {
              const aiSection = document.querySelector('[data-ai-script-section]');
              if (aiSection) {
                aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                console.log('📜 AI 대본 생성 섹션으로 이동');
              }
            }, 300);

            // localStorage 클리어 (일회용)
            localStorage.removeItem('product_video_info');
          } catch (e) {
            console.error('❌ 상품 정보 로드 실패:', e);
          }
        }
      }
    }
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const dropdown = document.getElementById('settings-dropdown');
      const button = event.target as HTMLElement;
      if (dropdown && !dropdown.contains(button) && !button.closest('[data-settings-button]')) {
        dropdown.classList.add('hidden');
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 대본 생성 중 자동 스크롤
  useEffect(() => {
    if (scriptContentRef.current && scriptProgress?.content) {
      scriptContentRef.current.scrollTop = scriptContentRef.current.scrollHeight;
    }
  }, [scriptProgress?.content]);

  // 영상 생성 로그 자동 스크롤
  useEffect(() => {
    if (videoLogsRef.current) {
      videoLogsRef.current.scrollTop = videoLogsRef.current.scrollHeight;
    }
  }, [videoLogs]);

  // 파이프라인 로그 자동 스크롤
  useEffect(() => {
    if (pipelineLogsRef.current) {
      pipelineLogsRef.current.scrollTop = pipelineLogsRef.current.scrollHeight;
    }
  }, [logs]);

  // 대본 생성 로그 자동 스크롤
  useEffect(() => {
    if (scriptGenerationLogRef.current) {
      scriptGenerationLogRef.current.scrollTop = scriptGenerationLogRef.current.scrollHeight;
    }
  }, [scriptGenerationLog, scriptGenerationLogs]);

  // 중국영상변환 로그 자동 스크롤
  useEffect(() => {
    if (chineseLogRef.current) {
      chineseLogRef.current.scrollTop = chineseLogRef.current.scrollHeight;
    }
  }, [chineseConvertLogs]);

  // videoFormat이 변경될 때마다 localStorage에 저장
  useEffect(() => {
    if (typeof window !== 'undefined' && isMounted) {
      console.log('💾 videoFormat 저장:', videoFormat);
      localStorage.setItem('videoFormat', videoFormat);
    }
  }, [videoFormat, isMounted]);

  // 컴포넌트 언마운트 시 폴링 인터벌 정리
  useEffect(() => {
    return () => {
      if (scriptPollingInterval) {
        clearInterval(scriptPollingInterval);
      }
    };
  }, [scriptPollingInterval]);

  useEffect(() => {
    setIsMounted(true);
    checkAuth();

    // localStorage에서 videoFormat 복원 (클라이언트에서만)
    const savedVideoFormat = localStorage.getItem('videoFormat');
    console.log('📂 localStorage에서 videoFormat 불러오기:', savedVideoFormat);
    if (savedVideoFormat === 'longform' || savedVideoFormat === 'shortform' || savedVideoFormat === 'sora2' || savedVideoFormat === 'video-merge') {
      console.log('✅ videoFormat 복원:', savedVideoFormat);
      setVideoFormat(savedVideoFormat as any);
    } else {
      console.log('⚠️ 저장된 videoFormat 없음, 기본값(longform) 사용');
    }

    // localStorage에서 selectedModel 복원 (isFilterExpanded는 useState lazy init에서 이미 처리됨)
    const savedFilters = localStorage.getItem('trend-video-filters');
    if (savedFilters) {
      try {
        const filters = JSON.parse(savedFilters);
        if (filters.selectedModel) {
          setSelectedModel(filters.selectedModel);
        }
      } catch (error) {
        console.error('Failed to restore filters:', error);
      }
    }

    // 진행 중인 작업 복구 (유효성 체크 포함)
    const savedJobId = localStorage.getItem('currentJobId');
    if (savedJobId) {
      // 먼저 job이 유효한지 체크
      fetch(`/api/generate-video-upload?jobId=${savedJobId}`, {
        headers: getAuthHeaders()
      })
        .then(response => {
          if (response.ok) {
            // job이 유효하면 폴링 시작
            setCurrentJobId(savedJobId);
            setIsGeneratingVideo(true);
            startPollingVideoStatus(savedJobId);
          } else {
            // job이 유효하지 않으면 localStorage 정리
            console.warn('Saved job is no longer valid, cleaning up:', savedJobId);
            localStorage.removeItem('currentJobId');
          }
        })
        .catch(error => {
          console.error('Job validation error:', error);
          localStorage.removeItem('currentJobId');
        });
    }

    // 저장된 영상 목록 자동 복구 비활성화 - 버튼 클릭 시에만 데이터 로드
    // const savedVideos = localStorage.getItem('trend-video-results');
    // const savedFetchedAt = localStorage.getItem('trend-video-fetched-at');
    // if (savedVideos && savedFetchedAt) {
    //   try {
    //     const parsedVideos = JSON.parse(savedVideos);
    //     if (Array.isArray(parsedVideos) && parsedVideos.length > 0) {
    //       setVideos(parsedVideos);
    //       setLastFetchedAt(savedFetchedAt);
    //       pushLog(`이전 검색 결과 복원: ${parsedVideos.length}개 영상`);
    //     }
    //   } catch (error) {
    //     console.error('저장된 영상 목록 복구 실패:', error);
    //   }
    // }

    // 파이프라인 스크립트 로드 (내 콘텐츠에서 실행 버튼 눌렀을 때)
    const pipelineScript = localStorage.getItem('pipelineScript');
    console.log('🔍 파이프라인 스크립트 체크:', pipelineScript ? '있음' : '없음');

    if (pipelineScript) {
      console.log('🎬 파이프라인 스크립트 감지됨');
      try {
        const parsed = JSON.parse(pipelineScript);
        const { title, content, imageSource, type } = parsed;
        console.log('📝 파싱된 데이터:', {
          title,
          hasContent: !!content,
          imageSource: imageSource || 'dalle (기본값)',
          contentType: typeof content,
          type: type || 'longform (기본값)'
        });

        // JSON 객체를 File 객체로 변환
        const jsonString = JSON.stringify(content, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const file = new File([blob], `${title}.json`, { type: 'application/json' });

        console.log('📦 File 객체 생성 완료:', {
          name: file.name,
          size: file.size,
          type: file.type
        });

        console.log('🔧 상태 업데이트 시작...');
        setUploadedJson(file);
        console.log('  ✓ uploadedJson 설정:', file.name);

        // 이미지 소스 설정 (기본값: none - 직접 업로드)
        const source = imageSource || 'none';
        setImageSource(source);
        console.log('  ✓ imageSource 설정:', source);

        // 포맷 타입 설정 (기본값: longform)
        const formatType = type || 'longform';
        setVideoFormat(formatType);
        setOriginalFormat(formatType); // 원본 포맷 저장
        console.log('  ✓ videoFormat 설정:', formatType);
        console.log('  ✓ originalFormat 저장:', formatType);

        setShowUploadSection(true);
        console.log('  ✓ showUploadSection: true');

        localStorage.removeItem('pipelineScript');
        console.log('  ✓ pipelineScript localStorage 제거');

        // 업로드 섹션으로 스크롤 (섹션이 렌더링된 후)
        setTimeout(() => {
          if (uploadSectionRef.current) {
            uploadSectionRef.current.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
            console.log('  ✓ 업로드 섹션으로 스크롤 완료');
          }
        }, 100);

        // Sora2 타입인 경우 자동으로 영상 생성 시작
        if (formatType === 'sora2') {
          console.log('🎬 Sora2 타입 감지! 자동 영상 생성 시작...');

          setToast({
            message: `Sora2 대본 "${title}"이(가) 로드되었습니다! 영상 생성을 시작합니다...`,
            type: 'info'
          });
          setTimeout(() => setToast(null), 5000);

          // 즉시 Sora2 비디오 생성 시작
          setTimeout(async () => {
            try {
              console.log('📡 Sora2 API 호출 시작...');
              const response = await fetch('/api/sora/generate', {
                method: 'POST',
                headers: {
                  ...getAuthHeaders(),
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  script: content,  // JSON 객체 그대로 전달
                  title: title
                })
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Sora2 생성 실패');
              }

              const data = await response.json();
              console.log('✅ Sora2 생성 시작:', data);

              setToast({
                message: `Sora2 영상 생성 완료! 출력 경로: ${data.outputPath}`,
                type: 'success'
              });
              setTimeout(() => setToast(null), 8000);

            } catch (error) {
              console.error('❌ Sora2 생성 오류:', error);
              setToast({
                message: `Sora2 생성 실패: ${(error as Error).message}`,
                type: 'error'
              });
              setTimeout(() => setToast(null), 8000);
            }
          }, 1000); // 1초 후 실행 (UI 업데이트 후)
        } else {
          // 롱폼/숏폼은 수동 시작
          console.log('📋 파일 업로드 섹션만 열림 - 사용자가 수동으로 생성 버튼을 눌러야 합니다');

          setToast({
            message: `대본 "${title}"이(가) 로드되었습니다! 영상 제작 시작 버튼을 눌러주세요.`,
            type: 'success'
          });
          setTimeout(() => setToast(null), 5000);
        }

        console.log('✅ 파이프라인 스크립트 로드 완료');
      } catch (error) {
        console.error('❌ 파이프라인 스크립트 로드 실패:', error);
      }
    } else {
      console.log('📭 파이프라인 스크립트 없음 - 정상 초기화');
    }
  }, []);

  // 자동 영상 생성 기능 제거됨 - 사용자가 직접 "영상 제작 시작" 버튼을 눌러야 함

  // 영상 생성 상태 폴링 함수
  const startPollingVideoStatus = (jobId: string) => {
    // 기존 폴링이 있으면 중지
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    let hasAlerted = false; // alert 중복 방지 플래그

    const checkInterval = setInterval(async () => {
      try {
        const statusResponse = await fetch(`/api/generate-video-upload?jobId=${jobId}`, {
          headers: getAuthHeaders()
        });

        // 404 또는 기타 에러 응답 처리
        if (!statusResponse.ok) {
          if (statusResponse.status === 404) {
            console.warn('Job not found, stopping polling:', jobId);
            clearInterval(checkInterval);
            setPollingInterval(null);
            setIsGeneratingVideo(false);
            setVideoProgress(null);
            localStorage.removeItem('currentJobId');
            return;
          }
          throw new Error(`HTTP error! status: ${statusResponse.status}`);
        }

        const statusData = await statusResponse.json();

        setVideoProgress({
          step: statusData.step || '처리 중...',
          progress: statusData.progress || 50
        });

        // 로그가 있으면 추가
        if (statusData.logs && Array.isArray(statusData.logs)) {
          setVideoLogs(statusData.logs);
        }

        if (statusData.status === 'completed' && statusData.videoUrl && !hasAlerted) {
          hasAlerted = true; // alert 중복 방지
          clearInterval(checkInterval);
          setPollingInterval(null);
          setVideoProgress({ step: '완료!', progress: 100 });
          setGeneratedVideoUrl(statusData.videoUrl);
          setIsGeneratingVideo(false);
          localStorage.removeItem('currentJobId');

          // 크레딧 업데이트
          fetchCreditsAndSettings();

          alert('✅ 영상 생성 완료!\n\n다운로드 버튼을 클릭하세요.');

          // 업로드된 파일 초기화
          setUploadedJson(null);
          setUploadedImages([]);
        } else if (statusData.status === 'failed') {
          clearInterval(checkInterval);
          setPollingInterval(null);
          localStorage.removeItem('currentJobId');
          setIsGeneratingVideo(false);
          setVideoProgress(null);

          // 크레딧 환불되었으므로 새로고침
          fetchCreditsAndSettings();
          alert('❌ 영상 생성 실패: ' + (statusData.error || '알 수 없는 오류'));
        } else if (statusData.status === 'cancelled') {
          // 취소 상태는 UI만 업데이트, 알럿은 표시하지 않음 (버튼에서 이미 표시함)
          clearInterval(checkInterval);
          setPollingInterval(null);
          setIsGeneratingVideo(false);
          setVideoProgress(null);
          localStorage.removeItem('currentJobId');
        }
      } catch (error: any) {
        clearInterval(checkInterval);
        setPollingInterval(null);
        setIsGeneratingVideo(false);
        localStorage.removeItem('currentJobId');
        console.error('Status check error:', error);
      }
    }, 2000); // 2초마다 체크

    setPollingInterval(checkInterval);
  };

  // 대본 생성 상태 폴링 함수
  const startPollingScriptStatus = (scriptId: string) => {
    const checkInterval = setInterval(async () => {
      try {
        const statusResponse = await fetch(`/api/script-status?scriptId=${scriptId}`, {
          headers: getAuthHeaders()
        });
        const statusData = await statusResponse.json();

        if (statusData.status === 'completed') {
          clearInterval(checkInterval);
          setScriptProgress({ current: 100, total: 100 });
          setScriptGenerationLog(prev => [...prev, '✅ 대본 생성 완료!']);
          setScriptGenerationLog(prev => [...prev, `📄 제목: ${statusData.title}`]);

          // 크레딧 업데이트
          fetchCreditsAndSettings();

          // 완료된 대본 정보 저장
          setCompletedScript({
            title: statusData.title,
            content: statusData.content,
            scriptId: scriptId
          });
        } else if (statusData.status === 'failed') {
          clearInterval(checkInterval);
          setIsGeneratingScript(false);
          setScriptGenerationLog([]);
          setScriptProgress(null);

          // 크레딧 환불되었으므로 새로고침
          fetchCreditsAndSettings();
          setToast({
            message: '대본 생성 실패: ' + (statusData.error || '알 수 없는 오류'),
            type: 'error'
          });
          setTimeout(() => setToast(null), 5000);
        } else if (statusData.status === 'processing') {
          // 처리 중 상태 업데이트 - 프로그레스 바, 콘텐츠, 로그 업데이트
          const progress = statusData.progress || 50;
          setScriptProgress({
            current: progress,
            total: 100,
            content: statusData.content || ''
          });

          // 로그 업데이트
          if (statusData.logs && statusData.logs.length > 0) {
            setScriptGenerationLog(statusData.logs);
          }
        }
      } catch (error: any) {
        clearInterval(checkInterval);
        setIsGeneratingScript(false);
        setScriptProgress(null);
        console.error('Script status check error:', error);
      }
    }, 2000); // 2초마다 체크
  };

  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  // Authorization 헤더는 더 이상 사용하지 않음
  const getAuthHeaders = () => {
    return {}; // 빈 객체 반환 (쿠키가 자동으로 전송됨)
  };

  const checkAuth = async () => {
    try {
      setIsInitialLoading(true);

      // 1. 세션 확인
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (data.user) {
        setUser(data.user);
        console.log('✅ 사용자 인증됨:', data.user.email);

        // 2. 크레딧, 설정, 최근 제목 동시에 가져오기
        const [creditsRes, settingsRes, titlesRes] = await Promise.all([
          fetch('/api/credits', { headers: getAuthHeaders() }),
          fetch('/api/settings'),
          fetch('/api/recent-titles', { headers: getAuthHeaders() })
        ]);

        const [creditsData, settingsData, titlesData] = await Promise.all([
          creditsRes.json(),
          settingsRes.json(),
          titlesRes.json()
        ]);

        console.log('📊 API 응답 상태:', {
          credits: creditsRes.status,
          settings: settingsRes.status,
          titles: titlesRes.status
        });

        // 에러 응답 확인
        if (!titlesRes.ok) {
          console.error('❌ 최근 제목 API 호출 실패:', {
            status: titlesRes.status,
            statusText: titlesRes.statusText,
            data: titlesData
          });
          setTitleHistory([]);
        } else {
          console.log('📦 titlesData 전체:', titlesData);

          if (titlesData && titlesData.titles && Array.isArray(titlesData.titles)) {
            setTitleHistory(titlesData.titles);
            console.log('✅ 최근 제목 로드됨:', titlesData.titles.length, '개', titlesData.titles);
          } else {
            console.warn('⚠️ 제목 데이터가 올바르지 않습니다:', titlesData);
            setTitleHistory([]); // 빈 배열로 초기화
          }
        }

        if (creditsData.credits !== undefined) {
          setUser(prev => prev ? {...prev, credits: creditsData.credits} : null);
        }

        if (settingsData) {
          setSettings(settingsData);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      // 모든 초기 데이터 로드 완료
      setIsInitialLoading(false);
    }
  };

  const fetchCreditsAndSettings = async () => {
    try {
      // 크레딧 조회
      const creditsRes = await fetch('/api/credits', {
        headers: getAuthHeaders()
      });
      const creditsData = await creditsRes.json();

      // 설정 조회
      const settingsRes = await fetch('/api/settings');
      const settingsData = await settingsRes.json();

      if (creditsData.credits !== undefined) {
        setUser(prev => prev ? {...prev, credits: creditsData.credits} : null);
      }

      if (settingsData) {
        setSettings(settingsData);
      }
    } catch (error) {
      console.error('크레딧/설정 조회 오류:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      // 쿠키 기반 인증 - 서버에서 쿠키 삭제
      setUser(null);
      showToast('로그아웃 되었습니다.', 'info');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleCancelScript = async () => {
    if (!currentScriptId) {
      showToast('취소할 대본이 없습니다.', 'error');
      return;
    }

    const confirmCancel = window.confirm('대본 생성을 취소하시겠습니까?');
    if (!confirmCancel) return;

    try {
      const response = await fetch(`/api/scripts/${currentScriptId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      if (response.ok) {
        showToast('대본 생성이 취소되었습니다.', 'success');

        // 폴링 중지
        if (scriptPollingInterval) {
          clearInterval(scriptPollingInterval);
          setScriptPollingInterval(null);
        }

        // 상태 초기화
        setIsGeneratingScript(false);
        setScriptProgress(null);
        setCurrentScriptId(null);

        // 크레딧 새로고침
        fetchCreditsAndSettings();
      } else {
        const data = await response.json();
        showToast('취소 실패: ' + (data.error || '알 수 없는 오류'), 'error');
      }
    } catch (error) {
      console.error('Cancel script error:', error);
      showToast('취소 중 오류가 발생했습니다.', 'error');
    }
  };

  // Toast 자동 제거
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000); // 3초 후 자동 제거
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
  };

  // Douyin 영상 다운로드 함수
  const downloadDouyinVideo = async () => {
    if (!douyinUrl.trim()) {
      showToast('Douyin URL을 입력하세요', 'error');
      return;
    }

    if (!douyinUrl.includes('douyin.com') && !douyinUrl.includes('iesdouyin.com')) {
      showToast('올바른 Douyin URL이 아닙니다', 'error');
      return;
    }

    setIsDownloading(true);
    setDownloadedVideo(null);

    try {
      const response = await fetch('/api/douyin/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ videoUrl: douyinUrl })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setDownloadedVideo(data.videoPath);
        showToast('영상 다운로드 완료!', 'success');
      } else {
        showToast('다운로드 실패: ' + data.error, 'error');
      }
    } catch (error: any) {
      showToast('다운로드 실패: ' + error.message, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  // SORA2 대본 생성
  const generateSora2Script = async () => {
    if (!manualTitle.trim()) {
      showToast('주제를 먼저 입력해주세요', 'error');
      return;
    }

    try {
      showToast('SORA2 전용 대본 생성 중...', 'info');

      const response = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          topic: manualTitle.trim(),
          videoFormat: 'sora2' // SORA2 전용 프롬프트 사용
        })
      });

      if (!response.ok) {
        throw new Error('대본 생성 실패');
      }

      const data = await response.json();
      setSora2Script(data.script);
      setShowSora2Review(true);
      showToast('SORA2 대본 생성 완료! 확인 후 비디오 제작으로 진행하세요', 'success');

    } catch (error) {
      console.error('SORA2 script generation error:', error);
      showToast('SORA2 대본 생성 실패: ' + (error as Error).message, 'error');
    }
  };

  // SORA2 비디오 생성 (대본 확인 후)
  const startSora2VideoGeneration = async () => {
    try {
      showToast('SORA2 비디오 생성 시작...', 'info');

      const response = await fetch('/api/sora/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          script: sora2Script,
          title: manualTitle.trim()
        })
      });

      if (!response.ok) {
        throw new Error('SORA2 비디오 생성 실패');
      }

      const data = await response.json();
      showToast('SORA2 비디오 생성 시작! 작업 ID: ' + data.taskId, 'success');
      setShowSora2Review(false);

    } catch (error) {
      console.error('SORA2 generation error:', error);
      showToast('SORA2 비디오 생성 실패: ' + (error as Error).message, 'error');
    }
  };

  const hasCategoryFilter = selectedCategories.length > 0;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const filters: StoredFilters = {
      viewRange,
      subRange,
      videoType,
      dateFilter,
      sortBy,
      selectedCategories,
      titleQuery,
      durationRange,
      selectedModel,
    };

    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    cachedFilters = filters;
  }, [viewRange, subRange, videoType, dateFilter, sortBy, selectedCategories, titleQuery, durationRange, selectedModel]);

  const pushLog = useCallback((message: string) => {
    setLogs((prev) => {
      const timestamp = new Date().toLocaleTimeString("ko-KR", { hour12: false });
      const next = [...prev, `[${timestamp}] ${message}`];
      if (next.length > MAX_LOG_LINES) {
        return next.slice(next.length - MAX_LOG_LINES);
      }
      return next;
    });
  }, []);

  const runPipeline = useCallback(async (): Promise<RunPipelinePayload | null> => {
    if (!selectedIds.length) {
      alert('영상 하나 이상을 선택해주세요.');
      return null;
    }

    const selectedVideos = videos.filter((video) => selectedIds.includes(video.id));
    if (!selectedVideos.length) {
      alert('선택한 영상 정보를 찾지 못했습니다.');
      return null;
    }

    setIsPipelineProcessing(true);
    pushLog(`파이프라인 준비 시작 (${selectedVideos.length}건)`);

    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos: selectedVideos, model: selectedModel }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof payload.error === 'string'
            ? payload.error
            : '파이프라인 준비 중 오류가 발생했습니다.';
        pushLog(`오류: ${message}`);
        alert(message);
        return null;
      }

      const results = Array.isArray(payload.results)
        ? (payload.results as PipelineResultItem[])
        : [];
      const pipelineModel = normalizeModel(
        typeof payload.model === 'string' ? payload.model : selectedModel
      );

      if (!results.length) {
        pushLog('파이프라인 결과 없음');
        alert('파이프라인 결과가 비어 있습니다.');
        return null;
      }

      return { results, pipelineModel, selectedVideos };
    } catch (error) {
      console.error('Pipeline error', error);
      const message =
        error instanceof Error ? error.message : '파이프라인 실행 중 알 수 없는 오류가 발생했습니다.';
      pushLog(`오류: ${message}`);
      alert(message);
      return null;
    } finally {
      setIsPipelineProcessing(false);
    }
  }, [selectedIds, selectedModel, videos, pushLog]);

  const filteredVideos = useMemo(() => {
    let result = videos.filter((video) => {
      const matchType = videoType === "all" || video.type === videoType;
      const matchViews = video.views >= viewRange.min && video.views <= viewRange.max;
      const matchSubs =
        video.channelSubscribers >= subRange.min &&
        video.channelSubscribers <= subRange.max;
      const matchDate = matchesDateFilterLocal(video.publishedAt, dateFilter);
      const matchCategory =
        !hasCategoryFilter || (video.categoryId && selectedCategories.includes(video.categoryId));
      const matchTitle =
        !titleQuery.trim() || video.title.toLowerCase().includes(titleQuery.trim().toLowerCase());
      const durationSecondsValue = typeof video.durationSeconds === 'number'
        ? video.durationSeconds
        : 0;
      const minDurationSeconds = durationRange.min * 60;
      const maxDurationSeconds = durationRange.max * 60;
      const matchDuration =
        durationSecondsValue >= minDurationSeconds && durationSecondsValue <= maxDurationSeconds;

      return matchType && matchViews && matchSubs && matchDate && matchCategory && matchTitle && matchDuration;
    });

    if (sortBy === "views") {
      result = [...result].sort((a, b) => b.views - a.views);
    }
    if (sortBy === "recent") {
      result = [...result].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    }
    if (sortBy === "vph") {
      result = [...result].sort((a, b) => calculateVph(b) - calculateVph(a));
    }

    return result;
  }, [videos, videoType, viewRange, subRange, dateFilter, sortBy, selectedCategories, hasCategoryFilter, titleQuery, durationRange]);

  const fetchVideos = useCallback(async () => {
    setIsFetching(true);
    setErrorMessage(null);
    pushLog("YouTube 데이터 요청 시작");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoType,
          dateFilter,
          sortBy,
          viewRange,
          subRange,
          categoryIds: selectedCategories,
          titleQuery,
          durationRangeSeconds: {
            min: durationRange.min * 60,
            max: durationRange.max * 60,
          },
          model: selectedModel,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : "YouTube API 요청에 실패했습니다. 환경 변수와 쿼터를 확인하세요.";
        pushLog(`오류: ${message}`);
        throw new Error(message);
      }

      const items = Array.isArray(payload.videos) ? (payload.videos as VideoItem[]) : [];
      setVideos(items.length ? items : []);
      setSelectedIds([]);
      const fetchedAt = new Date().toISOString();
      setLastFetchedAt(fetchedAt);

      // localStorage에 영상 목록 저장
      if (items.length > 0) {
        localStorage.setItem('trend-video-results', JSON.stringify(items));
        localStorage.setItem('trend-video-fetched-at', fetchedAt);
      }

      if (!items.length) {
        const message = "조건에 맞는 영상이 없습니다. 필터를 조정해보세요.";
        setErrorMessage(message);
        pushLog("조회 결과 없음");
      } else {
        pushLog(`성공: ${items.length}개 영상 수신 (저장됨)`);
      }
    } catch (error) {
      console.error("Failed to fetch YouTube data", error);
      const message =
        error instanceof Error
          ? error.message
          : "YouTube API 호출에 실패했습니다. API 키를 확인해주세요.";
      setErrorMessage(message);
      setVideos(fallbackVideos);
      pushLog(`오류: ${message}`);
    } finally {
      setIsFetching(false);
    }
  }, [videoType, dateFilter, sortBy, viewRange, subRange, selectedCategories, titleQuery, durationRange, selectedModel, pushLog]);

  const toggleSelect = useCallback((videoId: string) => {
    setSelectedIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
  }, []);

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleRunAutomation = useCallback(async () => {
    // 파일 업로드 섹션 표시
    setShowUploadSection(true);

    // 조건에 따라 토스트 메시지 변경
    let message = '';
    if (videoFormat === 'sora2') {
      message = '📤 JSON 대본을 업로드해주세요. (이미지 불필요)';
    } else if (productionMode === 'merge') {
      message = '📤 JSON 대본과 비디오 파일들을 업로드해주세요.';
    } else if (imageSource === 'none') {
      message = '이미지들을 업로드해주세요.';
    } else if (imageSource === 'dalle') {
      message = '📤 JSON 대본을 업로드해주세요. (DALL-E가 이미지 자동 생성)';
    } else if (imageSource === 'google') {
      message = '📤 JSON 대본을 업로드해주세요. (Google에서 이미지 자동 검색)';
    }

    showToast(message, 'info');

    // 업로드 섹션으로 스크롤
    setTimeout(() => {
      uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [videoFormat, imageSource]);

  const handleMoveToLLM = useCallback(async () => {
    // 영상이 선택되지 않았으면 프롬프트만 복사하고 모델 홈페이지로 이동
    if (!selectedIds.length) {
      try {
        // 프롬프트 파일 가져오기
        const response = await fetch(`/api/prompt?format=${videoFormat}`);

        if (!response.ok) {
          showToast('프롬프트를 가져오는데 실패했습니다.', 'error');
          return;
        }

        const data = await response.json();

        if (data.content) {
          // 안전한 클립보드 복사
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(data.content);
            } else {
              // 폴백: textarea를 사용한 복사
              const textarea = document.createElement('textarea');
              textarea.value = data.content;
              textarea.style.position = 'fixed';
              textarea.style.opacity = '0';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
            }
            showToast('프롬프트가 클립보드에 복사되었습니다!', 'success');
          } catch (clipError) {
            console.error('클립보드 복사 실패:', clipError);
            showToast('클립보드 복사 실패', 'error');
          }
        }

        // 모델 홈페이지 열기
        const modelUrls: Record<string, string> = {
          'gpt': 'https://chatgpt.com',
          'gemini': 'https://gemini.google.com',
          'claude': 'https://claude.ai',
          'groq': 'https://groq.com'
        };

        const url = modelUrls[selectedModel] || 'https://chatgpt.com';
        window.open(url, '_blank');
      } catch (error) {
        console.error('프롬프트 복사 실패:', error);
        showToast('프롬프트 복사에 실패했습니다.', 'error');
      }
      return;
    }

    const blankTabs: Array<Window | null> = [];
    if (typeof window !== 'undefined') {
      selectedIds.forEach(() => {
        const tab = window.open('about:blank', '_blank');
        blankTabs.push(tab);
      });
    }

    const payload = await runPipeline();
    if (!payload) {
      blankTabs.forEach((tab) => tab?.close());
      return;
    }

    const { results, pipelineModel, selectedVideos } = payload;

    results.forEach((item, index) => {
      const matchedVideo = selectedVideos.find((video) => video.id === item.id);
      if (matchedVideo) {
        const targetTab = blankTabs[index] ?? null;
        const prompt = composeLLMPrompt({ item, video: matchedVideo, model: pipelineModel });
        openModelTab(pipelineModel, matchedVideo, prompt, targetTab);
      } else {
        blankTabs[index]?.close();
      }
    });

    if (blankTabs.length > results.length) {
      blankTabs.slice(results.length).forEach((tab) => tab?.close());
    }

    pushLog(`LLM 이동 완료 (${results.length}건)`);
    alert(`✅ 모델: ${pipelineModel.toUpperCase()}로 ${results.length}개 탭을 열었습니다.\n\n📋 각 탭의 프롬프트가 클립보드에 복사되었습니다.\n(마지막 탭의 내용이 클립보드에 남아있습니다)\n\n이제 LLM 사이트에서 Ctrl+V로 붙여넣으세요.`);
  }, [runPipeline, pushLog, selectedIds, videoFormat, selectedModel]);

  const handleGenerateSubtitle = useCallback(async () => {
    if (!selectedIds.length) {
      alert('영상을 먼저 선택해주세요.');
      return;
    }

    const selectedVideos = videos.filter(v => selectedIds.includes(v.id));

    if (selectedVideos.length === 0) {
      alert('선택한 영상이 없습니다.');
      return;
    }

    setIsTransforming(true);

    try {
      // 모든 선택된 영상에 대해 병렬로 제목 변형 요청
      const transformPromises = selectedVideos.map(async (video) => {
        try {
          const response = await fetch('/api/transform-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: video.title })
          });

          const data = await response.json();

          if (data.options && data.options.length > 0) {
            return {
              original: data.original,
              options: data.options,
              selected: 0,
              success: true
            };
          } else {
            return {
              original: video.title,
              options: [video.title],
              selected: 0,
              success: false,
              error: data.error
            };
          }
        } catch (error) {
          console.error(`Error transforming title for "${video.title}":`, error);
          return {
            original: video.title,
            options: [video.title],
            selected: 0,
            success: false,
            error: '변형 실패'
          };
        }
      });

      const results = await Promise.all(transformPromises);

      // 실패한 것이 있는지 확인
      const failedCount = results.filter(r => !r.success).length;
      if (failedCount > 0) {
        alert(`⚠️ ${failedCount}개의 제목 변형에 실패했습니다.\n원본 제목이 표시됩니다.`);
      }

      setTransformedTitles(results);
      setShowTitleModal(true);
    } catch (error) {
      console.error(error);
      alert('❌ 제목 변형 중 오류가 발생했습니다.');
    } finally {
      setIsTransforming(false);
    }
  }, [selectedIds, videos]);

  const handleRegenerateTitles = useCallback(async (index: number) => {
    if (index < 0 || index >= transformedTitles.length) return;

    const item = transformedTitles[index];
    setIsTransforming(true);

    try {
      const response = await fetch('/api/transform-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.original })
      });

      const data = await response.json();

      if (data.options && data.options.length > 0) {
        const newTitles = [...transformedTitles];
        newTitles[index] = { ...item, options: data.options, selected: 0 };
        setTransformedTitles(newTitles);
      } else {
        alert('❌ ' + (data.error || '제목 재생성에 실패했습니다.'));
      }
    } catch (error) {
      console.error(error);
      alert('❌ 제목 재생성 중 오류가 발생했습니다.');
    } finally {
      setIsTransforming(false);
    }
  }, [transformedTitles]);

  const handleSelectOption = useCallback((titleIndex: number, optionIndex: number) => {
    const newTitles = [...transformedTitles];
    newTitles[titleIndex] = { ...newTitles[titleIndex], selected: optionIndex };
    setTransformedTitles(newTitles);
  }, [transformedTitles]);

  const lastFetchedLabel = lastFetchedAt
    ? new Date(lastFetchedAt).toLocaleString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // 초기 로딩 중일 때 로딩 화면 표시
  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-300 text-lg">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 메인 컨텐츠 */}
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 pb-8 sm:pb-16 text-slate-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 sm:gap-10 sm:px-6">


        {/* AI 콘텐츠 생성 Flow */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">🎬 AI 콘텐츠 생성 Flow</h3>
              <p className="mt-1 text-xs text-slate-300">
                AI 대본을 생성하고, LLM을 사용하거나 자동으로 영상을 제작하세요.
              </p>
            </div>
            {/* 롱폼/숏폼/SORA2/상품 선택 */}
            <div className="flex gap-2">
              <button
                onClick={() => handleFormatChange('longform')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  videoFormat === 'longform'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                🎬 롱폼
              </button>
              <button
                onClick={() => handleFormatChange('shortform')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  videoFormat === 'shortform'
                    ? 'bg-pink-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                📱 숏폼
              </button>
              <button
                onClick={() => handleFormatChange('sora2')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  videoFormat === 'sora2'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                🎥 SORA2
              </button>
              <button
                onClick={() => handleFormatChange('product')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  videoFormat === 'product'
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                🛍️ 상품
              </button>
            </div>
          </div>
          <div className="mb-4 h-px bg-white/10"></div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Flow 1: AI 대본 생성 */}
            <div data-ai-script-section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 backdrop-blur">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">1</span>
                    <h4 className="text-sm font-semibold text-emerald-300">AI 대본 생성</h4>
                  </div>
                  <p className="text-xs text-slate-400">
                    주제를 입력하여 AI로 대본을 생성하거나 프롬프트를 복사하세요
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {user?.isAdmin && (
                  <button
                    onClick={async () => {
                      setShowTitleInput(true);
                      setTitleInputMode('copy');
                      setManualTitle('');
                      setSuggestedTitles([]);
                      setSelectedSuggestedTitle(null);
                    }}
                    className={`w-full rounded-xl px-5 py-3.5 text-base font-semibold text-white transition ${
                      titleInputMode === 'copy' && showTitleInput
                        ? 'bg-slate-600 ring-2 ring-slate-400'
                        : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    🚀 Claude로 열기
                  </button>
                )}
                {user?.isAdmin && (
                  <button
                    onClick={async () => {
                      setShowTitleInput(true);
                      setTitleInputMode('generate-api');
                      setManualTitle('');
                      setSuggestedTitles([]);
                      setSelectedSuggestedTitle(null);
                    }}
                    className={`w-full rounded-xl px-5 py-3.5 text-base font-semibold text-white transition ${
                      titleInputMode === 'generate-api' && showTitleInput
                        ? 'bg-red-500 ring-2 ring-red-300'
                        : 'bg-red-600 hover:bg-red-500'
                    }`}
                  >
                    🔴 AI 대본생성(API)
                  </button>
                )}
                <button
                  onClick={async () => {
                    setShowTitleInput(true);
                    setTitleInputMode('generate');
                    setManualTitle('');
                    setSuggestedTitles([]);
                    setSelectedSuggestedTitle(null);
                  }}
                  className={`w-full rounded-xl px-5 py-3.5 text-base font-semibold text-white transition ${
                    titleInputMode === 'generate' && showTitleInput
                      ? 'bg-emerald-500 ring-2 ring-emerald-300'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  🤖 AI 대본 생성
                </button>
              </div>
            </div>

            {/* Flow 2: 영상 제작 */}
            <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 backdrop-blur">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white">2</span>
                    <h4 className="text-sm font-semibold text-purple-300">영상 제작</h4>
                  </div>
                  <p className="text-xs text-slate-400">
                    영상 제작 또는 영상 병합을 선택하세요
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* 큰 버튼: 영상제작 */}
                <button
                  type="button"
                  onClick={() => {
                    setProductionMode('create');
                    handleRunAutomation();
                  }}
                  disabled={isPipelineProcessing}
                  className="w-full rounded-xl bg-purple-600 px-5 py-3.5 text-base font-semibold text-white transition hover:bg-purple-500 disabled:cursor-wait disabled:opacity-70"
                >
                  {isPipelineProcessing && productionMode === 'create' ? '⏳ 제작 중...' : '🎬 영상 제작'}
                </button>

                {/* 큰 버튼: 영상병합 */}
                <button
                  type="button"
                  onClick={() => {
                    setProductionMode('merge');
                    handleRunAutomation();
                  }}
                  disabled={isPipelineProcessing}
                  className="w-full rounded-xl bg-teal-600 px-5 py-3.5 text-base font-semibold text-white transition hover:bg-teal-500 disabled:cursor-wait disabled:opacity-70"
                >
                  {isPipelineProcessing && productionMode === 'merge' ? '⏳ 병합 중...' : '🎞️ 영상 병합'}
                </button>

                {/* 큰 버튼: 중국영상변환 */}
                <button
                  type="button"
                  onClick={() => {
                    setShowChineseConverter(!showChineseConverter);
                    if (!showChineseConverter) {
                      // 섹션이 열릴 때 다른 섹션들 닫기
                      setShowTitleInput(false);
                      setShowUploadSection(false);

                      // 섹션으로 스크롤
                      setTimeout(() => {
                        chineseConverterSectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start'
                        });
                      }, 100);
                    }
                  }}
                  disabled={isPipelineProcessing || isConvertingChinese}
                  className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-600 px-5 py-3.5 text-base font-semibold text-white transition hover:from-red-500 hover:to-orange-500 disabled:cursor-wait disabled:opacity-70"
                >
                  {isConvertingChinese ? '⏳ 변환 중...' : '🇨🇳 중국영상변환'}
                </button>

                {/* Douyin 영상 크롤링 버튼 */}
                <div className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/10 p-4 backdrop-blur">
                  <h3 className="mb-2 text-sm font-semibold text-cyan-300">🎬 Douyin 영상 크롤링</h3>
                  <p className="mb-3 text-xs text-slate-400">Douyin 링크로 워터마크 없는 영상 다운로드</p>

                  <input
                    type="text"
                    value={douyinUrl}
                    onChange={(e) => setDouyinUrl(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && douyinUrl.trim() && !isDownloading) {
                        downloadDouyinVideo();
                      }
                    }}
                    placeholder="https://www.douyin.com/video/..."
                    className="mb-3 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={downloadDouyinVideo}
                    disabled={isDownloading || !douyinUrl.trim()}
                    className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-cyan-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDownloading ? '⏳ 다운로드 중...' : '📥 영상 다운로드'}
                  </button>

                  {downloadedVideo && (
                    <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-900/20 p-3">
                      <p className="text-xs font-semibold text-emerald-300">✅ 다운로드 완료</p>
                      <p className="mt-1 break-all text-xs text-emerald-200">{downloadedVideo}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI 대본 제목 입력 */}
        {showTitleInput && (
        <section className="rounded-3xl border border-emerald-500/20 bg-emerald-950/20 p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-emerald-400">
              {titleInputMode === 'copy' ? '🚀 Claude로 열기' :
               titleInputMode === 'generate-api' ? '🔴 AI 대본생성(API)' :
               '🤖 AI 대본 생성'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowTitleInput(false);
                setManualTitle('');
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          {/* 선택된 모드 표시 */}
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-white/10 px-4 py-3">
            <span className="text-2xl">
              {titleInputMode === 'copy' ? '📋' : titleInputMode === 'generate-api' ? '🔴' : '🤖'}
            </span>
            <div>
              <div className="text-sm font-semibold text-white">
                {titleInputMode === 'copy'
                  ? '프롬프트 복사 모드 (무료)'
                  : titleInputMode === 'generate-api'
                  ? '⚠️ Claude API 직접 호출 (관리자 전용)'
                  : `AI 대본 생성 모드 (${settings?.aiScriptCost || 25} 크레딧)`}
              </div>
              <div className="text-xs text-slate-400">
                {titleInputMode === 'copy'
                  ? 'Claude.ai를 새 탭으로 열고 프롬프트를 클립보드에 복사합니다 (Ctrl+V로 붙여넣기)'
                  : titleInputMode === 'generate-api'
                  ? 'Claude API를 직접 호출합니다 (테스트용, 비용 발생)'
                  : '로컬 Claude로 대본을 생성합니다 (실패 시 API 사용)'}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              영상 제목을 입력하세요
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => {
                  setManualTitle(e.target.value);
                  setSuggestedTitles([]);
                  setSelectedSuggestedTitle(null);
                }}
                placeholder="예: 70대 할머니의 첫 해외여행 이야기"
                className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualTitle.trim() && !isGeneratingScript) {
                    e.currentTarget.nextElementSibling?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                  }
                }}
              />
              <button
                onClick={async () => {
                  console.log('=== 버튼 클릭됨 ===');
                  console.log('manualTitle:', manualTitle);
                  console.log('titleInputMode:', titleInputMode);
                  console.log('user:', user);
                  console.log('settings:', settings);
                  try {
                    if (!manualTitle.trim()) {
                      setToast({
                        message: '제목을 입력해주세요.',
                        type: 'error'
                      });
                      setTimeout(() => setToast(null), 3000);
                      return;
                    }

                    // 제목을 히스토리에 추가
                    addToTitleHistory(manualTitle.trim());

                    if (titleInputMode === 'copy') {
                    // Claude로 프롬프트 열기 - /api/prompt에서 텍스트 파일 전체 내용 가져오기
                    try {
                      const response = await fetch(`/api/prompt?format=${videoFormat}`);

                      if (!response.ok) {
                        throw new Error(`API 오류: ${response.status}`);
                      }

                      const data = await response.json();

                      if (data.content) {
                        // 파일 전체 내용에 주제 추가
                        const promptContent = `${data.content}\n\n주제: ${manualTitle.trim()}\n\n위 주제로 영상 대본을 작성해주세요.`;

                        // API 호출로 Playwright 자동화 실행
                        try {
                          setToast({
                            message: `🚀 Claude.ai 자동 실행 중... 잠시만 기다려주세요.`,
                            type: 'info'
                          });

                          const response = await fetch('/api/claude/auto-open', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              prompt: promptContent
                            })
                          });

                          const result = await response.json();

                          if (result.success) {
                            setToast({
                              message: `✅ Claude.ai가 자동으로 열리고 프롬프트가 전송됩니다!`,
                              type: 'success'
                            });
                            setTimeout(() => setToast(null), 5000);
                            setShowTitleInput(false);
                            setManualTitle('');
                          } else {
                            setToast({
                              message: `❌ 실패: ${result.error}`,
                              type: 'error'
                            });
                            setTimeout(() => setToast(null), 5000);
                          }
                        } catch (error) {
                          console.error('Claude 자동 실행 실패:', error);
                          setToast({
                            message: 'Claude 자동 실행에 실패했습니다.',
                            type: 'error'
                          });
                          setTimeout(() => setToast(null), 5000);
                        }
                      } else {
                        console.error('프롬프트 데이터:', data);
                        setToast({
                          message: '프롬프트를 찾을 수 없습니다. prompt*.txt 파일이 프로젝트 루트에 있는지 확인하세요.',
                          type: 'error'
                        });
                        setTimeout(() => setToast(null), 5000);
                      }
                    } catch (error) {
                      console.error('프롬프트 복사 오류:', error);
                      setToast({
                        message: '프롬프트 복사 중 오류가 발생했습니다.',
                        type: 'error'
                      });
                      setTimeout(() => setToast(null), 5000);
                    }
                  } else if (titleInputMode === 'generate-api') {
                    // AI 대본생성(API) - 확인 모달 표시
                    if (!user || !settings) {
                      setToast({
                        message: '사용자 정보를 불러오는 중입니다.',
                        type: 'error'
                      });
                      setTimeout(() => setToast(null), 3000);
                      return;
                    }

                    setScriptConfirmData({
                      cost: settings.aiScriptCost,
                      currentCredits: user.credits,
                      title: manualTitle.trim(),
                      mode: 'generate-api'
                    });
                    setShowScriptConfirmModal(true);
                  } else {
                    // AI 대본 생성 (로컬 Claude 사용) - 확인 모달 표시
                    if (!user || !settings) {
                      console.error('❌ 사용자 정보 또는 설정 없음:', { user, settings });
                      setToast({
                        message: !user ? '로그인이 필요합니다.' : '설정을 불러오는 중입니다. 잠시 후 다시 시도해주세요.',
                        type: 'error'
                      });
                      setTimeout(() => setToast(null), 3000);
                      return;
                    }

                    setScriptConfirmData({
                      cost: settings.aiScriptCost,
                      currentCredits: user.credits,
                      title: manualTitle.trim(),
                      mode: 'generate'
                    });
                    setShowScriptConfirmModal(true);
                  }
                  } catch (error) {
                    console.error('Button onClick error:', error);
                    setToast({
                      message: `오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
                      type: 'error'
                    });
                    setTimeout(() => setToast(null), 5000);
                  }
                }}
                // 모달에서 확인하면 실행됨 - 아래 주석 처리된 코드는 사용하지 않음
                /*
                    setIsGeneratingScript(true);
                    setShowScriptLogs(true); // 로그창 처음부터 열기
                    setScriptProgress({ current: 0, total: 100 });
                    setScriptGenerationLogs([{
                      timestamp: new Date().toISOString(),
                      message: '🖥️ 로컬 Claude를 사용하여 대본 생성 시작...'
                    }]);

                    try {
                      const response = await fetch('/api/scripts/generate', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                          title: manualTitle.trim(),
                          type: videoFormat
                        })
                      });

                      const data = await response.json();

                      if (!response.ok) {
                        throw new Error(data.error || '대본 생성에 실패했습니다.');
                      }

                      // 스크립트 ID 확인 (API는 taskId로 반환)
                      if (!data.taskId) {
                        console.error('API 응답에 taskId가 없습니다:', data);
                        throw new Error('스크립트 ID를 받지 못했습니다.');
                      }

                      // 스크립트 ID 저장
                      const scriptId = data.taskId;
                      setCurrentScriptId(scriptId);
                      console.log('대본 생성 시작, ID:', scriptId);

                      setScriptGenerationLogs(prev => [...prev, {
                        timestamp: new Date().toISOString(),
                        message: `📝 대본 생성 작업 시작 (ID: ${scriptId.substring(0, 8)}...)`
                      }]);

                      // 2초마다 상태 확인하는 폴링 시작
                      let checkCount = 0;
                      const maxChecks = 180; // 최대 6분 대기

                      const interval = setInterval(async () => {
                        try {
                          const statusResponse = await fetch(`/api/scripts?id=${scriptId}`, {
                            headers: getAuthHeaders()
                          });
                          const statusData = await statusResponse.json();

                          // 진행률과 로그 업데이트
                          if (statusData.script?.logs && statusData.script.logs.length > 0) {
                            const formattedLogs = statusData.script.logs.map((log: any) => ({
                              timestamp: typeof log === 'object' ? log.timestamp : new Date().toISOString(),
                              message: typeof log === 'object' ? log.message : log
                            }));
                            setScriptGenerationLogs(formattedLogs);

                            // 로그 개수로 대략적인 진행률 계산 (최대 90%까지)
                            const progress = Math.min(Math.floor((statusData.script.logs.length / 10) * 90), 90);
                            setScriptProgress({ current: progress, total: 100 });
                          }

                          if (statusData.script?.status === 'DONE') {
                            // 완료!
                            clearInterval(interval);
                            setScriptPollingInterval(null);
                            setScriptProgress({ current: 100, total: 100 });
                            setScriptGenerationLogs(prev => [...prev, {
                              timestamp: new Date().toISOString(),
                              message: '✅ 대본 생성 완료!'
                            }]);

                            const scriptContent = statusData.script.message || '{}';
                            setCompletedScript({
                              title: manualTitle.trim(),
                              content: scriptContent,
                              scriptId: scriptId
                            });

                            // 크레딧 업데이트
                            fetchCreditsAndSettings();

                            setToast({
                              message: '대본이 생성되었습니다!',
                              type: 'success'
                            });
                            setTimeout(() => setToast(null), 3000);
                            setShowTitleInput(false);
                            setManualTitle('');
                            setIsGeneratingScript(false);
                            setCurrentScriptId(null);
                          } else if (statusData.script?.status === 'ERROR') {
                            clearInterval(interval);
                            setScriptPollingInterval(null);
                            setIsGeneratingScript(false);

                            // 에러 로그 추가 (기존 로그 유지)
                            if (statusData.script.logs && statusData.script.logs.length > 0) {
                              const formattedLogs = statusData.script.logs.map((log: any) => ({
                                timestamp: typeof log === 'object' ? log.timestamp : new Date().toISOString(),
                                message: typeof log === 'object' ? log.message : log
                              }));
                              setScriptGenerationLogs(formattedLogs);
                            }
                            setScriptGenerationLogs(prev => [...prev, {
                              timestamp: new Date().toISOString(),
                              message: `❌ 오류: ${statusData.script?.message || '알 수 없는 오류'}`
                            }]);

                            // 진행률은 에러 표시를 위해 유지
                            setScriptProgress({ current: 0, total: 100 });
                            setCurrentScriptId(null);

                            // 크레딧 환불되었으므로 새로고침
                            fetchCreditsAndSettings();

                            setToast({
                              message: statusData.script?.message || '대본 생성 중 오류가 발생했습니다.',
                              type: 'error'
                            });
                            setTimeout(() => setToast(null), 5000);
                          } else {
                            // 아직 진행 중
                            checkCount++;
                            if (checkCount >= maxChecks) {
                              clearInterval(interval);
                              setScriptPollingInterval(null);
                              setIsGeneratingScript(false);

                              // 타임아웃 로그 추가 (기존 로그 유지)
                              setScriptGenerationLogs(prev => [...prev, {
                                timestamp: new Date().toISOString(),
                                message: '⏱️ 대본 생성 시간이 초과되었습니다.'
                              }]);

                              // 진행률은 타임아웃 표시를 위해 유지
                              setScriptProgress({ current: 0, total: 100 });
                              setCurrentScriptId(null);

                              setToast({
                                message: '대본 생성 시간이 초과되었습니다.',
                                type: 'error'
                              });
                              setTimeout(() => setToast(null), 5000);
                            }
                          }
                        } catch (error: any) {
                          clearInterval(interval);
                          setScriptPollingInterval(null);
                          setIsGeneratingScript(false);
                          setCurrentScriptId(null);

                          setToast({
                            message: error.message || '대본 상태 확인 중 오류가 발생했습니다.',
                            type: 'error'
                          });
                          setTimeout(() => setToast(null), 5000);
                        }
                      }, 2000);

                      setScriptPollingInterval(interval);

                      setToast({
                        message: '로컬 Claude로 대본 생성 중... 잠시만 기다려주세요.',
                        type: 'info'
                      });
                    } catch (error: any) {
                      console.error(error);
                      setIsGeneratingScript(false);
                      setCurrentScriptId(null);

                      setToast({
                        message: error.message || 'AI 대본 생성 중 오류가 발생했습니다.',
                        type: 'error'
                      });
                      setTimeout(() => setToast(null), 5000);
                    }
                    */
                disabled={!manualTitle.trim() || isGeneratingScript}
                className="rounded-lg bg-emerald-600 px-8 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGeneratingScript ? '⏳ 생성 중...' : titleInputMode === 'copy' ? '🚀 열기' : '🤖 생성'}
              </button>
            </div>

            {/* 제목 히스토리 - 디버깅 */}
            <div className="mt-4">
              <label className="mb-2 block text-xs font-medium text-slate-400">
                📝 최근 사용한 제목 (클릭하여 재사용) {titleHistory.length > 0 ? `(${titleHistory.length}개)` : '(로딩 중...)'}
              </label>
              {titleHistory.length > 0 ? (
                <div className="max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="flex flex-wrap gap-2">
                    {titleHistory.map((title, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setManualTitle(title);
                          setSuggestedTitles([]);
                          setSelectedSuggestedTitle(null);
                        }}
                        className="rounded-md bg-emerald-600/20 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-600/40 hover:text-emerald-100"
                        title={title}
                      >
                        {title.length > 30 ? title.substring(0, 30) + '...' : title}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-xs text-slate-500">
                  최근 대본이 없습니다. 대본을 생성하면 여기에 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {/* 대본 생성 중 UI */}
        {!completedScript && scriptProgress && (
          <section className="rounded-3xl border border-purple-500/20 bg-purple-950/20 p-6 backdrop-blur mt-6">
            <div className="space-y-4">
              {/* 진행률 바 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">대본 생성 진행률</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-purple-400">
                      {scriptProgress.current}%
                    </span>
                    <button
                      onClick={handleCancelScript}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500 cursor-pointer"
                      title="대본 생성 중지"
                    >
                      🛑 중지
                    </button>
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
                    style={{ width: `${scriptProgress.current}%` }}
                  />
                </div>
              </div>

              {/* 생성 중인 대본 미리보기 */}
              {scriptProgress.content && (
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-6">
                  <h4 className="mb-3 text-lg font-semibold text-purple-300">📝 생성 중인 대본</h4>
                  <div ref={scriptContentRef} className="max-h-96 overflow-y-auto rounded bg-slate-900/50 p-4">
                    <pre className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed">{scriptProgress.content}</pre>
                  </div>
                  <div className="mt-3 text-right text-sm text-purple-400 font-semibold">
                    {scriptProgress.content.length.toLocaleString()}자 생성됨
                  </div>
                </div>
              )}

              {/* 로그 */}
              {scriptGenerationLogs.length > 0 && (
                <div ref={scriptGenerationLogRef} className="max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                  <div className="space-y-1">
                    {scriptGenerationLogs.map((log, idx) => {
                      // API 사용 여부 감지
                      const isUsingAPI = log.message.includes('Claude API') ||
                                        log.message.includes('API 호출') ||
                                        log.message.includes('Using Claude API') ||
                                        log.message.includes('💰');
                      const isUsingLocal = log.message.includes('로컬 Claude') ||
                                          log.message.includes('Local Claude') ||
                                          log.message.includes('python') ||
                                          log.message.includes('🖥️');

                      return (
                        <div key={idx} className="text-sm text-slate-300 font-mono">
                          <span className="text-blue-400">[{new Date(log.timestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                          {isUsingAPI && <span className="font-bold text-red-500 mr-1">[💰 API]</span>}
                          {isUsingLocal && <span className="font-bold text-green-500 mr-1">[🖥️ 로컬]</span>}
                          {log.message}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 파일 업로드로 직접 영상 생성 */}
        {showUploadSection && (
        <section ref={uploadSectionRef} className="rounded-3xl border border-purple-500/20 bg-purple-950/20 p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-purple-400">📤 파일 업로드로 영상 생성</h2>
            <button
              type="button"
              onClick={() => setShowUploadSection(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
          <p className="mb-4 text-sm text-slate-300">
            {videoFormat === 'sora2'
              ? 'JSON 대본을 업로드하여 AI 시네마틱 영상을 생성하세요. (이미지 불필요)'
              : productionMode === 'merge'
              ? '여러 개의 비디오 파일을 업로드하여 하나로 병합하세요. TTS 나레이션 추가 가능'
              : 'JSON 대본을 업로드하고, 이미지 소스를 선택하여 영상을 생성하세요.'}
          </p>

          <div className="space-y-4">
            {/* VIDEO-MERGE 안내 메시지 */}
            {productionMode === 'merge' && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🎞️</span>
                <div>
                  <p className="text-sm font-semibold text-orange-200 mb-1">
                    영상 병합 모드: 여러 비디오를 하나로 연결합니다
                  </p>
                  <p className="text-xs text-orange-300/80">
                    1개 이상의 비디오 파일을 업로드하면 순서대로 병합됩니다. 선택적으로 TTS 나레이션을 추가할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
            )}

            {/* SORA2 안내 메시지 */}
            {productionMode !== 'merge' && videoFormat === 'sora2' && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🎬</span>
                <div>
                  <p className="text-sm font-semibold text-cyan-200 mb-1">
                    SORA2 모드: 이미지 없이 AI가 영상을 생성합니다
                  </p>
                  <p className="text-xs text-cyan-300/80">
                    JSON 대본만 업로드하면 SoraExtend가 자동으로 8초 시네마틱 영상을 제작합니다.
                  </p>
                </div>
              </div>
            </div>
            )}

            {/* 통합 파일 업로드 (VIDEO-MERGE 전용) */}
            {productionMode === 'merge' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                📁 JSON/TXT 대본과 비디오 파일들을 한번에 드래그하세요
              </label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);

                  const files = Array.from(e.dataTransfer.files);

                  // JSON/TXT 파일 분류
                  const jsonFile = files.find(f =>
                    f.type === 'application/json' ||
                    f.name.endsWith('.json') ||
                    f.name.endsWith('.txt')
                  );

                  // 비디오 파일 분류
                  const videoFiles = files.filter(f => f.type.startsWith('video/'));

                  if (jsonFile) {
                    setUploadedJson(jsonFile);
                    showToast('✅ JSON/TXT 파일 업로드 완료', 'success');
                  }

                  if (videoFiles.length > 0) {
                    setUploadedVideos(prev => [...prev, ...videoFiles]);
                    showToast(`✅ ${videoFiles.length}개 비디오를 업로드했습니다!`, 'success');
                  }

                  if (!jsonFile && videoFiles.length === 0) {
                    showToast('JSON/TXT 또는 비디오 파일을 업로드해주세요.', 'error');
                  }
                }}
                onPaste={async (e) => {
                  e.preventDefault();
                  try {
                    const rawText = e.clipboardData.getData('text');
                    if (!rawText) {
                      showToast('클립보드가 비어있습니다.', 'error');
                      return;
                    }

                    // JSON 파싱 시도
                    try {
                      const text = stripMarkdownCodeBlock(rawText);
                      const jsonData = JSON.parse(text);
                      const blob = new Blob([text], { type: 'application/json' });
                      const file = new File([blob], 'clipboard.json', { type: 'application/json' });
                      setUploadedJson(file);
                      showToast('✅ 클립보드에서 JSON을 가져왔습니다!', 'success');
                    } catch (e) {
                      showToast('클립보드 내용이 올바른 JSON 형식이 아닙니다.', 'error');
                    }
                  } catch (error) {
                    console.error('클립보드 읽기 실패:', error);
                    showToast('클립보드 읽기에 실패했습니다.', 'error');
                  }
                }}
                className={`rounded-lg border-2 border-dashed transition-all ${
                  isDraggingFiles
                    ? 'border-purple-400 bg-purple-500/20'
                    : 'border-white/20 bg-white/5'
                } p-6 text-center mb-4`}
                tabIndex={0}
              >
                <div className="space-y-4">
                  {/* 업로드된 파일 표시 */}
                  {(uploadedJson || uploadedVideos.length > 0) ? (
                    <div className="space-y-3">
                      <div className="text-4xl">✅</div>

                      {/* JSON 파일 표시 */}
                      {uploadedJson && (
                        <div className="rounded-lg bg-purple-500/10 p-3 border border-purple-500/30">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-purple-400">📄 {uploadedJson.name}</p>
                            <button
                              onClick={() => setUploadedJson(null)}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 비디오 파일 표시 */}
                      {uploadedVideos.length > 0 && (
                        <div className="rounded-lg bg-orange-500/10 p-3 border border-orange-500/30">
                          <p className="text-sm text-orange-400 mb-2">🎞️ {uploadedVideos.length}개 비디오</p>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {uploadedVideos.map((vid, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs text-slate-300 bg-white/10 rounded px-2 py-1">
                                <span>{idx + 1}. {vid.name}</span>
                                <button
                                  onClick={() => {
                                    setUploadedVideos(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="ml-2 text-red-400 hover:text-red-300"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => {
                          setUploadedJson(null);
                          setUploadedVideos([]);
                        }}
                        className="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/30"
                      >
                        전체 삭제
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-4xl">📁</div>
                      <p className="text-sm text-slate-300 font-semibold">JSON/TXT 대본과 비디오 파일들을 한번에 드래그하세요</p>
                      <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded">
                        <p className="text-xs text-blue-300">
                          📌 <strong>비디오 정렬 규칙:</strong><br/>
                          • 파일명에 숫자가 있으면 숫자 순서대로 병합 (예: clip_01.mp4, clip_02.mp4)<br/>
                          • 숫자가 없으면 생성/수정 시간 순서대로 병합 (오래된 것부터)
                        </p>
                      </div>
                      <label className={`rounded-lg bg-gradient-to-r from-purple-600 to-orange-600 px-4 py-2 text-sm font-semibold text-white transition inline-block ${
                        isGeneratingVideo
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-pointer hover:from-purple-500 hover:to-orange-500'
                      }`}>
                        파일 선택
                        <input
                          type="file"
                          multiple
                          accept=".json,.txt,video/*"
                          disabled={isGeneratingVideo}
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);

                            const jsonFile = files.find(f =>
                              f.type === 'application/json' ||
                              f.name.endsWith('.json') ||
                              f.name.endsWith('.txt')
                            );

                            const videoFiles = files.filter(f => f.type.startsWith('video/'));

                            if (jsonFile) {
                              setUploadedJson(jsonFile);
                            }

                            if (videoFiles.length > 0) {
                              setUploadedVideos(prev => [...prev, ...videoFiles]);
                            }

                            if (jsonFile || videoFiles.length > 0) {
                              showToast('✅ 파일 업로드 완료!', 'success');
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* 워터마크 제거 옵션 숨김 - 작동하지 않음 */}
            {false && productionMode === 'merge' && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeWatermark}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setRemoveWatermark(newValue);
                    localStorage.setItem('removeWatermark', String(newValue));
                  }}
                  className="w-5 h-5 rounded border-cyan-400 bg-slate-800 text-cyan-500 focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-semibold text-cyan-200">🧹 워터마크 자동 제거</span>
                  <p className="text-xs text-cyan-300/80 mt-1">
                    OpenCV를 사용하여 움직이는 워터마크를 자동으로 감지하고 제거합니다. (SORA2 영상 권장)
                  </p>
                </div>
              </label>
            </div>
            )}

            {/* 이미지 소스 선택 (SORA2, VIDEO-MERGE 제외) */}
            {videoFormat !== 'sora2' && productionMode !== 'merge' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                🎨 이미지 소스 선택
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImageSource('none');
                  }}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    imageSource === 'none'
                      ? 'border-emerald-400 bg-emerald-950/30 text-emerald-300'
                      : 'border-white/20 bg-white/5 text-slate-300 hover:border-white/40 hover:bg-white/10'
                  }`}
                >
                  <div className="text-2xl mb-1">📤</div>
                  직접 업로드
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageSource('dalle');
                    setUploadedImages([]); // 이미지 초기화
                  }}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    imageSource === 'dalle'
                      ? 'border-emerald-400 bg-emerald-950/30 text-emerald-300'
                      : 'border-white/20 bg-white/5 text-slate-300 hover:border-white/40 hover:bg-white/10'
                  }`}
                >
                  <div className="text-2xl mb-1">🎨</div>
                  DALL-E
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageSource('google');
                    setUploadedImages([]); // 이미지 초기화
                  }}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    imageSource === 'google'
                      ? 'border-emerald-400 bg-emerald-950/30 text-emerald-300'
                      : 'border-white/20 bg-white/5 text-slate-300 hover:border-white/40 hover:bg-white/10'
                  }`}
                >
                  <div className="text-2xl mb-1">🔍</div>
                  Google 검색
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {imageSource === 'none' && '💡 이미지를 직접 업로드합니다 (8컷 권장)'}
                {imageSource === 'dalle' && '💡 DALL-E가 자동으로 이미지를 생성합니다'}
                {imageSource === 'google' && '💡 Google에서 관련 이미지를 검색합니다'}
              </p>
            </div>
            )}

            {/* 파일 업로드 (JSON + 이미지) */}
            {videoFormat !== 'sora2' && productionMode !== 'merge' && imageSource === 'none' && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">
                  📁 JSON 대본 + 이미지
                </label>
                <button
                  onClick={() => setShowJsonTextarea(!showJsonTextarea)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
                    showJsonTextarea
                      ? 'bg-purple-500 hover:bg-purple-600'
                      : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                  title="JSON 직접 입력"
                >
                  {showJsonTextarea ? '✕ 닫기' : '📋 JSON 붙여넣기'}
                </button>
              </div>
              <div
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);

                  const files = Array.from(e.dataTransfer.files);
                  const jsonFile = files.find(f => f.type === 'application/json' || f.name.endsWith('.json') || f.name.endsWith('.txt'));
                  const imageFiles = files.filter(f => f.type.startsWith('image/'));

                  if (jsonFile) setUploadedJson(jsonFile);
                  if (imageFiles.length > 0) {
                    console.log('\n' + '='.repeat(70));
                    console.log('🎯 드래그앤드롭으로 이미지 업로드됨 (' + imageFiles.length + '개)');
                    console.log('='.repeat(70));
                    imageFiles.slice(0, 50).forEach((file, i) => {
                      const date = new Date(file.lastModified);
                      const timeStr = date.toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        fractionalSecondDigits: 3
                      });
                      console.log(`  [${i}] ${file.name.padEnd(30)} | lastModified: ${timeStr} | ${(file.size / 1024).toFixed(1)}KB`);
                    });
                    console.log('='.repeat(70) + '\n');
                    setUploadedImages(imageFiles.slice(0, 50)); // 최대 50개
                  }

                  if (!jsonFile && imageFiles.length === 0) {
                    showToast('JSON 또는 이미지 파일을 업로드해주세요.', 'error');
                  }
                }}
                onPaste={async (e) => {
                  e.preventDefault();
                  const items = Array.from(e.clipboardData.items);
                  const imageItems = items.filter(item => item.type.startsWith('image/'));

                  if (imageItems.length === 0) {
                    showToast('클립보드에 이미지가 없습니다.', 'error');
                    return;
                  }

                  const imageFiles: File[] = [];
                  for (const item of imageItems) {
                    const file = item.getAsFile();
                    if (file) {
                      // 파일명 생성
                      const timestamp = Date.now();
                      const ext = file.type.split('/')[1] || 'png';
                      const renamedFile = new File([file], `clipboard_${timestamp}.${ext}`, { type: file.type });
                      imageFiles.push(renamedFile);
                    }
                  }

                  if (imageFiles.length > 0) {
                    console.log('\n' + '='.repeat(70));
                    console.log('📋 클립보드로 이미지 붙여넣기됨 (' + imageFiles.length + '개)');
                    console.log('='.repeat(70));
                    imageFiles.forEach((file, i) => {
                      const date = new Date(file.lastModified);
                      const timeStr = date.toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        fractionalSecondDigits: 3
                      });
                      console.log(`  [${i}] ${file.name.padEnd(30)} | lastModified: ${timeStr} | ${(file.size / 1024).toFixed(1)}KB`);
                    });
                    console.log('='.repeat(70) + '\n');
                    setUploadedImages(prev => [...prev, ...imageFiles].slice(0, 50));
                    showToast(`✅ ${imageFiles.length}개 이미지를 클립보드에서 가져왔습니다!`, 'success');
                  }
                }}
                className={`rounded-lg border-2 border-dashed transition-all ${
                  isDraggingFiles
                    ? 'border-purple-400 bg-purple-500/20'
                    : 'border-white/20 bg-white/5'
                } p-8 text-center focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="text-4xl">📁</div>
                  <div>
                    <p className="text-sm text-slate-300">JSON/TXT 파일과 이미지를 한번에 드래그하세요</p>
                    <p className="mt-1 text-xs text-slate-400">또는 파일을 선택하세요</p>
                    <p className="mt-1 text-xs text-purple-400">💡 이미지를 복사한 후 여기를 클릭하고 Ctrl+V로 붙여넣기 가능</p>
                    <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded">
                      <p className="text-xs text-blue-300">
                        📌 <strong>이미지 정렬 규칙:</strong><br/>
                        • 파일명에 숫자가 있으면 숫자 순서대로 정렬 (예: image_01.jpg, image_02.jpg)<br/>
                        • 숫자가 없으면 생성/수정 시간 순서대로 정렬 (오래된 것부터 씬 0)
                      </p>
                    </div>
                  </div>

                  {/* 업로드된 파일 표시 */}
                  {(uploadedJson || uploadedImages.length > 0) && (
                    <div className="w-full space-y-3 rounded-lg bg-white/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs text-slate-400">업로드된 파일</span>
                        <button
                          onClick={() => {
                            setUploadedJson(null);
                            setUploadedImages([]);
                          }}
                          className="rounded bg-red-500/20 px-3 py-1 text-xs text-red-400 transition hover:bg-red-500/30"
                        >
                          전체 취소
                        </button>
                      </div>
                      {uploadedJson && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-emerald-400">✓ JSON:</span>
                          <span className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                            {uploadedJson.name}
                            <button
                              onClick={() => setUploadedJson(null)}
                              className="ml-1 flex h-3 w-3 items-center justify-center rounded text-xs opacity-60 transition hover:bg-red-500/30 hover:text-red-400 hover:opacity-100"
                              aria-label="JSON 삭제"
                            >
                              ✕
                            </button>
                          </span>
                        </div>
                      )}
                      {uploadedImages.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-emerald-400">
                              ✓ 이미지: {uploadedImages.length}개
                            </span>
                            {uploadedImages.length < 8 && (
                              <span className="text-xs text-amber-400">(8개 권장)</span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {uploadedImages.map((img, idx) => (
                              <span
                                key={idx}
                                className="group flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs text-slate-400"
                              >
                                {img.name}
                                <button
                                  onClick={() => {
                                    setUploadedImages(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="ml-1 flex h-3 w-3 items-center justify-center rounded text-xs opacity-60 transition hover:bg-red-500/30 hover:text-red-400 hover:opacity-100"
                                  aria-label={`${img.name} 삭제`}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <label className={`rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition ${
                    isGeneratingVideo
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer hover:bg-purple-500'
                  }`}>
                    파일 선택
                    <input
                      type="file"
                      multiple
                      accept=".json,.txt,image/*"
                      disabled={isGeneratingVideo}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const jsonFile = files.find(f => f.type === 'application/json' || f.name.endsWith('.json') || f.name.endsWith('.txt'));
                        const imageFiles = files.filter(f => f.type.startsWith('image/'));

                        if (jsonFile) setUploadedJson(jsonFile);
                        if (imageFiles.length > 0) {
                          console.log('\n' + '='.repeat(70));
                          console.log('📁 파일 선택으로 이미지 업로드됨 (' + imageFiles.length + '개)');
                          console.log('='.repeat(70));
                          imageFiles.slice(0, 8).forEach((file, i) => {
                            const date = new Date(file.lastModified);
                            const timeStr = date.toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              fractionalSecondDigits: 3
                            });
                            console.log(`  [${i}] ${file.name.padEnd(30)} | lastModified: ${timeStr} | ${(file.size / 1024).toFixed(1)}KB`);
                          });
                          console.log('='.repeat(70) + '\n');
                          setUploadedImages(imageFiles.slice(0, 8));
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* JSON 직접 입력 textarea */}
              {showJsonTextarea && (
                <div className="mt-3 rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
                  <label className="mb-2 block text-sm font-semibold text-purple-300">
                    📝 JSON 직접 입력
                  </label>
                  <textarea
                    value={jsonTextareaValue}
                    onChange={(e) => setJsonTextareaValue(e.target.value)}
                    placeholder="JSON을 여기에 붙여넣으세요 (Ctrl+V)...&#10;&#10;예시:&#10;{&#10;  &quot;scenes&quot;: [&#10;    { &quot;text&quot;: &quot;첫 번째 장면&quot; },&#10;    { &quot;text&quot;: &quot;두 번째 장면&quot; }&#10;  ]&#10;}"
                    className="w-full h-48 rounded-lg bg-slate-900 border border-slate-700 p-3 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-y"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        // Ctrl+Enter로 적용
                        const rawText = jsonTextareaValue.trim();
                        if (!rawText) return;

                        try {
                          // 마크다운 코드 블록 제거
                          const text = stripMarkdownCodeBlock(rawText);
                          const jsonData = JSON.parse(text);
                          const blob = new Blob([text], { type: 'application/json' });
                          const file = new File([blob], 'clipboard.json', { type: 'application/json' });
                          setUploadedJson(file);
                          showToast('✅ JSON을 가져왔습니다!', 'success');
                          setJsonTextareaValue('');
                          setShowJsonTextarea(false);
                        } catch (e) {
                          showToast('올바른 JSON 형식이 아닙니다.', 'error');
                        }
                      }
                    }}
                  />
                  <div className="mt-3 flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setJsonTextareaValue('');
                        setShowJsonTextarea(false);
                      }}
                      className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        const rawText = jsonTextareaValue.trim();
                        if (!rawText) {
                          showToast('JSON을 입력해주세요.', 'error');
                          return;
                        }

                        try {
                          // 마크다운 코드 블록 제거
                          const text = stripMarkdownCodeBlock(rawText);
                          const jsonData = JSON.parse(text);
                          const blob = new Blob([text], { type: 'application/json' });
                          const file = new File([blob], 'clipboard.json', { type: 'application/json' });
                          setUploadedJson(file);
                          showToast('✅ JSON을 가져왔습니다!', 'success');
                          setJsonTextareaValue('');
                          setShowJsonTextarea(false);
                        } catch (e) {
                          showToast('올바른 JSON 형식이 아닙니다.', 'error');
                        }
                      }}
                      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                    >
                      적용 (Ctrl+Enter)
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* JSON 파일만 업로드 (DALL-E, Google 검색, 또는 SORA2) */}
            {productionMode !== 'merge' && (videoFormat === 'sora2' || imageSource !== 'none') && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">
                  📄 JSON 대본 업로드
                </label>
                <button
                  onClick={() => setShowJsonTextarea(!showJsonTextarea)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
                    showJsonTextarea
                      ? 'bg-purple-500 hover:bg-purple-600'
                      : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                  title="JSON 직접 입력"
                >
                  {showJsonTextarea ? '✕ 닫기' : '📋 JSON 붙여넣기'}
                </button>
              </div>
              <div
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);

                  const file = e.dataTransfer.files[0];
                  if (file && (file.type === 'application/json' || file.name.endsWith('.json') || file.name.endsWith('.txt'))) {
                    setUploadedJson(file);
                  } else {
                    showToast('JSON 또는 TXT 파일만 업로드 가능합니다.', 'error');
                  }
                }}
                onPaste={async (e) => {
                  e.preventDefault();
                  try {
                    const rawText = e.clipboardData.getData('text');
                    if (!rawText) {
                      showToast('클립보드가 비어있습니다.', 'error');
                      return;
                    }

                    // JSON 파싱 시도
                    try {
                      // 마크다운 코드 블록 제거
                      const text = stripMarkdownCodeBlock(rawText);
                      const jsonData = JSON.parse(text);
                      // JSON을 Blob으로 변환
                      const blob = new Blob([text], { type: 'application/json' });
                      const file = new File([blob], 'clipboard.json', { type: 'application/json' });
                      setUploadedJson(file);
                      showToast('✅ 클립보드에서 JSON을 가져왔습니다!', 'success');
                    } catch (e) {
                      showToast('클립보드 내용이 올바른 JSON 형식이 아닙니다.', 'error');
                    }
                  } catch (error) {
                    console.error('클립보드 읽기 실패:', error);
                    showToast('클립보드 읽기에 실패했습니다.', 'error');
                  }
                }}
                className={`rounded-lg border-2 border-dashed transition-all ${
                  isDraggingFiles
                    ? 'border-purple-400 bg-purple-500/20'
                    : 'border-white/20 bg-white/5'
                } p-6 text-center focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
              >
                {uploadedJson ? (
                  <div className="space-y-3">
                    <div className="text-4xl">✅</div>
                    <div className="rounded-lg bg-white/5 p-3">
                      <span className="text-sm text-emerald-400">✓ JSON: </span>
                      <span className="text-sm text-slate-300">{uploadedJson.name}</span>
                    </div>
                    <button
                      onClick={() => setUploadedJson(null)}
                      className="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/30"
                    >
                      파일 삭제
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-4xl">📄</div>
                    <p className="text-sm text-slate-300">JSON 또는 TXT 파일을 드래그하거나 선택하세요</p>
                    <p className="text-xs text-purple-400">💡 JSON을 복사한 후 여기를 클릭하고 Ctrl+V로 붙여넣기 가능</p>
                    <label className={`rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition inline-block ${
                      isGeneratingVideo
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer hover:bg-purple-500'
                    }`}>
                      파일 선택
                      <input
                        type="file"
                        accept=".json,.txt"
                        disabled={isGeneratingVideo}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && (file.type === 'application/json' || file.name.endsWith('.json') || file.name.endsWith('.txt'))) {
                            setUploadedJson(file);
                          } else {
                            showToast('JSON 또는 TXT 파일만 업로드 가능합니다.', 'error');
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* JSON 직접 입력 textarea */}
              {showJsonTextarea && (
                <div className="mt-3 rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
                  <label className="mb-2 block text-sm font-semibold text-purple-300">
                    📝 JSON 직접 입력
                  </label>
                  <textarea
                    value={jsonTextareaValue}
                    onChange={(e) => setJsonTextareaValue(e.target.value)}
                    placeholder="JSON을 여기에 붙여넣으세요 (Ctrl+V)...&#10;&#10;예시:&#10;{&#10;  &quot;scenes&quot;: [&#10;    { &quot;text&quot;: &quot;첫 번째 장면&quot; },&#10;    { &quot;text&quot;: &quot;두 번째 장면&quot; }&#10;  ]&#10;}"
                    className="w-full h-48 rounded-lg bg-slate-900 border border-slate-700 p-3 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-y"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        // Ctrl+Enter로 적용
                        const rawText = jsonTextareaValue.trim();
                        if (!rawText) return;

                        try {
                          // 마크다운 코드 블록 제거
                          const text = stripMarkdownCodeBlock(rawText);
                          const jsonData = JSON.parse(text);
                          const blob = new Blob([text], { type: 'application/json' });
                          const file = new File([blob], 'clipboard.json', { type: 'application/json' });
                          setUploadedJson(file);
                          showToast('✅ JSON을 가져왔습니다!', 'success');
                          setJsonTextareaValue('');
                          setShowJsonTextarea(false);
                        } catch (e) {
                          showToast('올바른 JSON 형식이 아닙니다.', 'error');
                        }
                      }
                    }}
                  />
                  <div className="mt-3 flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setJsonTextareaValue('');
                        setShowJsonTextarea(false);
                      }}
                      className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        const rawText = jsonTextareaValue.trim();
                        if (!rawText) {
                          showToast('JSON을 입력해주세요.', 'error');
                          return;
                        }

                        try {
                          // 마크다운 코드 블록 제거
                          const text = stripMarkdownCodeBlock(rawText);
                          const jsonData = JSON.parse(text);
                          const blob = new Blob([text], { type: 'application/json' });
                          const file = new File([blob], 'clipboard.json', { type: 'application/json' });
                          setUploadedJson(file);
                          showToast('✅ JSON을 가져왔습니다!', 'success');
                          setJsonTextareaValue('');
                          setShowJsonTextarea(false);
                        } catch (e) {
                          showToast('올바른 JSON 형식이 아닙니다.', 'error');
                        }
                      }}
                      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                    >
                      적용 (Ctrl+Enter)
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* 영상 생성 버튼 */}
            <button
              data-video-generate-btn
              onClick={async () => {
                if (!user) {
                  showToast('로그인이 필요합니다. 우측 상단의 로그인 버튼을 클릭하세요.', 'error');
                  return;
                }

                // VIDEO-MERGE 전용 검증 및 API 호출
                if (productionMode === 'merge') {
                  if (uploadedVideos.length === 0) {
                    showToast('최소 1개 이상의 비디오를 업로드해주세요.', 'error');
                    return;
                  }

                  // 영상 병합 시작
                  setIsGeneratingVideo(true);
                  setVideoLogs([]);
                  setGeneratedVideoUrl(null);

                  try {
                    showToast('비디오 병합을 시작합니다...', 'info');

                    // FormData 생성
                    const mergeFormData = new FormData();

                    // 비디오 정렬: 시퀀스 번호가 있으면 시퀀스 우선, 없으면 시간 순서
                    const sortedVideos = [...uploadedVideos].sort((a, b) => {
                      // 파일명에서 숫자 추출 (예: clip_01.mp4 → 1, scene_5.mp4 → 5)
                      const extractNumber = (filename: string): number | null => {
                        const match = filename.match(/(\d+)/);
                        return match ? parseInt(match[1], 10) : null;
                      };

                      const numA = extractNumber(a.name);
                      const numB = extractNumber(b.name);

                      // 둘 다 시퀀스 번호가 있으면 시퀀스로 정렬
                      if (numA !== null && numB !== null) {
                        return numA - numB;
                      }

                      // 시퀀스 번호가 없으면 생성/수정 시간으로 정렬 (오래된 것부터)
                      return a.lastModified - b.lastModified;
                    });

                    // 정렬된 비디오 파일들 추가
                    sortedVideos.forEach((video, index) => {
                      mergeFormData.append(`video_${index}`, video);
                    });

                    // JSON 파일 추가 (있으면 - TTS 나레이션용)
                    if (uploadedJson) {
                      mergeFormData.append('json', uploadedJson);
                    }

                    // 자막 옵션 추가 (항상 true)
                    mergeFormData.append('addSubtitles', 'true');

                    // 워터마크 제거 옵션 추가
                    mergeFormData.append('removeWatermark', removeWatermark ? 'true' : 'false');

                    // API 호출
                    const response = await fetch('/api/video-merge', {
                      method: 'POST',
                      body: mergeFormData
                    });

                    const data = await response.json();

                    if (!response.ok) {
                      throw new Error(data.error || '비디오 병합 실패');
                    }

                    if (data.jobId) {
                      setCurrentJobId(data.jobId);
                      showToast('✅ 비디오 병합이 시작되었습니다!', 'success');

                      // 폴링 시작
                      const interval = setInterval(async () => {
                        try {
                          const statusRes = await fetch(`/api/job-status?jobId=${data.jobId}`);
                          const statusData = await statusRes.json();

                          // 로그를 줄 단위로 분리해서 배열로 저장
                          if (statusData.logs) {
                            const logLines = typeof statusData.logs === 'string'
                              ? statusData.logs.split('\n').filter((line: string) => line.trim())
                              : statusData.logs;
                            setVideoLogs(logLines);
                          }

                          // 진행률 업데이트
                          if (statusData.progress !== undefined) {
                            setVideoProgress({
                              step: statusData.status === 'processing' ? '비디오 병합 중...' : '준비 중...',
                              progress: statusData.progress
                            });
                          }

                          if (statusData.status === 'completed' && statusData.outputPath) {
                            clearInterval(interval);
                            setPollingInterval(null);
                            setIsGeneratingVideo(false);
                            setVideoProgress({
                              step: '완료!',
                              progress: 100
                            });

                            const videoUrl = `/api/video-stream?path=${encodeURIComponent(statusData.outputPath)}`;
                            setGeneratedVideoUrl(videoUrl);
                            showToast('✅ 비디오 병합 완료!', 'success');

                            // 사용자 정보 갱신
                            await checkAuth();
                          } else if (statusData.status === 'failed') {
                            clearInterval(interval);
                            setPollingInterval(null);
                            setIsGeneratingVideo(false);
                            setVideoProgress(null);
                            showToast(`❌ 비디오 병합 실패: ${statusData.error}`, 'error');
                          }
                        } catch (error) {
                          console.error('폴링 오류:', error);
                        }
                      }, 2000);

                      setPollingInterval(interval);
                    }
                  } catch (error: any) {
                    console.error('비디오 병합 오류:', error);
                    showToast(error.message || '비디오 병합 중 오류가 발생했습니다.', 'error');
                    setIsGeneratingVideo(false);
                  }
                  return;
                }

                if (!uploadedJson) {
                  showToast('JSON 파일을 먼저 업로드해주세요.', 'error');
                  return;
                }

                // SORA2가 아니고 직접 업로드 모드일 때만 이미지 필수
                if (videoFormat !== 'sora2' && imageSource === 'none' && uploadedImages.length === 0) {
                  showToast('최소 1개 이상의 이미지를 업로드해주세요.', 'error');
                  return;
                }

                const cost = settings?.videoGenerationCost || 40;
                const currentCredits = user.credits || 0;

                // 모달 표시
                setConfirmModalData({
                  cost,
                  currentCredits,
                  jsonName: uploadedJson.name,
                  imageCount: imageSource === 'none' ? uploadedImages.length : 0
                });
                setShowConfirmModal(true);
              }}
              disabled={
                isGeneratingVideo ||
                (productionMode === 'merge' ? uploadedVideos.length === 0 :
                  (!uploadedJson || (videoFormat !== 'sora2' && imageSource === 'none' && uploadedImages.length === 0)))
              }
              className="w-full rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingVideo ? '영상 생성 중...' :
                productionMode === 'merge' ? `🎞️ 비디오 병합${settings ? ` (${settings.videoGenerationCost} 크레딧)` : ''}` :
                `🎬 영상 제작${settings ? ` (${settings.videoGenerationCost} 크레딧)` : ''}`}
            </button>
          </div>
        </section>
        )}

        {/* 중국영상변환 */}
        {showChineseConverter && (
        <section ref={chineseConverterSectionRef} className="rounded-3xl border border-red-500/20 bg-red-950/20 p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-red-400">🇨🇳 중국영상변환</h2>
            <button
              type="button"
              onClick={() => {
                setShowChineseConverter(false);
                setChineseVideoFile(null);
                setChineseConvertLogs([]);
                setChineseProgress(null);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          <p className="mb-4 text-sm text-slate-300">
            중국어 자막이 포함된 영상을 업로드하면 한국어 자막과 음성으로 변환합니다.
          </p>

          {/* 상품 제목 입력 */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              🏷️ 상품 제목 (선택사항)
            </label>
            <input
              type="text"
              value={chineseVideoTitle}
              onChange={(e) => setChineseVideoTitle(e.target.value)}
              placeholder="예: 겨울 니트 스웨터 여성용"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              제목을 입력하면 변환된 파일명으로 저장됩니다.
            </p>
          </div>

          {/* 파일 업로드 */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-300">
              📹 중국어 영상 파일
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFiles(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingFiles(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFiles(false);
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('video/')) {
                  setChineseVideoFile(file);
                } else {
                  alert('비디오 파일만 업로드할 수 있습니다.');
                }
              }}
              className={`relative rounded-lg border-2 border-dashed p-6 text-center transition ${
                isDraggingFiles
                  ? 'border-red-400 bg-red-500/10'
                  : 'border-slate-600 bg-slate-800/50'
              }`}
            >
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setChineseVideoFile(file);
                  }
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {chineseVideoFile ? (
                <div>
                  <div className="mb-2 text-3xl">📹</div>
                  <p className="font-semibold text-white">{chineseVideoFile.name}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {(chineseVideoFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <div className="mb-2 text-4xl">🎬</div>
                  <p className="text-sm text-slate-400">
                    클릭하거나 드래그하여 비디오 파일 업로드
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 변환 프로세스 설명 */}
          <div className="mb-4 rounded-lg bg-red-900/20 p-4">
            <h3 className="mb-2 text-sm font-semibold text-white">🔄 변환 프로세스</h3>
            <ol className="space-y-1 text-xs text-slate-300">
              <li>1️⃣ 중국어 자막 추출</li>
              <li>2️⃣ 중국어 → 한국어 번역</li>
              <li>3️⃣ 한국어 TTS 음성 생성</li>
              <li>4️⃣ 원본 영상과 합성</li>
              <li>5️⃣ 완료 후 내 콘텐츠에서 확인</li>
            </ol>
          </div>

          {/* 프로그레스 바 */}
          {isConvertingChinese && chineseProgress && (
            <div className="mb-4 space-y-3 rounded-lg border border-red-500/30 bg-red-900/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{chineseProgress.step}</span>
                <span className="text-sm font-bold text-red-400">{chineseProgress.progress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-500"
                  style={{ width: `${chineseProgress.progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">
                ⏳ 영상을 변환하는 중입니다. 잠시만 기다려주세요...
              </p>
            </div>
          )}

          {/* 로그 */}
          {(isConvertingChinese || chineseConvertLogs.length > 0) && (
            <div ref={chineseLogRef} className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-300">📋 변환 로그</h3>
              <div className="space-y-1">
                {chineseConvertLogs.length > 0 ? (
                  chineseConvertLogs.map((log, idx) => (
                    <div key={idx} className="text-sm text-slate-300 font-mono">
                      <span className="text-blue-400">[{new Date(log.timestamp).toLocaleTimeString('ko-KR')}]</span>{' '}
                      {log.message}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-400 font-mono">
                    로그를 불러오는 중...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 변환 시작 버튼 */}
          <button
            type="button"
            onClick={async () => {
              if (!chineseVideoFile) {
                alert('비디오 파일을 선택해주세요.');
                return;
              }

              setIsConvertingChinese(true);
              setChineseProgress({ step: '🚀 중국영상변환 시작...', progress: 0 });
              setChineseConvertLogs([{
                timestamp: new Date().toISOString(),
                message: '🚀 중국영상변환 시작...'
              }]);

              try {
                // FormData 생성
                const formData = new FormData();
                formData.append('video', chineseVideoFile);

                // 제목이 입력되었으면 추가
                if (chineseVideoTitle.trim()) {
                  formData.append('title', chineseVideoTitle.trim());
                }

                const response = await fetch('/api/chinese-converter/convert', {
                  method: 'POST',
                  body: formData,
                });

                const data = await response.json();

                if (!response.ok) {
                  throw new Error(data.error || '변환 실패');
                }

                setChineseJobId(data.jobId);
                setChineseConvertLogs(prev => [...prev, {
                  timestamp: new Date().toISOString(),
                  message: `✅ 작업 시작됨 (Job ID: ${data.jobId})`
                }]);

                // 상태 폴링 시작
                const pollInterval = setInterval(async () => {
                  try {
                    const statusRes = await fetch(`/api/chinese-converter/status?jobId=${data.jobId}`);
                    const statusData = await statusRes.json();

                    // 진행률 업데이트
                    if (statusData.progress !== undefined) {
                      const currentStep = statusData.logs && statusData.logs.length > 0
                        ? statusData.logs[statusData.logs.length - 1].message
                        : '변환 중...';
                      setChineseProgress({
                        step: currentStep,
                        progress: statusData.progress
                      });
                    }

                    // 로그 업데이트 (전체 로그 배열로 교체)
                    if (statusData.logs && Array.isArray(statusData.logs)) {
                      setChineseConvertLogs(statusData.logs);
                    }

                    if (statusData.status === 'completed') {
                      clearInterval(pollInterval);
                      setChineseProgress(null);
                      setIsConvertingChinese(false);
                      setTimeout(() => {
                        window.location.href = '/my-content';
                      }, 2000);
                    } else if (statusData.status === 'failed') {
                      clearInterval(pollInterval);
                      setChineseProgress(null);
                      setIsConvertingChinese(false);
                    }
                  } catch (error) {
                    console.error('상태 조회 오류:', error);
                  }
                }, 3000);

                // 10분 후 자동 중지
                setTimeout(() => {
                  clearInterval(pollInterval);
                }, 10 * 60 * 1000);

              } catch (error: any) {
                console.error('변환 오류:', error);
                setChineseConvertLogs(prev => [...prev, {
                  timestamp: new Date().toISOString(),
                  message: `❌ 오류: ${error.message}`
                }]);
                setChineseProgress(null);
                setIsConvertingChinese(false);
              }
            }}
            disabled={!chineseVideoFile || isConvertingChinese}
            className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-600 px-6 py-3 font-semibold text-white transition hover:from-red-500 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConvertingChinese ? '⏳ 변환 중...' : '🚀 변환 시작'}
          </button>
        </section>
        )}

        {/* 영상 제작 확인 모달 */}
        {showConfirmModal && confirmModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-w-md w-full rounded-xl bg-gradient-to-br from-slate-900 to-purple-900 border border-purple-500/30 p-6 shadow-2xl">
              <h2 className="mb-4 text-2xl font-bold text-white">⚠️ 영상 생성 확인</h2>

              <div className="mb-6 space-y-3">
                <div className="rounded-lg bg-purple-500/10 p-3 border border-purple-500/30">
                  <p className="text-sm text-purple-300 font-semibold mb-2">📹 영상 포맷</p>
                  <p className="text-white text-lg font-bold">
                    {videoFormat === 'longform' ? '🎬 롱폼 (16:9 가로)' :
                     videoFormat === 'shortform' ? '📱 숏폼 (9:16 세로)' :
                     videoFormat === 'sora2' ? '🎥 SORA2 (AI 시네마틱)' :
                     '🎞️ 영상 병합 (Concat)'}
                  </p>
                </div>

                <div className="rounded-lg bg-white/5 p-3 border border-white/10">
                  <p className="text-sm text-slate-400">파일 정보</p>
                  <p className="text-white">📄 {confirmModalData.jsonName}</p>
                  <p className="text-white">
                    🖼️ 이미지: {imageSource === 'none'
                      ? `${confirmModalData.imageCount}개 업로드됨`
                      : imageSource === 'dalle'
                        ? 'DALL-E 자동 생성'
                        : 'Google 검색'}
                  </p>
                </div>

                <div className="rounded-lg bg-yellow-500/10 p-3 border border-yellow-500/30">
                  <p className="text-sm text-yellow-300 font-semibold mb-2">💰 크레딧 정보</p>
                  <p className="text-white">차감: {confirmModalData.cost} 크레딧</p>
                  <p className="text-white">현재: {confirmModalData.currentCredits.toLocaleString()} 크레딧</p>
                  <p className="text-white font-bold">잔액: {(confirmModalData.currentCredits - confirmModalData.cost).toLocaleString()} 크레딧</p>
                </div>

                <div className="rounded-lg bg-red-500/10 p-3 border border-red-500/30">
                  <p className="text-sm text-red-300 font-semibold mb-2">⚠️ 환불 정책</p>
                  <p className="text-sm text-slate-300">• 영상 생성 실패 시: 자동 환불</p>
                  <p className="text-sm text-slate-300">• 사용자가 직접 취소: 환불 불가</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmModalData(null);
                  }}
                  className="flex-1 rounded-lg bg-slate-700 px-4 py-3 font-semibold text-white transition hover:bg-slate-600"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    setShowConfirmModal(false);
                    setConfirmModalData(null);

                    setIsGeneratingVideo(true);
                    setVideoProgress({ step: '파일 업로드 준비 중...', progress: 0 });
                    setVideoLogs([]);

                    try {
                      // JSON 파일 읽기 및 파싱 (공통 함수 사용)
                      const parseResult = await parseJsonFile(uploadedJson!);

                      if (!parseResult.success) {
                        console.error('JSON 파싱 실패:', parseResult.error);
                        throw new Error(`JSON 파싱 실패: ${parseResult.error}`);
                      }

                      const storyData = parseResult.data;

                      if (parseResult.fixed) {
                        console.log('⚠️ JSON이 자동으로 수정되어 파싱되었습니다.');
                      } else {
                        console.log('✅ JSON 파싱 성공 (원본 그대로)');
                      }

                      setVideoProgress({ step: '이미지 업로드 중...', progress: 10 });

                      // FormData로 파일 전송
                      const formData = new FormData();
                      formData.append('json', uploadedJson!);
                      formData.append('imageSource', imageSource);
                      formData.append('videoFormat', videoFormat); // 롱폼/숏폼 정보 추가

                      // 직접 업로드 모드일 때만 이미지 추가
                      if (imageSource === 'none') {
                        console.log('\n' + '='.repeat(70));
                        console.log('📷 이미지 정렬 시작 (총 ' + uploadedImages.length + '개)');
                        console.log('='.repeat(70));
                        console.log('\n🔵 원본 순서 (사용자가 선택한 순서):');
                        uploadedImages.forEach((img, i) => {
                          const date = new Date(img.lastModified);
                          const timeStr = date.toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            fractionalSecondDigits: 3
                          });
                          console.log(`  [${i}] ${img.name.padEnd(30)} | ${timeStr} | ${(img.size / 1024).toFixed(1)}KB`);
                        });

                        // 이미지 정렬: 명확한 시퀀스 패턴이 있으면 시퀀스 우선, 없으면 시간 순서
                        const sortedImages = [...uploadedImages].sort((a, b) => {
                          // 명확한 시퀀스 번호만 추출:
                          // - image_01, scene_1, img_5 등
                          // - image(1), scene(2) 등
                          // - (1), (2) 등
                          // - 파일명 전체가 숫자 (1.jpg, 2.png)
                          const extractSequence = (filename: string): number | null => {
                            const name = filename.replace(/\.\w+$/, ''); // 확장자 제거

                            // image_01, scene_1, img_5 패턴
                            let match = name.match(/^(image|scene|img)[-_](\d+)$/i);
                            if (match) return parseInt(match[2], 10);

                            // image(1), scene(2) 패턴
                            match = name.match(/^(image|scene|img)\((\d+)\)$/i);
                            if (match) return parseInt(match[2], 10);

                            // (1), (2) 패턴
                            match = name.match(/^\((\d+)\)$/);
                            if (match) return parseInt(match[1], 10);

                            // 파일명 전체가 숫자 (1, 2, 3)
                            match = name.match(/^(\d+)$/);
                            if (match) return parseInt(match[1], 10);

                            return null;
                          };

                          const numA = extractSequence(a.name);
                          const numB = extractSequence(b.name);

                          // 둘 다 명확한 시퀀스 번호가 있으면 시퀀스로 정렬
                          if (numA !== null && numB !== null) {
                            console.log(`  정렬 (시퀀스): ${a.name} (seq:${numA}) vs ${b.name} (seq:${numB}) → ${numA - numB > 0 ? 'B가 앞' : 'A가 앞'}`);
                            return numA - numB;
                          }

                          // 시퀀스 번호가 없으면 생성/수정 시간으로 정렬 (오래된 것부터)
                          const timeDiff = a.lastModified - b.lastModified;
                          console.log(`  정렬 (시간): ${a.name} (${new Date(a.lastModified).toLocaleTimeString('ko-KR')}) vs ${b.name} (${new Date(b.lastModified).toLocaleTimeString('ko-KR')}) → ${timeDiff > 0 ? 'B가 앞' : 'A가 앞'}`);
                          return timeDiff;
                        });

                        console.log('\n🟢 정렬 후 순서 (오래된 파일부터 image_00):');
                        console.log('   ※ 첫 번째 파일(image_00)이 씬 0 또는 첫 씬이 됩니다!');
                        sortedImages.forEach((img, i) => {
                          const date = new Date(img.lastModified);
                          const timeStr = date.toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            fractionalSecondDigits: 3
                          });
                          const newName = `image_${String(i).padStart(2, '0')}.${img.name.split('.').pop()}`;
                          console.log(`  [${i}] ${img.name.padEnd(30)} → ${newName.padEnd(15)} | ${timeStr}`);
                        });

                        console.log('\n📤 FormData에 추가되는 순서:');
                        // 정렬된 이미지를 image_00.ext, image_01.ext 형식으로 파일명 변경하여 전송
                        sortedImages.forEach((img, idx) => {
                          const ext = img.name.split('.').pop() || 'jpg';
                          const newFileName = `image_${String(idx).padStart(2, '0')}.${ext}`;

                          // 새로운 File 객체 생성 (파일명 변경)
                          const renamedFile = new File([img], newFileName, { type: img.type });

                          formData.append(`image_${idx}`, renamedFile);
                          console.log(`  FormData.append('image_${idx}', ${newFileName}) - 원본: ${img.name}`);
                        });

                        console.log('\n' + '='.repeat(70));
                        console.log('✅ 이미지 정렬 및 FormData 추가 완료');
                        console.log('='.repeat(70) + '\n');
                      }

                      const response = await fetch('/api/generate-video-upload', {
                        method: 'POST',
                        body: formData,
                        headers: getAuthHeaders()
                      });

                      const data = await response.json();

                      if (!response.ok || !data.success) {
                        throw new Error(data.error || '영상 생성 요청 실패');
                      }

                      setVideoProgress({ step: '영상 생성 중...', progress: 40 });

                      // Job ID 저장 및 폴링 시작
                      const jobId = data.jobId;
                      setCurrentJobId(jobId);
                      localStorage.setItem('currentJobId', jobId);
                      startPollingVideoStatus(jobId);

                    } catch (error) {
                      console.error('Video generation error:', error);
                      setIsGeneratingVideo(false);
                      setVideoProgress(null);
                      alert(`❌ 영상 생성 실패:\n${error instanceof Error ? error.message : '알 수 없는 오류'}`);
                    }
                  }}
                  className="flex-1 rounded-lg bg-purple-600 px-4 py-3 font-semibold text-white transition hover:bg-purple-500"
                >
                  생성
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI 대본 생성 확인 모달 */}
        {showScriptConfirmModal && scriptConfirmData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-w-md w-full rounded-xl bg-gradient-to-br from-slate-900 to-emerald-900 border border-emerald-500/30 p-6 shadow-2xl">
              <h2 className="mb-4 text-2xl font-bold text-white">⚠️ AI 대본 생성 확인</h2>

              <div className="mb-6 space-y-3">
                <div className="rounded-lg bg-emerald-500/10 p-3 border border-emerald-500/30">
                  <p className="text-sm text-emerald-300 font-semibold mb-2">📹 영상 포맷</p>
                  <p className="text-white text-lg font-bold">
                    {videoFormat === 'longform' ? '🎬 롱폼 (16:9 가로)' :
                     videoFormat === 'shortform' ? '📱 숏폼 (9:16 세로)' :
                     videoFormat === 'sora2' ? '🎥 SORA2 (AI 시네마틱)' :
                     '🎞️ 영상 병합 (Concat)'}
                  </p>
                </div>

                <div className="rounded-lg bg-white/5 p-3 border border-white/10">
                  <p className="text-sm text-slate-400">대본 정보</p>
                  <p className="text-white">📝 주제: {scriptConfirmData.title}</p>
                  <p className="text-white">
                    🤖 생성 방식: {scriptConfirmData.mode === 'generate-api' ? 'Claude API' : '로컬 Claude'}
                  </p>
                </div>

                <div className="rounded-lg bg-yellow-500/10 p-3 border border-yellow-500/30">
                  <p className="text-sm text-yellow-300 font-semibold mb-2">💰 크레딧 정보</p>
                  <p className="text-white">차감: {scriptConfirmData.cost} 크레딧</p>
                  <p className="text-white">현재: {scriptConfirmData.currentCredits.toLocaleString()} 크레딧</p>
                  <p className="text-white font-bold">잔액: {(scriptConfirmData.currentCredits - scriptConfirmData.cost).toLocaleString()} 크레딧</p>
                </div>

                <div className="rounded-lg bg-red-500/10 p-3 border border-red-500/30">
                  <p className="text-sm text-red-300 font-semibold mb-2">⚠️ 환불 정책</p>
                  <p className="text-sm text-slate-300">• 대본 생성 실패 시: 자동 환불</p>
                  <p className="text-sm text-slate-300">• 사용자가 직접 취소: 환불 불가</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowScriptConfirmModal(false);
                    setScriptConfirmData(null);
                  }}
                  className="flex-1 rounded-lg bg-slate-700 px-4 py-3 font-semibold text-white transition hover:bg-slate-600"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    try {
                      console.log('🚀 생성 시작 버튼 클릭됨');
                      console.log('scriptConfirmData:', scriptConfirmData);

                      setShowScriptConfirmModal(false);
                      const title = scriptConfirmData.title;
                      const mode = scriptConfirmData.mode;
                      setScriptConfirmData(null);
                      setShowTitleInput(false);

                      console.log('title:', title, 'mode:', mode);

                      // 실제 AI 대본 생성 로직 실행
                      if (mode === 'generate-api') {
                        // Claude API 사용
                        setIsGeneratingScript(true);
                      setShowScriptLogs(true);
                      setScriptProgress({ current: 0, total: 100 });
                      setScriptGenerationLogs([{
                        timestamp: new Date().toISOString(),
                        message: '💰 Claude API를 사용하여 대본 생성 시작...'
                      }]);

                      try {
                        const promptResponse = await fetch(getPromptApiUrl());
                        const promptData = await promptResponse.json();

                        setScriptGenerationLogs(prev => [...prev, {
                          timestamp: new Date().toISOString(),
                          message: '📝 프롬프트 로드 완료'
                        }]);

                        // 상품 정보 준비 (상품 포맷인 경우)
                        let productInfo = null;
                        if (videoFormat === 'product') {
                          const productInfoStr = localStorage.getItem('current_product_info');
                          if (productInfoStr) {
                            try {
                              productInfo = JSON.parse(productInfoStr);
                              console.log('🛍️ 상품 정보 포함:', productInfo);
                            } catch (e) {
                              console.error('❌ 상품 정보 파싱 실패:', e);
                            }
                          }
                        }

                        const response = await fetch('/api/generate-script', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                          body: JSON.stringify({
                            prompt: promptData.content,
                            topic: title,
                            format: videoFormat,
                            productInfo: productInfo // 상품 정보 추가
                          })
                        });
                        const data = await response.json();

                        if (!response.ok) {
                          throw new Error(data.error || `API 오류: ${response.status}`);
                        }

                        if (!data.scriptId) {
                          throw new Error('scriptId를 받지 못했습니다.');
                        }

                        const scriptId = data.scriptId;
                        setCurrentScriptId(scriptId);

                        setScriptGenerationLogs(prev => [...prev, {
                          timestamp: new Date().toISOString(),
                          message: `📝 대본 생성 작업 시작 (ID: ${scriptId.substring(0, 8)}...)`
                        }]);

                        // 폴링 시작
                        let checkCount = 0;
                        const maxChecks = 180;

                        const interval = setInterval(async () => {
                          try {
                            const statusResponse = await fetch(`/api/scripts/${scriptId}`, {
                              headers: getAuthHeaders()
                            });

                            if (!statusResponse.ok) {
                              const errorText = await statusResponse.text();
                              console.warn(`❌ 상태 조회 실패 (${statusResponse.status}):`, errorText);

                              // 404는 아직 대본이 생성 중일 수 있으므로 계속 폴링
                              if (statusResponse.status === 404) {
                                checkCount++;
                                if (checkCount >= maxChecks) {
                                  clearInterval(interval);
                                  setScriptPollingInterval(null);
                                  setIsGeneratingScript(false);
                                  setScriptGenerationLogs(prev => [...prev, {
                                    timestamp: new Date().toISOString(),
                                    message: '⏱️ 대본 생성 시간이 초과되었습니다.'
                                  }]);
                                  setScriptProgress({ current: 0, total: 100 });
                                  setCurrentScriptId(null);
                                  setToast({ message: '대본 생성 시간이 초과되었습니다.', type: 'error' });
                                  setTimeout(() => setToast(null), 5000);
                                }
                                return; // 404는 에러로 처리하지 않고 계속 폴링
                              }

                              throw new Error(`상태 조회 실패 (${statusResponse.status}): ${errorText}`);
                            }

                            const statusData = await statusResponse.json();

                            if (statusData.script?.status === 'completed') {
                              clearInterval(interval);
                              setScriptPollingInterval(null);
                              setScriptProgress({ current: 100, total: 100 });
                              setScriptGenerationLogs(prev => [...prev, {
                                timestamp: new Date().toISOString(),
                                message: '✅ 대본 생성 완료!'
                              }]);

                              const scriptContent = statusData.script.content || '';
                              setCompletedScript({
                                title: title,
                                content: scriptContent,
                                scriptId: scriptId
                              });

                              // SORA2 형식인 경우 JSON 검증 및 설정
                              if (videoFormat === 'sora2') {
                                // JSON 파싱 (유틸리티 함수 사용)
                                const parseResult = parseJsonSafely(scriptContent);

                                if (parseResult.success) {
                                  setSora2Script(scriptContent);
                                  setShowSora2Review(true);
                                  const message = parseResult.fixed
                                    ? 'SORA2 대본이 생성되었습니다! (자동 수정 적용됨)'
                                    : 'SORA2 대본이 생성되었습니다! JSON 형식이 확인되었습니다.';
                                  setToast({ message, type: 'success' });
                                } else {
                                  console.error('SORA2 JSON 파싱 오류:', parseResult.error);
                                  setToast({ message: '대본이 생성되었지만 JSON 형식이 아닙니다. 프롬프트를 확인해주세요.', type: 'error' });
                                }
                              } else {
                                setToast({ message: 'API로 대본이 생성되었습니다!', type: 'success' });
                              }

                              fetchCreditsAndSettings();
                              setTimeout(() => setToast(null), 3000);
                              setManualTitle('');
                              setIsGeneratingScript(false);
                              setCurrentScriptId(null);
                            } else if (statusData.script?.status === 'failed') {
                              clearInterval(interval);
                              setScriptPollingInterval(null);
                              setIsGeneratingScript(false);

                              if (statusData.script.logs && statusData.script.logs.length > 0) {
                                const formattedLogs = statusData.script.logs.map((log: string) => ({
                                  timestamp: new Date().toISOString(),
                                  message: log
                                }));
                                setScriptGenerationLogs(formattedLogs);
                              }
                              setScriptGenerationLogs(prev => [...prev, {
                                timestamp: new Date().toISOString(),
                                message: `❌ 오류: ${statusData.script?.error || '알 수 없는 오류'}`
                              }]);

                              setScriptProgress({ current: 0, total: 100 });
                              setCurrentScriptId(null);
                              fetchCreditsAndSettings();
                              setToast({ message: statusData.script?.error || 'API 대본 생성 중 오류가 발생했습니다.', type: 'error' });
                              setTimeout(() => setToast(null), 5000);
                            } else if (statusData.script?.status === 'processing') {
                              const progress = statusData.script.progress || 50;
                              setScriptProgress({ current: progress, total: 100 });

                              if (statusData.script.content) {
                                setScriptProgress({ current: progress, total: 100, content: statusData.script.content });
                              }

                              if (statusData.script.logs && statusData.script.logs.length > 0) {
                                const formattedLogs = statusData.script.logs.map((log: string) => ({
                                  timestamp: new Date().toISOString(),
                                  message: log
                                }));
                                setScriptGenerationLogs(formattedLogs);
                              }

                              checkCount++;
                              if (checkCount >= maxChecks) {
                                clearInterval(interval);
                                setScriptPollingInterval(null);
                                setIsGeneratingScript(false);
                                setScriptGenerationLogs(prev => [...prev, {
                                  timestamp: new Date().toISOString(),
                                  message: '⏱️ 대본 생성 시간이 초과되었습니다.'
                                }]);
                                setScriptProgress({ current: 0, total: 100 });
                                setCurrentScriptId(null);
                                setToast({ message: '대본 생성 시간이 초과되었습니다.', type: 'error' });
                                setTimeout(() => setToast(null), 5000);
                              }
                            } else {
                              // pending 상태 - 로그 표시 및 기본 진행률 증가
                              if (statusData.script?.logs && statusData.script.logs.length > 0) {
                                const formattedLogs = statusData.script.logs.map((log: string) => ({
                                  timestamp: new Date().toISOString(),
                                  message: log
                                }));
                                setScriptGenerationLogs(formattedLogs);
                              } else {
                                // 로그가 없어도 기본 진행률 표시
                                setScriptProgress(prev => ({
                                  current: Math.min((prev?.current || 0) + 2, 30), // 최대 30%까지만 자동 증가
                                  total: prev?.total || 100
                                }));
                              }

                              checkCount++;
                              if (checkCount >= maxChecks) {
                                clearInterval(interval);
                                setScriptPollingInterval(null);
                                setIsGeneratingScript(false);
                                setScriptGenerationLogs(prev => [...prev, {
                                  timestamp: new Date().toISOString(),
                                  message: '⏱️ 대본 생성 시간이 초과되었습니다.'
                                }]);
                                setScriptProgress({ current: 0, total: 100 });
                                setCurrentScriptId(null);
                                setToast({ message: '대본 생성 시간이 초과되었습니다.', type: 'error' });
                                setTimeout(() => setToast(null), 5000);
                              }
                            }
                          } catch (error: any) {
                            console.error('폴링 오류:', error);
                          }
                        }, 2000);

                        setScriptPollingInterval(interval);
                      } catch (error: any) {
                        console.error(error);
                        setScriptGenerationLogs(prev => [...prev, {
                          timestamp: new Date().toISOString(),
                          message: `❌ 오류: ${error.message || '알 수 없는 오류'}`
                        }]);
                        setScriptProgress(null);
                        setToast({ message: error.message || 'API 대본 생성 중 오류가 발생했습니다.', type: 'error' });
                        setTimeout(() => setToast(null), 5000);
                        setIsGeneratingScript(false);
                      }
                    } else {
                      // 로컬 Claude 사용
                      setIsGeneratingScript(true);
                      setShowScriptLogs(true);
                      setScriptProgress({ current: 0, total: 100 });
                      setScriptGenerationLogs([{
                        timestamp: new Date().toISOString(),
                        message: '🖥️ 로컬 Claude를 사용하여 대본 생성 시작...'
                      }]);

                      try {
                        const response = await fetch('/api/scripts/generate', {
                          method: 'POST',
                          headers: getAuthHeaders(),
                          body: JSON.stringify({
                            title: title,
                            type: videoFormat, // format -> type으로 수정
                            useClaudeLocal: true
                          })
                        });

                        const data = await response.json();
                        console.log('📡 로컬 Claude API 응답:', data);

                        if (!response.ok) {
                          throw new Error(data.error || `API 오류: ${response.status}`);
                        }

                        if (!data.scriptId && !data.taskId) {
                          console.error('❌ API 응답에 scriptId 또는 taskId가 없습니다:', data);
                          throw new Error('scriptId를 받지 못했습니다.');
                        }

                        const scriptId = data.scriptId || data.taskId;
                        setCurrentScriptId(scriptId);

                        setScriptGenerationLogs(prev => [...prev, {
                          timestamp: new Date().toISOString(),
                          message: `📝 대본 생성 작업 시작 (ID: ${scriptId.substring(0, 8)}...)`
                        }]);

                        // 폴링 시작 (로컬 Claude는 scripts_temp 테이블 사용)
                        let checkCount = 0;
                        const maxChecks = 300; // 로컬은 더 오래 대기 (10분)

                        const interval = setInterval(async () => {
                          try {
                            // 로컬 Claude는 /api/script-status 엔드포인트 사용 (contents 테이블 조회)
                            const statusResponse = await fetch(`/api/script-status?scriptId=${scriptId}`, {
                              headers: getAuthHeaders()
                            });

                            if (!statusResponse.ok) {
                              const errorText = await statusResponse.text();
                              console.warn(`❌ 상태 조회 실패 (${statusResponse.status}):`, errorText);

                              // 404는 아직 대본이 생성 중일 수 있으므로 계속 폴링
                              if (statusResponse.status === 404) {
                                checkCount++;
                                if (checkCount >= maxChecks) {
                                  clearInterval(interval);
                                  setScriptPollingInterval(null);
                                  setIsGeneratingScript(false);
                                  setScriptGenerationLogs(prev => [...prev, {
                                    timestamp: new Date().toISOString(),
                                    message: '⏱️ 대본 생성 시간이 초과되었습니다.'
                                  }]);
                                  setScriptProgress({ current: 0, total: 100 });
                                  setCurrentScriptId(null);
                                  setToast({ message: '대본 생성 시간이 초과되었습니다.', type: 'error' });
                                  setTimeout(() => setToast(null), 5000);
                                }
                                return; // 404는 에러로 처리하지 않고 계속 폴링
                              }

                              throw new Error(`상태 조회 실패 (${statusResponse.status}): ${errorText}`);
                            }

                            const statusData = await statusResponse.json();
                            console.log('📊 로컬 Claude 상태:', statusData);

                            // 로그 표시 (항상 업데이트)
                            if (statusData.logs && statusData.logs.length > 0) {
                              const formattedLogs = statusData.logs.map((log: any) => ({
                                timestamp: typeof log === 'object' ? log.timestamp : new Date().toISOString(),
                                message: typeof log === 'object' ? log.message : log
                              }));
                              setScriptGenerationLogs(formattedLogs);

                              const progress = Math.min(Math.floor((statusData.logs.length / 10) * 90), 90);
                              setScriptProgress({ current: progress, total: 100 });
                            } else {
                              // 로그가 없어도 기본 진행률 표시
                              setScriptProgress(prev => ({
                                current: Math.min((prev?.current || 0) + 5, 50), // 최대 50%까지만 자동 증가
                                total: prev?.total || 100
                              }));
                            }

                            if (statusData.status === 'completed') {
                              clearInterval(interval);
                              setScriptPollingInterval(null);
                              setScriptProgress({ current: 100, total: 100 });
                              setScriptGenerationLogs(prev => [...prev, {
                                timestamp: new Date().toISOString(),
                                message: '✅ 대본 생성 완료!'
                              }]);

                              const scriptContent = statusData.content || '{}';
                              setCompletedScript({
                                title: title,
                                content: scriptContent,
                                scriptId: scriptId
                              });

                              fetchCreditsAndSettings();
                              setToast({ message: '로컬 Claude로 대본이 생성되었습니다!', type: 'success' });
                              setTimeout(() => setToast(null), 3000);
                              setManualTitle('');
                              setIsGeneratingScript(false);
                              setCurrentScriptId(null);
                            } else if (statusData.status === 'failed') {
                              clearInterval(interval);
                              setScriptPollingInterval(null);
                              setIsGeneratingScript(false);

                              setScriptGenerationLogs(prev => [...prev, {
                                timestamp: new Date().toISOString(),
                                message: `❌ 오류: ${statusData.error || '알 수 없는 오류'}`
                              }]);

                              setScriptProgress({ current: 0, total: 100 });
                              setCurrentScriptId(null);
                              fetchCreditsAndSettings();
                              setToast({ message: statusData.error || '대본 생성 중 오류가 발생했습니다.', type: 'error' });
                              setTimeout(() => setToast(null), 5000);
                            } else {
                              checkCount++;
                              if (checkCount >= maxChecks) {
                                clearInterval(interval);
                                setScriptPollingInterval(null);
                                setIsGeneratingScript(false);

                                setScriptGenerationLogs(prev => [...prev, {
                                  timestamp: new Date().toISOString(),
                                  message: '⏱️ 대본 생성 시간이 초과되었습니다.'
                                }]);

                                setScriptProgress({ current: 0, total: 100 });
                                setCurrentScriptId(null);
                                setToast({ message: '대본 생성 시간이 초과되었습니다.', type: 'error' });
                                setTimeout(() => setToast(null), 5000);
                              }
                            }
                          } catch (error: any) {
                            console.error('상태 조회 오류:', error);
                            clearInterval(interval);
                            setScriptPollingInterval(null);
                            setIsGeneratingScript(false);
                            setCurrentScriptId(null);

                            setToast({ message: error.message || '대본 상태 확인 중 오류가 발생했습니다.', type: 'error' });
                            setTimeout(() => setToast(null), 5000);
                          }
                        }, 2000);

                        setScriptPollingInterval(interval);

                        setToast({ message: '로컬 Claude로 대본 생성 중... 잠시만 기다려주세요.', type: 'info' });
                      } catch (error: any) {
                        console.error(error);
                        setIsGeneratingScript(false);
                        setCurrentScriptId(null);

                        setToast({ message: error.message || 'AI 대본 생성 중 오류가 발생했습니다.', type: 'error' });
                        setTimeout(() => setToast(null), 5000);
                      }
                    }
                  } catch (error) {
                      console.error('❌ 생성 시작 버튼 에러:', error);
                      setIsGeneratingScript(false);
                      setToast({
                        message: `치명적 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
                        type: 'error'
                      });
                      setTimeout(() => setToast(null), 5000);
                    }
                  }}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 영상 생성 프로그레스 */}
        {(isGeneratingVideo || generatedVideoUrl) && (
          <div className="rounded-3xl border border-emerald-500/30 bg-emerald-950/20 p-6 backdrop-blur">
            <h3 className="mb-4 text-lg font-bold text-emerald-400">🎬 영상 생성 진행 상황</h3>

            {isGeneratingVideo && videoProgress && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">{videoProgress.step}</span>
                  <span className="text-sm font-bold text-emerald-400">{videoProgress.progress}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${videoProgress.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    ⏳ 영상을 생성하는 중입니다. 잠시만 기다려주세요...
                  </p>
                  <button
                    onClick={async () => {
                      if (confirm('정말로 영상 생성을 취소하시겠습니까?')) {
                        try {
                          // 폴링 즉시 중지
                          if (pollingInterval) {
                            clearInterval(pollingInterval);
                            setPollingInterval(null);
                          }

                          const response = await fetch(`/api/generate-video-upload?jobId=${currentJobId}`, {
                            method: 'DELETE'
                          });

                          const data = await response.json();

                          if (response.ok) {
                            alert('✅ 영상 생성이 취소되었습니다.');
                            setIsGeneratingVideo(false);
                            setVideoProgress(null);
                            setVideoLogs([]);
                            setCurrentJobId(null);
                            localStorage.removeItem('currentJobId');
                          } else {
                            alert('취소 실패: ' + (data.error || '알 수 없는 오류'));
                          }
                        } catch (error) {
                          console.error('Cancel error:', error);
                          alert('취소 중 오류가 발생했습니다.');
                        }
                      }
                    }}
                    className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
                  >
                    🛑 중지
                  </button>
                </div>

                {/* 서버 로그 표시 */}
                {videoLogs.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">📋 서버 로그</span>
                    </div>
                    <div ref={videoLogsRef} className="max-h-96 overflow-y-auto rounded bg-black/50 p-3 font-mono text-xs leading-relaxed">
                      {videoLogs.map((log, idx) => (
                        <div key={idx} className="text-green-400 whitespace-pre-wrap break-all mb-1">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {generatedVideoUrl && !isGeneratingVideo && (
              <div className="space-y-3">
                <div className="rounded-lg bg-emerald-950/40 border border-emerald-500/30 p-4">
                  <p className="text-sm text-slate-300 mb-3">
                    ✅ 영상이 성공적으로 생성되었습니다!
                  </p>
                  <div className="flex gap-2">
                    <a
                      href={generatedVideoUrl}
                      download
                      className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-500"
                    >
                      ⬇️ 영상 다운로드
                    </a>
                    <button
                      onClick={() => {
                        setGeneratedVideoUrl(null);
                        setVideoProgress(null);
                      }}
                      className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-500"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}


        <section className="flex flex-col gap-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">소재찾기</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* LLM 이동 버튼들 */}
                {[
                  { value: 'chatgpt', label: 'ChatGPT' },
                  { value: 'gemini', label: 'Gemini' },
                  { value: 'claude', label: 'Claude' },
                  { value: 'groq', label: 'Groq' }
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSelectedModel(option.value as any);
                      // localStorage에 저장
                      const currentFilters = localStorage.getItem('trend-video-filters');
                      if (currentFilters) {
                        const filters = JSON.parse(currentFilters);
                        filters.selectedModel = option.value;
                        localStorage.setItem('trend-video-filters', JSON.stringify(filters));
                      }
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      selectedModel === option.value
                        ? 'bg-sky-400 text-sky-950 shadow shadow-sky-400/40'
                        : 'bg-white/10 text-slate-200 hover:bg-white/20'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleMoveToLLM}
                  disabled={isPipelineProcessing}
                  className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-wait disabled:opacity-70"
                >
                  🚀 LLM으로 이동
                </button>
                <div className="h-4 w-px bg-white/20"></div>
                <button
                  type="button"
                  onClick={fetchVideos}
                  disabled={isFetching}
                  className="flex items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-sky-950 shadow-lg shadow-sky-500/30 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isFetching ? "불러오는 중..." : "🔍 YouTube 데이터 불러오기"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newState = !isFilterExpanded;
                    setIsFilterExpanded(newState);
                    // localStorage에 저장
                    const currentFilters = localStorage.getItem('trend-video-filters');
                    const filters = currentFilters ? JSON.parse(currentFilters) : {};
                    filters.isFilterExpanded = newState;
                    localStorage.setItem('trend-video-filters', JSON.stringify(filters));
                    console.log('💾 소재찾기 펼침 상태 저장:', newState);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
                  aria-label={isFilterExpanded ? "접기" : "펼치기"}
                >
                  <svg
                    className={`h-5 w-5 transition-transform ${isFilterExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {isFilterExpanded && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
              {/* 필터 섹션 */}
              <aside className="space-y-8">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">제목 키워드</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={titleQuery}
                    onChange={(event) => setTitleQuery(event.target.value)}
                    onKeyPress={(event) => {
                      if (event.key === 'Enter') {
                        fetchVideos();
                      }
                    }}
                    placeholder="예: 여행 브이로그"
                    className="flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white shadow-inner focus:border-emerald-300 focus:outline-none"
                  />
                </div>
              </div>

              <RangeControl
                label="영상 길이 (분)"
                min={0}
                max={180}
                step={5}
                value={durationRange}
                onChange={setDurationRange}
                suffix="분"
              />
              <RangeControl
                label="조회수"
                min={1}
                max={10_000_000_000}
                step={50_000}
                value={viewRange}
                onChange={setViewRange}
                suffix="회"
                useLogScale={true}
              />

              <RangeControl
                label="구독자 수"
                min={1}
                max={10_000_000_000}
                step={10_000}
                value={subRange}
                onChange={setSubRange}
                suffix="명"
                useLogScale={true}
              />

              <div className="space-y-4 text-sm">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">
                    영상 종류
                  </label>
                  <select
                    value={videoType}
                    onChange={(event) => setVideoType(event.target.value as VideoType | "all")}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white shadow-inner focus:border-emerald-300 focus:outline-none"
                  >
                    {typeOptions.map((option) => (
                      <option key={option.value} value={option.value} className="text-slate-900">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">
                    게시일 조건
                  </label>
                  <select
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white shadow-inner focus:border-emerald-300 focus:outline-none"
                  >
                    {dateOptions.map((option) => (
                      <option key={option.value} value={option.value} className="text-slate-900">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-200">정렬</label>
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as SortOption)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white shadow-inner focus:border-emerald-300 focus:outline-none"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value} className="text-slate-900">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-200">카테고리</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCategories([])}
                    className="text-xs text-slate-300 underline underline-offset-4 hover:text-white"
                  >
                    전체 해제
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORY_OPTIONS.map((option) => {
                    const checked = selectedCategories.includes(option.id);
                    return (
                      <label
                        key={option.id}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                          checked
                            ? "border-emerald-300 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-white/5 text-slate-200 hover:border-white/25"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(option.id)}
                          className="h-4 w-4 rounded border-slate-400 text-emerald-400 focus:ring-emerald-400"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleRunAutomation}
                  disabled={isPipelineProcessing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-70"
                >
                  {isPipelineProcessing ? "준비 중..." : "선택 영상으로 제작"}
                </button>
              </div>
              </aside>

              {/* 검색 결과 및 로그 섹션 */}
              <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">검색 결과</h2>
                <p className="text-xs text-slate-300">
                  총 {filteredVideos.length}개의 결과. 선택하여 자동 대본 생성 파이프라인으로 보내세요.
                </p>
                {lastFetchedLabel && (
                  <p className="text-xs text-slate-400">마지막 업데이트: {lastFetchedLabel}</p>
                )}
              </div>
              <div className="text-xs text-slate-400">
                선택 {selectedIds.length} / {filteredVideos.length}
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                {errorMessage}
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredVideos.map((video) => {
                const isSelected = selectedIds.includes(video.id);
                return (
                  <VideoCard
                    key={video.id}
                    video={video}
                    isSelected={isSelected}
                    onToggle={() => toggleSelect(video.id)}
                  />
                );
              })}

              {!filteredVideos.length && (
                <div className="col-span-full rounded-3xl border border-white/10 bg-white/5 p-12 text-center text-sm text-slate-300">
                  조건에 맞는 영상이 없습니다. 필터 범위를 조정하거나 다른 조건으로 검색해보세요.
                </div>
              )}
            </div>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">YouTube API 로그</h3>
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className="rounded-lg border border-white/20 px-3 py-1 text-xs text-slate-200 transition hover:border-white/40 hover:text-white"
                >
                  로그 비우기
                </button>
              </div>
              <div className="mt-4 max-h-48 overflow-y-auto rounded-2xl bg-black/40 p-4 font-mono text-[11px] leading-5 text-slate-200">
                {logs.length ? (
                  logs.map((log, index) => <p key={`${log}-${index}`}>{log}</p>)
                ) : (
                  <p className="text-slate-400">아직 로그가 없습니다. 데이터를 불러오면 여기에서 확인할 수 있어요.</p>
                )}
              </div>
            </section>
          </section>
          </div>
          )}
          </div>
        </section>
      </div>

      {/* 제목 비교 및 대본 생성 모달 */}
      {showTitleModal && transformedTitles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-900 p-8 shadow-2xl">
            <h2 className="mb-6 text-2xl font-bold text-white">📝 제목 변형 결과</h2>

            <div className="mb-6 space-y-4">
              {transformedTitles.map((item, index) => (
                <div key={index} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-400 mb-1">원본 제목:</p>
                    <p className="text-base text-slate-300 break-words whitespace-pre-wrap">{item.original}</p>
                  </div>
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-emerald-400">✨ 변형된 제목 (선택하세요):</p>
                      <button
                        onClick={() => handleRegenerateTitles(index)}
                        disabled={isTransforming}
                        className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-1 text-xs text-emerald-300 transition hover:border-emerald-500/50 hover:bg-emerald-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        🔄 다시 만들기
                      </button>
                    </div>
                    <div className="space-y-2">
                      {item.options.map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          onClick={() => handleSelectOption(index, optionIndex)}
                          className={`cursor-pointer rounded-lg border p-3 transition ${
                            item.selected === optionIndex
                              ? 'border-emerald-400 bg-emerald-950/30'
                              : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              item.selected === optionIndex
                                ? 'border-emerald-400 bg-emerald-400'
                                : 'border-slate-500'
                            }`}>
                              {item.selected === optionIndex && (
                                <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                                  <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <p className={`flex-1 text-sm ${
                              item.selected === optionIndex
                                ? 'font-bold text-emerald-300'
                                : 'text-slate-300'
                            }`}>
                              {option}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-950/20 p-4">
              <p className="text-xs text-yellow-200">
                💡 선택된 제목들을 사용하여 대본을 생성합니다. {transformedTitles.length > 1 ? `(${transformedTitles.length}개 영상)` : ''}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {user?.isAdmin && (
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/prompt');
                      const data = await response.json();
                      if (data.content) {
                        // 모든 선택된 제목들을 조합
                        const selectedTitles = transformedTitles.map(item => item.options[item.selected]);

                        if (selectedTitles.length === 1) {
                          // 제목이 1개인 경우
                          const fullPrompt = `${data.content}\n\n주제: ${selectedTitles[0]}`;
                          await navigator.clipboard.writeText(fullPrompt);
                          setToast({
                            message: '프롬프트가 클립보드에 복사되었습니다!',
                            type: 'success'
                          });
                          setTimeout(() => setToast(null), 5000);
                        } else {
                          // 제목이 여러 개인 경우
                          const titlesText = selectedTitles.map((title, idx) => `${idx + 1}. ${title}`).join('\n');
                          const fullPrompt = `${data.content}\n\n주제 (${selectedTitles.length}개):\n${titlesText}`;
                          await navigator.clipboard.writeText(fullPrompt);
                          setToast({
                            message: `프롬프트가 클립보드에 복사되었습니다! (${selectedTitles.length}개 제목)`,
                            type: 'success'
                          });
                          setTimeout(() => setToast(null), 5000);
                        }
                        setShowTitleModal(false);
                      } else {
                        setToast({
                          message: data.error || '프롬프트를 읽을 수 없습니다.',
                          type: 'error'
                        });
                        setTimeout(() => setToast(null), 5000);
                      }
                    } catch (error) {
                      console.error(error);
                      setToast({
                        message: '프롬프트 복사 중 오류가 발생했습니다.',
                        type: 'error'
                      });
                      setTimeout(() => setToast(null), 5000);
                    }
                  }}
                  className="flex-1 rounded-xl bg-slate-700 px-6 py-3 font-semibold text-white transition hover:bg-slate-600"
                >
                  🚀 Claude로 열기 (무료)
                </button>
              )}

              <button
                onClick={() => {
                  const selectedTitles = transformedTitles.map(item => item.options[item.selected]);

                  // 크레딧 확인
                  if (user && settings && user.credits < settings.aiScriptCost * transformedTitles.length) {
                    setToast({
                      message: `크레딧이 부족합니다. (필요: ${settings.aiScriptCost * transformedTitles.length}, 보유: ${user.credits})`,
                      type: 'error'
                    });
                    setTimeout(() => setToast(null), 5000);
                    return;
                  }

                  // 확인 모달 표시
                  setScriptConfirmCallback(() => async () => {
                    try {
                    const promptResponse = await fetch(getPromptApiUrl());
                    const promptData = await promptResponse.json();

                    if (!promptData.content) {
                      setToast({
                        message: '프롬프트를 읽을 수 없습니다.',
                        type: 'error'
                      });
                      setTimeout(() => setToast(null), 5000);
                      return;
                    }

                    // 대본 생성 시작
                    setIsGeneratingScript(true);
                    setScriptProgress({ current: 0, total: transformedTitles.length });
                    setToast({
                      message: `AI가 ${transformedTitles.length}개의 대본을 생성 중입니다...`,
                      type: 'info'
                    });

                    // 모든 제목에 대해 순차적으로 대본 생성 (진행률 표시 위해)
                    const results = [];
                    for (let i = 0; i < selectedTitles.length; i++) {
                      const title = selectedTitles[i];
                      const response = await fetch('/api/generate-script', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          prompt: promptData.content,
                          topic: title
                        })
                      });
                      const data = await response.json();
                      results.push({ title, script: data.script, usage: data.usage, error: data.error });

                      // 진행률 업데이트
                      setScriptProgress({ current: i + 1, total: transformedTitles.length });
                    }

                    // 모든 대본을 하나의 파일로 저장
                    const allScripts = results.map((result, idx) => {
                      if (result.script) {
                        return `========================================\n제목 ${idx + 1}: ${result.title}\n========================================\n\n${result.script}\n\n`;
                      } else {
                        return `========================================\n제목 ${idx + 1}: ${result.title}\n========================================\n\n❌ 생성 실패: ${result.error || '알 수 없는 오류'}\n\n`;
                      }
                    }).join('\n');

                    const successCount = results.filter(r => r.script).length;
                    const totalInputTokens = results.reduce((sum, r) => sum + (r.usage?.input_tokens || 0), 0);
                    const totalOutputTokens = results.reduce((sum, r) => sum + (r.usage?.output_tokens || 0), 0);

                    const blob = new Blob([allScripts], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `scripts_${transformedTitles.length}개_${new Date().toISOString().slice(0,10)}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    setToast({
                      message: `대본 생성 완료! (${successCount}/${transformedTitles.length}개 성공) - 파일이 다운로드되었습니다.`,
                      type: 'success'
                    });
                    setTimeout(() => setToast(null), 5000);

                    // 크레딧 다시 가져오기
                    fetchCreditsAndSettings();

                    setShowTitleModal(false);
                  } catch (error) {
                    console.error(error);
                    setToast({
                      message: '대본 생성 중 오류가 발생했습니다.',
                      type: 'error'
                    });
                    setTimeout(() => setToast(null), 5000);
                    } finally {
                      setIsGeneratingScript(false);
                      setScriptProgress(null);
                    }
                  });
                  setShowScriptConfirmModal(true);
                }}
                className="flex-1 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-500"
              >
                🤖 AI로 대본 생성 (유료)
              </button>

              <button
                onClick={() => setShowTitleModal(false)}
                className="rounded-xl bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-500"
              >
                ✕ 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 대본 생성 확인 모달 (파이프라인용 - scriptConfirmCallback 사용) */}
      {showScriptConfirmModal && !scriptConfirmData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-slate-800 to-slate-900 p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-start gap-3">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-xl font-bold text-white">AI 대본 생성 확인</h3>
            </div>

            <div className="mb-8 space-y-4">
              <p className="text-sm text-slate-300">Claude API를 사용하여 대본을 생성합니다.</p>
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                <p className="font-semibold text-yellow-300">
                  💳 {settings?.aiScriptCost || 25} 크레딧이 차감됩니다
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  현재 보유: {user?.credits || 0} 크레딧
                </p>
              </div>
              <p className="text-sm text-slate-400">
                계속하시겠습니까?
              </p>
            </div>

            <div className="flex w-full gap-4">
              <button
                onClick={() => {
                  console.log('🚀 ✅ 생성 시작 버튼 클릭됨 (파이프라인 모달)');
                  console.log('scriptConfirmCallback:', scriptConfirmCallback);
                  setShowScriptConfirmModal(false);
                  if (scriptConfirmCallback) {
                    console.log('✅ callback 실행 중...');
                    scriptConfirmCallback();
                    setScriptConfirmCallback(null);
                  } else {
                    console.error('❌ scriptConfirmCallback이 null입니다!');
                    alert('오류: 생성 함수가 설정되지 않았습니다.');
                  }
                }}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500"
              >
                ✅ 생성
              </button>
              <button
                onClick={() => {
                  setShowScriptConfirmModal(false);
                  setScriptConfirmCallback(null);
                }}
                className="flex-1 rounded-lg bg-slate-600 px-4 py-3 font-semibold text-white transition hover:bg-slate-500"
              >
                ✕ 취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SORA2 대본 확인 및 편집 모달 */}
      {showSora2Review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-800 to-slate-900 p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎥</span>
                <h3 className="text-xl font-bold text-white">SORA2 대본 확인 및 편집</h3>
              </div>
              <button
                onClick={() => setShowSora2Review(false)}
                className="text-slate-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 space-y-4">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-4">
                <p className="text-sm text-cyan-200 mb-2">
                  💡 생성된 대본을 확인하고 필요시 수정하세요. 수정 후 영상 제작을 시작합니다.
                </p>
                <p className="text-xs text-slate-400">
                  SoraExtend를 통해 8초 길이의 고품질 영상이 생성됩니다.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-300">
                  대본 내용
                </label>
                <textarea
                  value={sora2Script}
                  onChange={(e) => setSora2Script(e.target.value)}
                  className="w-full min-h-[400px] rounded-lg bg-slate-900 border border-slate-700 p-4 text-white font-mono text-sm placeholder-slate-500 focus:border-cyan-500 focus:outline-none resize-none"
                  placeholder="SORA2 대본이 생성 중입니다..."
                />
              </div>

              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                <p className="text-xs text-yellow-200">
                  ⚠️ 영상 제작은 약 5-10분 정도 소요됩니다. 백그라운드에서 처리되며 완료 후 알림을 받게 됩니다.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={startSora2VideoGeneration}
                disabled={!sora2Script.trim() || isGeneratingVideo}
                className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-4 font-semibold text-white transition hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingVideo ? '⏳ 처리 중...' : '✅ 확인 및 영상 제작'}
              </button>
              <button
                onClick={() => setShowSora2Review(false)}
                disabled={isGeneratingVideo}
                className="rounded-lg bg-slate-600 px-6 py-4 font-semibold text-white transition hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✕ 취소
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Toast 알림 */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2">
          <div className={`rounded-xl border px-6 py-4 shadow-2xl backdrop-blur ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/90'
              : toast.type === 'error'
              ? 'border-red-500/30 bg-red-950/90'
              : 'border-blue-500/30 bg-blue-950/90'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
              </span>
              <p className={`text-sm font-medium ${
                toast.type === 'success'
                  ? 'text-emerald-200'
                  : toast.type === 'error'
                  ? 'text-red-200'
                  : 'text-blue-200'
              }`}>
                {toast.message}
              </p>
              <button
                onClick={() => setToast(null)}
                className="ml-2 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = "",
  useLogScale = false,
}: {
  label: string;
  value: { min: number; max: number };
  min: number;
  max: number;
  step: number;
  onChange: (next: { min: number; max: number }) => void;
  suffix?: string;
  useLogScale?: boolean;
}) {
  // 로그 스케일 변환 함수
  const toLog = (val: number) => {
    if (!useLogScale) return val;
    return Math.log10(Math.max(val, 1));
  };

  const fromLog = (logVal: number) => {
    if (!useLogScale) return logVal;
    return Math.round(Math.pow(10, logVal));
  };

  const logMin = toLog(min);
  const logMax = toLog(max);
  const logStep = useLogScale ? 0.01 : step; // 로그 스케일에서는 작은 step 사용

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-100">{label}</span>
        <span className="text-xs text-slate-300" suppressHydrationWarning>
          {renderCount(value.min)}{suffix} ~ {renderCount(value.max)}{suffix}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={logMin}
          max={logMax}
          step={logStep}
          value={toLog(value.min)}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-400"
          onChange={(event) => {
            const nextMin = fromLog(Number(event.target.value));
            const minGap = useLogScale ? 1 : step;
            onChange({ min: Math.min(nextMin, value.max - minGap), max: value.max });
          }}
          suppressHydrationWarning
        />
        <input
          type="range"
          min={logMin}
          max={logMax}
          step={logStep}
          value={toLog(value.max)}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-400"
          onChange={(event) => {
            const nextMax = fromLog(Number(event.target.value));
            const minGap = useLogScale ? 1 : step;
            onChange({ min: value.min, max: Math.max(nextMax, value.min + minGap) });
          }}
          suppressHydrationWarning
        />
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-slate-200">
        <label className="flex flex-col gap-1">
          <span className="font-medium">최소</span>
          <input
            type="number"
            min={min}
            max={value.max - (useLogScale ? 1 : step)}
            step={useLogScale ? 1 : step}
            value={value.min}
            onChange={(event) => {
              const minGap = useLogScale ? 1 : step;
              const nextMin = Math.min(Number(event.target.value), value.max - minGap);
              onChange({ min: nextMin, max: value.max });
            }}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:border-emerald-300 focus:outline-none"
            suppressHydrationWarning
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">최대</span>
          <input
            type="number"
            min={value.min + (useLogScale ? 1 : step)}
            max={max}
            step={useLogScale ? 1 : step}
            value={value.max}
            onChange={(event) => {
              const minGap = useLogScale ? 1 : step;
              const nextMax = Math.max(Number(event.target.value), value.min + minGap);
              onChange({ min: value.min, max: nextMax });
            }}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:border-emerald-300 focus:outline-none"
            suppressHydrationWarning
          />
        </label>
      </div>
    </div>
  );
}

function VideoCard({
  video,
  isSelected,
  onToggle,
}: {
  video: VideoItem;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      onToggle();
    }
  };

  const categoryLabel = video.categoryId ? categoryLabelMap[video.categoryId] : undefined;

  return (
    <article
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className={`relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
        isSelected
          ? "border-emerald-300 ring-2 ring-emerald-300"
          : "border-zinc-200 ring-1 ring-transparent hover:ring-emerald-200"
      }`}
    >
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          onClick={(event) => event.stopPropagation()}
          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
        />
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold shadow ${
            isSelected ? "bg-emerald-500 text-emerald-950" : "bg-black/60 text-slate-100"
          }`}
        >
          {isSelected ? "선택됨" : "탐색"}
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden">
        <Image
          src={video.thumbnailUrl}
          alt={video.title}
          fill
          sizes="(min-width: 1280px) 384px, (min-width: 768px) 50vw, 100vw"
          className="object-cover"
          priority={video.id === "1"}
        />
        <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-1 text-xs font-medium text-white">
          {video.duration}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        {/* 제목 영역 */}
        <div className="min-w-0">
          <h3
            className="text-base font-semibold leading-5 text-zinc-900"
            style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
            title={video.title}
          >
            {video.title}
          </h3>
        </div>

        {/* 버튼 영역 */}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
          >
            영상 보기
          </a>
          <a
            href={`http://downsub.com/?url=${encodeURIComponent(video.videoUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
          >
            자막 받기
          </a>
          <button
            onClick={async (event) => {
              event.stopPropagation();
              try {
                const response = await fetch(video.thumbnailUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `thumbnail_${video.id}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              } catch (error) {
                console.error('썸네일 다운로드 실패:', error);
                alert('썸네일 다운로드에 실패했습니다.');
              }
            }}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
          >
            썸네일
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm text-zinc-600">
          <div>
            <dt className="text-xs text-zinc-500">조회수</dt>
            <dd className="font-medium text-zinc-900">{renderCount(video.views)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">좋아요</dt>
            <dd className="font-medium text-zinc-900">{renderCount(video.likes)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">댓글</dt>
            <dd className="font-medium text-zinc-900">{renderCount(video.comments)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">게시일</dt>
            <dd className="font-medium text-zinc-900">
              {new Date(video.publishedAt).toLocaleDateString("ko-KR")}
            </dd>
          </div>
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-2 rounded-xl bg-zinc-100/80 p-3 text-xs text-zinc-700">
          <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700">
            {video.type.toUpperCase()}
          </span>
          {categoryLabel && (
            <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700">
              {categoryLabel}
            </span>
          )}
          <span>
            채널: <strong>{video.channelName}</strong>
          </span>
          <span>
            구독자 {renderCount(video.channelSubscribers)}명
          </span>
        </div>
      </div>
    </article>
  );
}

function composeLLMPrompt({
  item,
  video,
  model,
}: {
  item: PipelineResultItem;
  video: VideoItem;
  model: ModelOption;
}) {
  const categoryLabel = categoryLabelMap[video.categoryId ?? ""] ?? "기타";
  const fun = item.funHighlights?.length
    ? item.funHighlights.map((line, idx) => `${idx + 1}. ${line}`).join('\n')
    : '재미 요소를 직접 검토해 주세요.';
  const thumbnail = item.thumbnailPrompt ?? '썸네일 아이디어를 직접 작성해 주세요.';
  const transcriptPreview = item.transcript
    ? item.transcript.slice(0, 4000) + (item.transcript.length > 4000 ? '\n[...자막 일부 생략...]' : '')
    : '자막을 확보하지 못했습니다. DownSub 버튼으로 직접 추출해 주세요.';

  const lines: string[] = [];
  lines.push('🎥프롬프트제목: YouTube 영상자막기반신규영상자동생성');
  lines.push('');
  lines.push('📌목표');
  lines.push('기존유튜브영상제공된링크과자막을분석하여, 새로운버전의영상예: 리믹스, 요약, 리듬형자막등을생성한다');
  lines.push('');
  lines.push('### 🔹입력데이터');
  lines.push(`- 원본영상링크: ${video.videoUrl}`);
  lines.push(`- 영상제목: ${video.title}`);
  lines.push(`- 채널: ${video.channelName}`);
  lines.push(`- 업로드일: ${new Date(video.publishedAt).toLocaleDateString('ko-KR')}`);
  lines.push(`- 조회수: ${renderCount(video.views)}회`);
  lines.push(`- 영상길이: ${video.duration ?? '길이 정보 없음'}`);
  lines.push(`- 영상카테고리: ${categoryLabel}`);
  lines.push(`- 자막데이터:\n${transcriptPreview}`);
  lines.push('');
  lines.push('### 🔹생성목표');
  lines.push('1. 원본의톤과리듬을유지하되, 시각적몰입감을강화한자막형영상제작');
  lines.push('2. 텍스트자막을리듬기반으로재배치 (비트박자감지후타이밍자동매핑)');
  lines.push('3. 시청지속시간을높이는카메라워크컷전환자동삽입');
  lines.push('4. SNS용 9:16 비율버전자동생성 (TikTok, YouTube Shorts 호환)');
  lines.push('5. 자막언어선택: 한국어 or 영어중자동감지 선택언어로재생성');
  lines.push('6. 스타일: 트렌딩리믹스또는클립형밈버전 (감정강조 + 텍스트애니메이션)');
  lines.push('');
  lines.push('### 🔹생성단계');
  lines.push('1 **원본분석**');
  lines.push('- 영상의비트, 템포, 주요장면, 리듬포인트자동감지');
  lines.push('- 자막문장별타이밍분석 (.srt 기반)');
  lines.push('- 반복구절및후렴부식별');
  lines.push('');
  lines.push('2 **자막리믹스**');
  lines.push('- 강조단어에컬러효과적용 (예: Annana Paathiya  붉은노란그라데이션)');
  lines.push('- 타이밍에맞춘폰트크기변화및박자강조');
  lines.push('- 불필요한공백자막제거');
  lines.push('');
  lines.push('3 **비주얼편집**');
  lines.push('- 원본영상클립을 0.5~1.5배속도로리듬에맞게재조합');
  lines.push('- 컷전환시음악비트와동기화');
  lines.push('- 필요시자동줌인줌아웃삽입');
  lines.push('');
  lines.push('4 **결과물생성**');
  lines.push('- 영상길이:약 60초');
  lines.push('- 해상도: 1080x1920 (9:16)');
  lines.push('- 포맷: MP4');
  lines.push('- 배경음악: 원본그대로유지');
  lines.push('- 출력제목: Triplara.com Viral Remix | Short Ver.');
  lines.push('');
  lines.push('### 🔹출력스크립트자동생성예시');
  lines.push('예시문장:');
  lines.push('> 🎵 Triplara.com Annana Paathiya');
  lines.push('>  Appata Ketiya Viral Song');
  lines.push('> 🔥 XploreAll presents the trend you cant stop watching!');
  lines.push('');
  lines.push('### 🔹후속자동화옵션');
  lines.push(')- AI 음성더빙버전생성 (한국어영어선택)');
  lines.push('- 자동썸네일생성 (#viral #shorts #music 포함)');
  lines.push('- 영상설명문자동작성');
  lines.push('- 게시용해시태그자동생성: `#viral #trending #remix #shorts #AIvideo`');
  lines.push('');
  lines.push('**출력형식예시**');
  lines.push('최종결과물:');
  lines.push('- /output/final_video.mp4');
  lines.push('- /output/final_subtitle.srt');
  lines.push('- /output/description.txt');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('참고용 자동요약(초안):');
  lines.push(item.script);
  lines.push('');
  lines.push('재미 포인트 참고:');
  lines.push(fun);
  lines.push('');
  lines.push('썸네일 제안:');
  lines.push(thumbnail);
  lines.push('');
  lines.push(`선택한 모델: ${model.toUpperCase()}`);

  return lines.join('\n');
}

function calculateVph(video: VideoItem) {
  const publishedDate = new Date(video.publishedAt);
  const now = new Date();
  const diffMs = Math.max(now.getTime() - publishedDate.getTime(), 1);
  const diffHours = diffMs / (1000 * 60 * 60);
  return video.views / diffHours;
}

function openModelTab(model: ModelOption, video: VideoItem, script: string, targetWindow?: Window | null) {
  if (typeof window === 'undefined') {
    return;
  }

  const baseUrls: Record<ModelOption, string> = {
    gpt: 'https://chat.openai.com',
    gemini: 'https://gemini.google.com/app',
    claude: 'https://claude.ai/new',
    groq: 'https://console.groq.com/playground',
  };

  const prompt = `영상 제목: ${video.title}
채널: ${video.channelName}
조회수: ${video.views}
영상 링크: ${video.videoUrl}

추천 스크립트:
${script}`;

  // 먼저 클립보드에 복사 (탭 열기 전에 복사)
  navigator.clipboard.writeText(prompt).then(() => {
    console.log(`✅ [${model.toUpperCase()}] 프롬프트가 클립보드에 복사되었습니다.`);
  }).catch((err) => {
    console.error('클립보드 복사 실패:', err);
  });

  // 그 다음 탭 열기
  let opened: Window | null = null;
  if (targetWindow && !targetWindow.closed) {
    opened = targetWindow;
    opened.location.href = baseUrls[model];
  } else {
    opened = window.open(baseUrls[model], '_blank');
  }

  if (opened) {
    opened.focus();
  }
}

function normalizeModel(value: string | undefined): ModelOption {
  const found = modelOptions.find((option) => option.value === value);
  return found ? found.value : 'gpt';
}

function matchesDateFilterLocal(publishedAt: string, filter: DateFilter) {
  if (filter === "any") {
    return true;
  }

  const publishedDate = new Date(publishedAt);
  if (Number.isNaN(publishedDate.getTime())) {
    return true;
  }

  const now = Date.now();
  const diffMs = now - publishedDate.getTime();

  if (filter === "today") {
    return diffMs <= 24 * 60 * 60 * 1000;
  }
  if (filter === "week") {
    return diffMs <= 7 * 24 * 60 * 60 * 1000;
  }
  if (filter === "month") {
    return diffMs <= 30 * 24 * 60 * 60 * 1000;
  }

  return true;
}