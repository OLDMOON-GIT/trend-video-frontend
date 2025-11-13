'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

interface YouTubeUploadButtonProps {
  videoPath: string;
  thumbnailPath?: string;
  defaultTitle?: string;
  jobId: string;
  onUploadStart?: () => void;
  onUploadSuccess?: (data: { videoId: string; videoUrl: string }) => void;
  onUploadError?: (error: string) => void;
}

interface YouTubeChannel {
  id: string;
  channelId: string;
  channelTitle: string;
  isDefault: boolean;
}

export default function YouTubeUploadButton({
  videoPath,
  thumbnailPath,
  defaultTitle = '',
  jobId,
  onUploadStart,
  onUploadSuccess,
  onUploadError
}: YouTubeUploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'success' | 'error' | ''>('');
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [mounted, setMounted] = useState(false);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [scheduleType, setScheduleType] = useState<'now' | 'scheduled'>('now');
  const [publishAt, setPublishAt] = useState(() => {
    // 기본값: 현재 + 3분
    const defaultTime = new Date(Date.now() + 3 * 60 * 1000);
    return defaultTime.toISOString().slice(0, 16);
  });

  useEffect(() => {
    setMounted(true);
    // localStorage에서 저장된 공개 설정 불러오기
    const savedPrivacy = localStorage.getItem('youtube_privacy_setting');
    if (savedPrivacy && ['public', 'unlisted', 'private'].includes(savedPrivacy)) {
      setPrivacy(savedPrivacy as 'public' | 'unlisted' | 'private');
    }
  }, []);

  const loadChannels = async () => {
    try {
      setLoadingChannels(true);
      const res = await fetch('/api/youtube/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);

        // 기본 채널 자동 선택
        const defaultChannel = data.channels?.find((ch: YouTubeChannel) => ch.isDefault);
        if (defaultChannel) {
          setSelectedChannelId(defaultChannel.id);
        } else if (data.channels?.length > 0) {
          setSelectedChannelId(data.channels[0].id);
        }
      }
    } catch (error) {
      console.error('채널 목록 로딩 실패:', error);
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleUploadClick = async () => {
    setShowModal(true);
    await loadChannels();
  };

  const addLog = (log: string) => {
    setUploadLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${log}`]);
  };

  const handleCancelUpload = async () => {
    // 이미 중지 중이면 무시
    if (!isUploading || uploadStatus !== 'uploading') {
      return;
    }

    try {
      // 중지 상태로 즉시 변경하여 중복 클릭 방지
      setUploadStatus('error');
      setIsUploading(false);
      addLog('🛑 업로드 중지 요청 중...');

      const res = await fetch(`/api/youtube/upload?jobId=${jobId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success || res.ok) {
        addLog('✅ 업로드가 중지되었습니다.');
        toast.success('YouTube 업로드가 중지되었습니다.');
      } else {
        addLog(`❌ 중지 실패: ${data.error || '알 수 없는 오류'}`);
        toast.error('중지 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error: any) {
      const errorMessage = error?.message || '알 수 없는 오류';
      addLog(`❌ 중지 중 오류: ${errorMessage}`);
      toast.error('중지 중 오류가 발생했습니다.');
    }
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error('제목을 입력해주세요');
      return;
    }

    if (!selectedChannelId) {
      toast.error('YouTube 채널을 선택해주세요');
      return;
    }

    if (scheduleType === 'scheduled') {
      if (!publishAt) {
        toast.error('예약 시간을 선택해주세요');
        return;
      }

      // 예약 시간이 현재로부터 최소 3분 이후인지 확인
      const publishTime = new Date(publishAt).getTime();
      const minTime = Date.now() + 3 * 60 * 1000; // 3분 후

      if (publishTime < minTime) {
        toast.error('예약 시간은 최소 3분 이후로 설정해야 합니다');
        return;
      }
    }

    let progressInterval: NodeJS.Timeout | null = null;
    let messageTimer: NodeJS.Timeout;

    try {
      setIsUploading(true);
      setShowModal(false);
      setShowProgressModal(true);
      setUploadLogs([]);
      setUploadProgress(0);
      setUploadStatus('uploading');

      if (scheduleType === 'scheduled') {
        addLog('⏰ 예약 업로드 시작 (비디오는 지금 업로드, 예약 시간에 자동 공개)');
      } else {
        addLog('YouTube 업로드 시작');
      }

      // 업로드 시작 콜백 호출
      if (onUploadStart) {
        onUploadStart();
      }

      const tagList = tags.split(',').map(t => t.trim()).filter(t => t);

      addLog('업로드 요청 준비 중...');
      addLog(`제목: ${title}`);
      addLog(`공개 설정: ${privacy}`);
      if (scheduleType === 'scheduled') {
        addLog(`⏰ 예약 공개 시간: ${new Date(publishAt).toLocaleString('ko-KR')}`);
      }

      // 90% 이후 메시지 추가를 위한 타이머
      const messageTimer = setTimeout(() => {
        addLog('📤 YouTube 서버에 업로드 중... (비디오 크기에 따라 시간이 소요될 수 있습니다)');
      }, 15000); // 15초 후

      // 진행률 시뮬레이션 (업로드 중 증가)
      progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 98) {
            return 98; // 98%에서 멈춤 (완료 시 100으로 설정)
          }
          // 점진적으로 증가 (빠르게 시작, 아주 느리게 증가)
          const increment = prev < 30 ? 10 : prev < 60 ? 5 : prev < 90 ? 2 : 0.2;
          return Math.min(prev + increment, 98);
        });
      }, 1000);

      // publishAt을 ISO 8601 형식으로 변환
      const publishAtISO = scheduleType === 'scheduled' && publishAt
        ? new Date(publishAt).toISOString()
        : undefined;

      const res = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath,
          thumbnailPath,
          title,
          description,
          tags: tagList,
          privacy,
          channelId: selectedChannelId,
          jobId,
          publishAt: publishAtISO
        })
      });

      // API 응답 받으면 타이머 중지
      if (progressInterval) clearInterval(progressInterval);
      clearTimeout(messageTimer);

      addLog('서버 응답 대기 중...');

      const data = await res.json();

      console.log('📥 Upload API Response:', { status: res.status, data });

      if (data.success) {
        setUploadStatus('success');
        setUploadProgress(100);

        if (scheduleType === 'scheduled') {
          addLog('✅ YouTube 업로드 완료! (예약 시간에 자동 공개됩니다)');
          addLog(`🔒 현재 상태: Private (${new Date(publishAt).toLocaleString('ko-KR')}에 공개)`);
        } else {
          addLog('✅ YouTube 업로드 완료!');
        }

        addLog(`비디오 ID: ${data.videoId}`);
        addLog(`URL: ${data.videoUrl}`);

        // 성공 시 공개 설정 저장
        localStorage.setItem('youtube_privacy_setting', privacy);

        if (onUploadSuccess) {
          onUploadSuccess({ videoId: data.videoId, videoUrl: data.videoUrl });
        }

        // 3초 후 모달 닫기
        setTimeout(() => {
          setShowProgressModal(false);
        }, 3000);
      } else {
        setUploadStatus('error');
        if (progressInterval) clearInterval(progressInterval);
        clearTimeout(messageTimer);
        const errorMsg = data.error || '업로드 실패';
        const detailsMsg = data.details || '';

        addLog(`❌ 업로드 실패: ${errorMsg}`);
        if (detailsMsg) {
          addLog(`   상세: ${detailsMsg}`);
        }

        // 토큰 경로나 credentials 경로 정보가 있으면 표시
        if (data.tokenPath) {
          addLog(`   토큰 경로: ${data.tokenPath}`);
        }
        if (data.credentialsPath) {
          addLog(`   Credentials 경로: ${data.credentialsPath}`);
        }

        if (data.stdout) {
          addLog('Python stdout:');
          data.stdout.split('\n').forEach((line: string) => {
            if (line.trim()) addLog(`  ${line}`);
          });
        }
        if (data.stderr) {
          addLog('Python stderr:');
          data.stderr.split('\n').forEach((line: string) => {
            if (line.trim()) addLog(`  ${line}`);
          });
        }

        console.warn('❌ Upload API Error:', {
          error: errorMsg,
          details: detailsMsg,
          fullData: data
        });
        if (onUploadError) {
          onUploadError(errorMsg);
        }
      }
    } catch (error: any) {
      if (progressInterval) clearInterval(progressInterval);
      clearTimeout(messageTimer);
      setUploadStatus('error');
      const errorMessage = error?.message || error?.toString() || '알 수 없는 오류';
      addLog(`❌ 오류 발생: ${errorMessage}`);

      console.warn('YouTube 업로드 실패:', {
        message: errorMessage,
        error: error
      });
      if (onUploadError) {
        onUploadError(errorMessage);
      }
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      clearTimeout(messageTimer);
      setIsUploading(false);
    }
  };

  const modalContent = showModal && mounted ? (
    createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-[99999] p-4 pt-16 overflow-y-auto">
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-2xl font-bold text-white">YouTube 업로드</h2>
            </div>

            <div className="p-6 space-y-4">
              {/* YouTube 채널 선택 */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  YouTube 채널 *
                </label>
                {loadingChannels ? (
                  <div className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-400">
                    채널 목록 로딩 중...
                  </div>
                ) : channels.length === 0 ? (
                  <div className="w-full px-4 py-2 bg-slate-900/50 border border-red-500/50 rounded-lg text-red-400">
                    연결된 YouTube 채널이 없습니다. 설정에서 채널을 연결해주세요.
                  </div>
                ) : (
                  <select
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.channelTitle} {channel.isDefault ? '(기본)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  제목 *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="비디오 제목을 입력하세요"
                  maxLength={100}
                />
                <p className="text-xs text-slate-400 mt-1">{title.length}/100</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  설명
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="비디오 설명을 입력하세요"
                  maxLength={5000}
                />
                <p className="text-xs text-slate-400 mt-1">{description.length}/5000</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  태그 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="AI, 숏폼, 자동화"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  공개 설정
                </label>
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as any)}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="public">공개</option>
                  <option value="unlisted">일부 공개 (링크가 있는 사람만)</option>
                  <option value="private">비공개</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  업로드 시점
                </label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="now"
                      checked={scheduleType === 'now'}
                      onChange={(e) => setScheduleType(e.target.value as 'now')}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-white">지금 업로드</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="scheduled"
                      checked={scheduleType === 'scheduled'}
                      onChange={(e) => setScheduleType(e.target.value as 'scheduled')}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-white">예약 업로드</span>
                  </label>
                </div>

                {scheduleType === 'scheduled' && (
                  <div>
                    <input
                      type="datetime-local"
                      value={publishAt}
                      onChange={(e) => setPublishAt(e.target.value)}
                      min={new Date(Date.now() + 3 * 60 * 1000).toISOString().slice(0, 16)}
                      className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      ⏰ 예약 시간에 자동으로 공개됩니다 (기본값: 3분 후)
                    </p>
                    <p className="text-xs text-yellow-400 mt-1">
                      ⚠️ 비디오는 지금 바로 업로드되어 private 상태로 유지되다가 예약 시간에 공개됩니다
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-400">
                  💡 비디오: {videoPath}
                </p>
                {thumbnailPath && (
                  <p className="text-sm text-blue-400 mt-1">
                    🖼️ 썸네일: {thumbnailPath}
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-700 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={isUploading}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>업로드 중...</span>
                  </>
                ) : (
                  <span>업로드</span>
                )}
              </button>
            </div>
          </div>
        </div>,
      document.body
    )
  ) : null;

  const progressModal = showProgressModal && mounted ? (
    createPortal(
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[99999] p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {/* 헤더 */}
          <div className={`p-6 border-b border-gray-200 dark:border-gray-700 ${
            uploadStatus === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
            uploadStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
            'bg-blue-50 dark:bg-blue-900/20'
          }`}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {uploadStatus === 'uploading' && (
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                )}
                {uploadStatus === 'success' && '✅'}
                {uploadStatus === 'error' && '❌'}
                YouTube 업로드 {uploadStatus === 'uploading' ? '진행 중' : uploadStatus === 'success' ? '완료' : '실패'}
              </h2>
              {uploadStatus !== 'uploading' && (
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 진행바 */}
            {uploadStatus === 'uploading' && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">업로드 진행률</span>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500 transition-all duration-500 ease-out rounded-full flex items-center justify-end pr-1"
                    style={{ width: `${uploadProgress}%` }}
                  >
                    {uploadProgress > 10 && (
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 로그 영역 */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
            <div className="font-mono text-sm space-y-1">
              {uploadLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`${
                    log.includes('✅') ? 'text-green-600 dark:text-green-400 font-semibold' :
                    log.includes('❌') ? 'text-red-600 dark:text-red-400' :
                    log.includes('⚠️') ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {log}
                </div>
              ))}
              {uploadLogs.length === 0 && (
                <div className="text-gray-500 dark:text-gray-400">로그 대기 중...</div>
              )}
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            {uploadStatus === 'uploading' ? (
              <button
                onClick={handleCancelUpload}
                className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>🛑</span>
                <span>업로드 중지</span>
              </button>
            ) : (
              <button
                onClick={() => setShowProgressModal(false)}
                className="w-full py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <>
      <button
        onClick={handleUploadClick}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
        <span>YouTube 업로드</span>
      </button>

      {modalContent}
      {progressModal}
    </>
  );
}
