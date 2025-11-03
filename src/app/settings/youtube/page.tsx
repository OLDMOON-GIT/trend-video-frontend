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
  const [hasCredentials, setHasCredentials] = useState(false);
  const [isUploadingCredentials, setIsUploadingCredentials] = useState(false);

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

      // Credentials 파일 존재 여부 확인
      setHasCredentials(data.hasCredentials || false);
    } catch (error) {
      console.error('YouTube 인증 상태 확인 실패:', error);
      toast.error('YouTube 인증 상태 확인 실패');
    } finally {
      setIsInitialLoading(false);
    }
  };

  const handleUploadCredentials = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // JSON 파일 검증
    if (!file.name.endsWith('.json')) {
      toast.error('JSON 파일만 업로드 가능합니다');
      return;
    }

    try {
      setIsUploadingCredentials(true);
      toast.loading('Credentials 파일 업로드 중...', { id: 'upload' });

      const formData = new FormData();
      formData.append('credentials', file);

      const res = await fetch('/api/youtube/credentials', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Credentials 파일 업로드 완료!', { id: 'upload' });
        setHasCredentials(true);
      } else {
        throw new Error(data.error || '업로드 실패');
      }
    } catch (error: any) {
      console.error('Credentials 업로드 실패:', error);
      toast.error(`업로드 실패: ${error.message}`, { id: 'upload' });
    } finally {
      setIsUploadingCredentials(false);
      // 파일 input 초기화
      e.target.value = '';
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
        // 상세 에러 정보 표시
        let errorMessage = data.error || '연결 실패';
        if (data.details) {
          errorMessage += '\n\n' + data.details;
        }
        if (data.setupGuide) {
          errorMessage += '\n\n자세한 설정 방법: ' + data.setupGuide;
        }
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('YouTube 연결 실패:', error);
      toast.error(`YouTube 연결 실패: ${error.message}`, {
        id: 'auth',
        duration: 10000 // 10초 동안 표시
      });
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
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg">
                  <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                  <span className="text-slate-300">연결되지 않음</span>
                </div>

                {/* Credentials 업로드 섹션 */}
                {!hasCredentials && (
                  <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg">
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      1단계: Credentials 파일 업로드
                    </h3>

                    <p className="text-sm text-slate-300 mb-4">
                      먼저 Google Cloud Console에서 다운로드한 OAuth 2.0 클라이언트 credentials JSON 파일을 업로드하세요.
                    </p>

                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-purple-500/50 border-dashed rounded-lg cursor-pointer bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-10 h-10 mb-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="mb-2 text-sm text-slate-300">
                          <span className="font-semibold">클릭하여 파일 선택</span> 또는 드래그 앤 드롭
                        </p>
                        <p className="text-xs text-slate-400">JSON 파일만 가능</p>
                      </div>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleUploadCredentials}
                        disabled={isUploadingCredentials}
                        className="hidden"
                      />
                    </label>

                    {isUploadingCredentials && (
                      <div className="mt-3 flex items-center justify-center gap-2 text-sm text-purple-400">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>
                        <span>업로드 중...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Credentials 업로드 완료 */}
                {hasCredentials && (
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-semibold">Credentials 파일이 설정되었습니다</span>
                    </div>
                    <p className="text-sm text-slate-300">
                      이제 아래 버튼을 클릭하여 YouTube 채널을 연결할 수 있습니다.
                    </p>
                  </div>
                )}

                {/* 설정 플로우 안내 */}
                <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    YouTube API 설정 방법
                  </h3>

                  <div className="space-y-4">
                    {/* Step 1 */}
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        1
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white mb-1">Google Cloud Console 접속</h4>
                        <p className="text-sm text-slate-300 mb-2">
                          Google Cloud Console에서 프로젝트를 생성하고 YouTube Data API v3를 활성화하세요.
                        </p>
                        <a
                          href="https://console.cloud.google.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Google Cloud Console 열기
                        </a>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        2
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white mb-1">OAuth 2.0 클라이언트 ID 생성</h4>
                        <p className="text-sm text-slate-300 mb-2">
                          <span className="font-semibold text-blue-400">API 및 서비스 → 사용자 인증 정보</span>에서
                          OAuth 클라이언트 ID를 생성하세요.
                        </p>
                        <ul className="text-sm text-slate-400 space-y-1 ml-4">
                          <li>• 애플리케이션 유형: <span className="text-white font-semibold">데스크톱 앱</span></li>
                          <li>• OAuth 동의 화면에서 범위 추가:
                            <div className="ml-4 mt-1">
                              <code className="text-xs bg-slate-800 px-2 py-1 rounded">youtube.upload</code>
                              <code className="text-xs bg-slate-800 px-2 py-1 rounded ml-2">youtube.force-ssl</code>
                            </div>
                          </li>
                        </ul>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        3
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white mb-1">JSON 파일 다운로드 및 저장</h4>
                        <p className="text-sm text-slate-300 mb-2">
                          생성한 OAuth 클라이언트 ID에서 <span className="text-blue-400 font-semibold">JSON 다운로드</span> 후
                          아래 경로에 저장하세요:
                        </p>
                        <div className="bg-slate-900 rounded-lg p-3 font-mono text-sm text-green-400 border border-slate-700">
                          trend-video-backend/config/youtube_client_secret.json
                        </div>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        4
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-white mb-1">페이지 새로고침 후 연결</h4>
                        <p className="text-sm text-slate-300">
                          파일 저장 후 이 페이지를 새로고침하고 아래 <span className="text-red-400 font-semibold">"YouTube 채널 연결"</span> 버튼을 클릭하세요.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 자세한 가이드 링크 */}
                  <div className="mt-4 pt-4 border-t border-blue-500/20">
                    <p className="text-xs text-slate-400 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      자세한 단계별 가이드:
                      <code className="px-2 py-0.5 bg-slate-800 rounded">trend-video-backend/YOUTUBE_SETUP.md</code>
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={isAuthenticating || !hasCredentials}
                  className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  title={!hasCredentials ? 'Credentials 파일을 먼저 업로드하세요' : ''}
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
