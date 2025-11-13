'use client';

import { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { MediaPreviewCard } from './MediaPreview';

interface MediaFile {
  file: File;
  id: string;
  type: 'image' | 'video';
}

type SortOption = 'filename' | 'oldest' | 'newest' | 'custom';

interface SortableMediaListProps {
  files: File[];
  onFilesReorder: (files: File[]) => void;
  onFileRemove: (file: File) => void;
}

export function SortableMediaList({ files, onFilesReorder, onFileRemove }: SortableMediaListProps) {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('filename');
  const [prevFilesLength, setPrevFilesLength] = useState(0);
  const sortOptionRef = useRef<SortOption>('filename');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px 이동 후 드래그 시작 (클릭과 구분)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // sortOption이 변경되면 ref 업데이트
  useEffect(() => {
    sortOptionRef.current = sortOption;
  }, [sortOption]);

  useEffect(() => {
    // File 배열을 MediaFile 배열로 변환
    const newMediaFiles = files.map((file) => ({
      file,
      id: `${file.name}-${file.lastModified}-${file.size}`,
      type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }));

    // 사용자 지정 모드면 자동 정렬 안 함 (사용자가 직접 순서를 바꾼 상태)
    if (sortOptionRef.current === 'custom' && mediaFiles.length > 0) {
      // 기존 파일들은 순서 유지하고, 새로 추가된 파일만 끝에 추가
      const existingIds = new Set(mediaFiles.map(mf => mf.id));
      const newFiles = newMediaFiles.filter(mf => !existingIds.has(mf.id));

      if (newFiles.length > 0) {
        setMediaFiles(prev => [...prev, ...newFiles]);
      }
      return;
    }

    // 자동으로 정렬 적용 (시퀀스 번호 우선, 없으면 오래된 순)
    const sorted = [...newMediaFiles].sort((a, b) => {
      const extractSequence = (filename: string): number | null => {
        // 1. 파일명이 숫자로 시작: "1.jpg", "02.png"
        const startMatch = filename.match(/^(\d+)\./);
        if (startMatch) return parseInt(startMatch[1], 10);

        // 2. _숫자. 또는 -숫자. 패턴: "image_01.jpg", "scene-02.png"
        const seqMatch = filename.match(/[_-](\d{1,3})\./);
        if (seqMatch) return parseInt(seqMatch[1], 10);

        // 3. (숫자) 패턴: "Image_fx (47).jpg"
        // 단, 랜덤 ID가 없을 때만
        const parenMatch = filename.match(/\((\d+)\)/);
        if (parenMatch && !filename.match(/[_-]\w{8,}/)) {
          return parseInt(parenMatch[1], 10);
        }

        return null;
      };

      const numA = extractSequence(a.file.name);
      const numB = extractSequence(b.file.name);

      // 둘 다 시퀀스 번호가 있으면: 시퀀스 번호로 정렬
      if (numA !== null && numB !== null) {
        return numA - numB;
      }

      // 시퀀스 번호가 하나만 있으면: 시퀀스 번호 있는게 우선
      if (numA !== null) return -1;
      if (numB !== null) return 1;

      // 둘 다 없으면: lastModified로 정렬 (오래된 순)
      return a.file.lastModified - b.file.lastModified;
    });

    setMediaFiles(sorted);

    // 파일이 추가/삭제되었을 때만 부모 컴포넌트에 정렬된 순서 알림
    if (files.length !== prevFilesLength && sorted.length > 0) {
      onFilesReorder(sorted.map(mf => mf.file));
      setPrevFilesLength(files.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, prevFilesLength]);

  // 정렬 옵션 적용
  const applySorting = (option: SortOption) => {
    setSortOption(option);

    if (option === 'custom') {
      // 사용자 지정: 현재 순서 유지 (드래그 앤 드롭)
      return;
    }

    const sorted = [...mediaFiles].sort((a, b) => {
      switch (option) {
        case 'filename':
          // 파일명 기준 정렬 (시퀀스 번호 우선, 없으면 오래된 것부터)
          const extractSequence = (filename: string): number | null => {
            // 1. 파일명이 숫자로 시작: "1.jpg", "02.png"
            const startMatch = filename.match(/^(\d+)\./);
            if (startMatch) return parseInt(startMatch[1], 10);

            // 2. _숫자. 또는 -숫자. 패턴: "image_01.jpg", "scene-02.png"
            const seqMatch = filename.match(/[_-](\d{1,3})\./);
            if (seqMatch) return parseInt(seqMatch[1], 10);

            // 3. (숫자) 패턴: "Image_fx (47).jpg"
            // 단, 랜덤 ID가 없을 때만
            const parenMatch = filename.match(/\((\d+)\)/);
            if (parenMatch && !filename.match(/[_-]\w{8,}/)) {
              return parseInt(parenMatch[1], 10);
            }

            return null;
          };

          const numA = extractSequence(a.file.name);
          const numB = extractSequence(b.file.name);

          // 둘 다 시퀀스 번호가 있으면: 시퀀스 번호로 정렬
          if (numA !== null && numB !== null) {
            return numA - numB;
          }

          // 시퀀스 번호가 하나만 있으면: 시퀀스 번호 있는게 우선
          if (numA !== null) return -1;
          if (numB !== null) return 1;

          // 둘 다 시퀀스 번호가 없으면: 오래된 것부터 (생성/수정 시간 순)
          return a.file.lastModified - b.file.lastModified;

        case 'oldest':
          // 오래된 것 먼저 (날짜 오름차순)
          return a.file.lastModified - b.file.lastModified;

        case 'newest':
          // 최신 것 먼저 (날짜 내림차순)
          return b.file.lastModified - a.file.lastModified;

        default:
          return 0;
      }
    });

    setMediaFiles(sorted);
    onFilesReorder(sorted.map(mf => mf.file));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setMediaFiles((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);

        // 부모 컴포넌트에 순서 변경 알림
        onFilesReorder(newItems.map((item) => item.file));

        return newItems;
      });

      // 드래그로 순서를 변경하면 자동으로 '사용자 지정' 모드로 전환
      setSortOption('custom');
    }
  };

  const handleRemove = (id: string) => {
    const fileToRemove = mediaFiles.find((mf) => mf.id === id);
    if (fileToRemove) {
      onFileRemove(fileToRemove.file);
    }
  };

  if (mediaFiles.length === 0) {
    return null;
  }

  const sortButtons: { value: SortOption; label: string; icon: string }[] = [
    { value: 'filename', label: '자동 정렬 (번호 → 시간순)', icon: '🔢' },
    { value: 'oldest', label: '오래된 것 먼저', icon: '⏮️' },
    { value: 'newest', label: '최신 것 먼저', icon: '⏭️' },
    { value: 'custom', label: '사용자 지정', icon: '✋' },
  ];

  return (
    <div className="w-full">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">
            업로드된 파일 ({mediaFiles.length}개)
          </h3>
        </div>

        {/* 정렬 옵션 버튼 */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-sm text-gray-400 flex items-center mr-2">정렬:</span>
          {sortButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => applySorting(btn.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortOption === btn.value
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <span className="mr-1">{btn.icon}</span>
              {btn.label}
            </button>
          ))}
        </div>

        {sortOption === 'custom' && (
          <p className="text-sm text-gray-400 italic">
            💡 드래그하여 순서를 변경하세요
          </p>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={mediaFiles.map((mf) => mf.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {mediaFiles.map((mediaFile) => (
              <MediaPreviewCard
                key={mediaFile.id}
                mediaFile={mediaFile}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sortOption !== 'custom' && (
        <div className="mt-4 p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
          <p className="text-sm text-green-300">
            ✅ <strong>{sortButtons.find(b => b.value === sortOption)?.label}</strong> 순서로 정렬되었습니다.
          </p>
          {sortOption === 'filename' && (
            <p className="text-xs text-green-400 mt-1">
              💡 파일명에 숫자가 있으면 번호 순, 없으면 생성/수정 시간 순으로 정렬됩니다.
            </p>
          )}
        </div>
      )}

      {sortOption === 'custom' && (
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
          <p className="text-sm text-blue-300">
            💡 <strong>팁:</strong> 파일 왼쪽 상단의 드래그 핸들(≡)을 클릭하고 드래그하여 순서를 변경할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
