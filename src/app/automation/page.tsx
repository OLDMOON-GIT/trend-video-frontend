'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ScheduleCalendar from '@/components/automation/ScheduleCalendar';
import ChannelSettings from '@/components/automation/ChannelSettings';
import MediaUploadBox from '@/components/MediaUploadBox';

function AutomationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [titles, setTitles] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState(() => ({
    title: '',
    type: getSelectedType(),
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
    model: getSelectedModel(),
    youtubeSchedule: 'immediate',
    youtubePublishAt: ''
  }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [recentTitles, setRecentTitles] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [titleError, setTitleError] = useState<string>('');
  const [expandedLogsFor, setExpandedLogsFor] = useState<string | null>(null);
  const [logsMap, setLogsMap] = useState<Record<string, any[]>>({});
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [mainTab, setMainTab] = useState<'queue' | 'schedule-management'>('queue');
  const [queueTab, setQueueTab] = useState<'scheduled' | 'processing' | 'waiting_upload' | 'failed' | 'completed'>('scheduled');
  const [scheduleManagementTab, setScheduleManagementTab] = useState<'channel-settings' | 'calendar'>('channel-settings');
  const [progressMap, setProgressMap] = useState<Record<string, { scriptProgress?: number; videoProgress?: number }>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null); // 업로드 중인 스케줄 ID
  const [uploadedImagesFor, setUploadedImagesFor] = useState<Record<string, File[]>>({}); // 스케줄별 업로드된 이미지
  const [isManualSortFor, setIsManualSortFor] = useState<Record<string, boolean>>({}); // 스케줄별 수동 정렬 여부
  const [draggingCardIndexFor, setDraggingCardIndexFor] = useState<Record<string, number | null>>({}); // 스케줄별 드래그 중인 카드 인덱스
  const [uploadBoxOpenFor, setUploadBoxOpenFor] = useState<Record<string, boolean>>({}); // 스케줄별 업로드 박스 열림 여부
  const [downloadMenuFor, setDownloadMenuFor] = useState<Record<string, boolean>>({}); // 다운로드 메뉴 열림 여부
  const [isSubmitting, setIsSubmitting] = useState(false); // 제목 추가 중복 방지
  const [currentProductData, setCurrentProductData] = useState<any>(null); // 현재 상품 정보

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

  // localStorage에서 선택한 LLM 모델 불러오기
  function getSelectedModel(): string {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_selected_model');
      return saved || 'claude';
    }
    return 'claude';
  }

  // localStorage에서 선택한 미디어 모드 불러오기
  function getSelectedMediaMode(): string {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation_selected_media_mode');
      return saved || 'imagen3';
    }
    return 'imagen3';
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

    // 상품관리에서 왔는지 체크
    const fromProduct = searchParams.get('fromProduct');
    if (fromProduct === 'true') {
      // localStorage에서 상품 정보 읽기
      const prefillData = localStorage.getItem('automation_prefill');
      if (prefillData) {
        try {
          const data = JSON.parse(prefillData);

          // 폼 열기
          setShowAddForm(true);

          // 폼에 상품 정보 미리 채우기
          setNewTitle(prev => ({
            ...prev,
            title: data.title ? `[광고] ${data.title}` : '[광고] ',
            type: data.type || 'product',
            category: data.category || '상품',
            tags: data.tags || '',
            productUrl: data.productUrl || '',
            scriptMode: 'chrome',
            mediaMode: 'imagen3',
            model: 'gpt-4o',
            youtubeSchedule: 'immediate'
          }));

          // productData를 별도로 저장 (대본 생성 시 사용)
          if (data.productData) {
            const productDataStr = JSON.stringify(data.productData);
            localStorage.setItem('current_product_data', productDataStr);
            // state에도 저장하여 UI에 표시
            setCurrentProductData(data.productData);
          }

          // 사용 후 삭제
          localStorage.removeItem('automation_prefill');

          console.log('✅ 상품 정보가 폼에 자동 입력되었습니다:', data);
        } catch (error) {
          console.error('❌ 상품 정보 파싱 실패:', error);
        }
      }
    }
  }, [searchParams]);

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

      setSchedulerStatus(status.status);
      setSettings(status.status.settings);
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

  async function addTitle() {
    // 중복 제출 방지
    if (isSubmitting) {
      console.warn('⚠️ 이미 제목 추가 중입니다. 중복 제출을 방지합니다.');
      return;
    }

    if (!newTitle.title || !newTitle.type) {
      alert('제목과 타입은 필수입니다');
      return;
    }

    if (titleError) {
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
      // 상품 정보가 있으면 포함
      let productData = null;
      if (newTitle.type === 'product') {
        const savedProductData = localStorage.getItem('current_product_data');
        if (savedProductData) {
          productData = savedProductData; // 이미 JSON 문자열
          localStorage.removeItem('current_product_data'); // 사용 후 삭제
        }
      }

      const response = await fetch('/api/automation/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.title,
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
        await addScheduleToTitle(titleId, newTitle.scheduleTime);
      }

      saveRecentTitle(newTitle.title);

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
        model: getSelectedModel() // localStorage에서 불러온 모델 유지
      });
      setShowAddForm(false);
      setCurrentProductData(null); // 상품정보 초기화
      await fetchData();
      setQueueTab('scheduled'); // 예약 큐 탭으로 자동 전환
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
    setEditForm({
      ...title,
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
      // 제목 업데이트 (모든 필드 포함)
      await fetch('/api/automation/titles', {
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

      cancelEdit();
      await fetchData();
    } catch (error) {
      console.error('Failed to save edit:', error);
    }
  }

  async function addScheduleToTitle(titleId: string, scheduledTime: string, youtubePublishTime?: string) {
    try {
      const response = await fetch('/api/automation/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleId,
          scheduledTime,
          youtubePublishTime: youtubePublishTime || null
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
          // 로그가 변경되지 않았으면 상태 업데이트 안 함
          if (JSON.stringify(prevLogs) === JSON.stringify(data.logs)) {
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

    if (activeTitles.length === 0) return;

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

      // 숨겨진 a 태그를 만들어서 클릭 (페이지 이동 없이 다운로드)
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      console.log(`✅ ${typeLabels[type]} 다운로드 요청 완료`);
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드 중 오류가 발생했습니다.');
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

  // 이미지 업로드 실행
  async function uploadImages(titleId: string, scheduleId: string, scriptId: string) {
    const images = uploadedImagesFor[titleId];

    if (!images || images.length === 0) {
      return;
    }

    try {
      setUploadingFor(titleId);

      const formData = new FormData();
      formData.append('scheduleId', scheduleId);
      formData.append('scriptId', scriptId);

      images.forEach((file, index) => {
        formData.append(`images`, file);
      });

      const response = await fetch('/api/automation/upload-images', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        // 업로드 박스 닫기
        setUploadBoxOpenFor(prev => ({ ...prev, [titleId]: false }));

        // 업로드된 이미지 초기화
        setUploadedImagesFor(prev => {
          const newState = { ...prev };
          delete newState[titleId];
          return newState;
        });

        // 로그창 자동 열기
        setExpandedLogsFor(titleId);

        await fetchData();
        setQueueTab('waiting_upload'); // 업로드 대기 탭으로 자동 전환

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

          // 2. 영상 생성 API 호출 (내부 요청 형식)
          const videoRes = await fetch('/api/generate-video-upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Request': 'automation-system'
            },
            body: JSON.stringify({
              storyJson,
              userId: titleInfo.user_id,
              imageSource: (titleInfo.media_mode === 'auto' || titleInfo.media_mode === 'upload') ? 'none' : titleInfo.media_mode,
              imageModel: titleInfo.model || 'dalle3',
              videoFormat: titleInfo.type || 'shortform',
              ttsVoice: 'ko-KR-SoonBokNeural',
              title: titleInfo.title,
              scriptId
            })
          });

          const videoData = await videoRes.json();
          if (videoRes.ok) {
            console.log('✅ [영상 제작] 성공:', videoData.jobId);
          } else {
            console.error('❌ [영상 제작] 실패:', videoData.error);
          }
        }
      } else {
        console.error('❌ 업로드 실패:', data.error || '알 수 없는 오류');
      }
    } catch (error) {
      console.error('❌ Image upload error:', error);
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
                      setNewTitle(prev => ({ ...prev, type }));
                      localStorage.setItem('automation_selected_type', type);
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
                    <option value="일반">일반</option>
                    <option value="상품">상품</option>
                    <option value="북한탈북자사연">북한탈북자사연</option>
                    <option value="막장드라마">막장드라마</option>
                    <option value="감동실화">감동실화</option>
                    <option value="복수극">복수극</option>
                    <option value="로맨스">로맨스</option>
                    <option value="스릴러">스릴러</option>
                    <option value="코미디">코미디</option>
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
                    {/* 상품정보가 없을 때만 URL 입력 필드 표시 */}
                    {!currentProductData && (
                      <input
                        type="url"
                        placeholder="상품 URL (선택)"
                        value={newTitle.productUrl}
                        onChange={(e) => setNewTitle({ ...newTitle, productUrl: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    )}

                    {/* 상품정보 미리보기 */}
                    {currentProductData && (
                      <div className="rounded-lg bg-emerald-900/30 border border-emerald-500/50 p-4">
                        <p className="text-sm font-semibold text-emerald-400 mb-2">🛍️ 상품 정보 미리보기</p>
                        <div className="space-y-1.5 text-xs">
                          {currentProductData.title && (
                            <p className="text-slate-300">
                              <span className="font-semibold text-slate-400">제목:</span> {currentProductData.title}
                            </p>
                          )}
                          {currentProductData.thumbnail && (
                            <p className="text-slate-400 truncate">
                              <span className="font-semibold">썸네일:</span> {currentProductData.thumbnail}
                            </p>
                          )}
                          {currentProductData.product_link && (
                            <p className="text-blue-400 truncate">
                              <span className="font-semibold text-slate-400">링크:</span> {currentProductData.product_link}
                            </p>
                          )}
                          {currentProductData.description && (
                            <p className="text-slate-400 line-clamp-2">
                              <span className="font-semibold">설명:</span> {currentProductData.description}
                            </p>
                          )}
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
                      <option value="chatgpt">ChatGPT</option>
                      <option value="gemini">Gemini</option>
                      <option value="claude">Claude</option>
                      <option value="groq">Groq</option>
                    </select>
                  </div>
                </div>

                {/* 유튜브 업로드 설정 */}
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
                  {newTitle.youtubeSchedule === 'scheduled' && (
                    <div className="mt-3">
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
                  {newTitle.youtubeSchedule === 'immediate' && (
                    <p className="text-xs text-slate-400 mt-1">영상 생성 완료 후 즉시 유튜브에 업로드됩니다</p>
                  )}
                </div>

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
                  onClick={addTitle}
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
                      type: 'longform',
                      category: '',
                      tags: '',
                      productUrl: '',
                      scheduleTime: '',
                      channel: currentChannel, // 현재 선택된 채널 유지
                      scriptMode: 'chrome',
                      mediaMode: 'imagen3',
                      model: 'gpt-4o',
                      youtubeSchedule: 'immediate',
                      youtubePublishAt: ''
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
          <div className="grid grid-cols-2 gap-3 mb-4">
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
          </div>

          {/* 큐 서브 탭 */}
          {mainTab === 'queue' && (
            <div className="grid grid-cols-5 gap-2 mb-4">
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
          )}

          {/* 채널별 주기관리 탭 */}
          {mainTab === 'schedule-management' && (
            <div>
              {/* 주기관리 서브 탭 */}
              <div className="grid grid-cols-2 gap-2 mb-4">
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

              {/* 스케줄 달력 */}
              {scheduleManagementTab === 'calendar' && (
                <div>
                  <ScheduleCalendar />
                </div>
              )}
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
                      return ['scheduled', 'pending'].includes(title.status);
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
                              onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
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
                              <option value="일반">일반</option>
                              <option value="북한탈북자사연">북한탈북자사연</option>
                              <option value="막장드라마">막장드라마</option>
                              <option value="감동실화">감동실화</option>
                              <option value="복수극">복수극</option>
                              <option value="로맨스">로맨스</option>
                              <option value="스릴러">스릴러</option>
                              <option value="코미디">코미디</option>
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

                        {/* 상품 URL (product 타입일 때만) */}
                        {editForm.type === 'product' && (
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">상품 URL</label>
                            <input
                              type="url"
                              placeholder="상품 URL"
                              value={editForm.product_url || ''}
                              onChange={(e) => setEditForm({ ...editForm, product_url: e.target.value })}
                              className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        )}

                        {/* 채널, 대본 생성, 미디어 생성, AI 모델 */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-400 block mb-1">채널</label>
                            {channels.length > 0 ? (
                              <select
                                value={editForm.channel_id || channels[0].id}
                                onChange={(e) => setEditForm({ ...editForm, channel_id: e.target.value })}
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
                        <div className="mb-3 max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
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
                    {/* 제목 정보 */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold text-lg">{title.title}</h4>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            title.type === 'longform' ? 'bg-blue-600/30 text-blue-300' :
                            title.type === 'shortform' ? 'bg-purple-600/30 text-purple-300' :
                            'bg-orange-600/30 text-orange-300'
                          }`}>
                            {title.type === 'longform' ? '롱폼' : title.type === 'shortform' ? '숏폼' : '상품'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${
                            title.status === 'processing' ? 'bg-yellow-600/30 text-yellow-300 animate-pulse' :
                            title.status === 'completed' ? 'bg-green-600/30 text-green-300' :
                            title.status === 'failed' ? 'bg-red-600/30 text-red-300' :
                            title.status === 'scheduled' ? 'bg-blue-600/30 text-blue-300' :
                            title.status === 'waiting_for_upload' ? 'bg-purple-600/30 text-purple-300 animate-pulse' :
                            'bg-slate-600 text-slate-300'
                          }`}>
                            {title.status === 'processing' && '⏳ '}
                            {title.status === 'failed' && '❌ '}
                            {title.status === 'scheduled' && '📅 '}
                            {title.status === 'waiting_for_upload' && '📤 '}
                            {title.status === 'processing' ? '진행 중' :
                             title.status === 'completed' ? '' :
                             title.status === 'failed' ? '실패' :
                             title.status === 'scheduled' ? '예약됨' :
                             title.status === 'waiting_for_upload' ? '업로드 대기' :
                             title.status}
                          </span>
                          {/* 진행률 표시 */}
                          {progressMap[title.id]?.scriptProgress !== undefined && (
                            <span className="text-xs px-2 py-0.5 rounded bg-cyan-600/30 text-cyan-300">
                              📝 대본: {progressMap[title.id].scriptProgress}%
                            </span>
                          )}
                          {progressMap[title.id]?.videoProgress !== undefined && (
                            <span className="text-xs px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300">
                              🎬 영상: {progressMap[title.id].videoProgress}%
                            </span>
                          )}
                          {title.category && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-600/30 text-green-300">
                              {title.category}
                            </span>
                          )}
                          {title.model && (
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-600/30 text-purple-300">
                              🤖 {title.model === 'chatgpt' ? 'ChatGPT' : title.model === 'gemini' ? 'Gemini' : title.model === 'claude' ? 'Claude' : title.model === 'groq' ? 'Groq' : title.model}
                            </span>
                          )}
                          {title.script_mode && (
                            <span className="text-xs px-2 py-0.5 rounded bg-pink-600/30 text-pink-300">
                              대본: {title.script_mode === 'chrome' ? '크롬창' : 'API'}
                            </span>
                          )}
                          {title.media_mode && (
                            <span className="text-xs px-2 py-0.5 rounded bg-yellow-600/30 text-yellow-300">
                              미디어: {title.media_mode === 'dalle' ? 'DALL-E' : title.media_mode === 'imagen3' ? 'Imagen3' : title.media_mode === 'sora2' ? 'SORA2' : '업로드'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 ml-4">
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
                        {/* 즉시 실행 버튼 (완료/업로드 대기 상태가 아닐 때만) */}
                        {title.status !== 'waiting_for_upload' && title.status !== 'completed' && (
                          <button
                            onClick={() => forceExecute(title.id, title.title)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm transition"
                          >
                            ▶️ 즉시 실행
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
                            </>
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
                        {/* 대본 보기 버튼 (completed 상태이고 script_id가 있을 때만) */}
                        {(() => {
                          const scriptId = titleSchedules.find((s: any) => s.script_id)?.script_id;
                          return title.status === 'completed' && scriptId && (
                            <button
                              onClick={() => {
                                window.location.href = '/my-content?tab=scripts';
                              }}
                              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition"
                              title="내 콘텐츠에서 대본 보기"
                            >
                              📝 대본
                            </button>
                          );
                        })()}
                        {/* 영상 보기 버튼 (completed 상태이고 video_id가 있을 때만) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.video_id);
                          const videoId = schedule?.video_id;
                          return title.status === 'completed' && videoId && (
                            <button
                              onClick={() => {
                                window.location.href = '/my-content?tab=videos';
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm transition"
                              title="내 콘텐츠에서 영상 보기"
                            >
                              🎬 영상
                            </button>
                          );
                        })()}
                        {/* 대본 재생성 버튼 (failed 또는 completed 상태이고 script_id가 있을 때만) */}
                        {(() => {
                          const scriptId = titleSchedules.find((s: any) => s.script_id)?.script_id;
                          return (title.status === 'failed' || title.status === 'completed') && scriptId && (
                            <button
                              onClick={() => handleRegenerateScript(scriptId, title.id, title.title)}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm transition"
                              title="대본 재생성"
                            >
                              🔄 대본
                            </button>
                          );
                        })()}
                        {/* 영상 재생성 버튼 (failed 또는 completed 상태이고 video_id가 있을 때만) */}
                        {(() => {
                          const schedule = titleSchedules.find((s: any) => s.script_id || s.video_id);
                          const videoId = schedule?.video_id;
                          const scriptId = schedule?.script_id;
                          return (title.status === 'failed' || title.status === 'completed') && (videoId || scriptId) && (
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
                    </div>

                    {/* 상품 정보 및 YouTube 정보 */}
                    {title.product_url && (
                      <a
                        href={title.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 underline mb-2 inline-block"
                      >
                        🔗 {title.product_url}
                      </a>
                    )}
                    {title.product_data && (() => {
                      try {
                        const productData = JSON.parse(title.product_data);
                        return (
                          <div className="mb-3 p-2 bg-slate-700/50 rounded border border-slate-600">
                            <p className="text-xs font-semibold text-emerald-400 mb-1">🛍️ 상품 정보</p>
                            {productData.title && <p className="text-xs text-slate-300">제목: {productData.title}</p>}
                            {productData.thumbnail && <p className="text-xs text-slate-400 truncate">썸네일: {productData.thumbnail}</p>}
                            {productData.product_link && (
                              <p className="text-xs truncate">
                                링크: <a
                                  href={productData.product_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 underline"
                                >
                                  {productData.product_link}
                                </a>
                              </p>
                            )}
                            {productData.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">설명: {productData.description}</p>}
                          </div>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}
                    {title.tags && (
                      <p className="text-xs text-slate-500 mb-3">🏷️ {title.tags}</p>
                    )}
                    {/* YouTube 정보 (완료 상태일 때만 표시) */}
                    {title.status === 'completed' && (() => {
                      const schedule = titleSchedules.find((s: any) => s.youtube_url || s.youtube_upload_id);
                      if (!schedule) return null;

                      return (
                        <div className="mb-3 p-2 bg-red-900/30 rounded border border-red-500/30">
                          <p className="text-xs font-semibold text-red-400 mb-1">📺 YouTube</p>
                          {title.channel && (
                            <p className="text-xs text-slate-300">채널: {title.channel}</p>
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
                          <span>이미지 업로드가 필요합니다</span>
                        </h5>
                        <p className="text-sm text-slate-300 mb-4">
                          대본 생성이 완료되었습니다. 영상 제작을 위해 이미지를 업로드해주세요.
                        </p>

                        {/* 이미지 업로드 박스 (MediaUploadBox 컴포넌트 사용) */}
                        <div className="mb-4">
                          <MediaUploadBox
                            uploadedImages={uploadedImagesFor[title.id] || []}
                            uploadedVideos={[]}
                            onImagesChange={(files) => {
                              setUploadedImagesFor(prev => ({ ...prev, [title.id]: files }));
                            }}
                            onVideosChange={() => {}}
                            acceptJson={false}
                            acceptImages={true}
                            acceptVideos={false}
                            mode={title.type === 'shortform' ? 'shortform' : 'longform'}
                            maxImages={50}
                          />

                          {/* 업로드 버튼 */}
                          {uploadedImagesFor[title.id] && uploadedImagesFor[title.id].length > 0 && (() => {
                            // 현재 title에 대한 대본 생성 pipeline 찾기
                            const scriptSchedule = titleSchedules.find((s: any) =>
                              s.script_id && (s.status === 'waiting_for_upload' || s.status === 'pending' || s.status === 'processing')
                            );

                            if (!scriptSchedule?.script_id) {
                              return (
                                <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-sm text-red-200">
                                  ⚠️ script_id를 찾을 수 없습니다. 대본 생성이 완료되지 않았을 수 있습니다.
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
                      <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/80 p-4">
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
