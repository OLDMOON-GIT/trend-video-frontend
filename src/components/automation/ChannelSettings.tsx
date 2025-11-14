'use client';

import { useState, useEffect } from 'react';

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
  interval_unit?: 'hours' | 'days';
  weekdays?: number[];
  posting_time?: string;
  isActive: boolean;
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

  useEffect(() => {
    Promise.all([fetchChannels(), fetchSettings()]);
  }, []);

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
        posting_time: '18:00',
        isActive: true,
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

  return (
    <div className="space-y-4">
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
                        <div className="text-xs text-gray-500 mt-1">
                          {setting.posting_mode === 'fixed_interval'
                            ? `${setting.interval_value}${
                                setting.interval_unit === 'hours' ? '시간' : '일'
                              }마다`
                            : `${setting.weekdays
                                ?.map((d) => WEEKDAY_LABELS[d])
                                .join(', ')} ${setting.posting_time}`}
                        </div>
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 설정 편집 */}
      {editingSetting && (
        <div className="bg-white rounded-lg shadow p-4">
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
                        interval_unit: e.target.value as 'hours' | 'days',
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                  >
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
                  <label className="block text-sm font-medium mb-2">업로드 시간</label>
                  <input
                    type="time"
                    value={editingSetting.posting_time || '18:00'}
                    onChange={(e) =>
                      setEditingSetting({
                        ...editingSetting,
                        posting_time: e.target.value,
                      })
                    }
                    className="px-3 py-2 border rounded"
                  />
                </div>
              </>
            )}

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
