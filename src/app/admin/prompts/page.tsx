'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';

interface Prompt {
  id: string;
  type: 'longform' | 'shortform';
  name: string;
  systemPrompt: string;
  sceneTemplate: string;
  dalleTemplate: string;
  updatedAt: string;
}

export default function PromptsAdminPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    type: 'longform' as 'longform' | 'shortform',
    name: '',
    systemPrompt: '',
    sceneTemplate: '',
    dalleTemplate: ''
  });

  const getSessionId = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  };

  const getAuthHeaders = (): HeadersInit => {
    const sessionId = getSessionId();
    if (!sessionId) return {};
    return {
      'Authorization': `Bearer ${sessionId}`
    };
  };

  useEffect(() => {
    checkAuth();
    fetchPrompts();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (!data.user || !data.user.isAdmin) {
        router.push('/');
        return;
      }
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/');
    }
  };

  const fetchPrompts = async () => {
    try {
      const response = await fetch('/api/admin/prompts', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (response.ok) {
        setPrompts(data.prompts || []);
      }
    } catch (error) {
      console.error('Error fetching prompts:', error);
    }
  };

  const handleSelectPrompt = (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setFormData({
      type: prompt.type,
      name: prompt.name,
      systemPrompt: prompt.systemPrompt,
      sceneTemplate: prompt.sceneTemplate,
      dalleTemplate: prompt.dalleTemplate
    });
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!selectedPrompt) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/prompts', {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          id: selectedPrompt.id,
          ...formData
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert('프롬프트가 저장되었습니다.');
        setIsEditing(false);
        fetchPrompts();
      } else {
        alert('저장 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Breadcrumb
          items={[
            { label: '홈', href: '/' },
            { label: '관리자', href: '/admin' },
            { label: '프롬프트 관리' }
          ]}
        />

        <div className="mb-8">
          <h1 className="text-3xl font-bold">프롬프트 관리</h1>
          <p className="mt-2 text-slate-400">
            롱폼/숏폼 영상 생성을 위한 프롬프트를 관리합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 프롬프트 목록 */}
          <div className="rounded-lg bg-slate-900/50 p-6">
            <h2 className="mb-4 text-xl font-semibold">프롬프트 목록</h2>
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => handleSelectPrompt(prompt)}
                  className={`w-full rounded-lg p-4 text-left transition ${
                    selectedPrompt?.id === prompt.id
                      ? 'bg-purple-600'
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{prompt.name}</div>
                      <div className="text-sm text-slate-400">
                        {prompt.type === 'longform' ? '🎬 롱폼 (16:9)' : '📱 숏폼 (9:16)'}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 프롬프트 편집 */}
          <div className="lg:col-span-2">
            {selectedPrompt ? (
              <div className="rounded-lg bg-slate-900/50 p-6">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{formData.name}</h2>
                  <div className="flex gap-2">
                    {!isEditing ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="rounded-lg bg-blue-600 px-4 py-2 font-semibold transition hover:bg-blue-500"
                      >
                        수정
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            handleSelectPrompt(selectedPrompt);
                          }}
                          className="rounded-lg bg-gray-600 px-4 py-2 font-semibold transition hover:bg-gray-500"
                        >
                          취소
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={isSaving}
                          className="rounded-lg bg-green-600 px-4 py-2 font-semibold transition hover:bg-green-500 disabled:opacity-50"
                        >
                          {isSaving ? '저장 중...' : '저장'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-400">
                      이름
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={!isEditing}
                      className="w-full rounded-lg bg-slate-800 px-4 py-2 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-400">
                      시스템 프롬프트
                    </label>
                    <textarea
                      value={formData.systemPrompt}
                      onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                      disabled={!isEditing}
                      rows={6}
                      className="w-full rounded-lg bg-slate-800 px-4 py-2 font-mono text-sm disabled:opacity-50"
                      placeholder="영상 생성을 위한 시스템 프롬프트..."
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-400">
                      씬 템플릿
                    </label>
                    <textarea
                      value={formData.sceneTemplate}
                      onChange={(e) => setFormData({ ...formData, sceneTemplate: e.target.value })}
                      disabled={!isEditing}
                      rows={6}
                      className="w-full rounded-lg bg-slate-800 px-4 py-2 font-mono text-sm disabled:opacity-50"
                      placeholder="각 씬 생성을 위한 프롬프트 템플릿..."
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-400">
                      DALL-E 이미지 템플릿
                    </label>
                    <textarea
                      value={formData.dalleTemplate}
                      onChange={(e) => setFormData({ ...formData, dalleTemplate: e.target.value })}
                      disabled={!isEditing}
                      rows={6}
                      className="w-full rounded-lg bg-slate-800 px-4 py-2 font-mono text-sm disabled:opacity-50"
                      placeholder="DALL-E 이미지 생성을 위한 프롬프트 템플릿..."
                    />
                  </div>

                  <div className="rounded-lg bg-slate-800/50 p-4">
                    <div className="text-sm text-slate-400">
                      <p className="font-semibold">💡 템플릿 변수</p>
                      <ul className="mt-2 space-y-1">
                        <li>• <code className="text-purple-400">{'{{title}}'}</code> - 영상 제목</li>
                        <li>• <code className="text-purple-400">{'{{sceneNumber}}'}</code> - 씬 번호</li>
                        <li>• <code className="text-purple-400">{'{{sceneContent}}'}</code> - 씬 내용</li>
                        <li>• <code className="text-purple-400">{'{{aspectRatio}}'}</code> - 비율 (16:9 / 9:16)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg bg-slate-900/50 p-12 text-center">
                <div>
                  <div className="text-6xl">📝</div>
                  <p className="mt-4 text-slate-400">
                    왼쪽에서 프롬프트를 선택해주세요.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
