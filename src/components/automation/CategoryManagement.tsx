'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
}

interface CategoryManagementProps {
  onCategoryChange?: () => void;
}

export default function CategoryManagement({ onCategoryChange }: CategoryManagementProps = {}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [error, setError] = useState('');

  // 카테고리 목록 조회
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/automation/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');

      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      setError('카테고리 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // 카테고리 추가
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('카테고리 이름을 입력해주세요.');
      return;
    }

    try {
      setError('');
      const response = await fetch('/api/automation/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          description: newCategoryDescription.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '카테고리 추가에 실패했습니다.');
        return;
      }

      setNewCategoryName('');
      setNewCategoryDescription('');
      await fetchCategories();
      onCategoryChange?.(); // 부모 컴포넌트에 변경 알림
      alert('카테고리가 추가되었습니다.');
    } catch (error) {
      console.error('Error adding category:', error);
      setError('카테고리 추가 중 오류가 발생했습니다.');
    }
  };

  // 카테고리 수정
  const handleUpdateCategory = async () => {
    if (!editingCategory) return;

    try {
      setError('');
      const response = await fetch('/api/automation/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCategory.id,
          name: editingCategory.name,
          description: editingCategory.description,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '카테고리 수정에 실패했습니다.');
        return;
      }

      setEditingCategory(null);
      await fetchCategories();
      onCategoryChange?.(); // 부모 컴포넌트에 변경 알림
      alert('카테고리가 수정되었습니다.');
    } catch (error) {
      console.error('Error updating category:', error);
      setError('카테고리 수정 중 오류가 발생했습니다.');
    }
  };

  // 카테고리 삭제
  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`"${name}" 카테고리를 삭제하시겠습니까?\n\n이 카테고리를 사용하는 채널 설정은 영향을 받지 않습니다.`)) {
      return;
    }

    try {
      setError('');
      const response = await fetch(`/api/automation/categories?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || '카테고리 삭제에 실패했습니다.');
        return;
      }

      await fetchCategories();
      onCategoryChange?.(); // 부모 컴포넌트에 변경 알림
      alert('카테고리가 삭제되었습니다.');
    } catch (error) {
      console.error('Error deleting category:', error);
      setError('카테고리 삭제 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-400">카테고리 목록을 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 에러 메시지 */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* 카테고리 추가 */}
      <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-white">새 카테고리 추가</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              카테고리 이름 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="예: 시니어사연, 복수극, 패션"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              설명 (선택)
            </label>
            <input
              type="text"
              value={newCategoryDescription}
              onChange={(e) => setNewCategoryDescription(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="카테고리에 대한 간단한 설명"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleAddCategory}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            추가
          </button>
        </div>
      </div>

      {/* 카테고리 목록 */}
      <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            등록된 카테고리 ({categories.length}개)
          </h3>
        </div>

        {categories.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            등록된 카테고리가 없습니다.
            <br />
            위에서 새 카테고리를 추가해주세요.
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between p-4 bg-slate-700/50 border border-slate-600 rounded-lg hover:border-slate-500 transition"
              >
                {editingCategory?.id === category.id ? (
                  // 수정 모드
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={editingCategory.name}
                      onChange={(e) =>
                        setEditingCategory({
                          ...editingCategory,
                          name: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                    />
                    <input
                      type="text"
                      value={editingCategory.description}
                      onChange={(e) =>
                        setEditingCategory({
                          ...editingCategory,
                          description: e.target.value,
                        })
                      }
                      placeholder="설명"
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdateCategory}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => setEditingCategory(null)}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  // 표시 모드
                  <>
                    <div className="flex-1">
                      <div className="text-white font-medium">
                        {category.name}
                      </div>
                      {category.description && (
                        <div className="text-sm text-gray-400 mt-1">
                          {category.description}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(category.created_at).toLocaleString('ko-KR')}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingCategory(category)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                      >
                        수정
                      </button>
                      <button
                        onClick={() =>
                          handleDeleteCategory(category.id, category.name)
                        }
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                      >
                        삭제
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
