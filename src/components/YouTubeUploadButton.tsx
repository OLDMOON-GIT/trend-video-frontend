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
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [mounted, setMounted] = useState(false);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [loadingChannels, setLoadingChannels] = useState(false);

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

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error('제목을 입력해주세요');
      return;
    }

    if (!selectedChannelId) {
      toast.error('YouTube 채널을 선택해주세요');
      return;
    }

    try {
      setIsUploading(true);
      setShowModal(false);

      // 업로드 시작 콜백 호출
      if (onUploadStart) {
        onUploadStart();
      }

      const tagList = tags.split(',').map(t => t.trim()).filter(t => t);

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
          jobId
        })
      });

      const data = await res.json();

      console.log('📥 Upload API Response:', { status: res.status, data });

      if (data.success) {
        // 성공 시 공개 설정 저장
        localStorage.setItem('youtube_privacy_setting', privacy);

        if (onUploadSuccess) {
          onUploadSuccess({ videoId: data.videoId, videoUrl: data.videoUrl });
        }
      } else {
        const errorMsg = data.error || data.details || '업로드 실패';
        console.warn('❌ Upload API Error:', {
          error: errorMsg,
          fullData: data
        });
        if (onUploadError) {
          onUploadError(errorMsg);
        }
        // throw 하지 않고 조용히 종료
      }
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || '알 수 없는 오류';
      console.warn('YouTube 업로드 실패:', {
        message: errorMessage,
        error: error
      });
      if (onUploadError) {
        onUploadError(errorMessage);
      }
    } finally {
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
    </>
  );
}
