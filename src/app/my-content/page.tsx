'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';
import YouTubeUploadButton from '@/components/YouTubeUploadButton';
import { parseJsonSafely } from '@/lib/json-utils';

interface Script {
  id: string;
  title: string;
  originalTitle?: string;
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  type?: 'longform' | 'shortform' | 'sora2';
  useClaudeLocal?: boolean; // 로컬 Claude 사용 여부 (true) vs API Claude (false)
  logs?: string[];
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
  createdAt: string;
  updatedAt: string;
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
  type?: 'longform' | 'shortform' | 'sora2';
  logs?: string[];
}

type TabType = 'all' | 'videos' | 'scripts' | 'published' | 'settings';

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

export default function MyContentPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [user, setUser] = useState<{ id: string; email: string; isAdmin?: boolean } | null>(null);

  // URL 파라미터에서 탭 읽기
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab') as TabType;
    if (tab && ['all', 'videos', 'scripts', 'published', 'settings'].includes(tab)) {
      setActiveTab(tab);
    }
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

  // Pagination states for each tab
  const [allTabLimit, setAllTabLimit] = useState(10);
  const [scriptsTabLimit, setScriptsTabLimit] = useState(10);

  // Videos state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<'all' | 'active'>('all');
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [expandedLogJobId, setExpandedLogJobId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const jobLogRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  useEffect(() => {
    if (user) {
      if (activeTab === 'scripts') {
        fetchScripts();
      } else if (activeTab === 'videos') {
        setJobs([]);
        setOffset(0);
        fetchJobs(true);
      } else if (activeTab === 'all') {
        fetchScripts();
        setJobs([]);
        setOffset(0);
        fetchJobs(true);
      }
    }
  }, [user, activeTab, filter, searchQuery]);

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
          const statusData = await response.json();

          if (statusData.status === 'completed' || statusData.status === 'failed') {
            clearInterval(interval);
            // 전체 목록 새로고침 (완료되었으므로)
            fetchScripts();
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
          const statusData = await response.json();

          if (statusData.status === 'completed' || statusData.status === 'failed' || statusData.status === 'cancelled') {
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

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

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
  const fetchScripts = async () => {
    setIsLoadingScripts(true);
    try {
      const response = await fetch('/api/my-scripts', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        setScripts(data.scripts);
      } else {
        console.error('❌ 대본 가져오기 실패:', data.error);
        toast.error(data.error || '대본을 불러올 수 없습니다.');
      }
    } catch (error) {
      console.error('❌ Error fetching scripts:', error);
      toast.error('대본 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingScripts(false);
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
        const data = await response.json();
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

          const data = await response.json();

          if (response.ok) {
            toast.success('대본 생성이 취소되었습니다.');
            fetchScripts();
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
          const data = await response.json();
          console.log('📦 응답 데이터:', data);

          if (response.ok) {
            toast.success('대본이 삭제되었습니다.');
            fetchScripts();
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

  // ===== 영상 관련 함수 =====
  const fetchJobs = async (reset = false) => {
    const currentOffset = reset ? 0 : offset;

    if (reset) {
      setIsLoadingVideos(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        filter,
        limit: '10',
        offset: currentOffset.toString(),
        ...(searchQuery && { search: searchQuery })
      });

      const response = await fetch(`/api/my-videos?${params}`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (response.ok) {
        if (reset) {
          setJobs(data.jobs);
        } else {
          setJobs(prev => [...prev, ...data.jobs]);
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

          const data = await response.json();

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

          const data = await response.json();

          if (response.ok) {
            toast.success('영상이 삭제되었습니다.');
            fetchJobs(true);
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

      const data = await response.json();

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

  const handleRestartScript = async (scriptId: string, title: string) => {
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

          const data = await response.json();

          if (response.ok) {
            toast.success('대본이 재생성되었습니다.\n\n새로운 대본이 생성 중입니다.');
            // 대본 탭으로 전환
            setActiveTab('scripts');
            // 목록 새로고침
            fetchScripts();
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

  const handleCopyScript = async (content: string, title: string) => {
    try {
      if (!content || content.trim().length === 0) {
        toast.error('복사할 대본 내용이 없습니다.');
        return;
      }

      // Clipboard API 사용 가능 여부 확인
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(content);
        toast.success('대본이 클립보드에 복사되었습니다!');
      } else {
        // 폴백: document.execCommand 사용
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
          toast.success('대본이 클립보드에 복사되었습니다!');
        } else {
          throw new Error('복사 실패');
        }
      }
    } catch (error) {
      console.error('Copy error:', error);
      // 폴백도 실패한 경우
      try {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toast.success('대본이 클립보드에 복사되었습니다!');
      } catch (err) {
        toast.error('복사 중 오류가 발생했습니다.');
      }
    }
  };

  const handleCopyLogs = async (logs: string[] | undefined) => {
    try {
      if (!logs || logs.length === 0) {
        alert('복사할 로그가 없습니다.');
        return;
      }
      const logsText = logs.join('\n');
      await navigator.clipboard.writeText(logsText);
      alert('로그가 클립보드에 복사되었습니다.');
    } catch (error) {
      console.error('Copy error:', error);
      // 클립보드 권한이 없을 때 폴백
      try {
        const textarea = document.createElement('textarea');
        textarea.value = logs?.join('\n') || '';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('로그가 클립보드에 복사되었습니다.');
      } catch (fallbackError) {
        console.error('Fallback copy error:', fallbackError);
        alert('로그 복사 중 오류가 발생했습니다.');
      }
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

      const data = await response.json();
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
        { value: 'sora2', label: 'SORA2 (30초)' }
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
      const response = await fetch('/api/convert-script', {
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

      const data = await response.json();

      if (response.ok) {
        toast.success(`대본 변환이 시작되었습니다! (${targetFormat})`);

        // 목록 새로고침
        setTimeout(() => {
          fetchScripts();
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
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">
            내 콘텐츠
            {activeTab === 'all' && (scripts.length > 0 || jobs.length > 0) && (
              <span className="ml-3 text-lg text-slate-400">
                영상 {jobs.length}개 · 대본 {scripts.length}개
              </span>
            )}
            {activeTab === 'videos' && jobs.length > 0 && (
              <span className="ml-3 text-lg text-slate-400">영상 {jobs.length}개</span>
            )}
            {activeTab === 'scripts' && scripts.length > 0 && (
              <span className="ml-3 text-lg text-slate-400">대본 {scripts.length}개</span>
            )}
          </h1>
        </div>

        {/* 탭 */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => handleTabChange('all')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
              activeTab === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📂 전체 {(jobs.length + scripts.length) > 0 && `(${jobs.length + scripts.length})`}
          </button>
          <button
            onClick={() => handleTabChange('videos')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
              activeTab === 'videos'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            🎬 영상 {jobs.length > 0 && `(${jobs.length})`}
          </button>
          <button
            onClick={() => handleTabChange('scripts')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
              activeTab === 'scripts'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📝 대본 {scripts.length > 0 && `(${scripts.length})`}
          </button>
          <button
            onClick={() => handleTabChange('published')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
              activeTab === 'published'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📺 퍼블리시
          </button>
          <button
            onClick={() => handleTabChange('settings')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
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
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                placeholder="영상 제목, ID, 상태로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
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
            <div className="mb-6 flex gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  filter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
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
                  const allItems = [
                    ...jobs.map(job => ({ type: 'video' as const, data: job, date: job.createdAt })),
                    ...scripts.map(script => ({ type: 'script' as const, data: script, date: script.createdAt }))
                  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  const displayedItems = allItems.slice(0, allTabLimit);
                  const hasMoreItems = allItems.length > allTabLimit;

                  return (
                    <>
                      {displayedItems.map((item) => (
                    <div
                      key={`${item.type}-${item.data.id}`}
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
                            {/* 타입 배지 */}
                            {item.data.type && (
                              <div className="absolute top-2 left-2">
                                <span className={`px-2 py-1 rounded text-xs font-bold shadow-lg ${
                                  item.data.type === 'shortform' ? 'bg-blue-500 text-white' :
                                  item.data.type === 'longform' ? 'bg-green-500 text-white' :
                                  'bg-purple-500 text-white'
                                }`}>
                                  {item.data.type === 'shortform' ? '⚡ 숏폼' : item.data.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
                                </span>
                              </div>
                            )}
                            {/* 상태 배지 */}
                            <div className="absolute top-2 right-2">
                              {getStatusBadge(item.data.status)}
                            </div>
                          </div>

                          {/* 메타데이터 영역 - 중앙 */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-white mb-2 break-words line-clamp-2">
                                {item.data.title || item.data.id}
                              </h3>
                              <div className="space-y-1 text-sm text-slate-400">
                                <p className="flex items-center gap-2">
                                  <span className="text-slate-500">•</span>
                                  <span>{item.data.step}</span>
                                </p>
                                <p className="flex items-center gap-2">
                                  <span className="text-slate-500">•</span>
                                  <span>{formatDate(item.data.createdAt)}</span>
                                </p>
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
                                <div className="mt-3 rounded-lg bg-red-500/20 border border-red-500/30 p-3 text-sm text-red-300">
                                  {item.data.error}
                                </div>
                              )}
                            </div>

                            {/* 버튼 영역 - 하단 또는 오른쪽 */}
                            <div className="flex flex-wrap gap-2 mt-4">
                            {(item.data.status === 'pending' || item.data.status === 'processing') && (
                              <>
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedLogJobId(expandedLogJobId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer"
                                  >
                                    {expandedLogJobId === item.data.id ? '📋 로그 닫기' : '📋 로그'}
                                  </button>
                                )}
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
                                <YouTubeUploadButton
                                  videoPath={item.data.videoPath}
                                  thumbnailPath={item.data.thumbnailPath}
                                  defaultTitle={item.data.title || ''}
                                  jobId={item.data.id}
                                />
                                <button
                                  onClick={() => handleOpenFolder(item.data.id)}
                                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer"
                                  title="폴더 열기"
                                >
                                  📁 폴더
                                </button>
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedLogJobId(expandedLogJobId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer"
                                    title="로그 보기"
                                  >
                                    {expandedLogJobId === item.data.id ? '📋 닫기' : `📋 로그 (${item.data.logs.length})`}
                                  </button>
                                )}
                                <a
                                  href={`/api/download-video?jobId=${item.data.id}`}
                                  download
                                  className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer"
                                >
                                  <span>📥</span>
                                  <span>저장</span>
                                </a>
                                <button
                                  onClick={() => handleRestartVideo(item.data.id)}
                                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 cursor-pointer"
                                  title="재시도"
                                >
                                  🔄 재시도
                                </button>
                                <button
                                  onClick={() => handleDeleteVideo(item.data.id, item.data.title || item.data.id)}
                                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer"
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                            {(item.data.status === 'failed' || item.data.status === 'cancelled') && (
                              <>
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedLogJobId(expandedLogJobId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer"
                                    title="로그 보기"
                                  >
                                    {expandedLogJobId === item.data.id ? '📋 로그 닫기' : '📋 로그 보기'} ({item.data.logs.length})
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
                          </div>
                        </div>
                      ) : (
                        // 대본 아이템 - 수평 레이아웃
                        <div className="flex flex-col md:flex-row gap-4 p-4">
                          {/* 아이콘 영역 - 왼쪽 */}
                          <div className="relative w-full md:w-64 h-36 flex-shrink-0 bg-slate-800/50 rounded-lg overflow-hidden flex items-center justify-center">
                            <span className="text-6xl">📝</span>
                            {/* 타입 배지 */}
                            {item.data.type && (
                              <div className="absolute top-2 left-2">
                                <span className={`px-2 py-1 rounded text-xs font-bold shadow-lg ${
                                  item.data.type === 'shortform' ? 'bg-blue-500 text-white' :
                                  item.data.type === 'longform' ? 'bg-green-500 text-white' :
                                  'bg-purple-500 text-white'
                                }`}>
                                  {item.data.type === 'shortform' ? '⚡ 숏폼' : item.data.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
                                </span>
                              </div>
                            )}
                            {/* 상태 배지 */}
                            <div className="absolute top-2 right-2">
                              {getStatusBadge(item.data.status)}
                            </div>
                          </div>

                          {/* 메타데이터 영역 - 중앙 */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-white mb-2 break-words line-clamp-2">
                                {item.data.title}
                              </h3>
                              <div className="space-y-1 text-sm text-slate-400">
                                <p className="flex items-center gap-2">
                                  <span className="text-slate-500">•</span>
                                  <span>{formatDate(item.data.createdAt)}</span>
                                </p>
                                {item.data.status === 'completed' && (
                                  <p className="flex items-center gap-2">
                                    <span className="text-slate-500">•</span>
                                    <span>길이: {item.data.content.length.toLocaleString()}자</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            <div>
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

                                {/* 로그 표시 */}
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <div
                                    ref={(el) => {
                                      if (el) {
                                        scriptLogRefs.current.set(item.data.id, el);
                                      } else {
                                        scriptLogRefs.current.delete(item.data.id);
                                      }
                                    }}
                                    className="max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4"
                                  >
                                    <div className="space-y-1">
                                      {item.data.logs.map((log, idx) => {
                                        const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                                        const logTimestamp = typeof log === 'object' && log.timestamp ? log.timestamp : new Date().toISOString();

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
                                  </div>
                                )}
                              </>
                            )}

                            {/* 대기 중 상태 */}
                            {item.data.status === 'pending' && (
                              <div className="mb-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-300">
                                ⏳ 대본 생성 대기 중...
                              </div>
                            )}

                            {/* 에러 상태 */}
                            {item.data.error && (
                              <div className="mb-3 rounded bg-red-500/20 p-3 text-sm text-red-300">
                                {item.data.error}
                              </div>
                            )}

                            {/* 대본 미리보기 (축소 상태) */}
                            {item.data.status === 'completed' && expandedScriptId !== item.data.id && (
                              <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                                <p className="text-base text-slate-300 line-clamp-3 leading-relaxed">
                                  {item.data.content}
                                </p>
                              </div>
                            )}

                            </div>

                            {/* 버튼 영역 - 하단 */}
                            <div className="flex flex-wrap gap-2 mt-4">
                            {(item.data.status === 'pending' || item.data.status === 'processing') && (
                              <>
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedScriptLogId(expandedScriptLogId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                                  >
                                    {expandedScriptLogId === item.data.id ? '📋 로그 닫기' : '📋 로그'}
                                  </button>
                                )}
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
                                <button
                                  onClick={() => toggleContent(item.data.id)}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                                >
                                  {expandedScriptId === item.data.id ? '📄 닫기' : '📖 대본'}
                                </button>
                                <button
                                  onClick={() => {
                                    console.log('🎬 [내 콘텐츠] 영상 제작 버튼 클릭됨');
                                    console.log('📝 대본 제목:', item.data.title);

                                    // JSON 파싱 후 메인 페이지로 이동하며 파이프라인 시작
                                    try {
                                      // 마크다운 코드 블록 제거
                                      let content = item.data.content
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
                                  🎬 영상
                                </button>
                                <button
                                  onClick={() => handleCopyScript(item.data.content, item.data.title)}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                                  title="대본 복사"
                                >
                                  📋 복사
                                </button>
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedScriptLogId(expandedScriptLogId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                    title="로그 보기"
                                  >
                                    {expandedScriptLogId === item.data.id ? '📋 닫기' : `📋 로그 (${item.data.logs.length})`}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDownload(item.data.id)}
                                  className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                                >
                                  <span>📥</span>
                                  <span>저장</span>
                                </button>
                                {(item.data.type === 'longform' || item.data.type === 'shortform') && (
                                  <button
                                    onClick={() => handleConvertScript(item.data.id, item.data.type || 'longform', item.data.title)}
                                    className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-500 cursor-pointer whitespace-nowrap"
                                    title="다른 형식으로 변환"
                                  >
                                    🔀 변환
                                  </button>
                                )}
                                <button
                                  onClick={() => handleRestartScript(item.data.id, item.data.title)}
                                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-500 cursor-pointer whitespace-nowrap"
                                  title="재시도"
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
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                            {(item.data.status === 'failed' || item.data.status === 'cancelled') && (
                              <>
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedScriptLogId(expandedScriptLogId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                    title="로그 보기"
                                  >
                                    {expandedScriptLogId === item.data.id ? '📋 닫기' : `📋 로그 (${item.data.logs.length})`}
                                  </button>
                                )}
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
                                    console.log('🔴 삭제 버튼 클릭됨 (All 탭 - Failed)');
                                    handleDeleteScript(item.data.id, item.data.title);
                                  }}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                                >
                                  🗑️ 삭제
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                          </div>
                      )}

                      {/* 대본 펼친 내용 */}
                      {item.type === 'script' && expandedScriptId === item.data.id && (
                        <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                          <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">
                            {item.data.content}
                          </pre>
                        </div>
                      )}

                      {/* 대본 로그 표시 (전체 탭) */}
                      {item.type === 'script' && expandedScriptLogId === item.data.id && item.data.logs && item.data.logs.length > 0 && (
                        <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400">📋 생성 로그</span>
                            <span className="text-xs text-slate-500">{item.data.logs.length}개 항목</span>
                          </div>
                          <div
                            ref={(el) => {
                              if (el) {
                                scriptLogRefs.current.set(item.data.id, el);
                              } else {
                                scriptLogRefs.current.delete(item.data.id);
                              }
                            }}
                            className="max-h-96 overflow-y-auto rounded bg-black/50 p-3 font-mono text-xs leading-relaxed"
                          >
                            {item.data.logs.map((log, idx) => (
                              <div
                                key={idx}
                                className="text-emerald-400 whitespace-pre-wrap break-all mb-1"
                                ref={(el) => {
                                  // 마지막 로그 항목에만 ref 추가
                                  if (idx === item.data.logs!.length - 1 && el) {
                                    scriptLastLogRefs.current.set(item.data.id, el);
                                  }
                                }}
                              >
                                {typeof log === 'string' ? log : log.message || JSON.stringify(log)}
                              </div>
                            ))}
                          </div>
                        </div>
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
                            {item.data.logs.map((log, idx) => (
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
                  {hasMoreItems && (
                    <div className="mt-6 text-center">
                      <button
                        onClick={() => setAllTabLimit(prev => prev + 10)}
                        className="rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500"
                      >
                        더보기 ({allItems.length - allTabLimit}개 더)
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
            <div className="mb-6 flex gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  filter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
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
                    className="group rounded-xl border border-white/10 bg-white/5 backdrop-blur transition hover:bg-white/10 hover:border-purple-500/50 overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row gap-4 p-4">
                      {/* 아이콘 영역 - 왼쪽 */}
                      <div className="relative w-full md:w-64 h-36 flex-shrink-0 bg-slate-800/50 rounded-lg overflow-hidden flex items-center justify-center">
                        <span className="text-6xl">📝</span>
                        {/* 타입 배지 */}
                        {script.type && (
                          <div className="absolute top-2 left-2">
                            <span className={`px-2 py-1 rounded text-xs font-bold shadow-lg ${
                              script.type === 'shortform' ? 'bg-blue-500 text-white' :
                              script.type === 'longform' ? 'bg-green-500 text-white' :
                              'bg-purple-500 text-white'
                            }`}>
                              {script.type === 'shortform' ? '⚡ 숏폼' : script.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
                            </span>
                          </div>
                        )}
                        {/* 상태 배지 */}
                        <div className="absolute top-2 right-2">
                          {getStatusBadge(script.status)}
                        </div>
                      </div>

                      {/* 메타데이터 영역 - 중앙 */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-2 break-words line-clamp-2">
                            {script.title}
                          </h3>
                          <div className="space-y-1 text-sm text-slate-400">
                            <p className="flex items-center gap-2">
                              <span className="text-slate-500">•</span>
                              <span>{formatDate(script.createdAt)}</span>
                            </p>
                            {script.status === 'completed' && (
                              <p className="flex items-center gap-2">
                                <span className="text-slate-500">•</span>
                                <span>길이: {script.content.length.toLocaleString()}자</span>
                              </p>
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

                            {/* 로그 표시 */}
                            {script.logs && script.logs.length > 0 && (
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
                                  {script.logs.map((log, idx) => {
                                    const logMessage = typeof log === 'string' ? log : log.message || JSON.stringify(log);
                                    const logTimestamp = typeof log === 'object' && log.timestamp ? log.timestamp : new Date().toISOString();

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
                          <div className="mb-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-300">
                            ⏳ 대본 생성 대기 중...
                          </div>
                        )}

                        {/* 에러 상태 */}
                        {script.error && (
                          <div className="mb-3 rounded bg-red-500/20 p-3 text-sm text-red-300">
                            {script.error}
                          </div>
                        )}

                        {/* 대본 미리보기 (축소 상태) */}
                        {script.status === 'completed' && expandedScriptId !== script.id && (
                          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                            <p className="text-base text-slate-300 line-clamp-3 leading-relaxed">
                              {script.content}
                            </p>
                          </div>
                        )}
                        </div>

                        {/* 버튼 영역 - 하단 */}
                        <div className="flex flex-wrap gap-2 mt-4">
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
                            <button
                              onClick={() => toggleContent(script.id)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                            >
                              {expandedScriptId === script.id ? '📄 닫기' : '📖 대본'}
                            </button>
                            <button
                              onClick={() => {
                                console.log('🎬 [대본 탭] 영상 제작 버튼 클릭됨');
                                console.log('📝 대본 제목:', script.title);

                                // JSON 파싱 후 메인 페이지로 이동하며 파이프라인 시작
                                try {
                                  // 마크다운 코드 블록 제거
                                  let content = script.content
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
                                      const titleMatch = fixed.match(/\{\s*"title"/s);
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
                              🎬 영상
                            </button>
                            <button
                              onClick={() => handleCopyScript(script.content, script.title)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                              title="대본 복사"
                            >
                              📋 복사
                            </button>
                            {script.logs && script.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedScriptLogId(expandedScriptLogId === script.id ? null : script.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title="로그 보기"
                              >
                                {expandedScriptLogId === script.id ? '📋 닫기' : `📋 로그 (${script.logs.length})`}
                              </button>
                            )}
                            <button
                              onClick={() => handleDownload(script.id)}
                              className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                            >
                              <span>📥</span>
                              <span>저장</span>
                            </button>
                            {(script.type === 'longform' || script.type === 'shortform') && (
                              <button
                                onClick={() => handleConvertScript(script.id, script.type || 'longform', script.title)}
                                className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-500 cursor-pointer whitespace-nowrap"
                                title="다른 형식으로 변환"
                              >
                                🔀 변환
                              </button>
                            )}
                            <button
                              onClick={() => handleRestartScript(script.id, script.title)}
                              className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-orange-500 cursor-pointer whitespace-nowrap"
                              title="재시도"
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
                            >
                              🗑️
                            </button>
                          </>
                        )}
                        {(script.status === 'failed' || script.status === 'cancelled') && (
                          <>
                            {script.logs && script.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedScriptLogId(expandedScriptLogId === script.id ? null : script.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title="로그 보기"
                              >
                                {expandedScriptLogId === script.id ? '📋 닫기' : `📋 로그 (${script.logs.length})`}
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
                                console.log('🔴 삭제 버튼 클릭됨 (Scripts 탭 - Failed)');
                                handleDeleteScript(script.id, script.title);
                              }}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 cursor-pointer whitespace-nowrap"
                            >
                              🗑️ 삭제
                            </button>
                          </>
                        )}
                        </div>
                      </div>
                    </div>

                    {/* 대본 펼친 내용 (전체보기) */}
                    {expandedScriptId === script.id && script.status === 'completed' && (
                      <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-4">
                        <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">
                          {script.content}
                        </pre>
                      </div>
                    )}

                    {/* 대본 로그 표시 (대본 탭) */}
                    {expandedScriptLogId === script.id && script.logs && script.logs.length > 0 && (
                      <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-400">📋 생성 로그</span>
                          <span className="text-xs text-slate-500">{script.logs.length}개 항목</span>
                        </div>
                        <div
                          ref={(el) => {
                            if (el) {
                              scriptLogRefs.current.set(script.id, el);
                            } else {
                              scriptLogRefs.current.delete(script.id);
                            }
                          }}
                          className="max-h-96 overflow-y-auto rounded bg-black/50 p-3 font-mono text-xs leading-relaxed"
                        >
                          {script.logs.map((log, idx) => (
                            <div
                              key={idx}
                              className="text-emerald-400 whitespace-pre-wrap break-all mb-1"
                              ref={(el) => {
                                // 마지막 로그 항목에만 ref 추가
                                if (idx === script.logs!.length - 1 && el) {
                                  scriptLastLogRefs.current.set(script.id, el);
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

                {/* 더보기 버튼 */}
                {filteredScripts.length > scriptsTabLimit && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => setScriptsTabLimit(prev => prev + 10)}
                      className="rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500"
                    >
                      더보기 ({filteredScripts.length - scriptsTabLimit}개 더)
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
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                placeholder="영상 제목, ID, 상태로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
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
            <div className="mb-6 flex gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  filter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  filter === 'active'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
              >
                진행 중
              </button>
            </div>

            {/* 영상 목록 */}
            {isLoadingVideos ? (
              <div className="text-center text-slate-400">로딩 중...</div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
                <p className="text-slate-400">
                  {filter === 'active' ? '진행 중인 작업이 없습니다.' : '생성한 영상이 없습니다.'}
                </p>
              </div>
            ) : (
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
                              'bg-purple-500 text-white'
                            }`}>
                              {job.type === 'shortform' ? '⚡ 숏폼' : job.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
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
                            <div className="mt-3 rounded-lg bg-red-500/20 border border-red-500/30 p-3 text-sm text-red-300">
                              {job.error}
                            </div>
                          )}
                        </div>

                        {/* 버튼 영역 - 하단 */}
                        <div className="flex flex-wrap gap-2 mt-4">
                        {(job.status === 'pending' || job.status === 'processing') && (
                          <>
                            {job.logs && job.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedLogJobId(expandedLogJobId === job.id ? null : job.id)}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
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
                            <YouTubeUploadButton
                              videoPath={job.videoPath}
                              thumbnailPath={job.thumbnailPath}
                              defaultTitle={job.title || ''}
                              jobId={job.id}
                            />
                            <button
                              onClick={() => handleOpenFolder(job.id)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer whitespace-nowrap"
                              title="폴더 열기"
                            >
                              📁 폴더
                            </button>
                            {job.logs && job.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedLogJobId(expandedLogJobId === job.id ? null : job.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title="로그 보기"
                              >
                                {expandedLogJobId === job.id ? '📋 닫기' : `📋 로그 (${job.logs.length})`}
                              </button>
                            )}
                            <a
                              href={`/api/download-video?jobId=${job.id}`}
                              download
                              className="flex items-center justify-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                            >
                              <span>📥</span>
                              <span>저장</span>
                            </a>
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
                        {(job.status === 'failed' || job.status === 'cancelled') && (
                          <>
                            {job.logs && job.logs.length > 0 && (
                              <button
                                onClick={() => setExpandedLogJobId(expandedLogJobId === job.id ? null : job.id)}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                                title="로그 보기"
                              >
                                {expandedLogJobId === job.id ? '📋 닫기' : `📋 로그 (${job.logs.length})`}
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

                    {/* 로그 표시 영역 */}
                    {expandedLogJobId === job.id && job.logs && job.logs.length > 0 && (
                      <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-400">📋 서버 로그</span>
                          <span className="text-xs text-slate-500">{job.logs.length}개 항목</span>
                        </div>
                        <div
                          ref={(el) => {
                            if (el) {
                              jobLogRefs.current.set(job.id, el);
                            } else {
                              jobLogRefs.current.delete(job.id);
                            }
                          }}
                          className="max-h-96 overflow-y-auto rounded bg-black/50 p-3 font-mono text-xs leading-relaxed"
                        >
                          {job.logs.map((log, idx) => (
                            <div key={idx} className="text-green-400 whitespace-pre-wrap break-all mb-1">
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
                      {isLoadingMore ? '로딩 중...' : '더 보기'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 퍼블리시 탭 콘텐츠 */}
        {activeTab === 'published' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
            <div className="text-center text-slate-400 py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-lg font-semibold mb-2">퍼블리시된 영상</p>
              <p className="text-sm">YouTube에 업로드된 영상 목록이 여기에 표시됩니다.</p>
              <p className="text-xs mt-2 text-slate-500">(준비 중)</p>
            </div>
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
