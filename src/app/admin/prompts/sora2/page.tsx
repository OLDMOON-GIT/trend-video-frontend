'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';
import toast from 'react-hot-toast';

interface Sora2Prompt {
  name: string;
  path: string;
  format: string;
  size_bytes: number;
  created_at: string;
  modified_at: string;
  config: {
    project_type?: string;
    duration_per_segment?: number;
    num_segments?: number;
    size?: string;
    model?: string;
  };
}

interface PromptDetail {
  prompt: string;
  metadata: {
    project_type: string;
    duration_per_segment: number;
    num_segments: number;
    size: string;
    model: string;
  };
}

export default function Sora2PromptsPage() {
  const [prompts, setPrompts] = useState<Sora2Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [promptDetail, setPromptDetail] = useState<PromptDetail | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [duration, setDuration] = useState(8);
  const [numSegments, setNumSegments] = useState(3);
  const [size, setSize] = useState('1280x720');

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/prompts');
      const data = await response.json();

      if (data.success) {
        // Filter only Sora2 prompts
        const sora2Prompts = data.prompts.filter(
          (p: Sora2Prompt) => p.config.project_type === 'sora2'
        );
        setPrompts(sora2Prompts);
      }
    } catch (error) {
      console.error('프롬프트 로드 실패:', error);
      toast.error('프롬프트를 불러올 수 없습니다. API 서버를 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  const loadPromptDetail = async (name: string) => {
    try {
      const response = await fetch(`http://localhost:5000/api/prompts/${name}`);
      const data = await response.json();

      if (data.success) {
        setPromptDetail(data.prompt);
        setNewPromptName(name);
        setNewPromptText(data.prompt.prompt);
        setDuration(data.prompt.metadata.duration_per_segment || 8);
        setNumSegments(data.prompt.metadata.num_segments || 3);
        setSize(data.prompt.metadata.size || '1280x720');
        setSelectedPrompt(name);
      }
    } catch (error) {
      console.error('프롬프트 상세 로드 실패:', error);
      toast.error('프롬프트 상세 정보를 불러올 수 없습니다.');
    }
  };

  const savePrompt = async () => {
    if (!newPromptName || !newPromptText) {
      toast.error('프롬프트 이름과 내용을 입력하세요.');
      return;
    }

    const metadata = {
      project_type: 'sora2',
      duration_per_segment: duration,
      num_segments: numSegments,
      size: size,
      model: 'sora-2'
    };

    try {
      let response;

      if (selectedPrompt && selectedPrompt === newPromptName) {
        // Update existing
        response = await fetch(`http://localhost:5000/api/prompts/${newPromptName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: newPromptText, metadata })
        });
      } else {
        // Create new
        response = await fetch('http://localhost:5000/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newPromptName,
            prompt: newPromptText,
            metadata,
            format: 'json',
            project_type: 'sora2'
          })
        });
      }

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        loadPrompts();
        setIsEditing(false);
      } else {
        toast.error('저장 실패: ' + data.error);
      }
    } catch (error) {
      console.error('프롬프트 저장 실패:', error);
      toast.error('프롬프트를 저장할 수 없습니다.');
    }
  };

  const deletePrompt = async (name: string) => {
    if (!confirm(`"${name}" 프롬프트를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:5000/api/prompts/${name}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        toast.success('프롬프트가 삭제되었습니다.');
        loadPrompts();
        if (selectedPrompt === name) {
          setSelectedPrompt(null);
          setPromptDetail(null);
        }
      } else {
        toast.error('삭제 실패: ' + data.error);
      }
    } catch (error) {
      console.error('프롬프트 삭제 실패:', error);
      toast.error('프롬프트를 삭제할 수 없습니다.');
    }
  };

  const generateVideo = async (promptName: string) => {
    if (!confirm(`"${promptName}" 프롬프트로 비디오를 생성하시겠습니까?`)) {
      return;
    }

    const toastId = toast.loading('비디오 생성 중... (몇 분 소요될 수 있습니다)');

    try {
      const response = await fetch('http://localhost:5000/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_name: promptName })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('비디오가 생성되었습니다!\n경로: ' + data.output_path, {
          id: toastId,
          duration: 5000
        });
      } else {
        toast.error('생성 실패: ' + data.error, { id: toastId });
      }
    } catch (error) {
      console.error('비디오 생성 실패:', error);
      toast.error('비디오를 생성할 수 없습니다.', { id: toastId });
    }
  };

  const newPrompt = () => {
    setIsEditing(true);
    setSelectedPrompt(null);
    setPromptDetail(null);
    setNewPromptName('');
    setNewPromptText('');
    setDuration(8);
    setNumSegments(3);
    setSize('1280x720');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p>프롬프트 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Breadcrumb />

        <div className="mb-8">
          <h1 className="text-3xl font-bold">🎥 Sora2 프롬프트 관리</h1>
          <p className="mt-2 text-slate-400">
            OpenAI Sora2 AI 비디오 생성을 위한 프롬프트를 관리합니다.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* 프롬프트 목록 */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">프롬프트 목록</h2>
                <button
                  onClick={newPrompt}
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold transition hover:bg-cyan-600"
                >
                  + 새 프롬프트
                </button>
              </div>

              <div className="space-y-2">
                {prompts.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">
                    저장된 프롬프트가 없습니다.
                  </p>
                ) : (
                  prompts.map((prompt) => (
                    <div
                      key={prompt.name}
                      onClick={() => loadPromptDetail(prompt.name)}
                      className={`cursor-pointer rounded-lg border p-4 transition ${
                        selectedPrompt === prompt.name
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-white/10 hover:border-cyan-500/50 hover:bg-white/5'
                      }`}
                    >
                      <div className="font-semibold">{prompt.name}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {prompt.config.num_segments || 3}개 세그먼트 ×{' '}
                        {prompt.config.duration_per_segment || 8}초
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {new Date(prompt.modified_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 프롬프트 편집 */}
          <div className="lg:col-span-2">
            {!selectedPrompt && !isEditing ? (
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-12 backdrop-blur text-center">
                <div className="text-6xl mb-4">🎥</div>
                <p className="text-slate-400">
                  왼쪽에서 프롬프트를 선택하거나 새 프롬프트를 만드세요.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur">
                <h2 className="mb-6 text-xl font-bold">
                  {isEditing ? '새 프롬프트' : '프롬프트 편집'}
                </h2>

                <div className="space-y-6">
                  {/* 프롬프트 이름 */}
                  <div>
                    <label className="mb-2 block text-sm font-semibold">
                      프롬프트 이름
                    </label>
                    <input
                      type="text"
                      value={newPromptName}
                      onChange={(e) => setNewPromptName(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-800 px-4 py-2 text-white"
                      placeholder="my_video"
                    />
                  </div>

                  {/* 프롬프트 텍스트 */}
                  <div>
                    <label className="mb-2 block text-sm font-semibold">
                      프롬프트 내용
                    </label>
                    <textarea
                      value={newPromptText}
                      onChange={(e) => setNewPromptText(e.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-white/10 bg-slate-800 px-4 py-2 font-mono text-sm text-white"
                      placeholder="A futuristic car racing through a cyberpunk city at night..."
                    />
                  </div>

                  {/* 메타데이터 */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        세그먼트당 길이 (초)
                      </label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full rounded-lg border border-white/10 bg-slate-800 px-4 py-2 text-white"
                      >
                        <option value={4}>4초</option>
                        <option value={8}>8초</option>
                        <option value={12}>12초</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        세그먼트 수
                      </label>
                      <input
                        type="number"
                        value={numSegments}
                        onChange={(e) => setNumSegments(Number(e.target.value))}
                        min={1}
                        max={10}
                        className="w-full rounded-lg border border-white/10 bg-slate-800 px-4 py-2 text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        해상도
                      </label>
                      <select
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-800 px-4 py-2 text-white"
                      >
                        <option value="1920x1080">1920x1080 (Full HD)</option>
                        <option value="1280x720">1280x720 (HD)</option>
                        <option value="1080x1920">1080x1920 (Portrait)</option>
                        <option value="720x1280">720x1280 (Portrait HD)</option>
                      </select>
                    </div>
                  </div>

                  {/* 총 길이 표시 */}
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4">
                    <p className="text-sm text-cyan-300">
                      <strong>총 비디오 길이:</strong> {duration * numSegments}초 (
                      {Math.floor((duration * numSegments) / 60)}분{' '}
                      {(duration * numSegments) % 60}초)
                    </p>
                  </div>

                  {/* 버튼 */}
                  <div className="flex gap-3">
                    <button
                      onClick={savePrompt}
                      className="flex-1 rounded-lg bg-cyan-500 px-6 py-3 font-semibold transition hover:bg-cyan-600"
                    >
                      💾 저장
                    </button>

                    {selectedPrompt && !isEditing && (
                      <>
                        <button
                          onClick={() => generateVideo(selectedPrompt)}
                          className="flex-1 rounded-lg bg-green-500 px-6 py-3 font-semibold transition hover:bg-green-600"
                        >
                          🎬 비디오 생성
                        </button>
                        <button
                          onClick={() => deletePrompt(selectedPrompt)}
                          className="rounded-lg bg-red-500 px-6 py-3 font-semibold transition hover:bg-red-600"
                        >
                          🗑️ 삭제
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setSelectedPrompt(null);
                      }}
                      className="rounded-lg border border-white/10 px-6 py-3 font-semibold transition hover:bg-white/5"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 안내 */}
        <div className="mt-8 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-6 backdrop-blur">
          <h3 className="mb-3 text-lg font-bold text-cyan-300">💡 Sora2 프롬프트 작성 팁</h3>
          <div className="grid gap-4 md:grid-cols-2 text-sm text-slate-300">
            <div>
              <p className="font-semibold mb-2">✅ 좋은 프롬프트:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>구체적인 시각적 묘사</li>
                <li>카메라 움직임 명시</li>
                <li>조명과 색감 표현</li>
                <li>연속성을 고려한 설명</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-2">❌ 피해야 할 것:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>너무 추상적인 표현</li>
                <li>복잡한 서사 구조</li>
                <li>텍스트나 로고 요청</li>
                <li>유명인 또는 브랜드 언급</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
