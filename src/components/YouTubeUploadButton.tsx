'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

interface YouTubeUploadButtonProps {
  videoPath: string;
  thumbnailPath?: string;
  defaultTitle?: string;
  jobId: string;
}

export default function YouTubeUploadButton({
  videoPath,
  thumbnailPath,
  defaultTitle = '',
  jobId
}: YouTubeUploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('unlisted');

  const handleUploadClick = () => {
    setShowModal(true);
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error('제목을 입력해주세요');
      return;
    }

    try {
      setIsUploading(true);
      toast.loading('YouTube 업로드 중...', { id: 'upload' });

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
          privacy
        })
      });

      const data = await res.json();

      if (data.success) {
        toast.success(
          <div>
            <div>YouTube 업로드 성공!</div>
            <a
              href={data.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-300 hover:underline"
            >
              {data.videoUrl}
            </a>
          </div>,
          { id: 'upload', duration: 5000 }
        );
        setShowModal(false);
      } else {
        throw new Error(data.error || '업로드 실패');
      }
    } catch (error: any) {
      console.error('YouTube 업로드 실패:', error);
      toast.error(`업로드 실패: ${error.message}`, { id: 'upload' });
    } finally {
      setIsUploading(false);
    }
  };

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

      {/* 업로드 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-2xl font-bold text-white">YouTube 업로드</h2>
            </div>

            <div className="p-6 space-y-4">
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
        </div>
      )}
    </>
  );
}
