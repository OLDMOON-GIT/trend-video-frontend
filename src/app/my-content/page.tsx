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

  // Scripts state
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);
  const [expandedScriptId, setExpandedScriptId] = useState<string | null>(null);
  const [expandedScriptLogId, setExpandedScriptLogId] = useState<string | null>(null);
  const scriptContentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scriptLogRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scriptLastLogRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
  const [youtubeAuthenticated, setYoutubeAuthenticated] = useState(false);
  const [youtubeChannel, setYoutubeChannel] = useState<YouTubeChannel | null>(null);
  const [isYoutubeLoading, setIsYoutubeLoading] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmColor?: string;
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
    console.log('📥 대본 목록 가져오기 시작...');
    setIsLoadingScripts(true);
    try {
      const response = await fetch('/api/my-scripts', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      console.log('응답 상태:', response.status, response.statusText);

      const data = await response.json();
      console.log('응답 데이터:', data);

      if (response.ok) {
        console.log('✅ 대본 설정:', data.scripts.length, '개');
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

          console.log('📡 DELETE 응답:', response.status);
          const data = await response.json();
          console.log('📦 응답 데이터:', data);

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
            body: JSON.stringify({ scriptId })
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
      await navigator.clipboard.writeText(content);
      toast.success('대본이 클립보드에 복사되었습니다!');
    } catch (error) {
      console.error('Copy error:', error);
      // 클립보드 권한이 없을 때 폴백
      try {
        const textarea = document.createElement('textarea');
        textarea.value = content;
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
  const YouTubeSettings = ({ authenticated, channel, isLoading, onAuthChange }: {
    authenticated: boolean;
    channel: YouTubeChannel | null;
    isLoading: boolean;
    onAuthChange: (auth: boolean, ch: YouTubeChannel | null) => void;
  }) => {
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [hasCredentials, setHasCredentials] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
      loadYouTubeAuthStatus();
    }, []);

    const loadYouTubeAuthStatus = async () => {
      try {
        console.log('[YouTubeSettings] API 호출 시작...');
        const res = await fetch('/api/youtube/auth');
        const data = await res.json();
        console.log('[YouTubeSettings] API 응답:', data);
        console.log('[YouTubeSettings] hasCredentials:', data.hasCredentials);
        onAuthChange(data.authenticated || false, data.channel || null);
        setHasCredentials(data.hasCredentials || false);
        console.log('[YouTubeSettings] State 업데이트 완료');
      } catch (error) {
        console.error('YouTube 인증 상태 확인 실패:', error);
      }
    };

    const handleConnect = async () => {
      if (!hasCredentials) {
        toast.error('관리자가 YouTube API Credentials를 설정하지 않았습니다. 관리자에게 문의하세요.');
        return;
      }

      try {
        setIsAuthenticating(true);
        toast.loading('YouTube 연결 중...', { id: 'youtube-auth' });

        const res = await fetch('/api/youtube/auth', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          toast.success('YouTube 채널 연결 성공!', { id: 'youtube-auth' });
          await loadYouTubeAuthStatus();
        } else {
          throw new Error(data.error || '연결 실패');
        }
      } catch (error: any) {
        toast.error(`연결 실패: ${error.message}`, { id: 'youtube-auth' });
      } finally {
        setIsAuthenticating(false);
      }
    };

    const handleDisconnect = async () => {
      if (!confirm('YouTube 채널 연결을 해제하시겠습니까?')) return;

      try {
        setIsDisconnecting(true);
        toast.loading('연결 해제 중...', { id: 'youtube-disconnect' });

        const res = await fetch('/api/youtube/auth', { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
          toast.success('연결 해제 완료', { id: 'youtube-disconnect' });
          onAuthChange(false, null);
        } else {
          throw new Error(data.error || '연결 해제 실패');
        }
      } catch (error: any) {
        toast.error(`연결 해제 실패: ${error.message}`, { id: 'youtube-disconnect' });
      } finally {
        setIsDisconnecting(false);
      }
    };

    const handleCredentialsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadCredentialsFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      if (!file.name.endsWith('.json')) {
        toast.error('JSON 파일만 업로드할 수 있습니다.');
        return;
      }

      await uploadCredentialsFile(file);
    };

    const uploadCredentialsFile = async (file: File) => {
      try {
        setIsUploading(true);
        toast.loading('Credentials 업로드 중...', { id: 'credentials-upload' });

        const formData = new FormData();
        formData.append('credentials', file);

        const res = await fetch('/api/youtube/credentials', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();

        if (data.success) {
          toast.success('Credentials 업로드 완료! 이제 YouTube 채널을 연결하세요.', { id: 'credentials-upload' });
          setHasCredentials(true);
        } else {
          throw new Error(data.error || '업로드 실패');
        }
      } catch (error: any) {
        toast.error(`업로드 실패: ${error.message}`, { id: 'credentials-upload' });
      } finally {
        setIsUploading(false);
      }
    };

    return (
      <div className="p-8">
        <h2 className="text-2xl font-bold text-white mb-6">YouTube 설정</h2>

        {!hasCredentials ? (
          <div className="p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
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
        ) : !authenticated ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg">
              <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
              <span className="text-slate-300">연결되지 않음</span>
            </div>

            <button
              onClick={handleConnect}
              disabled={isAuthenticating}
              className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isAuthenticating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>연결 중...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <span>YouTube 채널 연결</span>
                </>
              )}
            </button>

            <p className="text-sm text-slate-400 text-center">
              YouTube 채널을 연결하면 생성한 비디오를 바로 업로드할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/30">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-400 font-semibold">연결됨</span>
            </div>

            {channel && (
              <div className="p-6 bg-slate-900/50 rounded-lg border border-slate-700">
                <div className="flex items-start gap-4">
                  <img
                    src={channel.thumbnails.medium.url}
                    alt={channel.title}
                    className="w-20 h-20 rounded-full"
                  />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-1">{channel.title}</h3>
                    {channel.customUrl && (
                      <p className="text-sm text-slate-400 mb-3">@{channel.customUrl}</p>
                    )}
                    <div className="flex gap-6 text-sm flex-wrap">
                      <div>
                        <span className="text-slate-400">구독자</span>
                        <span className="ml-2 text-white font-semibold">
                          {parseInt(channel.subscriberCount).toLocaleString()}명
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">동영상</span>
                        <span className="ml-2 text-white font-semibold">
                          {parseInt(channel.videoCount).toLocaleString()}개
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">조회수</span>
                        <span className="ml-2 text-white font-semibold">
                          {parseInt(channel.viewCount).toLocaleString()}회
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {isDisconnecting ? '연결 해제 중...' : '연결 해제'}
            </button>
          </div>
        )}
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
            onClick={() => setActiveTab('all')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
              activeTab === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📂 전체 {(jobs.length + scripts.length) > 0 && `(${jobs.length + scripts.length})`}
          </button>
          <button
            onClick={() => setActiveTab('videos')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
              activeTab === 'videos'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            🎬 영상 {jobs.length > 0 && `(${jobs.length})`}
          </button>
          <button
            onClick={() => setActiveTab('scripts')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
              activeTab === 'scripts'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📝 대본 {scripts.length > 0 && `(${scripts.length})`}
          </button>
          <button
            onClick={() => setActiveTab('published')}
            className={`rounded-lg px-6 py-3 text-sm font-semibold transition ${
              activeTab === 'published'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            📺 퍼블리시
          </button>
          <button
            onClick={() => setActiveTab('settings')}
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
                {[
                  ...jobs.map(job => ({ type: 'video' as const, data: job, date: job.createdAt })),
                  ...scripts.map(script => ({ type: 'script' as const, data: script, date: script.createdAt }))
                ]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((item) => (
                    <div
                      key={`${item.type}-${item.data.id}`}
                      className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:bg-white/10"
                    >
                      {item.type === 'video' ? (
                        // 영상 아이템
                        <div className="flex flex-col md:flex-row md:items-start gap-4">
                          {item.data.status === 'completed' && item.data.thumbnailPath && (
                            <a
                              href={`/api/download-thumbnail?jobId=${item.data.id}`}
                              download
                              className="flex-shrink-0 cursor-pointer group"
                              title="클릭하여 썸네일 다운로드"
                            >
                              <img
                                src={`/api/thumbnail?jobId=${item.data.id}`}
                                alt="썸네일"
                                className="w-full md:w-48 h-auto object-contain rounded-lg border-2 border-white/20 group-hover:border-purple-500 transition"
                              />
                            </a>
                          )}
                          <div className="flex-1 min-w-0 w-full">
                            <div className="mb-2 flex items-center gap-3 flex-wrap">
                              <h3 className="text-lg font-semibold text-white break-words">
                                {item.data.title || item.data.id}
                              </h3>
                              {getStatusBadge(item.data.status)}
                            </div>
                            <div className="mb-3 space-y-1 text-sm text-slate-400">
                              <p>진행 상태: {item.data.step}</p>
                              <p>생성 시간: {formatDate(item.data.createdAt)}</p>
                              {item.data.updatedAt !== item.data.createdAt && (
                                <p>마지막 업데이트: {formatDate(item.data.updatedAt)}</p>
                              )}
                            </div>
                            {item.data.status === 'processing' && (
                              <div className="mb-3">
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
                              <div className="rounded bg-red-500/20 p-3 text-sm text-red-300">
                                {item.data.error}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-4 md:mt-0 md:ml-4 md:flex-shrink-0">
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
                                {item.data.logs && item.data.logs.length > 0 && (
                                  <button
                                    onClick={() => setExpandedLogJobId(expandedLogJobId === item.data.id ? null : item.data.id)}
                                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 cursor-pointer"
                                    title="로그 보기"
                                  >
                                    {expandedLogJobId === item.data.id ? '📋 로그 닫기' : '📋 로그 보기'} ({item.data.logs.length})
                                  </button>
                                )}
                                <a
                                  href={`/api/download-video?jobId=${item.data.id}`}
                                  download
                                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer"
                                >
                                  다운로드
                                </a>
                                <button
                                  onClick={() => handleOpenFolder(item.data.id)}
                                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 cursor-pointer"
                                  title="폴더 열기"
                                >
                                  📁 폴더
                                </button>
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
                      ) : (
                        // 대본 아이템
                        <div className="flex flex-col gap-4">
                          <div className="flex-1 min-w-0 w-full">
                            <div className="mb-3">
                              <div className="flex items-start gap-3 mb-2">
                                <span className="text-2xl flex-shrink-0">📝</span>
                                <h3 className="text-xl md:text-2xl font-bold text-white break-words flex-1 min-w-0 leading-tight">
                                  {item.data.title}
                                </h3>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap ml-11">
                                {getStatusBadge(item.data.status)}
                                {item.data.type && (
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                    item.data.type === 'shortform' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                    item.data.type === 'longform' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                                    'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  }`}>
                                    {item.data.type === 'shortform' ? '⚡ 숏폼' : item.data.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
                                  </span>
                                )}
                                <span className="text-xs text-slate-500">생성: {formatDate(item.data.createdAt)}</span>
                                {item.data.status === 'completed' && (
                                  <span className="text-xs text-slate-500">길이: {item.data.content.length.toLocaleString()}자</span>
                                )}
                              </div>
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

                            {/* 버튼 영역 - 하단으로 이동 */}
                            <div className="flex flex-wrap gap-2 mt-3">
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
                                      console.log('📄 원본 content 길이:', item.data.content.length);

                                      // JSON 파싱 (공통 함수 사용 - 자동 정리 및 수정 포함)
                                      const parseResult = parseJsonSafely(item.data.content);

                                      if (!parseResult.success) {
                                        console.error('JSON 파싱 실패:', parseResult.error);
                                        throw new Error(parseResult.error || 'JSON 파싱 실패');
                                      }

                                      const scriptJson = parseResult.data;

                                      if (parseResult.fixed) {
                                        console.log('⚠️ JSON 자동 수정이 적용되었습니다');
                                      } else {
                                        console.log('✅ JSON 파싱 성공 (원본 그대로)');
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
                                  className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                                >
                                  📥 저장
                                </button>
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
                  {filteredScripts.map((script) => (
                  <div
                    key={script.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:bg-white/10"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex-1 min-w-0 w-full">
                        <div className="mb-3">
                          <div className="flex items-start gap-3 mb-2">
                            <span className="text-2xl flex-shrink-0">📝</span>
                            <h3 className="text-xl md:text-2xl font-bold text-white break-words flex-1 min-w-0 leading-tight">
                              {script.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap ml-11">
                            {getStatusBadge(script.status)}
                            {script.type && (
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                script.type === 'shortform' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                script.type === 'longform' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                                'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              }`}>
                                {script.type === 'shortform' ? '⚡ 숏폼' : script.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
                              </span>
                            )}
                            <span className="text-xs text-slate-500">생성: {formatDate(script.createdAt)}</span>
                            {script.status === 'completed' && (
                              <span className="text-xs text-slate-500">길이: {script.content.length.toLocaleString()}자</span>
                            )}
                          </div>
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
                          <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                            <p className="text-base text-slate-300 line-clamp-3 leading-relaxed">
                              {script.content}
                            </p>
                          </div>
                        )}

                        {/* 버튼 영역 - 하단으로 이동 */}
                        <div className="flex flex-wrap gap-2 mt-3">
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
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                            >
                              📥 저장
                            </button>
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
                  </div>
                ))}
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
                    className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:bg-white/10"
                  >
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      {/* 썸네일 */}
                      {job.status === 'completed' && job.thumbnailPath && (
                        <a
                          href={`/api/download-thumbnail?jobId=${job.id}`}
                          download
                          className="flex-shrink-0 cursor-pointer group"
                          title="클릭하여 썸네일 다운로드"
                        >
                          <img
                            src={`/api/thumbnail?jobId=${job.id}`}
                            alt="썸네일"
                            className="w-full md:w-48 h-auto object-contain rounded-lg border-2 border-white/20 group-hover:border-purple-500 transition"
                          />
                        </a>
                      )}

                      <div className="flex-1 min-w-0 w-full">
                        <div className="mb-2 flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-semibold text-white break-words">
                            {job.title || job.id}
                          </h3>
                          {getStatusBadge(job.status)}
                          {job.type && (
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              job.type === 'shortform' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                              job.type === 'longform' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                              'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}>
                              {job.type === 'shortform' ? '⚡ 숏폼' : job.type === 'longform' ? '📝 롱폼' : '🎬 Sora2'}
                            </span>
                          )}
                        </div>

                        <div className="mb-3 space-y-1 text-sm text-slate-400">
                          <p>진행 상태: {job.step}</p>
                          <p>생성 시간: {formatDate(job.createdAt)}</p>
                          {job.updatedAt !== job.createdAt && (
                            <p>마지막 업데이트: {formatDate(job.updatedAt)}</p>
                          )}
                        </div>

                        {job.status === 'processing' && (
                          <div className="mb-3">
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
                          <div className="rounded bg-red-500/20 p-3 text-sm text-red-300">
                            {job.error}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4 md:mt-0 md:ml-4 md:flex-shrink-0">
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
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-500 cursor-pointer whitespace-nowrap"
                            >
                              📥 저장
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
            <YouTubeSettings
              authenticated={youtubeAuthenticated}
              channel={youtubeChannel}
              isLoading={isYoutubeLoading}
              onAuthChange={(auth, ch) => {
                setYoutubeAuthenticated(auth);
                setYoutubeChannel(ch);
              }}
            />
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

      <Toaster position="top-center" />
    </div>
  );
}
