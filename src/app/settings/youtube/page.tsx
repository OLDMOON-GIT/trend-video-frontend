'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

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

export default function YouTubeSettingsPage() {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [channel, setChannel] = useState<YouTubeChannel | null>(null);

  // 초기 데이터 로드
  useEffect(() => {
    loadAuthStatus();
  }, []);

  const loadAuthStatus = async () => {
    try {
      setIsInitialLoading(true);
      const res = await fetch('/api/youtube/auth');
      const data = await res.json();

      if (data.authenticated) {
        setAuthenticated(true);
        setChannel(data.channel || null);
      } else {
        setAuthenticated(false);
        setChannel(null);
      }
    } catch (error) {
      console.error('YouTube 인증 상태 확인 실패:', error);
      toast.error('YouTube 인증 상태 확인 실패');
    } finally {
      setIsInitialLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setIsAuthenticating(true);
      toast.loading('YouTube 연결 중...', { id: 'auth' });

      const res = await fetch('/api/youtube/auth', {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('YouTube 채널 연결 성공!', { id: 'auth' });
        await loadAuthStatus();
      } else {
        throw new Error(data.error || '연결 실패');
      }
    } catch (error: any) {
      console.error('YouTube 연결 실패:', error);
      toast.error(`YouTube 연결 실패: ${error.message}`, { id: 'auth' });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('YouTube 채널 연결을 해제하시겠습니까?')) {
      return;
    }

    try {
      setIsDisconnecting(true);
      toast.loading('YouTube 연결 해제 중...', { id: 'disconnect' });

      const res = await fetch('/api/youtube/auth', {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        toast.success('YouTube 연결 해제 완료', { id: 'disconnect' });
        setAuthenticated(false);
        setChannel(null);
      } else {
        throw new Error(data.error || '연결 해제 실패');
      }
    } catch (error: any) {
      console.error('YouTube 연결 해제 실패:', error);
      toast.error(`연결 해제 실패: ${error.message}`, { id: 'disconnect' });
    } finally {
      setIsDisconnecting(false);
    }
  };

  // 로딩 스피너
  if (isInitialLoading) {
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
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              ← 홈으로
            </a>
            <div className="text-2xl">|</div>
            <h1 className="text-3xl font-bold text-white">YouTube 설정</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 overflow-hidden">

          {/* 연결 상태 */}
          <div className="p-8 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">채널 연결 상태</h2>

            {!authenticated ? (
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

                <p className="text-sm text-slate-400">
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
                        <div className="flex gap-6 text-sm">
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

          {/* 업로드 기본 설정 */}
          <div className="p-8">
            <h2 className="text-xl font-bold text-white mb-4">업로드 기본 설정</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  기본 공개 설정
                </label>
                <select
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  defaultValue="unlisted"
                >
                  <option value="public">공개</option>
                  <option value="unlisted">일부 공개 (링크가 있는 사람만)</option>
                  <option value="private">비공개</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  기본 카테고리
                </label>
                <select
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  defaultValue="27"
                >
                  <option value="27">교육</option>
                  <option value="22">브이로그</option>
                  <option value="24">엔터테인먼트</option>
                  <option value="28">과학과 기술</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  기본 태그 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  placeholder="AI, 숏폼, 자동화"
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-400">
                💡 팁: 비디오 업로드 시 이 설정을 기본값으로 사용하며, 각 업로드마다 개별 수정할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
