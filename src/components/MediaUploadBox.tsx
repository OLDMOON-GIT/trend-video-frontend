'use client';

import { useState, useEffect } from 'react';

interface MediaItem {
  type: 'image' | 'video';
  file: File;
}

interface MediaUploadBoxProps {
  // 파일 상태
  uploadedImages: File[];
  uploadedVideos: File[];
  uploadedJson?: File | null;

  // 파일 업데이트 핸들러
  onImagesChange: (files: File[]) => void;
  onVideosChange: (files: File[]) => void;
  onJsonChange?: (file: File | null) => void;

  // 옵션
  acceptJson?: boolean;
  acceptImages?: boolean;
  acceptVideos?: boolean;
  mode?: 'shortform' | 'longform' | 'merge';
  maxImages?: number;

  // 드래그 상태 (외부에서 관리 가능)
  isDraggingFiles?: boolean;
  onDraggingChange?: (isDragging: boolean) => void;

  // 토스트 메시지 (선택)
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

// 시퀀스 번호 추출 (개발 가이드 표준)
const extractSequenceNumber = (filename: string): number | null => {
  // 1. 파일명 시작이 숫자 (예: 01.jpg, 001.png)
  const startMatch = filename.match(/^(\d+)\./);
  if (startMatch) return parseInt(startMatch[1], 10);

  // 2. 언더스코어나 하이픈 뒤에 1~3자리 숫자 (예: scene_01.jpg, image-001.png)
  const seqMatch = filename.match(/[_-](\d{1,3})\./);
  if (seqMatch) return parseInt(seqMatch[1], 10);

  // 3. 괄호 안 숫자 (단, 해시값은 제외) (예: image(1).jpg)
  const parenMatch = filename.match(/\((\d+)\)/);
  if (parenMatch && !filename.match(/[_-]\w{8,}/)) {
    return parseInt(parenMatch[1], 10);
  }

  return null;
};

export default function MediaUploadBox({
  uploadedImages,
  uploadedVideos,
  uploadedJson,
  onImagesChange,
  onVideosChange,
  onJsonChange,
  acceptJson = false,
  acceptImages = true,
  acceptVideos = true,
  mode = 'shortform',
  maxImages = 50,
  isDraggingFiles = false,
  onDraggingChange,
  showToast
}: MediaUploadBoxProps) {
  const [isManualSort, setIsManualSort] = useState(false);
  const [draggingCardIndex, setDraggingCardIndex] = useState<number | null>(null);
  const [manuallyOrderedMedia, setManuallyOrderedMedia] = useState<MediaItem[]>([]);

  // 이미지+비디오 통합 배열 생성
  useEffect(() => {
    if (isManualSort) return;

    const combined: MediaItem[] = [
      ...uploadedImages.map(f => ({ type: 'image' as const, file: f })),
      ...uploadedVideos.map(f => ({ type: 'video' as const, file: f }))
    ];

    // 정렬: 시퀀스 번호 우선 → lastModified 오래된 순
    combined.sort((a, b) => {
      const numA = extractSequenceNumber(a.file.name);
      const numB = extractSequenceNumber(b.file.name);

      // 둘 다 시퀀스 번호가 있으면 번호 순
      if (numA !== null && numB !== null) return numA - numB;
      // A만 시퀀스 번호가 있으면 A가 앞
      if (numA !== null) return -1;
      // B만 시퀀스 번호가 있으면 B가 앞
      if (numB !== null) return 1;
      // 둘 다 시퀀스 번호가 없으면 오래된 순
      return a.file.lastModified - b.file.lastModified;
    });

    setManuallyOrderedMedia(combined);

    // 정렬된 순서를 부모 컴포넌트에 전달 (순서가 바뀌었을 때만)
    const sortedImages = combined.filter(m => m.type === 'image').map(m => m.file);
    const sortedVideos = combined.filter(m => m.type === 'video').map(m => m.file);

    // 순서 비교: 파일명 기준으로 비교
    const isOrderChanged =
      sortedImages.length !== uploadedImages.length ||
      sortedImages.some((f, i) => f.name !== uploadedImages[i]?.name) ||
      sortedVideos.length !== uploadedVideos.length ||
      sortedVideos.some((f, i) => f.name !== uploadedVideos[i]?.name);

    if (isOrderChanged) {
      onImagesChange(sortedImages);
      onVideosChange(sortedVideos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedImages, uploadedVideos, isManualSort]);

  // 순번순 정렬
  const sortBySequence = () => {
    const sorted = [...manuallyOrderedMedia].sort((a, b) => {
      const numA = extractSequenceNumber(a.file.name);
      const numB = extractSequenceNumber(b.file.name);

      // 둘 다 시퀀스 번호가 있으면 번호 순
      if (numA !== null && numB !== null) return numA - numB;
      // A만 시퀀스 번호가 있으면 A가 앞
      if (numA !== null) return -1;
      // B만 시퀀스 번호가 있으면 B가 앞
      if (numB !== null) return 1;
      // 둘 다 시퀀스 번호가 없으면 오래된 순
      return a.file.lastModified - b.file.lastModified;
    });
    setManuallyOrderedMedia(sorted);
    setIsManualSort(true);

    const newImages = sorted.filter(m => m.type === 'image').map(m => m.file);
    const newVideos = sorted.filter(m => m.type === 'video').map(m => m.file);
    onImagesChange(newImages);
    onVideosChange(newVideos);
  };

  // 시간순 정렬
  const sortByTimestamp = () => {
    const sorted = [...manuallyOrderedMedia].sort((a, b) => a.file.lastModified - b.file.lastModified);
    setManuallyOrderedMedia(sorted);
    setIsManualSort(true);

    const newImages = sorted.filter(m => m.type === 'image').map(m => m.file);
    const newVideos = sorted.filter(m => m.type === 'video').map(m => m.file);
    onImagesChange(newImages);
    onVideosChange(newVideos);
  };

  // 미디어 아이템 삭제
  const removeMediaItem = (globalIdx: number) => {
    const newCombined = manuallyOrderedMedia.filter((_, i) => i !== globalIdx);
    setManuallyOrderedMedia(newCombined);
    setIsManualSort(true);

    const newImages = newCombined.filter(m => m.type === 'image').map(m => m.file);
    const newVideos = newCombined.filter(m => m.type === 'video').map(m => m.file);
    onImagesChange(newImages);
    onVideosChange(newVideos);
  };

  const hasFiles = uploadedJson || uploadedImages.length > 0 || uploadedVideos.length > 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (onDraggingChange) onDraggingChange(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (onDraggingChange) onDraggingChange(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (onDraggingChange) onDraggingChange(false);

        const files = Array.from(e.dataTransfer.files);

        // JSON 파일 분류
        const jsonFile = files.find(f =>
          f.type === 'application/json' ||
          f.name.endsWith('.json') ||
          f.name.endsWith('.txt')
        );

        // 이미지 파일 분류
        const imageFiles = files.filter(f => f.type.startsWith('image/'));

        // 비디오 파일 분류
        const videoFiles = files.filter(f => f.type.startsWith('video/'));

        if (acceptJson && jsonFile && onJsonChange) {
          onJsonChange(jsonFile);
          if (showToast) showToast('✅ JSON 파일 업로드 완료', 'success');
        }

        if (acceptImages && imageFiles.length > 0) {
          const existingNames = new Set(uploadedImages.map(f => f.name));
          const newFiles = imageFiles.filter(f => !existingNames.has(f.name));
          if (newFiles.length < imageFiles.length && showToast) {
            showToast('⚠️ 중복된 파일은 무시되었습니다.', 'info');
          }
          onImagesChange([...uploadedImages, ...newFiles].slice(0, maxImages));
          setIsManualSort(false);
          if (showToast) showToast(`✅ ${newFiles.length}개 이미지를 업로드했습니다!`, 'success');
        }

        if (acceptVideos && videoFiles.length > 0) {
          const existingNames = new Set(uploadedVideos.map(f => f.name));
          const newFiles = videoFiles.filter(f => !existingNames.has(f.name));
          if (newFiles.length < videoFiles.length && showToast) {
            showToast('⚠️ 중복된 파일은 무시되었습니다.', 'info');
          }
          onVideosChange([...uploadedVideos, ...newFiles]);
          setIsManualSort(false);
          if (showToast) showToast(`✅ ${newFiles.length}개 비디오를 업로드했습니다!`, 'success');
        }
      }}
      className={`rounded-lg border-2 border-dashed transition-all ${
        isDraggingFiles
          ? 'border-purple-400 bg-purple-500/20'
          : 'border-white/20 bg-white/5'
      } p-6 text-center`}
    >
      <div className="space-y-4">
        {hasFiles ? (
          <div className="space-y-3">
            <div className="text-4xl">✅</div>

            {/* JSON 파일 표시 */}
            {uploadedJson && onJsonChange && (
              <div className="rounded-lg bg-purple-500/10 p-3 border border-purple-500/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-purple-400">📄 {uploadedJson.name}</p>
                  <button
                    onClick={() => onJsonChange(null)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* 정렬 버튼 */}
            {manuallyOrderedMedia.length > 0 && (
              <div className="flex gap-2 mb-3">
                <button
                  onClick={sortBySequence}
                  className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                >
                  순번순
                </button>
                <button
                  onClick={sortByTimestamp}
                  className="px-3 py-1.5 bg-green-600/80 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
                >
                  시간순
                </button>
              </div>
            )}

            {/* 드래그앤드롭 미디어 그리드 */}
            {manuallyOrderedMedia.length > 0 && (
              <div
                className="rounded-lg bg-slate-800/50 p-4 border border-slate-700"
                onDragOver={(e) => {
                  if (draggingCardIndex === null && e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }
                }}
                onDrop={(e) => {
                  if (draggingCardIndex === null && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();

                    const files = Array.from(e.dataTransfer.files);
                    const imageFiles = files.filter(f => f.type.startsWith('image/'));
                    const videoFiles = files.filter(f => f.type.startsWith('video/'));

                    if (acceptImages && imageFiles.length > 0) {
                      const existingNames = new Set(uploadedImages.map(f => f.name));
                      const newFiles = imageFiles.filter(f => !existingNames.has(f.name));
                      onImagesChange([...uploadedImages, ...newFiles].slice(0, maxImages));
                      setIsManualSort(false);
                    }
                    if (acceptVideos && videoFiles.length > 0) {
                      const existingNames = new Set(uploadedVideos.map(f => f.name));
                      const newFiles = videoFiles.filter(f => !existingNames.has(f.name));
                      onVideosChange([...uploadedVideos, ...newFiles]);
                      setIsManualSort(false);
                    }
                  }
                }}
              >
                <p className="text-sm text-slate-300 mb-3 flex items-center gap-2">
                  <span>💡</span>
                  <span>이미지와 비디오를 드래그하여 순서를 변경하세요 (여기에 파일을 드롭해도 추가됩니다)</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto pr-2">
                  {manuallyOrderedMedia.map((item, globalIdx) => (
                    <div
                      key={`${item.type}-${item.file.name}-${globalIdx}`}
                      draggable
                      onDragStart={(e) => {
                        setDraggingCardIndex(globalIdx);
                        e.dataTransfer.effectAllowed = 'move';
                        (e.currentTarget as HTMLElement).style.opacity = '0.5';
                      }}
                      onDragEnd={(e) => {
                        setDraggingCardIndex(null);
                        (e.currentTarget as HTMLElement).style.opacity = '1';
                      }}
                      onDragOver={(e) => {
                        if (draggingCardIndex !== null) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                        }
                      }}
                      onDrop={(e) => {
                        if (draggingCardIndex === null) return;

                        e.preventDefault();
                        e.stopPropagation();

                        const fromIdx = draggingCardIndex;
                        const toIdx = globalIdx;
                        if (fromIdx === toIdx) return;

                        const newCombined = [...manuallyOrderedMedia];
                        const [movedItem] = newCombined.splice(fromIdx, 1);
                        newCombined.splice(toIdx, 0, movedItem);

                        setManuallyOrderedMedia(newCombined);
                        setIsManualSort(true);

                        const newImages = newCombined.filter(m => m.type === 'image').map(m => m.file);
                        const newVideos = newCombined.filter(m => m.type === 'video').map(m => m.file);
                        onImagesChange(newImages);
                        onVideosChange(newVideos);

                        setDraggingCardIndex(null);
                      }}
                      className={`relative group cursor-move bg-slate-900/50 rounded-xl overflow-hidden border border-slate-700 transition-all ${
                        item.type === 'image' ? 'hover:border-blue-500' : 'hover:border-orange-500'
                      }`}
                    >
                      <div className={`${mode === 'longform' ? 'aspect-video' : 'aspect-[9/16]'} relative bg-black`}>
                        {item.type === 'image' ? (
                          <img
                            src={URL.createObjectURL(item.file)}
                            alt={item.file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <>
                            <video
                              src={URL.createObjectURL(item.file)}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <div className="text-5xl text-white/80">▶</div>
                            </div>
                          </>
                        )}
                        <div className="absolute top-2 left-2 bg-black/70 text-white p-2 rounded cursor-move">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M2 4h12v1H2V4zm0 3.5h12v1H2v-1zM2 11h12v1H2v-1z"/>
                          </svg>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMediaItem(globalIdx);
                          }}
                          className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white p-2 rounded transition"
                          title="삭제"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="p-3 bg-slate-800/80">
                        <p className="text-sm text-slate-200 truncate mb-1">{item.file.name}</p>
                        <p className="text-xs text-slate-400">
                          {(item.file.size / 1024).toFixed(1)} KB • {item.type === 'image' ? '이미지' : '비디오'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-4xl">📁</div>
            <p className="text-slate-300 font-semibold">
              {acceptJson && '스토리 JSON 또는 '}
              {acceptImages && '이미지'}
              {acceptImages && acceptVideos && ', '}
              {acceptVideos && '비디오'} 파일을 드래그하세요
            </p>
            <p className="text-xs text-slate-400 mb-3">
              {acceptJson && 'JSON, '}
              {acceptImages && 'PNG, JPG'}
              {acceptImages && acceptVideos && ', '}
              {acceptVideos && 'MP4, MOV'} 등 지원
            </p>
            <label className="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold cursor-pointer transition">
              또는 파일 선택
              <input
                type="file"
                accept={`${acceptJson ? '.json,.txt,' : ''}${acceptImages ? 'image/*,' : ''}${acceptVideos ? 'video/*' : ''}`}
                multiple
                onChange={(e) => {
                  if (!e.target.files || e.target.files.length === 0) return;

                  const files = Array.from(e.target.files);
                  const imageFiles = files.filter(f => f.type.startsWith('image/'));
                  const videoFiles = files.filter(f => f.type.startsWith('video/'));
                  const jsonFile = files.find(f => f.type === 'application/json' || f.name.endsWith('.json') || f.name.endsWith('.txt'));

                  if (acceptJson && jsonFile && onJsonChange) {
                    onJsonChange(jsonFile);
                  }

                  if (acceptImages && imageFiles.length > 0) {
                    const existingNames = new Set(uploadedImages.map(f => f.name));
                    const newFiles = imageFiles.filter(f => !existingNames.has(f.name));
                    onImagesChange([...uploadedImages, ...newFiles].slice(0, maxImages));
                  }

                  if (acceptVideos && videoFiles.length > 0) {
                    const existingNames = new Set(uploadedVideos.map(f => f.name));
                    const newFiles = videoFiles.filter(f => !existingNames.has(f.name));
                    onVideosChange([...uploadedVideos, ...newFiles]);
                  }
                }}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
