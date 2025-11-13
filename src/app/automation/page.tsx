'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AutomationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [titles, setTitles] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState({ title: '', type: 'longform', category: '', tags: '', productUrl: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  useEffect(() => {
    fetchData();

    // URL 파라미터로 titleId가 있으면 자동으로 수정 모드
    const titleId = searchParams.get('titleId');
    if (titleId) {
      setEditingId(titleId);
    }
  }, [searchParams]);

  async function fetchData() {
    try {
      const [statusRes, titlesRes, schedulesRes] = await Promise.all([
        fetch('/api/automation/scheduler'),
        fetch('/api/automation/titles'),
        fetch('/api/automation/schedules')
      ]);

      const status = await statusRes.json();
      const titlesData = await titlesRes.json();
      const schedulesData = await schedulesRes.json();

      setSchedulerStatus(status.status);
      setTitles(titlesData.titles || []);
      setSchedules(schedulesData.schedules || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      alert('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  async function toggleScheduler() {
    const action = schedulerStatus?.isRunning ? 'stop' : 'start';
    try {
      const response = await fetch('/api/automation/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (!response.ok) throw new Error('Failed to toggle scheduler');

      await fetchData();
      alert(`스케줄러 ${action === 'start' ? '시작' : '중지'} 완료`);
    } catch (error) {
      alert(`스케줄러 ${action} 실패`);
    }
  }

  async function addTitle() {
    if (!newTitle.title || !newTitle.type) {
      alert('제목과 타입은 필수입니다');
      return;
    }

    try {
      const response = await fetch('/api/automation/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTitle)
      });

      if (!response.ok) throw new Error('Failed to add title');

      setNewTitle({ title: '', type: 'longform', category: '', tags: '', productUrl: '' });
      await fetchData();
      alert('제목 추가 완료');
    } catch (error) {
      alert('제목 추가 실패');
    }
  }

  async function deleteTitle(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/automation/titles?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete title');

      await fetchData();
      alert('삭제 완료');
    } catch (error) {
      alert('삭제 실패');
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/automation/schedules?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete schedule');

      await fetchData();
      alert('삭제 완료');
    } catch (error) {
      alert('삭제 실패');
    }
  }

  function viewPipelineDetails(scheduleId: string) {
    router.push(`/automation/pipeline/${scheduleId}`);
  }

  function startEdit(title: any) {
    const titleSchedules = schedules.filter(s => s.title_id === title.id);
    setEditingId(title.id);
    setEditForm({
      ...title,
      schedules: titleSchedules
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function saveEdit() {
    try {
      // 제목 업데이트
      await fetch('/api/automation/titles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editForm.id,
          title: editForm.title,
          category: editForm.category,
          tags: editForm.tags
        })
      });

      alert('저장 완료');
      cancelEdit();
      await fetchData();
    } catch (error) {
      alert('저장 실패');
    }
  }

  async function addScheduleToTitle(titleId: string, scheduledTime: string, youtubePublishTime?: string) {
    try {
      const response = await fetch('/api/automation/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleId,
          scheduledTime,
          youtubePublishTime: youtubePublishTime || null
        })
      });

      if (!response.ok) throw new Error('Failed to add schedule');

      await fetchData();
      alert('스케줄 추가 완료');
    } catch (error) {
      alert('스케줄 추가 실패');
    }
  }

  if (loading) {
    return <div className="p-8">로딩 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">자동화 시스템</h1>

        {/* 스케줄러 상태 */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <h2 className="text-2xl font-semibold text-white mb-4">스케줄러 상태</h2>
          <div className="flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full ${schedulerStatus?.isRunning ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-slate-300">
              {schedulerStatus?.isRunning ? '실행 중' : '중지됨'}
            </span>
            <button
              onClick={toggleScheduler}
              className={`px-6 py-2 rounded-lg font-semibold transition ${
                schedulerStatus?.isRunning
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              {schedulerStatus?.isRunning ? '중지' : '시작'}
            </button>
          </div>
        </div>

        {/* 제목 리스트 관리 */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <h2 className="text-2xl font-semibold text-white mb-4">제목 리스트</h2>

          {/* 제목 추가 폼 */}
          <div className="mb-6 p-4 bg-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold text-white mb-3">새 제목 추가</h3>
            <div className="space-y-4 mb-4">
              <input
                type="text"
                placeholder="제목"
                value={newTitle.title}
                onChange={(e) => setNewTitle({ ...newTitle, title: e.target.value })}
                className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
              />

              <div className="grid grid-cols-3 gap-4">
                <select
                  value={newTitle.type}
                  onChange={(e) => setNewTitle({ ...newTitle, type: e.target.value })}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                >
                  <option value="longform">롱폼</option>
                  <option value="shortform">숏폼</option>
                  <option value="product">상품</option>
                </select>
                <input
                  type="text"
                  placeholder="카테고리 (선택)"
                  value={newTitle.category}
                  onChange={(e) => setNewTitle({ ...newTitle, category: e.target.value })}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="태그 (쉼표로 구분)"
                  value={newTitle.tags}
                  onChange={(e) => setNewTitle({ ...newTitle, tags: e.target.value })}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {newTitle.type === 'product' && (
                <input
                  type="url"
                  placeholder="상품 URL (선택)"
                  value={newTitle.productUrl}
                  onChange={(e) => setNewTitle({ ...newTitle, productUrl: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                />
              )}
            </div>
            <button
              onClick={addTitle}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition"
            >
              추가
            </button>
          </div>

          {/* 제목 리스트 */}
          <div className="space-y-3">
            {titles.length === 0 ? (
              <p className="text-slate-400">등록된 제목이 없습니다</p>
            ) : (
              titles.map((title) => {
                const titleSchedules = schedules.filter(s => s.title_id === title.id);
                const isEditing = editingId === title.id;

                if (isEditing) {
                  return (
                    <div key={title.id} className="p-4 bg-slate-700 rounded-lg border-2 border-blue-500">
                      {/* 제목 수정 폼 */}
                      <h3 className="text-white font-semibold mb-3">제목 수정</h3>
                      <div className="space-y-3 mb-4">
                        <input
                          type="text"
                          value={editForm.title || ''}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <input
                            type="text"
                            placeholder="카테고리"
                            value={editForm.category || ''}
                            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                            className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                          />
                          <input
                            type="text"
                            placeholder="태그"
                            value={editForm.tags || ''}
                            onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                            className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* 스케줄 목록 */}
                      {titleSchedules.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm text-slate-300 font-semibold mb-2">스케줄:</h4>
                          {titleSchedules.map(schedule => (
                            <div key={schedule.id} className="bg-slate-600 rounded p-2 mb-2 flex justify-between items-center">
                              <div className="text-xs text-slate-200">
                                {new Date(schedule.scheduled_time).toLocaleString('ko-KR')}
                              </div>
                              <button
                                onClick={() => deleteSchedule(schedule.id)}
                                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs"
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 스케줄 추가 */}
                      <div className="mb-4">
                        <h4 className="text-sm text-slate-300 font-semibold mb-2">스케줄 추가:</h4>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="datetime-local"
                            id="newScheduleTime"
                            className="px-3 py-2 bg-slate-600 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                          />
                          <input
                            type="datetime-local"
                            id="newYoutubeTime"
                            placeholder="유튜브 공개 (선택)"
                            className="px-3 py-2 bg-slate-600 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                          />
                          <button
                            onClick={() => {
                              const scheduleTime = (document.getElementById('newScheduleTime') as HTMLInputElement).value;
                              const youtubeTime = (document.getElementById('newYoutubeTime') as HTMLInputElement).value;
                              if (!scheduleTime) {
                                alert('실행 시간 입력 필요');
                                return;
                              }
                              addScheduleToTitle(title.id, scheduleTime, youtubeTime);
                              (document.getElementById('newScheduleTime') as HTMLInputElement).value = '';
                              (document.getElementById('newYoutubeTime') as HTMLInputElement).value = '';
                            }}
                            className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-semibold"
                          >
                            + 추가
                          </button>
                        </div>
                      </div>

                      {/* 버튼 */}
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition"
                        >
                          저장
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => deleteTitle(title.id)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={title.id}
                    onClick={() => startEdit(title)}
                    className="p-4 bg-slate-700 rounded-lg hover:bg-slate-650 cursor-pointer transition"
                  >
                    <h4 className="text-white font-semibold text-lg">{title.title}</h4>
                    <p className="text-sm text-slate-400">
                      {title.type} | {title.status}
                      {title.category && ` | ${title.category}`}
                    </p>
                    {title.product_url && (
                      <p className="text-xs text-blue-400 mt-1">🔗 {title.product_url}</p>
                    )}
                    {titleSchedules.length > 0 && (
                      <p className="text-xs text-green-400 mt-2">
                        📅 스케줄 {titleSchedules.length}개
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
