'use client';

import { useEffect, useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface MediaFile {
  file: File;
  id: string;
  type: 'image' | 'video';
}

interface MediaPreviewCardProps {
  mediaFile: MediaFile;
  onRemove: (id: string) => void;
}

export function MediaPreviewCard({ mediaFile, onRemove }: MediaPreviewCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mediaFile.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    const url = URL.createObjectURL(mediaFile.file);

    if (mediaFile.type === 'image') {
      setThumbnailUrl(url);
    } else if (mediaFile.type === 'video') {
      // 비디오 첫 프레임 캡처
      const video = videoRef.current;
      if (video) {
        video.src = url;
        video.currentTime = 0.1; // 첫 프레임 약간 지나서 (검은 화면 방지)
      }
    }

    return () => {
      URL.revokeObjectURL(url);
      if (thumbnailUrl && mediaFile.type === 'video') {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [mediaFile]);

  const handleVideoLoaded = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setThumbnailUrl(url);
          }
        }, 'image/jpeg', 0.7);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 transition-colors"
    >
      {/* 드래그 핸들 */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 bg-black/50 rounded p-1 cursor-grab active:cursor-grabbing hover:bg-black/70"
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>

      {/* 삭제 버튼 */}
      <button
        onClick={() => onRemove(mediaFile.id)}
        className="absolute top-2 right-2 z-10 bg-red-600/80 hover:bg-red-700 rounded p-1 transition-colors"
        title="삭제"
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 미리보기 이미지 */}
      <div className="aspect-video bg-gray-900 flex items-center justify-center overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={mediaFile.file.name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-gray-500">
            {mediaFile.type === 'video' ? '썸네일 생성 중...' : '로딩 중...'}
          </div>
        )}
      </div>

      {/* 비디오 캡처용 숨겨진 요소 */}
      {mediaFile.type === 'video' && (
        <>
          <video
            ref={videoRef}
            className="hidden"
            onLoadedData={handleVideoLoaded}
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="hidden" />
        </>
      )}

      {/* 파일 정보 */}
      <div className="p-3 bg-gray-800/90">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate" title={mediaFile.file.name}>
              {mediaFile.file.name}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {formatFileSize(mediaFile.file.size)} • {mediaFile.type === 'video' ? '영상' : '이미지'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
