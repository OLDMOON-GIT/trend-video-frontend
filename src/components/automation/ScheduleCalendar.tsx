'use client';

import { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

interface Schedule {
  id: string;
  title: string;
  scheduled_time: string;
  youtube_publish_time?: string;
  status: string;
  channel: string;
  channel_name?: string;
  color: string;
  type: string;
  category?: string;
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

export default function ScheduleCalendar() {
  const [date, setDate] = useState(new Date());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [channelSettings, setChannelSettings] = useState<ChannelSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 월별 스케줄 조회
  const fetchSchedules = async (targetDate: Date) => {
    try {
      setLoading(true);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      const response = await fetch(
        `/api/automation/calendar?year=${year}&month=${month}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch schedules');
      }

      const data = await response.json();
      setSchedules(data.schedules || []);
      setChannelSettings(data.channelSettings || []);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  // 날짜 변경 시 스케줄 조회
  useEffect(() => {
    fetchSchedules(date);
  }, [date]);

  // 특정 날짜의 스케줄 가져오기
  const getSchedulesForDate = (targetDate: Date): Schedule[] => {
    const dateStr = targetDate.toISOString().split('T')[0];
    return schedules.filter((schedule) => {
      const scheduleDate = new Date(schedule.scheduled_time)
        .toISOString()
        .split('T')[0];
      return scheduleDate === dateStr;
    });
  };

  // 달력 타일 스타일 커스터마이징
  const tileClassName = ({ date: tileDate, view }: any) => {
    if (view !== 'month') return null;

    const daySchedules = getSchedulesForDate(tileDate);
    if (daySchedules.length === 0) return null;

    // 해당 날짜의 대표 색상 (첫 번째 스케줄의 색상)
    return 'has-schedule';
  };

  // 달력 타일 내용 커스터마이징
  const tileContent = ({ date: tileDate, view }: any) => {
    if (view !== 'month') return null;

    const daySchedules = getSchedulesForDate(tileDate);

    if (daySchedules.length === 0) return null;

    // 채널별로 그룹화하여 색상 점 표시
    const uniqueChannels = Array.from(
      new Set(daySchedules.map((s) => s.channel))
    ).slice(0, 3);

    return (
      <div className="flex flex-wrap gap-1 mt-1 justify-center">
        {uniqueChannels.map((channelId) => {
          const schedule = daySchedules.find((s) => s.channel === channelId);
          return (
            <div
              key={channelId}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: schedule?.color }}
              title={schedule?.channel_name || channelId}
            />
          );
        })}
        {daySchedules.length > 3 && (
          <div className="text-xs text-gray-500">+{daySchedules.length - 3}</div>
        )}
      </div>
    );
  };

  // 날짜 클릭 시
  const onDateClick = (value: Date) => {
    setSelectedDate(value);
  };

  // 선택된 날짜의 스케줄
  const selectedDateSchedules = selectedDate
    ? getSchedulesForDate(selectedDate)
    : [];

  // 상태별 색상
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // 상태별 한글 표시
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return '대기';
      case 'processing':
        return '진행중';
      case 'completed':
        return '완료';
      case 'failed':
        return '실패';
      case 'cancelled':
        return '취소';
      default:
        return status;
    }
  };

  return (
    <div className="flex gap-4">
      <style jsx global>{`
        .react-calendar .has-schedule {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%);
          font-weight: 600;
        }
        .react-calendar .has-schedule:hover {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(147, 51, 234, 0.2) 100%);
        }
      `}</style>

      {/* 달력 */}
      <div className="flex-1">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-bold mb-4">스케줄 달력</h2>

          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {!loading && (
            <Calendar
              onChange={(value: any) => setDate(value)}
              value={date}
              onClickDay={onDateClick}
              tileContent={tileContent}
              tileClassName={tileClassName}
              locale="ko-KR"
              className="border-none w-full"
              onActiveStartDateChange={({ activeStartDate }) => {
                if (activeStartDate) {
                  fetchSchedules(activeStartDate);
                }
              }}
            />
          )}

          {/* 채널 범례 */}
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-semibold mb-2">채널</h3>
            <div className="flex flex-wrap gap-2">
              {channelSettings.map((setting) => (
                <div key={setting.id} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: setting.color }}
                  />
                  <span className="text-sm">{setting.channel_name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 선택된 날짜의 스케줄 목록 */}
      <div className="w-80">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-bold mb-4">
            {selectedDate
              ? `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 스케줄`
              : '날짜를 선택하세요'}
          </h2>

          {selectedDate && (
            <>
              {selectedDateSchedules.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  스케줄이 없습니다
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedDateSchedules.map((schedule) => {
                    const scheduledTime = new Date(schedule.scheduled_time);
                    const timeStr = `${String(scheduledTime.getHours()).padStart(
                      2,
                      '0'
                    )}:${String(scheduledTime.getMinutes()).padStart(2, '0')}`;

                    return (
                      <div
                        key={schedule.id}
                        className="border-l-4 pl-3 py-2"
                        style={{ borderLeftColor: schedule.color }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {schedule.title}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {timeStr} • {schedule.channel_name || schedule.channel}
                            </div>
                            {schedule.category && (
                              <div className="text-xs text-gray-400 mt-1">
                                {schedule.category}
                              </div>
                            )}
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded ${getStatusColor(
                              schedule.status
                            )}`}
                          >
                            {getStatusLabel(schedule.status)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* 통계 */}
        <div className="bg-white rounded-lg shadow p-4 mt-4">
          <h3 className="text-sm font-semibold mb-3">이번 달 통계</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">전체 스케줄</span>
              <span className="font-medium">{schedules.length}개</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">대기중</span>
              <span className="font-medium text-yellow-600">
                {schedules.filter((s) => s.status === 'pending').length}개
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">완료</span>
              <span className="font-medium text-green-600">
                {schedules.filter((s) => s.status === 'completed').length}개
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">실패</span>
              <span className="font-medium text-red-600">
                {schedules.filter((s) => s.status === 'failed').length}개
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
