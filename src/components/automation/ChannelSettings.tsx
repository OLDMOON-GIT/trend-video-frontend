'use client';

import { useState, useEffect, useRef } from 'react';

interface Channel {
  channelId: string;
  channelName: string;
  thumbnail?: string;
}

interface ChannelSetting {
  id: string;
  channel_id: string;
  channel_name: string;
  color: string;
  posting_mode: 'fixed_interval' | 'weekday_time';
  interval_value?: number;
  interval_unit?: 'minutes' | 'hours' | 'days';
  weekdays?: number[];
  posting_times?: string[]; // 여러 시간대 지원 (배열로 변경)
  isActive: boolean;
  categories?: string[]; // 자동 제목 생성용 카테고리 리스트
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // yellow
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export default function ChannelSettings() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [settings, setSettings] = useState<ChannelSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [editingSetting, setEditingSetting] = useState<Partial<ChannelSetting> | null>(
    null
  );
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [triggering, setTriggering] = useState(false);

  // 설정 편집 섹션 ref
  const editingRef = useRef<HTMLDivElement>(null);

  // 채널 목록 조회
  const fetchChannels = async () => {
    try {
      const response = await fetch('/api/youtube/channels');
      if (!response.ok) throw new Error('Failed to fetch channels');

      const data = await response.json();
      setChannels(
        data.channels?.map((ch: any) => ({
          channelId: ch.channelId,
          channelName: ch.channelTitle || ch.channelId,
          thumbnail: ch.thumbnailUrl,
        })) || []
      );
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  // 채널 설정 조회
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/automation/channel-settings');
      if (!response.ok) throw new Error('Failed to fetch settings');

      const data = await response.json();
      setSettings(data.settings || []);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // 카테고리 목록 조회
  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/automation/categories');
      if (!response.ok) throw new Error('Failed to fetch categories');

      const data = await response.json();
      setAvailableCategories(data.categories?.map((c: any) => c.name) || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // 스케줄러 상태 조회
  const fetchSchedulerStatus = async () => {
    try {
      const response = await fetch('/api/automation/scheduler-status');
      if (!response.ok) throw new Error('Failed to fetch scheduler status');

      const data = await response.json();
      setSchedulerStatus(data.status);
    } catch (error) {
      console.error('Error fetching scheduler status:', error);
    }
  };

  // 수동 트리거
  const handleManualTrigger = async () => {
    if (triggering) return;

    try {
      setTriggering(true);
      const response = await fetch('/api/automation/trigger-auto-schedule', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger auto-schedule');
      }

      alert(data.message || '자동 생성 완료!');
      await Promise.all([fetchSettings(), fetchSchedulerStatus()]);
    } catch (error: any) {
      console.error('Error triggering auto-schedule:', error);
      alert('오류: ' + error.message);
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    Promise.all([
      fetchChannels(),
      fetchSettings(),
      fetchCategories(),
      fetchSchedulerStatus(),
    ]);

    // 30초마다 스케줄러 상태 갱신
    const interval = setInterval(fetchSchedulerStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // 채널 선택 시 설정 편집 영역으로 스크롤
  useEffect(() => {
    if (editingSetting && editingRef.current) {
      setTimeout(() => {
        editingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [editingSetting]);

  // 채널 선택
  const handleChannelSelect = (channelId: string) => {
    const existingSetting = settings.find((s) => s.channel_id === channelId);
    const channel = channels.find((c) => c.channelId === channelId);

    if (existingSetting) {
      setEditingSetting(existingSetting);
    } else if (channel) {
      // 새 설정 생성
      const usedColors = settings.map((s) => s.color);
      const availableColor =
        PRESET_COLORS.find((c) => !usedColors.includes(c)) || PRESET_COLORS[0];

      setEditingSetting({
        channel_id: channelId,
        channel_name: channel.channelName,
        color: availableColor,
        posting_mode: 'fixed_interval',
        interval_value: 3,
        interval_unit: 'days',
        weekdays: [1, 3, 5], // 월, 수, 금
        posting_times: ['09:00', '12:00', '15:00', '18:00', '21:00'], // 하루 5회 기본값
        isActive: true,
        categories: [], // 빈 배열로 시작
      });
    }

    setSelectedChannel(channelId);
  };

  // 설정 저장
  const handleSaveSetting = async () => {
    if (!editingSetting) return;

    console.log('💾 저장할 채널 설정:', editingSetting);

    try {
      const response = await fetch('/api/automation/channel-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingSetting),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ 저장 실패:', errorData);
        throw new Error(errorData.error || 'Failed to save setting');
      }

      await fetchSettings();
      setSelectedChannel(null);
      setEditingSetting(null);
      alert('채널 설정이 저장되었습니다.');
    } catch (error: any) {
      console.error('Error saving setting:', error);
      alert(`설정 저장에 실패했습니다.\n${error.message || '알 수 없는 오류'}`);
    }
  };

  // 설정 삭제
  const handleDeleteSetting = async (channelId: string) => {
    if (!confirm('이 채널 설정을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(
        `/api/automation/channel-settings?channelId=${channelId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Failed to delete setting');

      await fetchSettings();
      alert('채널 설정이 삭제되었습니다.');
    } catch (error) {
      console.error('Error deleting setting:', error);
      alert('설정 삭제에 실패했습니다.');
    }
  };

  // 요일 토글
  const toggleWeekday = (day: number) => {
    if (!editingSetting) return;

    const weekdays = editingSetting.weekdays || [];
    const newWeekdays = weekdays.includes(day)
      ? weekdays.filter((d) => d !== day)
      : [...weekdays, day].sort();

    setEditingSetting({ ...editingSetting, weekdays: newWeekdays });
  };

  // 카테고리 토글
  const toggleCategory = (category: string) => {
    if (!editingSetting) return;

    const categories = editingSetting.categories || [];
    const newCategories = categories.includes(category)
      ? categories.filter((c) => c !== category)
      : [...categories, category];

    setEditingSetting({ ...editingSetting, categories: newCategories });
  };

  // 카테고리 직접 추가
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const addCustomCategory = () => {
    if (!editingSetting || !newCategoryInput.trim()) return;

    const categories = editingSetting.categories || [];
    if (categories.includes(newCategoryInput.trim())) {
      alert('이미 추가된 카테고리입니다.');
      return;
    }

    setEditingSetting({
      ...editingSetting,
      categories: [...categories, newCategoryInput.trim()],
    });
    setNewCategoryInput('');
  };

  return (
    <div className="space-y-4">
      {/* 스케줄러 상태 및 수동 트리거 */}
      <div className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg shadow p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-sm font-medium opacity-90">🤖 자동화 스케줄러 상태</h3>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">상태:</span>
                {schedulerStatus?.isRunning ? (
                  <span className="text-xs bg-green-400 text-green-900 px-2 py-0.5 rounded-full font-medium">
                    ● 실행 중
                  </span>
                ) : (
                  <span className="text-xs bg-red-400 text-red-900 px-2 py-0.5 rounded-full font-medium">
                    ○ 정지됨
                  </span>
                )}
              </div>
              {schedulerStatus?.lastAutoScheduleCheck && (
                <div className="text-xs opacity-80">
                  마지막 체크: {new Date(schedulerStatus.lastAutoScheduleCheck).toLocaleString('ko-KR')}
                </div>
              )}
              {schedulerStatus?.lastAutoScheduleResult && (
                <div className="text-xs opacity-80">
                  결과: ✅ {schedulerStatus.lastAutoScheduleResult.success}개 생성,
                  ⏭️ {schedulerStatus.lastAutoScheduleResult.skipped}개 건너뜀,
                  ❌ {schedulerStatus.lastAutoScheduleResult.failed}개 실패
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleManualTrigger}
            disabled={triggering}
            className="px-4 py-2 bg-white text-purple-600 rounded-lg font-medium hover:bg-purple-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggering ? '실행 중...' : '🚀 지금 자동 생성 실행'}
          </button>
        </div>
      </div>

      {/* 채널 목록 */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-bold mb-4">채널별 스케줄 설정</h2>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {channels.map((channel) => {
              const setting = settings.find((s) => s.channel_id === channel.channelId);
              return (
                <div
                  key={channel.channelId}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedChannel === channel.channelId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleChannelSelect(channel.channelId)}
                >
                  <div className="flex items-center gap-3">
                    {channel.thumbnail && (
                      <img
                        src={channel.thumbnail}
                        alt={channel.channelName}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{channel.channelName}</div>
                      {setting && (
                        <>
                          <div className="text-xs text-gray-500 mt-1">
                            {setting.posting_mode === 'fixed_interval'
                              ? `${setting.interval_value}${
                                  setting.interval_unit === 'minutes' ? '분' :
                                  setting.interval_unit === 'hours' ? '시간' : '일'
                                }마다`
                              : `${setting.weekdays
                                  ?.map((d) => WEEKDAY_LABELS[d])
                                  .join(', ')} ${(setting.posting_times || []).join(', ')}`}
                          </div>
                          {/* 완전 자동화 상태 표시 */}
                          {setting.categories && setting.categories.length > 0 && (
                            <div className="mt-2 flex items-center gap-1">
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                🤖 완전 자동화
                              </span>
                              <span className="text-xs text-gray-500">
                                카테고리 {setting.categories.length}개
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {setting && (
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: setting.color }}
                      />
                    )}
                  </div>

                  {setting && (
                    <>
                      {/* 카테고리 표시 (접혀있을 때) */}
                      {setting.categories && setting.categories.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-xs text-gray-600 mb-1">자동 제목 카테고리:</div>
                          <div className="flex flex-wrap gap-1">
                            {setting.categories.slice(0, 3).map((cat) => (
                              <span
                                key={cat}
                                className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded"
                              >
                                {cat}
                              </span>
                            ))}
                            {setting.categories.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{setting.categories.length - 3}개
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSetting(channel.channelId);
                          }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 설정 편집 */}
      {editingSetting && (
        <div ref={editingRef} className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-bold mb-4">
            {editingSetting.channel_name} 설정
          </h3>

          <div className="space-y-4">
            {/* 색상 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">달력 색상</label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() =>
                      setEditingSetting({ ...editingSetting, color })
                    }
                    className={`w-8 h-8 rounded-full border-2 ${
                      editingSetting.color === color
                        ? 'border-gray-800'
                        : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* 주기 모드 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">주기 설정 방식</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={editingSetting.posting_mode === 'fixed_interval'}
                    onChange={() =>
                      setEditingSetting({
                        ...editingSetting,
                        posting_mode: 'fixed_interval',
                      })
                    }
                  />
                  <span className="text-sm">고정 주기</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={editingSetting.posting_mode === 'weekday_time'}
                    onChange={() =>
                      setEditingSetting({
                        ...editingSetting,
                        posting_mode: 'weekday_time',
                      })
                    }
                  />
                  <span className="text-sm">요일/시간 지정</span>
                </label>
              </div>
            </div>

            {/* 고정 주기 설정 */}
            {editingSetting.posting_mode === 'fixed_interval' && (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">주기</label>
                  <input
                    type="number"
                    min="1"
                    value={editingSetting.interval_value || 1}
                    onChange={(e) =>
                      setEditingSetting({
                        ...editingSetting,
                        interval_value: parseInt(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">단위</label>
                  <select
                    value={editingSetting.interval_unit || 'days'}
                    onChange={(e) =>
                      setEditingSetting({
                        ...editingSetting,
                        interval_unit: e.target.value as 'minutes' | 'hours' | 'days',
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="minutes">분 (테스트용, 최소 5분)</option>
                    <option value="hours">시간</option>
                    <option value="days">일</option>
                  </select>
                </div>
              </div>
            )}

            {/* 요일/시간 설정 */}
            {editingSetting.posting_mode === 'weekday_time' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">요일 선택</label>
                  <div className="flex gap-2">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <button
                        key={index}
                        onClick={() => toggleWeekday(index)}
                        className={`w-10 h-10 rounded ${
                          editingSetting.weekdays?.includes(index)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    업로드 시간 (하루에 여러 시간 설정 가능)
                  </label>
                  <div className="space-y-2">
                    {(editingSetting.posting_times || ['18:00']).map((time, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => {
                            const newTimes = [...(editingSetting.posting_times || [])];
                            newTimes[index] = e.target.value;
                            setEditingSetting({
                              ...editingSetting,
                              posting_times: newTimes,
                            });
                          }}
                          className="px-3 py-2 border rounded"
                        />
                        <button
                          onClick={() => {
                            const newTimes = (editingSetting.posting_times || []).filter((_, i) => i !== index);
                            setEditingSetting({
                              ...editingSetting,
                              posting_times: newTimes.length > 0 ? newTimes : ['18:00'],
                            });
                          }}
                          className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm"
                        >
                          ❌ 삭제
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const currentTimes = editingSetting.posting_times || ['18:00'];
                        setEditingSetting({
                          ...editingSetting,
                          posting_times: [...currentTimes, '18:00'],
                        });
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm"
                    >
                      ➕ 시간 추가
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* 카테고리 선택 (완전 자동화용) */}
            <div className="pt-4 border-t">
              <div className="mb-2">
                <label className="block text-sm font-medium mb-1">
                  자동 제목 생성 카테고리
                  <span className="ml-2 text-xs text-gray-500">
                    (주기 도래 시 선택한 카테고리에서 제목 자동 생성)
                  </span>
                </label>
              </div>

              {/* 등록된 카테고리 버튼들 */}
              <div className="flex flex-wrap gap-2 mb-3">
                {availableCategories.length === 0 ? (
                  <div className="text-sm text-yellow-400 p-3 bg-yellow-400/10 border border-yellow-400/30 rounded">
                    ⚠️ 등록된 카테고리가 없습니다.
                    <a href="#category-management" className="ml-2 underline hover:text-yellow-300">
                      카테고리 관리 탭에서 먼저 카테고리를 등록해주세요.
                    </a>
                  </div>
                ) : (
                  availableCategories.map((category) => (
                    <button
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`px-3 py-1 rounded-full text-sm ${
                        editingSetting.categories?.includes(category)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {category}
                    </button>
                  ))
                )}
              </div>

              {/* 사용자 정의 카테고리 추가 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomCategory();
                    }
                  }}
                  placeholder="직접 입력 (예: 운동, 재테크)"
                  className="flex-1 px-3 py-2 border rounded text-sm"
                />
                <button
                  onClick={addCustomCategory}
                  className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                >
                  추가
                </button>
              </div>

              {/* 선택된 카테고리 표시 */}
              {editingSetting.categories && editingSetting.categories.length > 0 && (
                <div className="mt-3 p-3 bg-blue-50 rounded">
                  <div className="text-xs font-medium text-blue-900 mb-2">
                    선택된 카테고리 ({editingSetting.categories.length}개)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingSetting.categories.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                      >
                        {cat}
                        <button
                          onClick={() => toggleCategory(cat)}
                          className="hover:text-blue-600"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 저장 버튼 */}
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleSaveSetting}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setSelectedChannel(null);
                  setEditingSetting(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
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
