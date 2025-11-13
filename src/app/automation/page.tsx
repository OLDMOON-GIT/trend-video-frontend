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
  const [newTitle, setNewTitle] = useState({ title: '', type: 'shortform', category: '', tags: '', productUrl: '' });
  const [selectedTitleId, setSelectedTitleId] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [youtubePublishTime, setYoutubePublishTime] = useState('');
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  useEffect(() => {
    fetchData();

    // URL 파라미터로 titleId가 있으면 자동으로 스케줄 폼 열기
    const titleId = searchParams.get('titleId');
    if (titleId) {
      setSelectedTitleId(titleId);
      setShowScheduleForm(true);
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

      setNewTitle({ title: '', type: 'shortform', category: '', tags: '', productUrl: '' });
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

  async function addSchedule() {
    if (!selectedTitleId || !scheduledTime) {
      alert('제목과 예약 시간은 필수입니다');
      return;
    }

    try {
      const response = await fetch('/api/automation/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleId: selectedTitleId,
          scheduledTime,
          youtubePublishTime: youtubePublishTime || null
        })
      });

      if (!response.ok) throw new Error('Failed to add schedule');

      setSelectedTitleId('');
      setScheduledTime('');
      setYoutubePublishTime('');
      await fetchData();
      alert('스케줄 추가 완료');
    } catch (error) {
      alert('스케줄 추가 실패');
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
          <div className="mt-4 text-sm text-slate-400">
            <p>체크 간격: {schedulerStatus?.settings?.check_interval || 60}초</p>
            <p>최대 재시도: {schedulerStatus?.settings?.max_retry || 3}회</p>
            <p>알림 이메일: {schedulerStatus?.settings?.alert_email || 'moony75@gmail.com'}</p>
          </div>
        </div>

        {/* 제목 리스트 관리 */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <h2 className="text-2xl font-semibold text-white mb-4">제목 리스트</h2>

          {/* 제목 추가 폼 */}
          <div className="mb-6 p-4 bg-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold text-white mb-3">새 제목 추가</h3>
            <div className="space-y-4 mb-4">
              {/* 제목 입력 - 전체 너비 */}
              <input
                type="text"
                placeholder="제목"
                value={newTitle.title}
                onChange={(e) => setNewTitle({ ...newTitle, title: e.target.value })}
                className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
              />

              {/* 타입, 카테고리, 태그 - 그리드 */}
              <div className="grid grid-cols-3 gap-4">
                <select
                  value={newTitle.type}
                  onChange={(e) => setNewTitle({ ...newTitle, type: e.target.value })}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                >
                  <option value="shortform">숏폼</option>
                  <option value="longform">롱폼</option>
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

              {/* 상품 URL - product 타입일 때만 표시 */}
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
          <div className="space-y-2">
            {titles.length === 0 ? (
              <p className="text-slate-400">등록된 제목이 없습니다</p>
            ) : (
              titles.map((title) => (
                <div key={title.id} className="p-4 bg-slate-700 rounded-lg flex justify-between items-center">
                  <div className="flex-1">
                    <h4 className="text-white font-semibold">{title.title}</h4>
                    <p className="text-sm text-slate-400">
                      타입: {title.type} | 상태: {title.status}
                      {title.category && ` | 카테고리: ${title.category}`}
                    </p>
                    {title.product_url && (
                      <p className="text-xs text-blue-400 mt-1">
                        🔗 {title.product_url}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteTitle(title.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm transition"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 스케줄 관리 */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-2xl font-semibold text-white mb-4">스케줄 관리</h2>

          {/* 스케줄 추가 폼 */}
          <div className="mb-6 p-4 bg-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold text-white mb-3">새 스케줄 추가</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <select
                value={selectedTitleId}
                onChange={(e) => setSelectedTitleId(e.target.value)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
              >
                <option value="">제목 선택</option>
                {titles.filter(t => t.status === 'pending').map((title) => (
                  <option key={title.id} value={title.id}>
                    {title.title} ({title.type})
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="실행 시간"
              />
              <input
                type="datetime-local"
                value={youtubePublishTime}
                onChange={(e) => setYoutubePublishTime(e.target.value)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg border border-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="유튜브 공개 시간 (선택)"
              />
            </div>
            <button
              onClick={addSchedule}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition"
            >
              스케줄 추가
            </button>
          </div>

          {/* 스케줄 리스트 */}
          <div className="space-y-2">
            {schedules.length === 0 ? (
              <p className="text-slate-400">등록된 스케줄이 없습니다</p>
            ) : (
              schedules.map((schedule) => (
                <div key={schedule.id} className="p-4 bg-slate-700 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-white font-semibold">{schedule.title}</h4>
                      <p className="text-sm text-slate-400">
                        타입: {schedule.type} | 상태: <span className={`font-semibold ${
                          schedule.status === 'completed' ? 'text-green-400' :
                          schedule.status === 'failed' ? 'text-red-400' :
                          schedule.status === 'processing' ? 'text-yellow-400' :
                          'text-slate-400'
                        }`}>{schedule.status}</span>
                      </p>
                      <p className="text-sm text-slate-400">
                        예약: {new Date(schedule.scheduled_time).toLocaleString('ko-KR')}
                      </p>
                      {schedule.youtube_publish_time && (
                        <p className="text-sm text-slate-400">
                          공개: {new Date(schedule.youtube_publish_time).toLocaleString('ko-KR')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => viewPipelineDetails(schedule.id)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition"
                      >
                        상세
                      </button>
                      <button
                        onClick={() => deleteSchedule(schedule.id)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm transition"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
