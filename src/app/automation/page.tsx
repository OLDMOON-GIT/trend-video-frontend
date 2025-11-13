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
  const [newTitle, setNewTitle] = useState({ title: '', type: 'longform', category: '', tags: '', productUrl: '', scheduleTime: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [recentTitles, setRecentTitles] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingScheduleFor, setAddingScheduleFor] = useState<string | null>(null);

  // 현재 시간 + 3분 계산
  function getDefaultScheduleTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 3);
    return now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm 형식
  }

  useEffect(() => {
    fetchData();
    loadRecentTitles();

    // URL 파라미터로 titleId가 있으면 자동으로 수정 모드
    const titleId = searchParams.get('titleId');
    if (titleId) {
      setEditingId(titleId);
    }
  }, [searchParams]);

  function loadRecentTitles() {
    try {
      const saved = localStorage.getItem('automation_recent_titles');
      if (saved) {
        setRecentTitles(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load recent titles:', error);
    }
  }

  function saveRecentTitle(title: string) {
    try {
      const saved = localStorage.getItem('automation_recent_titles');
      const recent = saved ? JSON.parse(saved) : [];
      const updated = [title, ...recent.filter((t: string) => t !== title)].slice(0, 4);
      localStorage.setItem('automation_recent_titles', JSON.stringify(updated));
      setRecentTitles(updated);
    } catch (error) {
      console.error('Failed to save recent title:', error);
    }
  }

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
        body: JSON.stringify({
          title: newTitle.title,
          type: newTitle.type,
          category: newTitle.category,
          tags: newTitle.tags,
          productUrl: newTitle.productUrl
        })
      });

      if (!response.ok) throw new Error('Failed to add title');

      const data = await response.json();
      const titleId = data.titleId;

      // 스케줄 시간이 입력되었으면 스케줄 추가
      if (newTitle.scheduleTime) {
        await addScheduleToTitle(titleId, newTitle.scheduleTime);
      }

      saveRecentTitle(newTitle.title);
      setNewTitle({ title: '', type: 'longform', category: '', tags: '', productUrl: '', scheduleTime: '' });
      setShowAddForm(false);
      await fetchData();
      alert(newTitle.scheduleTime ? '제목 및 스케줄 추가 완료' : '제목 추가 완료');
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

          {/* 제목 추가 버튼/폼 */}
          {!showAddForm ? (
            <button
              onClick={() => {
                setShowAddForm(true);
                // 폼 열 때 기본 스케줄 시간 설정
                setNewTitle(prev => ({ ...prev, scheduleTime: getDefaultScheduleTime() }));
              }}
              className="mb-6 w-full px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition"
            >
              + 새 제목 추가
            </button>
          ) : (
            <div className="mb-6 p-4 bg-slate-700 rounded-lg border-2 border-green-500">
              <h3 className="text-lg font-semibold text-white mb-3">새 제목 추가</h3>
              <div className="space-y-4 mb-4">
                <input
                  type="text"
                  placeholder="제목"
                  value={newTitle.title}
                  onChange={(e) => setNewTitle({ ...newTitle, title: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                />

                {/* 최근 제목 4개 */}
                {recentTitles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-slate-400 self-center">최근:</span>
                    {recentTitles.map((title, idx) => (
                      <button
                        key={idx}
                        onClick={() => setNewTitle({ ...newTitle, title })}
                        className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded text-xs transition"
                      >
                        {title.length > 30 ? title.substring(0, 30) + '...' : title}
                      </button>
                    ))}
                  </div>
                )}

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

                {/* 스케줄 시간 입력 */}
                <div>
                  <label className="text-sm text-slate-300 block mb-2">📅 스케줄 (선택)</label>
                  <input
                    type="datetime-local"
                    value={newTitle.scheduleTime}
                    onChange={(e) => setNewTitle({ ...newTitle, scheduleTime: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">비워두면 제목만 추가됩니다</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addTitle}
                  className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition"
                >
                  추가
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewTitle({ title: '', type: 'longform', category: '', tags: '', productUrl: '', scheduleTime: '' });
                  }}
                  className="flex-1 px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition"
                >
                  취소
                </button>
              </div>
            </div>
          )}

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
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-slate-400 block mb-1">실행 시간</label>
                            <input
                              type="datetime-local"
                              id="newScheduleTime"
                              className="w-full px-3 py-2 bg-slate-600 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const scheduleTime = (document.getElementById('newScheduleTime') as HTMLInputElement).value;
                              if (!scheduleTime) {
                                alert('실행 시간 입력 필요');
                                return;
                              }
                              addScheduleToTitle(title.id, scheduleTime);
                              (document.getElementById('newScheduleTime') as HTMLInputElement).value = '';
                            }}
                            className="self-end px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-semibold transition"
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
                    className="p-4 bg-slate-700 rounded-lg"
                  >
                    {/* 제목 정보 */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h4 className="text-white font-semibold text-lg">{title.title}</h4>
                        <p className="text-sm text-slate-400">
                          {title.type} | {title.status}
                          {title.category && ` | ${title.category}`}
                        </p>
                        {title.product_url && (
                          <p className="text-xs text-blue-400 mt-1">🔗 {title.product_url}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(title)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => deleteTitle(title.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-sm transition"
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {/* 스케줄 목록 */}
                    {titleSchedules.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-slate-400 font-semibold mb-2">📅 등록된 스케줄:</p>
                        <div className="space-y-1">
                          {titleSchedules.map((schedule: any) => (
                            <div key={schedule.id} className="flex justify-between items-center bg-slate-600 rounded px-3 py-2">
                              <span className="text-xs text-green-400">
                                {new Date(schedule.scheduled_time).toLocaleString('ko-KR')}
                                {schedule.status !== 'pending' && ` (${schedule.status})`}
                              </span>
                              <button
                                onClick={() => deleteSchedule(schedule.id)}
                                className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs transition"
                              >
                                삭제
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 스케줄 추가 */}
                    {addingScheduleFor === title.id ? (
                      <div className="bg-slate-600 rounded-lg p-3">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-slate-300 block mb-1">실행 시간</label>
                            <input
                              type="datetime-local"
                              id={`schedule-${title.id}`}
                              className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="self-end flex gap-2">
                            <button
                              onClick={() => {
                                const time = (document.getElementById(`schedule-${title.id}`) as HTMLInputElement).value;
                                if (!time) {
                                  alert('시간 입력 필요');
                                  return;
                                }
                                addScheduleToTitle(title.id, time);
                                setAddingScheduleFor(null);
                              }}
                              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-semibold transition"
                            >
                              추가
                            </button>
                            <button
                              onClick={() => setAddingScheduleFor(null)}
                              className="px-4 py-2 bg-slate-500 hover:bg-slate-400 text-white rounded text-sm transition"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingScheduleFor(title.id)}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-semibold transition"
                      >
                        + 스케줄 추가
                      </button>
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
