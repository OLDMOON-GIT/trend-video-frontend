"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Breadcrumb from "@/components/Breadcrumb";

import type { DateFilter, SortOption, VideoItem, VideoType } from "@/types/video";

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
const defaultSubRange = { min: 0, max: 10_000_000 };
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
  const storedFilters = useMemo(loadStoredFilters, []);
  const [viewRange, setViewRange] = useState(() => storedFilters?.viewRange ?? defaultViewRange);
  const [subRange, setSubRange] = useState(() => storedFilters?.subRange ?? defaultSubRange);
  const [videoType, setVideoType] = useState<VideoType | "all">(storedFilters?.videoType ?? "all");
  const [dateFilter, setDateFilter] = useState<DateFilter>(storedFilters?.dateFilter ?? "any");
  const [sortBy, setSortBy] = useState<SortOption>(storedFilters?.sortBy ?? "views");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(storedFilters?.selectedCategories ?? []);
  const [titleQuery, setTitleQuery] = useState(storedFilters?.titleQuery ?? "");
  const [durationRange, setDurationRange] = useState(() => storedFilters?.durationRange ?? defaultDurationRange);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(storedFilters?.selectedModel ?? 'gpt');
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
  const [titleInputMode, setTitleInputMode] = useState<'copy' | 'generate' | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{step: string; progress: number} | null>(null);
  const [videoLogs, setVideoLogs] = useState<string[]>([]);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [uploadedJson, setUploadedJson] = useState<File | null>(null);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [toast, setToast] = useState<{message: string; type: 'success' | 'info' | 'error'} | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [scriptProgress, setScriptProgress] = useState<{current: number; total: number; content?: string} | null>(null);
  const [showScriptConfirmModal, setShowScriptConfirmModal] = useState(false);
  const [scriptConfirmCallback, setScriptConfirmCallback] = useState<(() => void) | null>(null);
  const [completedScript, setCompletedScript] = useState<{title: string; content: string; scriptId: string} | null>(null);
  const [user, setUser] = useState<{id: string; email: string; credits: number; isAdmin: boolean} | null>(null);
  const [settings, setSettings] = useState<{aiScriptCost: number; videoGenerationCost: number} | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{cost: number; currentCredits: number; jsonName: string; imageCount: number} | null>(null);
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [isSuggestingTitles, setIsSuggestingTitles] = useState(false);
  const [selectedSuggestedTitle, setSelectedSuggestedTitle] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<'none' | 'dalle' | 'google'>('none');

  // 대본 생성 로그 (기존 변수 유지)
  const [scriptGenerationLog, setScriptGenerationLog] = useState<string[]>([]);
  const scriptContentRef = useRef<HTMLDivElement>(null);
  const videoLogsRef = useRef<HTMLDivElement>(null);
  const pipelineLogsRef = useRef<HTMLDivElement>(null);
  const scriptGenerationLogRef = useRef<HTMLDivElement>(null);

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
  }, [scriptGenerationLog]);

  useEffect(() => {
    setIsMounted(true);
    checkAuth();

    // 진행 중인 작업 복구
    const savedJobId = localStorage.getItem('currentJobId');
    if (savedJobId) {
      setCurrentJobId(savedJobId);
      setIsGeneratingVideo(true);
      startPollingVideoStatus(savedJobId);
    }

    // 저장된 영상 목록 복구
    const savedVideos = localStorage.getItem('trend-video-results');
    const savedFetchedAt = localStorage.getItem('trend-video-fetched-at');
    if (savedVideos && savedFetchedAt) {
      try {
        const parsedVideos = JSON.parse(savedVideos);
        if (Array.isArray(parsedVideos) && parsedVideos.length > 0) {
          setVideos(parsedVideos);
          setLastFetchedAt(savedFetchedAt);
          pushLog(`이전 검색 결과 복원: ${parsedVideos.length}개 영상`);
        }
      } catch (error) {
        console.error('저장된 영상 목록 복구 실패:', error);
      }
    }

    // 파이프라인 스크립트 로드 (내 콘텐츠에서 실행 버튼 눌렀을 때)
    const pipelineScript = localStorage.getItem('pipelineScript');
    console.log('🔍 파이프라인 스크립트 체크:', pipelineScript ? '있음' : '없음');

    if (pipelineScript) {
      console.log('🎬 파이프라인 스크립트 감지됨');
      try {
        const parsed = JSON.parse(pipelineScript);
        const { title, content, imageSource } = parsed;
        console.log('📝 파싱된 데이터:', {
          title,
          hasContent: !!content,
          imageSource: imageSource || 'dalle (기본값)',
          contentType: typeof content
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

        // 이미지 소스 설정 (기본값: dalle)
        const source = imageSource || 'dalle';
        setImageSource(source);
        console.log('  ✓ imageSource 설정:', source);

        setShowUploadSection(true);
        console.log('  ✓ showUploadSection: true');

        localStorage.removeItem('pipelineScript');
        console.log('  ✓ pipelineScript localStorage 제거');

        // 자동 영상 생성은 하지 않음 (사용자가 직접 버튼을 눌러야 함)
        console.log('📋 파일 업로드 섹션만 열림 - 사용자가 수동으로 생성 버튼을 눌러야 합니다');

        setToast({
          message: `대본 "${title}"이(가) 로드되었습니다! 영상 제작 시작 버튼을 눌러주세요.`,
          type: 'success'
        });
        setTimeout(() => setToast(null), 5000);

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

  // localStorage에서 세션 ID 가져오기
  const getSessionId = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  };

  // Authorization 헤더 포함한 fetch 옵션
  const getAuthHeaders = () => {
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
        return;
      }

      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders()
      });
      const data = await response.json();
      if (data.user) {
        setUser(data.user);
        console.log('✅ 사용자 인증됨:', data.user.email);

        // 크레딧 정보와 설정 가져오기
        fetchCreditsAndSettings();
      }
    } catch (error) {
      console.error('Auth check error:', error);
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
      // localStorage에서 세션 ID 삭제
      localStorage.removeItem('sessionId');
      setUser(null);
      showToast('로그아웃 되었습니다.', 'info');
    } catch (error) {
      console.error('Logout error:', error);
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
        : Math.max(parseIsoDurationLocal(video.duration), 0);
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
    showToast('📤 JSON 대본과 이미지 8컷을 업로드해주세요.', 'info');
  }, []);

  const handleMoveToLLM = useCallback(async () => {
    // 영상이 선택되지 않았으면 모델 홈페이지로 이동
    if (!selectedIds.length) {
      const modelUrls: Record<string, string> = {
        'gpt': 'https://chatgpt.com',
        'gemini': 'https://gemini.google.com',
        'claude': 'https://claude.ai',
        'groq': 'https://groq.com'
      };

      const url = modelUrls[selectedModel] || 'https://chatgpt.com';
      window.open(url, '_blank');
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
  }, [runPipeline, pushLog, selectedIds]);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 py-8 sm:py-16 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 sm:gap-10 sm:px-6">
        {/* 사용자 정보 바 */}
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-2">
          <div className="flex items-center gap-3 text-xs text-slate-300 sm:text-sm">
            <Breadcrumb />
            {user ? (
              <span>👤 {user.email}</span>
            ) : (
              <span>로그인하지 않음</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
            {user ? (
              <>
                {/* 크레딧 표시 */}
                <a
                  href="/credits"
                  className="rounded-lg bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 px-2 py-1 sm:px-4 sm:py-1.5 transition hover:from-yellow-500/30 hover:to-orange-500/30 cursor-pointer"
                >
                  <span className="text-xs font-semibold text-yellow-300 sm:text-sm">💰 {user.credits?.toLocaleString() || 0}</span>
                </a>

                {user.isAdmin && (
                  <a
                    href="/admin"
                    className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-red-500 sm:px-3 sm:py-1.5 sm:text-sm"
                  >
                    ⚙️ 관리자
                  </a>
                )}

                <a
                  href="/my-content"
                  className="rounded-lg bg-purple-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-purple-500 sm:px-3 sm:py-1.5 sm:text-sm"
                >
                  📂 내 콘텐츠
                </a>
                <button
                  onClick={handleLogout}
                  className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-semibold text-white transition hover:bg-slate-600 sm:px-3 sm:py-1.5 sm:text-sm"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <a
                href="/auth"
                className="rounded-lg bg-purple-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-purple-500 sm:px-3 sm:py-1.5 sm:text-sm"
              >
                로그인 / 회원가입
              </a>
            )}
          </div>
        </div>

        <header className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
            Auto Video Intelligence
          </p>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            유튜브 트렌드 필터 & 자동 영상 파이프라인
          </h1>
          <p className="max-w-3xl text-sm text-slate-300 sm:text-base">
            관심 있는 영상을 골라 필터링하고, 선택한 아이템으로 자동 대본 생성과 제작 파이프라인을 실행할 준비를 하세요.
          </p>
        </header>

        {/* 대본 생성 섹션 */}
        <section className="rounded-3xl border border-emerald-500/20 bg-emerald-950/20 p-6 backdrop-blur">
          <h2 className="mb-4 text-xl font-bold text-emerald-400">🎬 AI 대본 생성</h2>
          <p className="mb-4 text-sm text-slate-300">
            프롬프트를 복사하거나, Claude AI로 자동으로 대본을 생성하세요.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex gap-3 w-full">
              {user?.isAdmin && (
                <button
                  onClick={async () => {
                    setShowTitleInput(true);
                    setTitleInputMode('copy');
                    setManualTitle('');
                    setSuggestedTitles([]);
                    setSelectedSuggestedTitle(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-white transition ${
                    titleInputMode === 'copy' && showTitleInput
                      ? 'bg-slate-600 ring-2 ring-slate-400'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  📋 프롬프트 복사 (무료)
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
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-white transition ${
                  titleInputMode === 'generate' && showTitleInput
                    ? 'bg-emerald-500 ring-2 ring-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {`🤖 AI로 대본 생성${settings ? ` (${settings.aiScriptCost} 크레딧)` : ' (유료)'}`}
              </button>
            </div>
          </div>

          {/* 제목 입력 폼 - 버튼 아래로 이동 */}
          {showTitleInput && (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/20 bg-white/5 backdrop-blur animate-in slide-in-from-top-2">
              <div className="p-4">
                {/* 선택된 모드 표시 */}
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2">
                  <span className="text-lg">
                    {titleInputMode === 'copy' ? '📋' : '🤖'}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {titleInputMode === 'copy'
                      ? '프롬프트 복사 모드 (무료)'
                      : `AI 대본 생성 모드 (${settings?.aiScriptCost || 25} 크레딧)`}
                  </span>
                </div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  제목을 입력하세요
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => {
                      setManualTitle(e.target.value);
                      setSuggestedTitles([]);
                      setSelectedSuggestedTitle(null);
                    }}
                    placeholder="예: 70대 할머니의 첫 해외여행 이야기"
                    className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manualTitle.trim()) {
                        if (titleInputMode === 'copy') {
                          // 프롬프트 복사
                          (async () => {
                            try {
                              const response = await fetch('/api/prompt');
                              const data = await response.json();
                              if (data.content) {
                                const fullPrompt = `${data.content}\n\n주제: ${manualTitle.trim()}`;
                                await navigator.clipboard.writeText(fullPrompt);
                                setToast({
                                  message: `프롬프트가 클립보드에 복사되었습니다! 제목: ${manualTitle.trim()} - 이제 Claude.ai에 붙여넣으세요.`,
                                  type: 'success'
                                });
                                setTimeout(() => setToast(null), 5000);
                                setShowTitleInput(false);
                                setManualTitle('');
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
                          })();
                        }
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      if (!manualTitle.trim()) {
                        setToast({
                          message: '먼저 주제를 입력해주세요.',
                          type: 'info'
                        });
                        setTimeout(() => setToast(null), 5000);
                        return;
                      }

                      setIsSuggestingTitles(true);
                      try {
                        const promptResponse = await fetch('/api/prompt');
                        const promptData = await promptResponse.json();

                        if (!promptData.content) {
                          setToast({
                            message: '프롬프트를 읽을 수 없습니다.',
                            type: 'error'
                          });
                          setTimeout(() => setToast(null), 5000);
                          return;
                        }

                        const response = await fetch('/api/generate-script', {
                          method: 'POST',
                          headers: {
                            ...getAuthHeaders(),
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            prompt: promptData.content,
                            topic: manualTitle.trim(),
                            suggestTitles: true
                          })
                        });

                        const data = await response.json();

                        if (data.suggestedTitles && data.suggestedTitles.length > 0) {
                          setSuggestedTitles(data.suggestedTitles);
                        } else {
                          setToast({
                            message: '제목 제안에 실패했습니다.',
                            type: 'error'
                          });
                          setTimeout(() => setToast(null), 5000);
                        }
                      } catch (error) {
                        console.error(error);
                        setToast({
                          message: '제목 제안 중 오류가 발생했습니다.',
                          type: 'error'
                        });
                        setTimeout(() => setToast(null), 5000);
                      } finally {
                        setIsSuggestingTitles(false);
                      }
                    }}
                    disabled={isSuggestingTitles}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSuggestingTitles ? '⏳ 제안 중...' : '💡 제목 제안'}
                  </button>
                </div>

                {/* 제안된 제목 표시 */}
                {suggestedTitles.length > 0 && (
                  <div className="mb-3 rounded-lg border border-purple-500/30 bg-purple-500/10 p-3">
                    <p className="mb-2 text-xs font-semibold text-purple-300">💡 제안된 제목 (클릭하여 선택)</p>
                    <div className="space-y-2">
                      {suggestedTitles.map((title, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedSuggestedTitle(title);
                            setManualTitle(title);
                          }}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                            selectedSuggestedTitle === title
                              ? 'bg-purple-600 text-white font-semibold ring-2 ring-purple-300'
                              : 'bg-white/10 text-slate-300 hover:bg-white/20'
                          }`}
                        >
                          {selectedSuggestedTitle === title && <span className="mr-2">✓</span>}
                          {idx + 1}. {title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={async () => {
                      if (!manualTitle.trim()) {
                        setToast({
                          message: '제목을 입력해주세요.',
                          type: 'info'
                        });
                        setTimeout(() => setToast(null), 5000);
                        return;
                      }

                      if (titleInputMode === 'copy') {
                        // 프롬프트 복사
                        try {
                          const response = await fetch('/api/prompt');
                          const data = await response.json();
                          if (data.content) {
                            const fullPrompt = `${data.content}\n\n주제: ${manualTitle.trim()}`;

                            // 클립보드에 복사 시도
                            let copySuccess = false;

                            // 방법 1: Clipboard API (최신 브라우저, HTTPS)
                            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                              try {
                                await navigator.clipboard.writeText(fullPrompt);
                                copySuccess = true;
                              } catch (clipboardError) {
                                console.warn('Clipboard API 실패, 폴백 방법 시도:', clipboardError);
                              }
                            }

                            // 방법 2: execCommand 폴백 (구형 브라우저, HTTP)
                            if (!copySuccess && typeof document !== 'undefined') {
                              try {
                                const textarea = document.createElement('textarea');
                                textarea.value = fullPrompt;
                                textarea.style.position = 'fixed';
                                textarea.style.top = '0';
                                textarea.style.left = '0';
                                textarea.style.opacity = '0';
                                document.body.appendChild(textarea);
                                textarea.focus();
                                textarea.select();
                                const successful = document.execCommand('copy');
                                document.body.removeChild(textarea);
                                if (successful) {
                                  copySuccess = true;
                                }
                              } catch (execError) {
                                console.warn('execCommand 실패:', execError);
                              }
                            }

                            if (copySuccess) {
                              setToast({
                                message: `프롬프트가 클립보드에 복사되었습니다! 제목: ${manualTitle.trim()} - 이제 Claude.ai에 붙여넣으세요.`,
                                type: 'success'
                              });
                            } else {
                              setToast({
                                message: '클립보드 복사에 실패했습니다. 브라우저 설정을 확인해주세요.',
                                type: 'error'
                              });
                            }

                            setTimeout(() => setToast(null), 5000);
                            setShowTitleInput(false);
                            setManualTitle('');
                            setSuggestedTitles([]);
                            setSelectedSuggestedTitle(null);
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
                      } else {
                        // AI 대본 생성
                        // 크레딧 확인
                        if (user && settings && user.credits < settings.aiScriptCost) {
                          setToast({
                            message: `크레딧이 부족합니다. (필요: ${settings.aiScriptCost}, 보유: ${user.credits})`,
                            type: 'error'
                          });
                          setTimeout(() => setToast(null), 5000);
                          return;
                        }

                        // 확인 모달 표시
                        setScriptConfirmCallback(() => async () => {
                          // 모달 초기화 및 표시
                          setIsGeneratingScript(true);
                          setScriptGenerationLog([]);
                          setScriptProgress({ current: 10, total: 100 });
                          setCompletedScript(null);

                          try {
                          setScriptGenerationLog(prev => [...prev, '📝 프롬프트 로드 중...']);

                          const promptResponse = await fetch('/api/prompt', {
                            headers: getAuthHeaders()
                          });
                          const promptData = await promptResponse.json();

                          if (!promptData.content) {
                            setIsGeneratingScript(false);
                            setToast({
                              message: '프롬프트를 읽을 수 없습니다.',
                              type: 'error'
                            });
                            setTimeout(() => setToast(null), 5000);
                            return;
                          }

                          setScriptGenerationLog(prev => [...prev, '✅ 프롬프트 로드 완료']);
                          setScriptGenerationLog(prev => [...prev, `🤖 대본 생성 작업 시작... (주제: ${manualTitle.trim()})`]);

                          const scriptResponse = await fetch('/api/generate-script', {
                            method: 'POST',
                            headers: {
                              ...getAuthHeaders(),
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              prompt: promptData.content,
                              topic: manualTitle.trim()
                            })
                          });

                          const scriptData = await scriptResponse.json();

                          if (scriptData.scriptId) {
                            setScriptGenerationLog(prev => [...prev, '✅ 대본 생성 작업이 시작되었습니다!']);
                            setScriptGenerationLog(prev => [...prev, '⏳ 대본 생성 중... (약 30초 소요)']);

                            // 메인 페이지에서 상태 확인을 위한 폴링 시작
                            startPollingScriptStatus(scriptData.scriptId);
                          } else {
                            setIsGeneratingScript(false);
                            setToast({
                              message: `오류: ${scriptData.error || '대본 생성에 실패했습니다.'}`,
                              type: 'error'
                            });
                            setTimeout(() => setToast(null), 5000);
                          }
                          } catch (error) {
                            console.error(error);
                            setIsGeneratingScript(false);
                            setToast({
                              message: `오류: ${error}`,
                              type: 'error'
                            });
                            setTimeout(() => setToast(null), 5000);
                          }
                        });
                        setShowScriptConfirmModal(true);
                      }
                    }}
                    className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white transition ${
                      titleInputMode === 'copy'
                        ? 'bg-slate-700 hover:bg-slate-600'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
                  >
                    {titleInputMode === 'copy' ? '📋 클립보드에 복사' : `🤖 AI 대본 생성 (${settings?.aiScriptCost || 25} 크레딧)`}
                  </button>
                  <button
                    onClick={() => {
                      setShowTitleInput(false);
                      setManualTitle('');
                      setSuggestedTitles([]);
                      setSelectedSuggestedTitle(null);
                    }}
                    className="rounded-lg bg-slate-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-500"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 대본 생성 로딩 모달 (간단 버전) */}
          {isGeneratingScript && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/20 bg-gradient-to-br from-slate-800 to-slate-900 p-8 shadow-2xl">
                <h3 className="mb-6 text-3xl font-bold text-white">
                  {completedScript ? '✅ AI 대본 생성 완료' : '🤖 AI 대본 생성 중'}
                </h3>

                {/* 프로그레스바 */}
                {!completedScript && scriptProgress && (
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">대본 생성 진행률</span>
                      <span className="text-sm font-bold text-purple-400">
                        {scriptProgress.current}%
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
                        style={{ width: `${scriptProgress.current}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 생성 중인 대본 미리보기 */}
                {!completedScript && scriptProgress && scriptProgress.content && (
                  <div className="mb-6 rounded-lg border border-purple-500/30 bg-purple-500/10 p-6">
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
                <div ref={scriptGenerationLogRef} className="mb-6 max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                  <div className="space-y-1">
                    {scriptGenerationLog.map((log, idx) => (
                      <div key={idx} className="text-sm text-slate-300 font-mono">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 완료 시 저장 버튼 */}
                {completedScript && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                      <h4 className="mb-2 font-semibold text-emerald-300">📄 생성된 대본</h4>
                      <p className="text-sm text-slate-300 mb-2"><strong>제목:</strong> {completedScript.title}</p>
                      <div className="max-h-40 overflow-y-auto rounded bg-slate-900/50 p-3">
                        <pre className="whitespace-pre-wrap text-xs text-slate-400">{completedScript.content.substring(0, 500)}...</pre>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <button
                          onClick={async () => {
                            // JSON 파싱 및 파이프라인 실행
                            try {
                              const scriptJson = JSON.parse(completedScript.content);

                              // JSON을 파일로 만들어서 업로드한 것처럼 처리
                              setJsonName(completedScript.title || 'generated_script.json');
                              setUploadedJson(scriptJson);
                              setShowUploadSection(true); // 파일 업로드 섹션 자동으로 열기

                              // 모달 닫기
                              setIsGeneratingScript(false);
                              setScriptGenerationLog([]);
                              setCompletedScript(null);
                              setShowTitleInput(false);
                              setManualTitle('');
                              setSuggestedTitles([]);
                              setSelectedSuggestedTitle(null);

                              setToast({
                                message: '대본이 로드되었습니다! 이미지 소스를 선택하고 영상을 생성하세요.',
                                type: 'success'
                              });
                              setTimeout(() => setToast(null), 5000);
                            } catch (error) {
                              setToast({
                                message: 'JSON 파싱 오류: ' + error,
                                type: 'error'
                              });
                              setTimeout(() => setToast(null), 5000);
                            }
                          }}
                          className="flex-1 rounded-lg bg-purple-600 px-4 py-3 font-semibold text-white transition hover:bg-purple-500"
                        >
                          🎬 영상 제작
                        </button>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setIsGeneratingScript(false);
                            setScriptGenerationLog([]);
                            setCompletedScript(null);
                            setShowTitleInput(false);
                            setManualTitle('');
                            setSuggestedTitles([]);
                            setSelectedSuggestedTitle(null);
                            setToast({
                              message: '대본이 저장되었습니다! "내 대본" 페이지에서 확인하세요.',
                              type: 'success'
                            });
                            setTimeout(() => setToast(null), 5000);
                          }}
                          className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500"
                        >
                          ✅ 저장만 하기
                        </button>
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(completedScript.content);
                            setToast({
                              message: '대본이 클립보드에 복사되었습니다!',
                              type: 'success'
                            });
                            setTimeout(() => setToast(null), 3000);
                          }}
                          className="rounded-lg bg-slate-600 px-4 py-3 font-semibold text-white transition hover:bg-slate-500"
                        >
                          📋 복사
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {user?.isAdmin && (
            <p className="mt-3 text-xs text-slate-400">
              💡 팁: 무료로 사용하려면 "프롬프트 복사" 버튼을 누르고 Claude.ai에 직접 붙여넣으세요.
            </p>
          )}
        </section>

        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-3 backdrop-blur sm:p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="w-full text-xs font-semibold uppercase tracking-wider text-slate-300 sm:w-auto">모델 선택</span>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" suppressHydrationWarning>
              {modelOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedModel(option.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition sm:px-3 ${
                    selectedModel === option.value
                      ? 'bg-emerald-400 text-emerald-950 shadow shadow-emerald-400/40'
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                  suppressHydrationWarning
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleMoveToLLM}
              disabled={isPipelineProcessing}
              className="flex items-center justify-center gap-1 rounded-xl bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/25 disabled:cursor-wait disabled:opacity-70 sm:px-3 sm:py-2"
            >
              LLM 이동
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={fetchVideos}
              disabled={isFetching}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-3 py-2 text-xs font-semibold text-sky-950 shadow-lg shadow-sky-500/30 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:px-4"
            >
              {isFetching ? '불러오는 중...' : 'YouTube 데이터'}
            </button>
            <button
              type="button"
              onClick={handleRunAutomation}
              disabled={isPipelineProcessing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-70 sm:w-auto sm:px-4"
            >
              {isPipelineProcessing ? '준비 중...' : '영상 제작 시작'}
            </button>
          </div>
        </div>

        {/* 파일 업로드로 직접 영상 생성 */}
        {showUploadSection && (
        <section className="rounded-3xl border border-purple-500/20 bg-purple-950/20 p-6 backdrop-blur">
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
            JSON 대본을 업로드하고, 이미지 소스를 선택하여 영상을 생성하세요.
          </p>

          <div className="space-y-4">
            {/* 이미지 소스 선택 */}
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

            {/* 파일 업로드 (JSON + 이미지) */}
            {imageSource === 'none' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                📁 JSON 대본 + 이미지
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
                  const jsonFile = files.find(f => f.type === 'application/json' || f.name.endsWith('.json'));
                  const imageFiles = files.filter(f => f.type.startsWith('image/'));

                  if (jsonFile) setUploadedJson(jsonFile);
                  if (imageFiles.length > 0) setUploadedImages(imageFiles.slice(0, 50)); // 최대 50개

                  if (!jsonFile && imageFiles.length === 0) {
                    showToast('JSON 또는 이미지 파일을 업로드해주세요.', 'error');
                  }
                }}
                className={`rounded-lg border-2 border-dashed transition-all ${
                  isDraggingFiles
                    ? 'border-purple-400 bg-purple-500/20'
                    : 'border-white/20 bg-white/5'
                } p-8 text-center`}
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="text-4xl">📁</div>
                  <div>
                    <p className="text-sm text-slate-300">JSON과 이미지를 한번에 드래그하세요</p>
                    <p className="mt-1 text-xs text-slate-400">또는 파일을 선택하세요</p>
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

                  <label className="cursor-pointer rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500">
                    파일 선택
                    <input
                      type="file"
                      multiple
                      accept=".json,image/*"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const jsonFile = files.find(f => f.type === 'application/json' || f.name.endsWith('.json'));
                        const imageFiles = files.filter(f => f.type.startsWith('image/'));

                        if (jsonFile) setUploadedJson(jsonFile);
                        if (imageFiles.length > 0) setUploadedImages(imageFiles.slice(0, 8));
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
            )}

            {/* JSON 파일만 업로드 (DALL-E 또는 Google 검색 선택 시) */}
            {imageSource !== 'none' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                📄 JSON 대본 업로드
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
                  if (file && (file.type === 'application/json' || file.name.endsWith('.json'))) {
                    setUploadedJson(file);
                  } else {
                    showToast('JSON 파일만 업로드 가능합니다.', 'error');
                  }
                }}
                className={`rounded-lg border-2 border-dashed transition-all ${
                  isDraggingFiles
                    ? 'border-purple-400 bg-purple-500/20'
                    : 'border-white/20 bg-white/5'
                } p-6 text-center`}
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
                    <p className="text-sm text-slate-300">JSON 파일을 드래그하거나 선택하세요</p>
                    <label className="cursor-pointer rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 inline-block">
                      파일 선택
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && (file.type === 'application/json' || file.name.endsWith('.json'))) {
                            setUploadedJson(file);
                          } else {
                            showToast('JSON 파일만 업로드 가능합니다.', 'error');
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>
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

                if (!uploadedJson) {
                  showToast('JSON 파일을 먼저 업로드해주세요.', 'error');
                  return;
                }

                // 직접 업로드 모드일 때만 이미지 필수
                if (imageSource === 'none' && uploadedImages.length === 0) {
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
                !uploadedJson ||
                isGeneratingVideo ||
                (imageSource === 'none' && uploadedImages.length === 0)
              }
              className="w-full rounded-xl bg-purple-600 px-6 py-3 font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingVideo ? '영상 생성 중...' : `🎬 영상 생성 시작${settings ? ` (${settings.videoGenerationCost} 크레딧)` : ''}`}
            </button>
          </div>
        </section>
        )}

        {/* 확인 모달 */}
        {showConfirmModal && confirmModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-w-md w-full rounded-xl bg-gradient-to-br from-slate-900 to-purple-900 border border-purple-500/30 p-6 shadow-2xl">
              <h2 className="mb-4 text-2xl font-bold text-white">⚠️ 영상 생성 확인</h2>

              <div className="mb-6 space-y-3">
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
                      // JSON 파일 읽기
                      const jsonText = await uploadedJson!.text();
                      const storyData = JSON.parse(jsonText);

                      setVideoProgress({ step: '이미지 업로드 중...', progress: 10 });

                      // FormData로 파일 전송
                      const formData = new FormData();
                      formData.append('json', uploadedJson!);
                      formData.append('imageSource', imageSource);

                      // 직접 업로드 모드일 때만 이미지 추가
                      if (imageSource === 'none') {
                        // 이미지를 파일명 순서로 정렬 (자연스러운 정렬)
                        const sortedImages = [...uploadedImages].sort((a, b) => {
                          // 파일명에서 공백 제거하고 비교 (Image_fx (2).jpg와 Image_fx(2).jpg를 동일하게 취급)
                          const nameA = a.name.replace(/\s+/g, '');
                          const nameB = b.name.replace(/\s+/g, '');
                          return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
                        });

                        sortedImages.forEach((img, idx) => {
                          formData.append(`image_${idx}`, img);
                        });
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
                  생성 시작
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

        {/* 대본 생성 프로그레스 */}
        {isGeneratingScript && scriptProgress && (
          <div className="rounded-3xl border border-purple-500/30 bg-purple-950/20 p-6 backdrop-blur">
            <h3 className="mb-4 text-lg font-bold text-purple-400">🤖 AI 대본 생성 진행 상황</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">
                  대본 생성 중 ({scriptProgress.current}/{scriptProgress.total})
                </span>
                <span className="text-sm font-bold text-purple-400">
                  {Math.round((scriptProgress.current / scriptProgress.total) * 100)}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
                  style={{ width: `${(scriptProgress.current / scriptProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">
                ⏳ AI가 대본을 생성하는 중입니다. 잠시만 기다려주세요...
              </p>
            </div>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">필터</h2>
            <p className="mb-6 mt-1 text-xs text-slate-300">
              조회수, 구독자, 타입, 게시일, 카테고리 조건으로 원하는 영상을 추려보세요.
            </p>

            <div className="space-y-8">
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
                  <button
                    type="button"
                    onClick={fetchVideos}
                    disabled={isFetching}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    🔍
                  </button>
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
                min={0}
                max={10_000_000_000}
                step={50_000}
                value={viewRange}
                onChange={setViewRange}
                suffix="회"
              />

              <RangeControl
                label="구독자 수"
                min={0}
                max={10_000_000_000}
                step={10_000}
                value={subRange}
                onChange={setSubRange}
                suffix="명"
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
                  onClick={fetchVideos}
                  disabled={isFetching}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 py-3 text-sm font-semibold text-sky-950 shadow-lg shadow-sky-500/30 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isFetching ? "불러오는 중..." : "YouTube 데이터 불러오기"}
                </button>

                <button
                  type="button"
                  onClick={handleRunAutomation}
                  disabled={isPipelineProcessing}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-70"
                >
                  {isPipelineProcessing ? "준비 중..." : "선택 영상으로 제작"}
                </button>
              </div>
            </div>
          </aside>

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

            {/* 선택한 영상으로 자막 생성 버튼 */}
            {selectedIds.length > 0 && (
              <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-purple-300">📝 선택한 영상으로 자막 생성</h3>
                    <p className="text-xs text-slate-400">
                      선택한 영상 ({selectedIds.length}개)의 제목을 AI가 변형하고 대본을 생성합니다
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateSubtitle}
                    disabled={isTransforming}
                    className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTransforming ? '⏳ 제목 변형 중...' : '🎬 자막 생성 시작'}
                  </button>
                </div>
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
                  📋 프롬프트 복사 (무료)
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
                    const promptResponse = await fetch('/api/prompt');
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

      {/* 대본 생성 확인 모달 */}
      {showScriptConfirmModal && (
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
                  setShowScriptConfirmModal(false);
                  if (scriptConfirmCallback) {
                    scriptConfirmCallback();
                    setScriptConfirmCallback(null);
                  }
                }}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500"
              >
                ✅ 생성 시작
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
    </div>
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
}: {
  label: string;
  value: { min: number; max: number };
  min: number;
  max: number;
  step: number;
  onChange: (next: { min: number; max: number }) => void;
  suffix?: string;
}) {
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
          min={min}
          max={max}
          step={step}
          value={value.min}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-400"
          onChange={(event) => {
            const nextMin = Number(event.target.value);
            onChange({ min: Math.min(nextMin, value.max - step), max: value.max });
          }}
          suppressHydrationWarning
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value.max}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-400"
          onChange={(event) => {
            const nextMax = Number(event.target.value);
            onChange({ min: value.min, max: Math.max(nextMax, value.min + step) });
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
            max={value.max - step}
            step={step}
            value={value.min}
            onChange={(event) => {
              const nextMin = Math.min(Number(event.target.value), value.max - step);
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
            min={value.min + step}
            max={max}
            step={step}
            value={value.max}
            onChange={(event) => {
              const nextMax = Math.max(Number(event.target.value), value.min + step);
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className="text-base font-semibold leading-5 text-zinc-900"
              style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
              title={video.title}
            >
              {video.title}
            </h3>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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