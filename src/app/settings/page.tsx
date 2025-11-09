'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'youtube' | 'google-sites' | 'password' | 'profile'>('profile');

  // 공통
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Google Sites 설정
  const [isSaving, setIsSaving] = useState(false);
  const [googleSitesUrl, setGoogleSitesUrl] = useState('');
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

  useEffect(() => {
    // URL 파라미터에서 탭 읽기
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'youtube' || tab === 'google-sites' || tab === 'password' || tab === 'profile') {
      setActiveTab(tab);
    }

    // success 파라미터 처리 (YouTube OAuth 리다이렉트 후)
    if (params.get('success') === 'true') {
      toast.success('YouTube 채널 연결이 완료되었습니다!');
      // URL 파라미터 제거
      window.history.replaceState({}, '', '/settings?tab=youtube');
    }

    loadAllSettings();
  }, []);

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
        setNickname(sitesData.nickname || '');
        setProfileNickname(sitesData.nickname || '');
      } else if (sitesRes.status === 401) {
        router.push('/auth');
        return;
      }

      // YouTube 다중 채널 로드
      const youtubeRes = await fetch('/api/youtube/channels', { credentials: 'include' });
      const youtubeData = await youtubeRes.json();

      setChannels(youtubeData.channels || []);
      setHasCredentials(youtubeData.hasCredentials || false);
    } catch (error) {
      console.error('설정 로드 실패:', error);
      toast.error('설정 로드 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Google Sites 설정 저장
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleSitesUrl, nickname })
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

      // OAuth URL 생성
      const res = await fetch('/api/youtube/oauth-start', {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success && data.authUrl) {
        toast.success('Google 로그인 페이지로 이동합니다...', { id: 'youtube-auth' });
        // OAuth URL로 리다이렉트
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
    // 유효성 검사
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

    // 닉네임 변경 시 중복 체크 확인
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

      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">⚙️ 설정</h1>
          <p className="text-slate-400">
            YouTube 채널, 쿠팡 쇼핑몰, 비밀번호 설정을 관리하세요
          </p>
        </div>

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
                      setNicknameCheckResult(null); // 입력 시 중복 체크 결과 초기화
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
                  별명 (선택)
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={30}
                  placeholder="살림남"
                  className="w-full rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">쇼핑몰/HTML 내보내기에 표시될 이름입니다. 미입력 시 이메일이 사용됩니다.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Google Sites 페이지 URL
                </label>
                <input
                  type="text"
                  value={googleSitesUrl}
                  onChange={(e) => setGoogleSitesUrl(e.target.value)}
                  placeholder="https://sites.google.com/..."
                  className="w-full rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:outline-none"
                />
                <p className="mt-2 text-xs text-slate-500">
                  예: https://sites.google.com/d/1wdaBjcpjaM0WhdQOhG-ATzJ_Dx83ytH_/p/10Ms4qn7y-fscezanBmegRpWuro_iYjoX/edit
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
