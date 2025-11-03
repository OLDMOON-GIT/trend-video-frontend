'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function YouTubeSettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [channel, setChannel] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    checkAuth();

    // URL에 success 파라미터가 있으면 (OAuth 리디렉션 후) 연결 완료 토스트 표시
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      toast.success('YouTube 채널 연결이 완료되었습니다!');
      // URL 파라미터 제거
      window.history.replaceState({}, '', '/settings/youtube');
    }

    // 페이지가 포커스될 때마다 인증 상태 재확인 (OAuth 완료 후 돌아왔을 때)
    const handleFocus = () => {
      checkAuth();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/youtube/auth', { credentials: 'include' });
      const data = await res.json();

      setIsAuthenticated(data.authenticated || false);
      setHasCredentials(data.hasCredentials || false);
      setChannel(data.channel || null);
    } catch (error) {
      console.error('YouTube 인증 상태 확인 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!hasCredentials) {
      toast.error('관리자가 YouTube API Credentials를 설정하지 않았습니다. 관리자에게 문의하세요.');
      return;
    }

    try {
      setIsConnecting(true);
      toast.loading('YouTube 채널 연결 중...', { id: 'auth' });

      const res = await fetch('/api/youtube/auth', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('YouTube 채널 연결 성공!', { id: 'auth' });
        await checkAuth();
      } else {
        throw new Error(data.error || '연결 실패');
      }
    } catch (error: any) {
      console.error('YouTube 채널 연결 실패:', error);
      toast.error(`연결 실패: ${error.message}`, { id: 'auth' });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('정말로 YouTube 채널 연결을 해제하시겠습니까?')) {
      return;
    }

    try {
      toast.loading('연결 해제 중...', { id: 'disconnect' });
      const res = await fetch('/api/youtube/auth', {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('YouTube 연결 해제 완료', { id: 'disconnect' });
        setIsAuthenticated(false);
        setChannel(null);
      } else {
        throw new Error(data.error || '연결 해제 실패');
      }
    } catch (error: any) {
      console.error('연결 해제 실패:', error);
      toast.error(`연결 해제 실패: ${error.message}`, { id: 'disconnect' });
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
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <a href="/my-content?tab=settings" className="text-slate-400 hover:text-slate-300 transition-colors">
              ← 설정
            </a>
            <div className="text-2xl">|</div>
            <h1 className="text-3xl font-bold text-white">YouTube 채널 연결</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 overflow-hidden">

          {/* 관리자 설정 필요 경고 */}
          {!hasCredentials && (
            <div className="p-8 border-b border-slate-700">
              <div className="p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h3 className="text-lg font-bold text-yellow-400 mb-2">관리자 설정 필요</h3>
                    <p className="text-yellow-300/90 text-sm">
                      YouTube API Credentials가 설정되지 않았습니다.<br />
                      관리자에게 문의하여 공통 Credentials를 설정해야 YouTube 채널 연결이 가능합니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 연결 상태 */}
          <div className="p-8 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">연결 상태</h2>

            {isAuthenticated && channel ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-green-400 font-semibold">연결됨</span>
                </div>

                <div className="p-6 bg-slate-900/50 rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    {channel.thumbnail_url && (
                      <img
                        src={channel.thumbnail_url}
                        alt={channel.title}
                        className="w-16 h-16 rounded-full border-2 border-purple-500"
                      />
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-white">{channel.title}</h3>
                      <p className="text-sm text-slate-400">
                        구독자 {channel.subscriber_count?.toLocaleString() || '0'}명
                      </p>
                    </div>
                  </div>
                  {channel.description && (
                    <p className="text-sm text-slate-300 mt-2">{channel.description}</p>
                  )}
                </div>

                <button
                  onClick={handleDisconnect}
                  className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  YouTube 연결 해제
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg">
                  <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                  <span className="text-slate-300">연결되지 않음</span>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={!hasCredentials || isConnecting}
                  className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isConnecting ? (
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
              </div>
            )}
          </div>

          {/* 안내 */}
          <div className="p-8">
            <h2 className="text-xl font-bold text-white mb-4">📖 사용 방법</h2>
            <div className="space-y-3 text-sm text-slate-300">
              <p>1. <strong className="text-white">"YouTube 채널 연결"</strong> 버튼을 클릭하세요.</p>
              <p>2. Google 계정으로 로그인하고 YouTube 채널 접근 권한을 부여하세요.</p>
              <p>3. 연결이 완료되면 이 계정으로 비디오를 업로드할 수 있습니다.</p>
              <p className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <strong className="text-blue-300">💡 참고:</strong> YouTube API Credentials는 관리자가 설정합니다.
                각 사용자는 개인 YouTube 채널을 연결하여 사용합니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
