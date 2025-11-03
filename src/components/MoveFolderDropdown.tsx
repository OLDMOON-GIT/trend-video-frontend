'use client';

import { useState, useRef, useEffect } from 'react';

interface Folder {
  id: string;
  name: string;
  color: string;
}

interface MoveFolderDropdownProps {
  folders: Folder[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => Promise<void>;
}

export default function MoveFolderDropdown({
  folders,
  currentFolderId,
  onMove,
}: MoveFolderDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMove = async (folderId: string | null) => {
    try {
      await onMove(folderId);
      setIsOpen(false);
    } catch (error) {
      console.error('폴더 이동 실패:', error);
    }
  };

  const currentFolder = folders.find(f => f.id === currentFolderId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
        title="폴더로 이동"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-10 overflow-hidden">
          <div className="p-2">
            <div className="text-xs text-slate-400 px-2 py-1 mb-1">폴더로 이동</div>

            {/* 폴더 없음 (루트로 이동) */}
            <button
              onClick={() => handleMove(null)}
              className={`w-full text-left px-3 py-2 rounded transition-colors ${
                currentFolderId === null
                  ? 'bg-purple-600/30 text-purple-300'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="text-sm">폴더 없음</span>
              </div>
            </button>

            {/* 폴더 목록 */}
            {folders.length === 0 ? (
              <div className="text-xs text-slate-500 px-3 py-2 text-center">
                생성된 폴더가 없습니다
              </div>
            ) : (
              <div className="mt-1 max-h-64 overflow-y-auto">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => handleMove(folder.id)}
                    className={`w-full text-left px-3 py-2 rounded transition-colors ${
                      currentFolderId === folder.id
                        ? 'bg-purple-600/30 text-purple-300'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="text-sm truncate">{folder.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
