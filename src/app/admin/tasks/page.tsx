'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Task {
  id: string;
  content: string;
  status: 'todo' | 'ing' | 'done';
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  logs?: string[];
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState(0);
  const logRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  const getAuthHeaders = (): HeadersInit => {
    return {
      'Content-Type': 'application/json'
    }; // Authorization 헤더 제거, 쿠키 자동 전송
  };

  // 초기 로드
  useEffect(() => {
    checkAuth();
    fetchTasks();
  }, []);

  // 폴링 제거 - task 추가/수정/삭제 시에만 갱신

  // 로그가 업데이트될 때 자동 스크롤
  useEffect(() => {
    tasks.forEach(task => {
      if (task.logs && task.logs.length > 0) {
        const logElement = logRefs.current[task.id];
        if (logElement) {
          logElement.scrollTop = logElement.scrollHeight;
        }
      }
    });
  }, [tasks]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (!data.user || !data.user.isAdmin) {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
        return;
      }
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks', {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewTask = async () => {
    if (!newTaskContent.trim()) {
      alert('작업 내용을 입력해주세요.');
      return;
    }

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          content: newTaskContent.trim(),
          priority: newTaskPriority
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create task');
      }

      setNewTaskContent('');
      setNewTaskPriority(0);
      setShowNewTaskModal(false);
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('작업 생성에 실패했습니다.');
    }
  };

  const updateTaskStatus = async (taskId: string, status: 'todo' | 'ing' | 'done') => {
    try {
      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: taskId, status })
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      alert('작업 업데이트에 실패했습니다.');
    }
  };

  // 시작 버튼: 단순히 상태만 변경 (백그라운드 워커가 감지)
  const startTask = async (taskId: string) => {
    // 아무것도 하지 않음 - 백그라운드 워커가 자동으로 감지하고 처리
    alert('작업이 대기열에 추가되었습니다. 백그라운드에서 자동으로 처리됩니다.');
  };

  const deleteTaskById = async (taskId: string) => {
    if (!confirm('정말 이 작업을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks?id=${taskId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete task');
      }

      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('작업 삭제에 실패했습니다.');
    }
  };

  const getStatusBadge = (status: Task['status']) => {
    const configs = {
      todo: { label: 'TODO', icon: '⏳', bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500' },
      ing: { label: 'ING', icon: '🔄', bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500' },
      done: { label: 'DONE', icon: '✅', bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500' }
    };

    const config = configs[status];
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${config.bg} ${config.text} ${config.border}`}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-6xl">
{/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold text-white">📋 작업 관리</h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowNewTaskModal(true)}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-semibold text-white transition hover:from-purple-500 hover:to-pink-500"
            >
              ➕ 새작업
            </button>
            <Link
              href="/admin"
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              뒤로가기
            </Link>
          </div>
        </div>

        {/* 작업 목록 */}
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-16 text-center backdrop-blur">
              <div className="text-6xl mb-4">📝</div>
              <p className="text-xl text-slate-400 mb-2">등록된 작업이 없습니다</p>
              <p className="text-sm text-slate-500">상단의 "➕ 새작업" 버튼을 눌러 작업을 추가하세요</p>
            </div>
          ) : (
            tasks.map(task => (
              <div
                key={task.id}
                className={`rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur transition hover:border-purple-500/50 ${
                  task.status === 'done' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(task.status)}
                      {task.priority > 0 && (
                        <span className="text-xs text-yellow-400">⭐ 우선순위 {task.priority}</span>
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(task.createdAt).toLocaleString('ko-KR')}
                      </span>
                    </div>
                    <p className="text-lg text-white font-medium">{task.content}</p>
                  </div>

                  <div className="flex gap-2">
                    {task.status === 'todo' && (
                      <span className="rounded-lg bg-blue-600/20 border border-blue-500 px-3 py-1 text-xs font-semibold text-blue-300">
                        ⏳ 대기 중 (자동 처리 예정)
                      </span>
                    )}
                    {task.status === 'ing' && (
                      <>
                        <button
                          onClick={() => updateTaskStatus(task.id, 'todo')}
                          className="rounded-lg bg-yellow-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-yellow-500"
                        >
                          ⏸️ 중지
                        </button>
                        <button
                          onClick={() => updateTaskStatus(task.id, 'done')}
                          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-green-500"
                        >
                          ✅ 완료
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => deleteTaskById(task.id)}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-500"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>

                {task.logs && task.logs.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">📝 작업 로그</span>
                      <span className="text-xs text-slate-500">{task.logs.length}개 항목</span>
                    </div>
                    <div
                      ref={(el) => { logRefs.current[task.id] = el; }}
                      className="max-h-96 overflow-y-auto rounded bg-black/50 p-3 font-mono text-xs leading-relaxed"
                    >
                      {task.logs.map((log, idx) => (
                        <div key={idx} className="text-green-400 whitespace-pre-wrap break-all mb-1">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 새작업 모달 */}
      {showNewTaskModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setShowNewTaskModal(false)}
        >
          <div
            className="bg-slate-800 rounded-2xl border border-white/10 p-8 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-white mb-6">➕ 새 작업 추가</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  작업 내용
                </label>
                <textarea
                  value={newTaskContent}
                  onChange={(e) => setNewTaskContent(e.target.value)}
                  className="w-full min-h-[120px] rounded-lg bg-slate-900 border border-slate-700 p-4 text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
                  placeholder="예: src/components/Button.tsx 생성하고 기본 스타일 추가"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  우선순위
                </label>
                <input
                  type="number"
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 p-3 text-white focus:border-purple-500 focus:outline-none"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createNewTask}
                className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white transition hover:from-purple-500 hover:to-pink-500"
              >
                추가
              </button>
              <button
                onClick={() => setShowNewTaskModal(false)}
                className="rounded-lg bg-slate-700 px-6 py-3 font-semibold text-white transition hover:bg-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
