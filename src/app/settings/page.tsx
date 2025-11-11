'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

// Coupang 인터페이스들
interface CoupangSettings {
  accessKey: string;
  secretKey: string;
  trackingId: string;
  openaiApiKey?: string;
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
  originalUrl: string;
  shortUrl: string;
  productName: string;
  clicks: number;
  createdAt: string;
}

interface ShoppingShortsTask {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  progress: string;
  startTime: string;
  endTime?: string;
  results?: any[];
  error?: string;
  logs: string[];
}

type CoupangTabType = 'partners' | 'automation';

type SocialMediaPlatform = 'tiktok' | 'instagram' | 'facebook';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'youtube' | 'google-sites' | 'password' | 'profile' | 'coupang' | 'social-media'>('profile');
  const [coupangActiveTab, setCoupangActiveTab] = useState<CoupangTabType>('partners');
  const [socialMediaTab, setSocialMediaTab] = useState<SocialMediaPlatform>('tiktok');

  // 공통
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Google Sites 설정
  const [isSaving, setIsSaving] = useState(false);
  const [googleSitesUrl, setGoogleSitesUrl] = useState('');
  const [googleSitesEditUrl, setGoogleSitesEditUrl] = useState('');
  const [googleSitesHomeUrl, setGoogleSitesHomeUrl] = useState('');
  const [nickname, setNickname] = useState('');
  const [userId, setUserId] = useState('');

  // 개인정보 수정
  const [email, setEmail] = useState('');
  const [profileNickname, setProfileNickname] = useState('');
  const [isCheckingNickname, setIsCheckingNickname] = useState(false);
  const [nicknameCheckResult, setNicknameCheckResult] = useState<{
    available: boolean;
    message: string;
  } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // YouTube 설정 (다중 채널)
  const [channels, setChannels] = useState<any[]>([]);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Coupang Settings
  const [coupangSettings, setCoupangSettings] = useState<CoupangSettings>({
    accessKey: '',
    secretKey: '',
    trackingId: '',
    openaiApiKey: '',
    isConnected: false
  });
  const [isSavingCoupang, setIsSavingCoupang] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Coupang Search
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Coupang Links
  const [generatedLinks, setGeneratedLinks] = useState<ShortLink[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);

  // Coupang Stats
  const [stats, setStats] = useState({
    totalClicks: 0,
    totalLinks: 0,
    estimatedRevenue: 0,
    conversionRate: 0
  });

  // Shopping Shorts Automation
  const [productLimit, setProductLimit] = useState(3);
  const [videosPerProduct, setVideosPerProduct] = useState(2);
  const [category, setCategory] = useState('electronics');
  const [currentTask, setCurrentTask] = useState<ShoppingShortsTask | null>(null);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [taskPollingInterval, setTaskPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Douyin Direct Download
  const [douyinUrl, setDouyinUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedVideo, setDownloadedVideo] = useState<string | null>(null);

  // Social Media Settings
  const [socialMediaAccounts, setSocialMediaAccounts] = useState<{
    tiktok: any[];
    instagram: any[];
    facebook: any[];
  }>({
    tiktok: [],
    instagram: [],
    facebook: []
  });
  const [isConnectingSocialMedia, setIsConnectingSocialMedia] = useState(false);

  const getSessionId = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  };

  const getAuthHeaders = (): Record<string, string> => {
    const sessionId = getSessionId();
    return sessionId ? {
      'Authorization': `Bearer ${sessionId}`
    } : {};
  };

  useEffect(() => {
    // URL 파라미터에서 탭 읽기
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'youtube' || tab === 'google-sites' || tab === 'password' || tab === 'profile' || tab === 'coupang' || tab === 'social-media') {
      setActiveTab(tab as any);
    }

    // success 파라미터 처리 (YouTube OAuth 리다이렉트 후)
    if (params.get('success') === 'true') {
      toast.success('YouTube 채널 연결이 완료되었습니다!');
      // URL 파라미터 제거
      window.history.replaceState({}, '', '/settings?tab=youtube');
    }

    loadAllSettings();
  }, []);

  useEffect(() => {
    // Coupang 탭이 활성화될 때 쿠팡 설정 로드
    if (activeTab === 'coupang') {
      loadCoupangSettings();
      loadCoupangLinks();
      loadCoupangStats();
    } else if (activeTab === 'social-media') {
      loadSocialMediaAccounts();
    }
  }, [activeTab]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (taskPollingInterval) {
        clearInterval(taskPollingInterval);
      }
    };
  }, [taskPollingInterval]);

  const loadAllSettings = async () => {
    try {
      // 관리자 권한 확인
      const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
      const sessionData = await sessionRes.json();
      if (sessionData.user && sessionData.user.isAdmin) {
        setIsAdmin(true);
      }

      // 이메일 설정 (개인정보)
      if (sessionData.user && sessionData.user.email) {
        setEmail(sessionData.user.email);
      }

      // Google Sites 설정 로드
      const sitesRes = await fetch('/api/user/settings');
      const sitesData = await sitesRes.json();

      if (sitesRes.ok) {
        setUserId(sitesData.userId || '');
        setGoogleSitesUrl(sitesData.googleSitesUrl || '');
        setGoogleSitesEditUrl(sitesData.googleSitesEditUrl || '');
        setGoogleSitesHomeUrl(sitesData.googleSitesHomeUrl || '');
        setNickname(sitesData.nickname || '');
        setProfileNickname(sitesData.nickname || '');
      } else if (sitesRes.status === 401) {
        router.push('/auth');
        return;
      }

      // YouTube 다중 채널 로드
      const youtubeRes = await fetch('/api/youtube/channels', { credentials: 'include' });
      const youtubeData = await youtubeRes.json();

      // 기본 채널을 맨 위로 정렬
      const sortedChannels = (youtubeData.channels || []).sort((a: any, b: any) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return 0;
      });
      setChannels(sortedChannels);
      setHasCredentials(youtubeData.hasCredentials || false);
    } catch (error) {
      console.error('설정 로드 실패:', error);
      toast.error('설정 로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Social Media Functions
  const loadSocialMediaAccounts = async () => {
    try {
      const response = await fetch('/api/social-media/accounts', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSocialMediaAccounts(data.accounts || socialMediaAccounts);
      }
    } catch (error) {
      console.error('소셜미디어 계정 로드 실패:', error);
    }
  };

  const handleConnectSocialMedia = async (platform: SocialMediaPlatform) => {
    try {
      setIsConnectingSocialMedia(true);
      toast.loading(`${platform.toUpperCase()} 인증 페이지로 이동 중...`, { id: 'social-auth' });

      const res = await fetch(`/api/social-media/${platform}/oauth-start`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success && data.authUrl) {
        toast.success(`${platform.toUpperCase()} 로그인 페이지로 이동합니다...`, { id: 'social-auth' });
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || '연결 실패');
      }
    } catch (error: any) {
      console.error(`${platform} 연결 실패:`, error);
      toast.error(`연결 실패: ${error.message}`, { id: 'social-auth' });
      setIsConnectingSocialMedia(false);
    }
  };

  const handleRemoveSocialMedia = async (platform: SocialMediaPlatform, accountId: string) => {
    if (!confirm(`정말로 이 ${platform.toUpperCase()} 계정 연결을 해제하시겠습니까?`)) {
      return;
    }

    try {
      toast.loading('연결 해제 중...', { id: 'social-disconnect' });
      const res = await fetch(`/api/social-media/${platform}/accounts?accountId=${accountId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('계정 연결 해제 완료', { id: 'social-disconnect' });
        await loadSocialMediaAccounts();
      } else {
        throw new Error(data.error || '연결 해제 실패');
      }
    } catch (error: any) {
      console.error('연결 해제 실패:', error);
      toast.error(`연결 해제 실패: ${error.message}`, { id: 'social-disconnect' });
    }
  };

  // Coupang Functions
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
        setCoupangSettings({ ...coupangSettings, isConnected: true, lastChecked: new Date().toISOString() });
        toast.success('✅ 연결 성공! 쿠팡 파트너스 API가 정상 작동합니다.');
      } else {
        throw new Error(data.error || '연결 실패');
      }
    } catch (error: any) {
      toast.error('❌ 연결 실패: ' + error.message);
    } finally {
      setTestingConnection(false);
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

  const generateCoupangLink = async (product: Product) => {
    try {
      const response = await fetch('/api/coupang/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          productId: product.productId,
          productName: product.productName,
          productUrl: product.productUrl
        })
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentProduct(product);
        setShowLinkModal(true);
        loadCoupangLinks();
        toast.success('링크가 생성되었습니다!');
      } else {
        throw new Error(data.error || '링크 생성 실패');
      }
    } catch (error: any) {
      toast.error('링크 생성 실패: ' + error.message);
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

  const loadCoupangStats = async () => {
    try {
      const response = await fetch('/api/coupang/stats', {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats || stats);
      }
    } catch (error) {
      console.error('통계 로드 실패:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('클립보드에 복사되었습니다!');
  };

  // Shopping Shorts Automation Functions
  const startShoppingShortsPipeline = async () => {
    if (!coupangSettings.openaiApiKey?.trim()) {
      toast('⚠️ OpenAI 미설정 - 기본 번역 사용됩니다 (AI 번역 스킵)', { icon: 'ℹ️' });
    }

    if (!coupangSettings.isConnected) {
      toast('⚠️ 쿠팡 API 미연결 - 프론트엔드 API 사용', { icon: 'ℹ️' });
    }

    setIsRunningPipeline(true);
    try {
      const response = await fetch('/api/coupang/shopping-shorts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          productLimit,
          videosPerProduct,
          category,
          openaiApiKey: coupangSettings.openaiApiKey
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('쇼핑 쇼츠 파이프라인이 시작되었습니다!');

        const interval = setInterval(() => {
          pollTaskStatus(data.taskId);
        }, 2000);
        setTaskPollingInterval(interval);

        setCurrentTask({
          taskId: data.taskId,
          status: 'running',
          progress: '파이프라인 시작 중...',
          startTime: new Date().toISOString(),
          logs: []
        });
      } else {
        throw new Error(data.error || '파이프라인 시작 실패');
      }
    } catch (error: any) {
      toast.error('파이프라인 시작 실패: ' + error.message);
      setIsRunningPipeline(false);
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    try {
      const response = await fetch(`/api/coupang/shopping-shorts/start?taskId=${taskId}`, {
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const prevStatus = currentTask?.status;
        setCurrentTask(data.status);

        if (data.status.status === 'completed' || data.status.status === 'failed') {
          if (taskPollingInterval) {
            clearInterval(taskPollingInterval);
            setTaskPollingInterval(null);
          }
          setIsRunningPipeline(false);

          if (prevStatus !== data.status.status) {
            if (data.status.status === 'completed') {
              toast.success(`파이프라인 완료! ${data.status.results?.length || 0}개 상품 처리됨`);
            } else {
              toast.error('파이프라인 실패: ' + data.status.error);
            }
          }
        }
      }
    } catch (error) {
      console.error('작업 상태 조회 실패:', error);
    }
  };

  const downloadDouyinVideo = async () => {
    if (!douyinUrl.trim()) {
      toast.error('Douyin URL을 입력하세요');
      return;
    }

    if (!douyinUrl.includes('douyin.com') && !douyinUrl.includes('iesdouyin.com')) {
      toast.error('올바른 Douyin URL이 아닙니다');
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
        toast.success('영상 다운로드 완료!');
      } else {
        toast.error('다운로드 실패: ' + data.error);
      }
    } catch (error: any) {
      toast.error('다운로드 실패: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const stopShoppingShortsPipeline = async () => {
    if (!currentTask) return;

    try {
      const response = await fetch(`/api/coupang/shopping-shorts/start?taskId=${currentTask.taskId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast('파이프라인이 중지되었습니다.', { icon: 'ℹ️' });

        if (taskPollingInterval) {
          clearInterval(taskPollingInterval);
          setTaskPollingInterval(null);
        }

        setIsRunningPipeline(false);
        setCurrentTask(null);
      } else {
        throw new Error(data.error || '중지 실패');
      }
    } catch (error: any) {
      toast.error('중지 실패: ' + error.message);
    }
  };

  // Google Sites 설정 저장
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleSitesUrl,
          googleSitesEditUrl,
          googleSitesHomeUrl,
          nickname
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Google Sites 설정이 저장되었습니다!');
      } else {
        toast.error(data.error || '설정 저장 실패');
      }
    } catch (error) {
      console.error('설정 저장 실패:', error);
      toast.error('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // YouTube 채널 추가
  const handleAddChannel = async () => {
    if (!hasCredentials) {
      toast.error('관리자가 YouTube API Credentials를 설정하지 않았습니다.');
      return;
    }

    try {
      setIsConnecting(true);
      toast.loading('YouTube 인증 페이지로 이동 중...', { id: 'youtube-auth' });

      const res = await fetch('/api/youtube/oauth-start', {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success && data.authUrl) {
        toast.success('Google 로그인 페이지로 이동합니다...', { id: 'youtube-auth' });
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || '연결 실패');
      }
    } catch (error: any) {
      console.error('YouTube 연결 실패:', error);
      toast.error(`연결 실패: ${error.message}`, { id: 'youtube-auth' });
      setIsConnecting(false);
    }
  };

  // YouTube 채널 제거
  const handleRemoveChannel = async (channelId: string) => {
    if (!confirm('정말로 이 YouTube 채널 연결을 해제하시겠습니까?')) {
      return;
    }

    try {
      toast.loading('연결 해제 중...', { id: 'youtube-disconnect' });
      const res = await fetch(`/api/youtube/channels?channelId=${channelId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('YouTube 연결 해제 완료', { id: 'youtube-disconnect' });
        await loadAllSettings();
      } else {
        throw new Error(data.error || '연결 해제 실패');
      }
    } catch (error: any) {
      console.error('연결 해제 실패:', error);
      toast.error(`연결 해제 실패: ${error.message}`, { id: 'youtube-disconnect' });
    }
  };

  // 기본 채널 설정
  const handleSetDefault = async (channelId: string) => {
    try {
      toast.loading('기본 채널 설정 중...', { id: 'youtube-default' });
      const res = await fetch(`/api/youtube/channels?channelId=${channelId}`, {
        method: 'PATCH',
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('기본 채널로 설정되었습니다', { id: 'youtube-default' });
        await loadAllSettings();
      } else {
        throw new Error(data.error || '설정 실패');
      }
    } catch (error: any) {
      console.error('기본 채널 설정 실패:', error);
      toast.error(`설정 실패: ${error.message}`, { id: 'youtube-default' });
    }
  };

  // 비밀번호 변경
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('모든 필드를 입력해주세요.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('새 비밀번호가 일치하지 않습니다.');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('새 비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('비밀번호가 변경되었습니다!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.error || '비밀번호 변경 실패');
      }
    } catch (error) {
      console.error('비밀번호 변경 실패:', error);
      toast.error('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // 닉네임 중복 체크
  const handleCheckNickname = async () => {
    if (!profileNickname || !profileNickname.trim()) {
      setNicknameCheckResult({
        available: false,
        message: '닉네임을 입력해주세요.'
      });
      return;
    }

    if (profileNickname.trim() === nickname) {
      setNicknameCheckResult({
        available: true,
        message: '현재 사용 중인 닉네임입니다.'
      });
      return;
    }

    setIsCheckingNickname(true);
    try {
      const res = await fetch(`/api/user/nickname/check?nickname=${encodeURIComponent(profileNickname.trim())}`);
      const data = await res.json();

      if (res.ok) {
        setNicknameCheckResult({
          available: data.available,
          message: data.message
        });
      } else {
        throw new Error(data.error || '중복 체크 실패');
      }
    } catch (error: any) {
      console.error('닉네임 중복 체크 실패:', error);
      toast.error(`중복 체크 실패: ${error.message}`);
      setNicknameCheckResult({
        available: false,
        message: '중복 체크 중 오류가 발생했습니다.'
      });
    } finally {
      setIsCheckingNickname(false);
    }
  };

  // 개인정보 저장
  const handleSaveProfileInfo = async () => {
    if (!profileNickname || !profileNickname.trim()) {
      toast.error('닉네임을 입력해주세요.');
      return;
    }

    if (profileNickname.trim() !== nickname) {
      if (!nicknameCheckResult || !nicknameCheckResult.available) {
        toast.error('닉네임 중복 체크를 먼저 진행해주세요.');
        return;
      }
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: profileNickname.trim() })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('개인정보가 저장되었습니다!');
        setNickname(profileNickname.trim());
        setNicknameCheckResult(null);
      } else {
        toast.error(data.error || '저장 실패');
      }
    } catch (error) {
      console.error('개인정보 저장 실패:', error);
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingProfile(false);
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

      <div className="max-w-7xl mx-auto">
        {/* 탭 메뉴 */}
        <div className="mb-8 flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
              activeTab === 'profile'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            👤 개인정보 수정
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
              activeTab === 'password'
                ? 'bg-green-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🔒 비밀번호 변경
          </button>
          <button
            onClick={() => setActiveTab('youtube')}
            className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
              activeTab === 'youtube'
                ? 'bg-red-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            📺 YouTube 채널설정
          </button>
          <button
            onClick={() => setActiveTab('google-sites')}
            className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
              activeTab === 'google-sites'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🌐 Google Sites 설정
          </button>
          <button
            onClick={() => setActiveTab('coupang')}
            className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
              activeTab === 'coupang'
                ? 'bg-orange-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🛒 쿠팡 파트너스
          </button>
          <button
            onClick={() => setActiveTab('social-media')}
            className={`px-6 py-3 rounded-lg text-lg font-semibold transition ${
              activeTab === 'social-media'
                ? 'bg-pink-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            📱 소셜미디어 설정
          </button>
        </div>

        {/* 개인정보 수정 탭 */}
        {activeTab === 'profile' && (
          <div className="rounded-2xl border border-slate-600 bg-slate-800/50 p-8 backdrop-blur">
            <h2 className="text-2xl font-bold text-white mb-4">👤 개인정보 수정</h2>
            <p className="text-slate-400 mb-6 text-sm">
              회원 정보를 확인하고 수정할 수 있습니다
            </p>

            <div className="space-y-6">
              {/* 이메일 (읽기 전용) */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  이메일
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full rounded-lg bg-slate-900/50 border border-slate-600 px-4 py-3 text-slate-400 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-slate-500">이메일은 변경할 수 없습니다.</p>
              </div>

              {/* 닉네임 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  닉네임 <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={profileNickname}
                    onChange={(e) => {
                      setProfileNickname(e.target.value);
                      setNicknameCheckResult(null);
                    }}
                    maxLength={30}
                    placeholder="닉네임을 입력하세요 (2-30자)"
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={handleCheckNickname}
                    disabled={isCheckingNickname || !profileNickname.trim()}
                    className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition whitespace-nowrap"
                  >
                    {isCheckingNickname ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>확인 중...</span>
                      </div>
                    ) : (
                      '중복 확인'
                    )}
                  </button>
                </div>

                {/* 중복 체크 결과 */}
                {nicknameCheckResult && (
                  <div className={`mt-2 p-3 rounded-lg flex items-center gap-2 ${
                    nicknameCheckResult.available
                      ? 'bg-green-500/10 border border-green-500/30'
                      : 'bg-red-500/10 border border-red-500/30'
                  }`}>
                    {nicknameCheckResult.available ? (
                      <>
                        <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-green-400 font-medium">{nicknameCheckResult.message}</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="text-sm text-red-400 font-medium">{nicknameCheckResult.message}</span>
                      </>
                    )}
                  </div>
                )}

                <p className="mt-2 text-xs text-slate-400">
                  한글, 영문, 숫자, 언더스코어(_), 공백 사용 가능 (2-30자)
                </p>
              </div>

              {/* 안내 사항 */}
              <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-300 mb-2">📌 닉네임 안내</h3>
                <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                  <li>닉네임은 쇼핑몰 및 HTML 내보내기에 표시됩니다</li>
                  <li>닉네임을 변경하려면 먼저 중복 확인을 클릭하세요</li>
                  <li>중복 확인 후 사용 가능한 닉네임만 저장할 수 있습니다</li>
                </ul>
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="mt-6">
              <button
                onClick={handleSaveProfileInfo}
                disabled={isSavingProfile}
                className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-3 text-white font-bold hover:from-emerald-500 hover:to-green-500 transition disabled:opacity-50"
              >
                {isSavingProfile ? '저장 중...' : '💾 저장하기'}
              </button>
            </div>
          </div>
        )}

        {/* YouTube 설정 탭 */}
        {activeTab === 'youtube' && (
          <div className="rounded-2xl border border-slate-600 bg-slate-800/50 backdrop-blur">
            {/* 헤더 */}
            <div className="p-8 border-b border-slate-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">YouTube 채널 관리</h2>
                <button
                  onClick={handleAddChannel}
                  disabled={!hasCredentials || isConnecting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center gap-2"
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

              {/* 관리자 설정 필요 경고 */}
              {!hasCredentials && (
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
                        💡 관리자는 관리자 설정 페이지에서 YouTube Credentials를 설정할 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 채널 목록 */}
            <div className="p-8">
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
                          ? 'bg-red-500/10 border-red-500/50'
                          : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {channel.thumbnailUrl && (
                          <img
                            src={channel.thumbnailUrl}
                            alt={channel.channelTitle}
                            className="w-16 h-16 rounded-full border-2 border-red-500"
                          />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-bold text-white">{channel.channelTitle}</h3>
                            {channel.isDefault && (
                              <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-semibold rounded">
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
                              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg transition"
                            >
                              기본으로 설정
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveChannel(channel.id)}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition"
                          >
                            연결 해제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 안내 */}
            <div className="p-8 border-t border-slate-700">
              <h3 className="text-lg font-semibold text-blue-400 mb-3">📖 사용 방법</h3>
              <div className="space-y-2 text-sm text-slate-300">
                <p>• <strong className="text-white">채널 추가:</strong> "채널 추가" 버튼을 클릭하여 여러 YouTube 채널을 연결할 수 있습니다.</p>
                <p>• <strong className="text-white">기본 채널:</strong> 영상 업로드 시 기본적으로 사용될 채널을 설정할 수 있습니다.</p>
                <p>• <strong className="text-white">채널 선택:</strong> 영상 업로드 시 원하는 채널을 선택하여 업로드할 수 있습니다.</p>
              </div>
            </div>
          </div>
        )}

        {/* Google Sites 설정 탭 */}
        {activeTab === 'google-sites' && (
          <div className="rounded-2xl border border-slate-600 bg-slate-800/50 p-8 backdrop-blur mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">🌐 Google Sites 연동</h2>
            <p className="text-slate-400 mb-6 text-sm">
              상품을 게시할 Google Sites 페이지 URL을 입력하세요
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  🖊️ Google Sites Edit URL (편집용)
                </label>
                <input
                  type="text"
                  value={googleSitesEditUrl}
                  onChange={(e) => setGoogleSitesEditUrl(e.target.value)}
                  placeholder="https://sites.google.com/.../edit"
                  className="w-full rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-2 text-xs text-slate-500">
                  편집 모드로 열리는 URL - 상품관리 페이지에서 "편집" 버튼으로 열립니다
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  🏠 Google Sites Home URL (실제 사이트)
                </label>
                <input
                  type="text"
                  value={googleSitesHomeUrl}
                  onChange={(e) => setGoogleSitesHomeUrl(e.target.value)}
                  placeholder="https://sites.google.com/.../home"
                  className="w-full rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-2 text-xs text-slate-500">
                  실제 사이트 홈 URL - 상품관리 페이지에서 "사이트 보기" 버튼으로 열립니다
                </p>
              </div>

              {/* 안내 사항 */}
              <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-300 mb-2">💡 사용 방법</h3>
                <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Google Sites에서 상품을 표시할 페이지를 생성하세요</li>
                  <li>페이지 URL을 위 입력창에 붙여넣으세요</li>
                  <li>상품 관리 페이지에서 퍼블리시할 상품을 선택하세요</li>
                  <li>"📄 퍼블리시된 상품 HTML 코드 생성" 버튼을 클릭하세요</li>
                  <li>생성된 HTML 코드를 복사해서 Google Sites에 붙여넣으세요</li>
                </ol>
              </div>

              {/* HTML 코드 안내 */}
              {googleSitesUrl && userId && (
                <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-purple-300 mb-2">📋 HTML 코드</h3>
                  <p className="text-xs text-slate-400 mb-2">
                    상품 관리 페이지에서 "📄 퍼블리시된 상품 HTML 코드 생성" 버튼을 클릭하여 HTML 코드를 받으세요.
                    생성된 HTML 코드를 Google Sites에 임베드하면 됩니다.
                  </p>
                  <p className="text-xs text-green-400">
                    ✅ 모든 이미지와 링크는 쿠팡 CDN을 직접 사용하여 트래픽이 발생하지 않습니다!
                  </p>
                </div>
              )}
            </div>

            {/* 저장 버튼 */}
            <div className="mt-6">
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-white font-bold hover:from-purple-500 hover:to-pink-500 transition disabled:opacity-50"
              >
                {isSaving ? '저장 중...' : '💾 설정 저장'}
              </button>
            </div>
          </div>
        )}

        {/* 비밀번호 변경 탭 */}
        {activeTab === 'password' && (
          <div className="rounded-2xl border border-slate-600 bg-slate-800/50 p-8 backdrop-blur">
            <h2 className="text-2xl font-bold text-white mb-4">🔒 비밀번호 변경</h2>
            <p className="text-slate-400 mb-6 text-sm">
              보안을 위해 주기적으로 비밀번호를 변경하세요
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  현재 비밀번호
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호를 입력하세요"
                  className="w-full rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호를 입력하세요 (최소 6자)"
                  className="w-full rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  새 비밀번호 확인
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새 비밀번호를 다시 입력하세요"
                  className="w-full rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* 비밀번호 규칙 안내 */}
              <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-300 mb-2">📌 비밀번호 규칙</h3>
                <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                  <li>최소 6자 이상</li>
                  <li>영문, 숫자, 특수문자 조합 권장</li>
                  <li>이전 비밀번호와 다르게 설정</li>
                </ul>
              </div>
            </div>

            {/* 변경 버튼 */}
            <div className="mt-6">
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
                className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 text-white font-bold hover:from-green-500 hover:to-emerald-500 transition disabled:opacity-50"
              >
                {isChangingPassword ? '변경 중...' : '🔐 비밀번호 변경'}
              </button>
            </div>
          </div>
        )}

        {/* 쿠팡 파트너스 탭 */}
        {activeTab === 'coupang' && (
          <div>
            {/* 쿠팡 서브탭 */}
            <div className="mb-6 flex gap-2">
              <button
                onClick={() => setCoupangActiveTab('partners')}
                className={`rounded-lg px-6 py-2 font-semibold transition ${
                  coupangActiveTab === 'partners'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                🔗 파트너스 링크 생성
              </button>
              <button
                onClick={() => setCoupangActiveTab('automation')}
                className={`rounded-lg px-6 py-2 font-semibold transition ${
                  coupangActiveTab === 'automation'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                🤖 쇼핑 쇼츠 자동화
              </button>
            </div>

            {/* Partners Tab */}
            {coupangActiveTab === 'partners' && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left Column - Settings & Search */}
              <div className="space-y-6 lg:col-span-2">
                {/* API Settings */}
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

                  <div className="space-y-4">
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

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        Tracking ID (파트너스 ID)
                      </label>
                      <input
                        type="text"
                        value={coupangSettings.trackingId}
                        onChange={(e) => setCoupangSettings({ ...coupangSettings, trackingId: e.target.value })}
                        placeholder="예: example_id"
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        OpenAI API Key
                      </label>
                      <input
                        type="password"
                        value={coupangSettings.openaiApiKey || ''}
                        onChange={(e) => setCoupangSettings({ ...coupangSettings, openaiApiKey: e.target.value })}
                        placeholder="sk-..."
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        쇼핑 쇼츠 자동화에 사용 (GPT-4 제품 분석 및 대본 생성)
                      </p>
                    </div>

                    <div className="flex gap-3">
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

                    {coupangSettings.lastChecked && (
                      <p className="text-xs text-slate-500">
                        마지막 확인: {new Date(coupangSettings.lastChecked).toLocaleString('ko-KR')}
                      </p>
                    )}
                  </div>
                </section>

                {/* Product Search */}
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
                    <div className="mt-4 space-y-3">
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
                            onClick={() => generateCoupangLink(product)}
                            className="self-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500"
                          >
                            🔗 링크 생성
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Right Column - Stats & Links */}
              <div className="space-y-6">
                {/* Stats Dashboard */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <h2 className="mb-4 text-xl font-bold text-white">📊 통계</h2>

                  <div className="space-y-3">
                    <div className="rounded-lg bg-white/5 p-4">
                      <p className="text-sm text-slate-400">총 링크 수</p>
                      <p className="mt-1 text-2xl font-bold text-white">{stats.totalLinks}</p>
                    </div>

                    <div className="rounded-lg bg-white/5 p-4">
                      <p className="text-sm text-slate-400">총 클릭 수</p>
                      <p className="mt-1 text-2xl font-bold text-purple-400">{stats.totalClicks}</p>
                    </div>

                    <div className="rounded-lg bg-white/5 p-4">
                      <p className="text-sm text-slate-400">예상 수익</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-400">
                        ₩{stats.estimatedRevenue.toLocaleString()}
                      </p>
                    </div>

                    <div className="rounded-lg bg-white/5 p-4">
                      <p className="text-sm text-slate-400">전환율</p>
                      <p className="mt-1 text-2xl font-bold text-blue-400">{stats.conversionRate}%</p>
                    </div>
                  </div>
                </section>

                {/* Generated Links */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <h2 className="mb-4 text-xl font-bold text-white">🔗 생성된 링크</h2>

                  {generatedLinks.length === 0 ? (
                    <p className="text-center text-sm text-slate-500">
                      아직 생성된 링크가 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {generatedLinks.slice(0, 5).map((link) => (
                        <div
                          key={link.id}
                          className="rounded-lg border border-white/10 bg-white/5 p-3"
                        >
                          <p className="text-sm font-semibold text-white">{link.productName}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              value={link.shortUrl}
                              readOnly
                              className="flex-1 rounded bg-white/5 px-2 py-1 text-xs text-slate-300"
                            />
                            <button
                              onClick={() => copyToClipboard(link.shortUrl)}
                              className="rounded bg-purple-600 px-2 py-1 text-xs font-semibold text-white hover:bg-purple-500"
                            >
                              복사
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            클릭: {link.clicks} | {new Date(link.createdAt).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
            )}

            {/* Automation Tab */}
            {coupangActiveTab === 'automation' && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left Column - Pipeline Configuration */}
              <div className="space-y-6 lg:col-span-2">
                {/* Pipeline Info */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <h2 className="mb-4 text-xl font-bold text-white">🎬 쿠팡 → Douyin 쇼츠 자동화</h2>
                  <div className="rounded-lg bg-blue-500/20 p-4">
                    <p className="text-sm font-semibold text-blue-300">자동화 프로세스 (새 파이프라인):</p>
                    <ol className="mt-2 space-y-1 text-sm text-blue-200">
                      <li>1. 🛒 쿠팡 베스트셀러 상품 가져오기</li>
                      <li>2. 🔤 상품명 → 중국어 키워드 번역 (GPT-4)</li>
                      <li>3. 🔍 Douyin에서 중국어 키워드로 영상 검색</li>
                      <li>4. 📥 영상 다운로드 (워터마크 없는 영상)</li>
                      <li>5. 🔊 한국어 TTS 음성 생성 (예정)</li>
                      <li>6. 📝 자막 + 쿠팡링크 합성 (예정)</li>
                      <li>7. ⬆️ YouTube/Instagram/TikTok 업로드 (예정)</li>
                    </ol>
                  </div>
                  <div className="mt-3 rounded-lg bg-emerald-500/20 p-3 text-xs text-emerald-300">
                    💡 베스트 전략: 한국에서 잘 팔리는 상품 → 중국 영상 찾기 → 한국어로 재편집
                  </div>
                </section>

                {/* Configuration Form */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <h2 className="mb-4 text-xl font-bold text-white">⚙️ 파이프라인 설정</h2>

                  {coupangSettings.openaiApiKey && (
                    <div className="mb-4 rounded-lg bg-emerald-500/20 p-3 text-sm text-emerald-300">
                      ✅ OpenAI API 키 설정됨 - 전체 파이프라인 (AI 분석 포함) 실행 가능
                    </div>
                  )}

                  {!coupangSettings.openaiApiKey && (
                    <div className="mb-4 rounded-lg bg-blue-500/20 p-3 text-sm text-blue-300">
                      ℹ️ OpenAI 미설정 - 크롤링/다운로드만 테스트됩니다 (Step 1-2)
                      <br />
                      AI 분석/대본 생성은 "파트너스 링크 생성" 탭에서 OpenAI API 키 설정 필요 (Step 3, 5)
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        상품 개수 (Product Limit)
                      </label>
                      <input
                        type="number"
                        value={productLimit}
                        onChange={(e) => setProductLimit(parseInt(e.target.value) || 3)}
                        min="1"
                        max="10"
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        쿠팡에서 가져올 베스트셀러 상품 개수 (1-10)
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        상품당 영상 개수 (Videos Per Product)
                      </label>
                      <input
                        type="number"
                        value={videosPerProduct}
                        onChange={(e) => setVideosPerProduct(parseInt(e.target.value) || 2)}
                        min="1"
                        max="5"
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        각 상품당 Douyin에서 검색할 영상 개수 (1-5)
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        카테고리 (Category)
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white focus:border-purple-500 focus:outline-none [&>option]:bg-slate-800 [&>option]:text-white [&>optgroup]:bg-slate-900 [&>optgroup]:text-slate-300"
                      >
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
                        <optgroup label="디지털/IT" className="bg-slate-900 text-slate-300">
                          <option value="computers" className="bg-slate-800 text-white">💻 컴퓨터/노트북</option>
                          <option value="mobile" className="bg-slate-800 text-white">📱 핸드폰/액세서리</option>
                          <option value="camera" className="bg-slate-800 text-white">📷 카메라/영상장비</option>
                          <option value="gaming" className="bg-slate-800 text-white">🎮 게임/콘솔</option>
                          <option value="smartdevice" className="bg-slate-800 text-white">⌚ 스마트기기/웨어러블</option>
                        </optgroup>
                        <optgroup label="가정/생활" className="bg-slate-900 text-slate-300">
                          <option value="appliances" className="bg-slate-800 text-white">🔌 가전제품</option>
                          <option value="furniture" className="bg-slate-800 text-white">🛋️ 가구</option>
                          <option value="bedding" className="bg-slate-800 text-white">🛏️ 침구/홈패브릭</option>
                          <option value="storage" className="bg-slate-800 text-white">📦 수납/정리용품</option>
                          <option value="cleaning" className="bg-slate-800 text-white">🧹 청소/생활용품</option>
                        </optgroup>
                        <optgroup label="취미/레저" className="bg-slate-900 text-slate-300">
                          <option value="travel" className="bg-slate-800 text-white">✈️ 여행/레저용품</option>
                          <option value="camping" className="bg-slate-800 text-white">⛺ 캠핑/등산</option>
                          <option value="fishing" className="bg-slate-800 text-white">🎣 낚시</option>
                          <option value="bicycle" className="bg-slate-800 text-white">🚴 자전거</option>
                          <option value="musical" className="bg-slate-800 text-white">🎸 악기</option>
                        </optgroup>
                        <optgroup label="기타" className="bg-slate-900 text-slate-300">
                          <option value="automotive" className="bg-slate-800 text-white">🚗 자동차용품</option>
                          <option value="tools" className="bg-slate-800 text-white">🔧 공구/DIY</option>
                          <option value="stationery" className="bg-slate-800 text-white">✏️ 문구/사무용품</option>
                          <option value="books" className="bg-slate-800 text-white">📚 도서</option>
                          <option value="garden" className="bg-slate-800 text-white">🌱 원예/가드닝</option>
                        </optgroup>
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        쿠팡 베스트셀러 카테고리 선택
                      </p>
                    </div>

                    {!coupangSettings.isConnected && (
                      <div className="rounded-lg bg-blue-500/20 p-3 text-sm text-blue-300">
                        ℹ️ 쿠팡 API 미연결 - 프론트엔드 API로 자동 조회합니다
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={startShoppingShortsPipeline}
                        disabled={isRunningPipeline}
                        className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 font-bold text-white transition hover:from-purple-500 hover:to-pink-500 disabled:opacity-50"
                      >
                        {isRunningPipeline ? '⏳ 실행 중...' : '🚀 파이프라인 시작'}
                      </button>
                      {isRunningPipeline && (
                        <button
                          onClick={stopShoppingShortsPipeline}
                          className="rounded-lg bg-red-600 px-6 py-3 font-bold text-white transition hover:bg-red-500"
                        >
                          ⏹️ 중지
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {/* Douyin Direct Download */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <h2 className="mb-4 text-xl font-bold text-white">🎬 영상 크롤링 (Douyin URL)</h2>

                  <div className="mb-4 rounded-lg bg-blue-500/20 p-3 text-sm text-blue-300">
                    💡 Douyin 링크를 입력하면 워터마크 없는 고화질 영상을 다운로드합니다
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-300">
                        Douyin Video URL
                      </label>
                      <input
                        type="text"
                        value={douyinUrl}
                        onChange={(e) => setDouyinUrl(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && downloadDouyinVideo()}
                        placeholder="https://www.douyin.com/video/..."
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Douyin 영상 링크를 붙여넣으세요
                      </p>
                    </div>

                    <button
                      onClick={downloadDouyinVideo}
                      disabled={isDownloading || !douyinUrl.trim()}
                      className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3 font-bold text-white transition hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50"
                    >
                      {isDownloading ? '⏳ 다운로드 중...' : '📥 영상 다운로드'}
                    </button>

                    {downloadedVideo && (
                      <div className="rounded-lg bg-emerald-500/20 p-4">
                        <p className="text-sm font-semibold text-emerald-300">✅ 다운로드 완료</p>
                        <p className="mt-1 text-xs text-emerald-200 break-all">{downloadedVideo}</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Task Progress */}
                {currentTask && (
                  <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-xl font-bold text-white">📊 실행 상태</h2>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        currentTask.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                        currentTask.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {currentTask.status === 'running' ? '⏳ 실행 중' :
                         currentTask.status === 'completed' ? '✅ 완료' : '❌ 실패'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-slate-400">진행 상황</p>
                        <p className="mt-1 font-semibold text-white">{currentTask.progress}</p>
                      </div>

                      <div>
                        <p className="text-sm text-slate-400">시작 시간</p>
                        <p className="mt-1 text-sm text-slate-300">
                          {new Date(currentTask.startTime).toLocaleString('ko-KR')}
                        </p>
                      </div>

                      {currentTask.endTime && (
                        <div>
                          <p className="text-sm text-slate-400">종료 시간</p>
                          <p className="mt-1 text-sm text-slate-300">
                            {new Date(currentTask.endTime).toLocaleString('ko-KR')}
                          </p>
                        </div>
                      )}

                      {currentTask.error && (
                        <div className="rounded-lg bg-red-500/20 p-3">
                          <p className="text-sm font-semibold text-red-300">오류:</p>
                          <p className="mt-1 text-sm text-red-200">{currentTask.error}</p>
                        </div>
                      )}

                      {/* Logs */}
                      {currentTask.logs.length > 0 && (
                        <div>
                          <p className="mb-2 text-sm font-semibold text-slate-400">실행 로그 (최근 50개)</p>
                          <div className="max-h-96 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-xs text-slate-300">
                            {currentTask.logs.slice(-50).map((log, idx) => (
                              <div key={idx} className="mb-1 whitespace-pre-wrap break-words">{log}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Results */}
                {currentTask?.results && currentTask.results.length > 0 && (
                  <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                    <h2 className="mb-4 text-xl font-bold text-white">✅ 처리 결과 ({currentTask.results.length}개)</h2>

                    <div className="space-y-3">
                      {currentTask.results.map((result: any, idx: number) => (
                        <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-white">
                                {result.product_info?.product_name_ko || result.douyin_video?.title?.substring(0, 50)}
                              </h3>
                              {result.coupang_product && (
                                <div className="mt-2 text-sm">
                                  <p className="text-slate-300">
                                    쿠팡 제품: {result.coupang_product.product_name?.substring(0, 50)}...
                                  </p>
                                  <p className="text-emerald-400">
                                    가격: {result.coupang_product.product_price?.toLocaleString()}원
                                  </p>
                                  {result.coupang_product.affiliate_link && (
                                    <button
                                      onClick={() => copyToClipboard(result.coupang_product.affiliate_link)}
                                      className="mt-2 rounded bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-500"
                                    >
                                      링크 복사
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className={`ml-2 rounded-full px-2 py-1 text-xs font-semibold ${
                              result.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {result.success ? '✓' : '✗'}
                            </span>
                          </div>

                          {result.error && (
                            <p className="mt-2 text-xs text-red-400">{result.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Right Column - Quick Stats */}
              <div className="space-y-6">
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <h2 className="mb-4 text-xl font-bold text-white">📈 통계</h2>

                  <div className="space-y-3">
                    <div className="rounded-lg bg-white/5 p-4">
                      <p className="text-sm text-slate-400">현재 상태</p>
                      <p className="mt-1 text-lg font-bold text-white">
                        {isRunningPipeline ? '⏳ 실행 중' : '⏸️ 대기'}
                      </p>
                    </div>

                    {currentTask?.results && (
                      <>
                        <div className="rounded-lg bg-white/5 p-4">
                          <p className="text-sm text-slate-400">처리된 영상</p>
                          <p className="mt-1 text-2xl font-bold text-purple-400">
                            {currentTask.results.length}개
                          </p>
                        </div>

                        <div className="rounded-lg bg-white/5 p-4">
                          <p className="text-sm text-slate-400">성공률</p>
                          <p className="mt-1 text-2xl font-bold text-emerald-400">
                            {Math.round((currentTask.results.filter((r: any) => r.success).length / currentTask.results.length) * 100)}%
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </section>

                <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <h2 className="mb-4 text-xl font-bold text-white">💡 팁</h2>

                  <div className="space-y-2 text-sm text-slate-300">
                    <p>• 파이프라인은 백그라운드에서 실행됩니다</p>
                    <p>• 처리 시간은 영상 개수에 따라 다릅니다</p>
                    <p>• 결과는 자동으로 저장됩니다</p>
                    <p>• OpenAI API 사용량에 유의하세요</p>
                  </div>
                </section>
              </div>
            </div>
            )}
          </div>
        )}

        {/* 소셜미디어 설정 탭 */}
        {activeTab === 'social-media' && (
          <div>
            {/* 소셜미디어 서브탭 */}
            <div className="mb-6 flex gap-2">
              <button
                onClick={() => setSocialMediaTab('tiktok')}
                className={`rounded-lg px-6 py-2 font-semibold transition ${
                  socialMediaTab === 'tiktok'
                    ? 'bg-pink-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                📱 TikTok
              </button>
              <button
                onClick={() => setSocialMediaTab('instagram')}
                className={`rounded-lg px-6 py-2 font-semibold transition ${
                  socialMediaTab === 'instagram'
                    ? 'bg-pink-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                📷 Instagram
              </button>
              <button
                onClick={() => setSocialMediaTab('facebook')}
                className={`rounded-lg px-6 py-2 font-semibold transition ${
                  socialMediaTab === 'facebook'
                    ? 'bg-pink-600 text-white'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                📘 Facebook
              </button>
            </div>

            {/* TikTok Tab */}
            {socialMediaTab === 'tiktok' && (
              <div className="rounded-2xl border border-slate-600 bg-slate-800/50 backdrop-blur">
                <div className="p-8 border-b border-slate-700">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white">TikTok 계정 관리</h2>
                    <button
                      onClick={() => handleConnectSocialMedia('tiktok')}
                      disabled={isConnectingSocialMedia}
                      className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center gap-2"
                    >
                      {isConnectingSocialMedia ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>연결 중...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                          </svg>
                          <span>계정 추가</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-8">
                  {socialMediaAccounts.tiktok.length === 0 ? (
                    <div className="text-center py-12 bg-slate-900/50 rounded-lg border border-slate-700">
                      <svg className="w-16 h-16 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <p className="text-lg text-slate-300 mb-2">연결된 TikTok 계정이 없습니다</p>
                      <p className="text-sm text-slate-400">위의 "계정 추가" 버튼을 클릭하여 TikTok 계정을 연결하세요</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {socialMediaAccounts.tiktok.map((account) => (
                        <div
                          key={account.id}
                          className="p-6 rounded-lg border bg-slate-900/50 border-slate-700 hover:border-slate-600 transition"
                        >
                          <div className="flex items-start gap-4">
                            {account.profilePicture && (
                              <img
                                src={account.profilePicture}
                                alt={account.username}
                                className="w-16 h-16 rounded-full border-2 border-pink-500"
                              />
                            )}
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-white">{account.displayName}</h3>
                              <p className="text-sm text-slate-400 mb-2">@{account.username}</p>
                              {account.followerCount && (
                                <p className="text-sm text-slate-300">
                                  팔로워 {account.followerCount.toLocaleString()}명
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveSocialMedia('tiktok', account.id)}
                              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition"
                            >
                              연결 해제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-8 border-t border-slate-700">
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">📖 사용 방법</h3>
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>• <strong className="text-white">계정 추가:</strong> "계정 추가" 버튼을 클릭하여 TikTok 계정을 연결할 수 있습니다.</p>
                    <p>• <strong className="text-white">비디오 업로드:</strong> 내 콘텐츠 페이지에서 비디오를 TikTok으로 퍼블리시할 수 있습니다.</p>
                    <p>• <strong className="text-white">자동 퍼블리시:</strong> 비디오 생성 시 자동으로 TikTok에 업로드할 수 있습니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Instagram Tab */}
            {socialMediaTab === 'instagram' && (
              <div className="rounded-2xl border border-slate-600 bg-slate-800/50 backdrop-blur">
                <div className="p-8 border-b border-slate-700">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white">Instagram 계정 관리</h2>
                    <button
                      onClick={() => handleConnectSocialMedia('instagram')}
                      disabled={isConnectingSocialMedia}
                      className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center gap-2"
                    >
                      {isConnectingSocialMedia ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>연결 중...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                          </svg>
                          <span>계정 추가</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-8">
                  {socialMediaAccounts.instagram.length === 0 ? (
                    <div className="text-center py-12 bg-slate-900/50 rounded-lg border border-slate-700">
                      <svg className="w-16 h-16 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <p className="text-lg text-slate-300 mb-2">연결된 Instagram 계정이 없습니다</p>
                      <p className="text-sm text-slate-400">위의 "계정 추가" 버튼을 클릭하여 Instagram 계정을 연결하세요</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {socialMediaAccounts.instagram.map((account) => (
                        <div
                          key={account.id}
                          className="p-6 rounded-lg border bg-slate-900/50 border-slate-700 hover:border-slate-600 transition"
                        >
                          <div className="flex items-start gap-4">
                            {account.profilePicture && (
                              <img
                                src={account.profilePicture}
                                alt={account.username}
                                className="w-16 h-16 rounded-full border-2 border-pink-500"
                              />
                            )}
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-white">{account.displayName}</h3>
                              <p className="text-sm text-slate-400 mb-2">@{account.username}</p>
                              {account.followerCount && (
                                <p className="text-sm text-slate-300">
                                  팔로워 {account.followerCount.toLocaleString()}명
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveSocialMedia('instagram', account.id)}
                              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition"
                            >
                              연결 해제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-8 border-t border-slate-700">
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">📖 사용 방법</h3>
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>• <strong className="text-white">계정 추가:</strong> "계정 추가" 버튼을 클릭하여 Instagram 계정을 연결할 수 있습니다.</p>
                    <p>• <strong className="text-white">릴스 업로드:</strong> 내 콘텐츠 페이지에서 비디오를 Instagram 릴스로 퍼블리시할 수 있습니다.</p>
                    <p>• <strong className="text-white">자동 퍼블리시:</strong> 비디오 생성 시 자동으로 Instagram에 업로드할 수 있습니다.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Facebook Tab */}
            {socialMediaTab === 'facebook' && (
              <div className="rounded-2xl border border-slate-600 bg-slate-800/50 backdrop-blur">
                <div className="p-8 border-b border-slate-700">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white">Facebook 계정 관리</h2>
                    <button
                      onClick={() => handleConnectSocialMedia('facebook')}
                      disabled={isConnectingSocialMedia}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition flex items-center gap-2"
                    >
                      {isConnectingSocialMedia ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>연결 중...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                          </svg>
                          <span>계정 추가</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-8">
                  {socialMediaAccounts.facebook.length === 0 ? (
                    <div className="text-center py-12 bg-slate-900/50 rounded-lg border border-slate-700">
                      <svg className="w-16 h-16 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <p className="text-lg text-slate-300 mb-2">연결된 Facebook 계정이 없습니다</p>
                      <p className="text-sm text-slate-400">위의 "계정 추가" 버튼을 클릭하여 Facebook 페이지를 연결하세요</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {socialMediaAccounts.facebook.map((account) => (
                        <div
                          key={account.id}
                          className="p-6 rounded-lg border bg-slate-900/50 border-slate-700 hover:border-slate-600 transition"
                        >
                          <div className="flex items-start gap-4">
                            {account.profilePicture && (
                              <img
                                src={account.profilePicture}
                                alt={account.name}
                                className="w-16 h-16 rounded-full border-2 border-blue-500"
                              />
                            )}
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-white">{account.name}</h3>
                              <p className="text-sm text-slate-400 mb-2">{account.category}</p>
                              {account.followerCount && (
                                <p className="text-sm text-slate-300">
                                  팔로워 {account.followerCount.toLocaleString()}명
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveSocialMedia('facebook', account.id)}
                              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition"
                            >
                              연결 해제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-8 border-t border-slate-700">
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">📖 사용 방법</h3>
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>• <strong className="text-white">페이지 추가:</strong> "계정 추가" 버튼을 클릭하여 Facebook 페이지를 연결할 수 있습니다.</p>
                    <p>• <strong className="text-white">비디오 업로드:</strong> 내 콘텐츠 페이지에서 비디오를 Facebook으로 퍼블리시할 수 있습니다.</p>
                    <p>• <strong className="text-white">자동 퍼블리시:</strong> 비디오 생성 시 자동으로 Facebook에 업로드할 수 있습니다.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 돌아가기 버튼 */}
        <div className="text-center mt-8">
          <button
            onClick={() => router.push('/my-content')}
            className="text-slate-400 hover:text-white transition"
          >
            ← 내 콘텐츠로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
