'use client';

import { useState } from 'react';

interface Folder {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

interface FolderSidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, color: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onEditFolder: (folderId: string, name: string, color: string) => Promise<void>;
}

export default function FolderSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  onEditFolder,
}: FolderSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#8B5CF6');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const predefinedColors = [
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#F59E0B', // amber
    '#10B981', // emerald
    '#3B82F6', // blue
    '#6366F1', // indigo
    '#EF4444', // red
    '#14B8A6', // teal
  ];

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      await onCreateFolder(newFolderName.trim(), newFolderColor);
      setNewFolderName('');
      setNewFolderColor('#8B5CF6');
      setIsCreating(false);
    } catch (error) {
      console.error('폴더 생성 실패:', error);
    }
  };

  const handleEditFolder = async (folderId: string) => {
    if (!editName.trim()) return;

    try {
      await onEditFolder(folderId, editName.trim(), editColor);
      setEditingFolderId(null);
      setEditName('');
      setEditColor('');
    } catch (error) {
      console.error('폴더 수정 실패:', error);
    }
  };

  const startEdit = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setEditName(folder.name);
    setEditColor(folder.color);
  };

  return (
    <div className="w-64 bg-slate-800/50 border-r border-slate-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">폴더</h2>
        <button
          onClick={() => setIsCreating(true)}
          className="text-purple-400 hover:text-purple-300 transition-colors"
          title="폴더 추가"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* 전체 보기 */}
      <button
        onClick={() => onSelectFolder(null)}
        className={`w-full text-left px-3 py-2 rounded-lg mb-2 transition-colors ${
          selectedFolderId === null
            ? 'bg-purple-600/30 text-purple-300'
            : 'text-slate-300 hover:bg-slate-700/50'
        }`}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>전체</span>
        </div>
      </button>

      {/* 폴더 생성 폼 */}
      {isCreating && (
        <div className="bg-slate-700/50 rounded-lg p-3 mb-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="폴더 이름"
            className="w-full bg-slate-800 text-slate-100 px-3 py-2 rounded-lg mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            maxLength={50}
            autoFocus
          />
          <div className="flex gap-1 mb-2">
            {predefinedColors.map((color) => (
              <button
                key={color}
                onClick={() => setNewFolderColor(color)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                  newFolderColor === color ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreateFolder}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              생성
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewFolderName('');
                setNewFolderColor('#8B5CF6');
              }}
              className="flex-1 bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded text-sm transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 폴더 목록 */}
      <div className="space-y-1">
        {folders.map((folder) => (
          <div key={folder.id}>
            {editingFolderId === folder.id ? (
              <div className="bg-slate-700/50 rounded-lg p-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-800 text-slate-100 px-2 py-1 rounded text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  maxLength={50}
                  autoFocus
                />
                <div className="flex gap-1 mb-2">
                  {predefinedColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${
                        editColor === color ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditFolder(folder.id)}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded text-xs transition-colors"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => {
                      setEditingFolderId(null);
                      setEditName('');
                      setEditColor('');
                    }}
                    className="flex-1 bg-slate-600 hover:bg-slate-500 text-white px-2 py-1 rounded text-xs transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => onSelectFolder(folder.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors group ${
                  selectedFolderId === folder.id
                    ? 'bg-purple-600/30 text-purple-300'
                    : 'text-slate-300 hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: folder.color }}
                    />
                    <span className="truncate">{folder.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(folder);
                      }}
                      className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200"
                      title="수정"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`"${folder.name}" 폴더를 삭제하시겠습니까?\n폴더 내 항목은 삭제되지 않습니다.`)) {
                          onDeleteFolder(folder.id);
                        }
                      }}
                      className="p-1 hover:bg-red-600 rounded text-slate-400 hover:text-white"
                      title="삭제"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
