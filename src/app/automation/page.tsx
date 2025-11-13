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
  const [newTitle, setNewTitle] = useState({
    title: '',
    type: 'longform',
    category: '',
    tags: '',
    productUrl: '',
    scheduleTime: '',
    channel: '',
    scriptMode: 'chrome',
    mediaMode: 'imagen3'
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [recentTitles, setRecentTitles] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingScheduleFor, setAddingScheduleFor] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);

  // 현재 시간 + 3분 계산 (로컬 시간대)
  function getDefaultScheduleTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 3);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  useEffect(() => {
    fetchData();
    loadRecentTitles();
    fetchChannels();

    // URL 파라미터로 titleId가 있으면 자동으로 수정 모드
    const titleId = searchParams.get('titleId');
    if (titleId) {
      setEditingId(titleId);
    }
  }, [searchParams]);

  async function fetchChannels() {
    try {
      const response = await fetch('/api/youtube/channels');
      const data = await response.json();
      if (data.channels && data.channels.length > 0) {
        setChannels(data.channels);
        // 첫 번째 채널을 기본값으로 설정
        if (!newTitle.channel) {
          setNewTitle(prev => ({ ...prev, channel: data.channels[0].id }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    }
  }

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
      setSettings(status.status.settings);
      setTitles(titlesData.titles || []);
      setSchedules(schedulesData.schedules || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
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
    } catch (error) {
      console.error(`Failed to ${action} scheduler:`, error);
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
          productUrl: newTitle.productUrl,
          channel: newTitle.channel,
          scriptMode: newTitle.scriptMode,
          mediaMode: newTitle.mediaMode
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
      setNewTitle({
        title: '',
        type: 'longform',
        category: '',
        tags: '',
        productUrl: '',
        scheduleTime: '',
        channel: channels.length > 0 ? channels[0].id : '',
        scriptMode: 'chrome',
        mediaMode: 'imagen3'
      });
      setShowAddForm(false);
      await fetchData();
    } catch (error) {
      console.error('Failed to add title:', error);
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
    } catch (error) {
      console.error('Failed to delete title:', error);
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
    } catch (error) {
      console.error('Failed to delete schedule:', error);
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

      cancelEdit();
      await fetchData();
    } catch (error) {
      console.error('Failed to save edit:', error);
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
    } catch (error) {
      console.error('Failed to add schedule:', error);
    }
  }

  async function updateSchedule(scheduleId: string, scheduledTime: string) {
    try {
      const response = await fetch('/api/automation/schedules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scheduleId,
          scheduledTime
        })
      });

      if (!response.ok) throw new Error('Failed to update schedule');

      await fetchData();
    } catch (error) {
      console.error('Failed to update schedule:', error);
    }
  }

  async function updateSettings(newSettings: any) {
    try {
      const response = await fetch('/api/automation/scheduler', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: newSettings
        })
      });

      if (!response.ok) throw new Error('Failed to update settings');

      await fetchData();
    } catch (error) {
      console.error('Failed to update settings:', error);
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
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-400">
                      📝 최근 사용한 제목 (클릭하여 재사용)
                    </label>
                    <div className="max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
                      <div className="flex flex-wrap gap-2">
                        {recentTitles.map((title, idx) => (
                          <button
                            key={idx}
                            onClick={() => setNewTitle({ ...newTitle, title })}
                            className="rounded-md bg-emerald-600/20 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-600/40 hover:text-emerald-100"
                            title={title}
                          >
                            {title.length > 30 ? title.substring(0, 30) + '...' : title}
                          </button>
                        ))}
                      </div>
                    </div>
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

                {/* 채널, 대본 생성, 미디어 생성 방식 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">채널</label>
                    <select
                      value={newTitle.channel || (channels.length > 0 ? channels[0].id : '')}
                      onChange={(e) => setNewTitle({ ...newTitle, channel: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      {channels.map((ch: any) => (
                        <option key={ch.id} value={ch.id}>{ch.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">대본 생성</label>
                    <select
                      value={newTitle.scriptMode}
                      onChange={(e) => setNewTitle({ ...newTitle, scriptMode: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="chrome">크롬창</option>
                      <option value="api">API</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">미디어 생성</label>
                    <select
                      value={newTitle.mediaMode}
                      onChange={(e) => setNewTitle({ ...newTitle, mediaMode: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                    >
                      <option value="upload">직접 업로드</option>
                      <option value="dalle">DALL-E 3</option>
                      <option value="imagen3">Imagen 3</option>
                      <option value="sora2">SORA 2</option>
                    </select>
                  </div>
                </div>

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
                    setNewTitle({
                      title: '',
                      type: 'longform',
                      category: '',
                      tags: '',
                      productUrl: '',
                      scheduleTime: '',
                      channel: channels.length > 0 ? channels[0].id : '',
                      scriptMode: 'chrome',
                      mediaMode: 'imagen3'
                    });
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
                            <div key={schedule.id} className="bg-slate-600 rounded p-2 mb-2">
                              {editingScheduleId === schedule.id ? (
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="datetime-local"
                                    id={`edit-schedule-${schedule.id}`}
                                    defaultValue={new Date(schedule.scheduled_time).toISOString().slice(0, 16)}
                                    className="flex-1 px-2 py-1 bg-slate-700 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-xs"
                                  />
                                  <button
                                    onClick={() => {
                                      const newTime = (document.getElementById(`edit-schedule-${schedule.id}`) as HTMLInputElement).value;
                                      if (newTime) {
                                        updateSchedule(schedule.id, newTime);
                                        setEditingScheduleId(null);
                                      }
                                    }}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingScheduleId(null)}
                                    className="px-2 py-1 bg-slate-500 hover:bg-slate-400 text-white rounded text-xs"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center">
                                  <div className="text-xs text-slate-200">
                                    {new Date(schedule.scheduled_time).toLocaleString('ko-KR')}
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setEditingScheduleId(schedule.id)}
                                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                                    >
                                      수정
                                    </button>
                                    <button
                                      onClick={() => deleteSchedule(schedule.id)}
                                      className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-xs"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

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
