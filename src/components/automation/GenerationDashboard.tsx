'use client';

import { useState, useEffect } from 'react';

interface GenerationLog {
  id: string;
  channel_name: string;
  category: string;
  status: string;
  step: string;
  models_used: string[] | null;
  titles_generated: Array<{ title: string; model: string; score: number }> | null;
  best_title: string;
  best_score: number;
  product_info: any;
  error_message: string;
  created_at: string;
  completed_at: string;
}

export default function GenerationDashboard() {
  const [ongoingLogs, setOngoingLogs] = useState<GenerationLog[]>([]);
  const [recentLogs, setRecentLogs] = useState<GenerationLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      // 진행 중인 것
      const ongoingResponse = await fetch('/api/automation/generation-status?type=ongoing');
      if (ongoingResponse.ok) {
        const data = await ongoingResponse.json();
        setOngoingLogs(data.logs || []);
      }

      // 최근 완료된 것
      const recentResponse = await fetch('/api/automation/generation-status?limit=20');
      if (recentResponse.ok) {
        const data = await recentResponse.json();
        setRecentLogs(data.logs || []);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // 5초마다 자동 갱신
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      started: 'bg-blue-100 text-blue-700',
      fetching: 'bg-yellow-100 text-yellow-700',
      generating: 'bg-purple-100 text-purple-700',
      evaluating: 'bg-orange-100 text-orange-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 진행 중인 생성 */}
      {ongoingLogs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="animate-pulse">🔄</span>
            진행 중인 자동 생성 ({ongoingLogs.length}개)
          </h3>
          <div className="space-y-3">
            {ongoingLogs.map((log) => (
              <div
                key={log.id}
                className="border border-purple-200 rounded-lg p-4 bg-purple-50"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{log.channel_name}</span>
                      <span className="text-sm text-gray-500">→</span>
                      <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {log.category}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{log.step}</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusBadge(
                      log.status
                    )}`}
                  >
                    {log.status}
                  </span>
                </div>

                {log.models_used && log.models_used.length > 0 && (
                  <div className="mt-2 flex gap-1">
                    {log.models_used.map((model) => (
                      <span
                        key={model}
                        className="text-xs bg-gray-200 px-2 py-0.5 rounded"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 생성 히스토리 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold mb-4">
          📊 최근 자동 생성 히스토리 (최근 20개)
        </h3>

        {recentLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            아직 자동 생성 기록이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className={`border rounded-lg p-4 ${
                  log.status === 'completed'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{log.channel_name}</span>
                      <span className="text-sm text-gray-500">→</span>
                      <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {log.category}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusBadge(
                          log.status
                        )}`}
                      >
                        {log.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(log.created_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                </div>

                {/* 성공 시: 제목 & 점수 */}
                {log.status === 'completed' && log.best_title && (
                  <div className="mt-3 p-3 bg-white rounded border">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-green-700 mb-1">
                          ✅ 선택된 제목
                        </div>
                        <div className="text-sm">{log.best_title}</div>
                      </div>
                      {log.best_score && (
                        <div className="ml-4 text-center">
                          <div className="text-2xl font-bold text-green-600">
                            {log.best_score.toFixed(0)}
                          </div>
                          <div className="text-xs text-gray-500">점수</div>
                        </div>
                      )}
                    </div>

                    {/* 모든 제목 점수 표시 */}
                    {log.titles_generated && log.titles_generated.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                          모든 후보 제목 보기 ({log.titles_generated.length}개)
                        </summary>
                        <div className="mt-2 space-y-1">
                          {log.titles_generated.map((item, idx) => (
                            <div
                              key={idx}
                              className="text-xs p-2 bg-gray-50 rounded flex items-center justify-between"
                            >
                              <div className="flex-1">
                                <span className="text-gray-600">[{item.model}]</span>{' '}
                                {item.title}
                              </div>
                              <span className="ml-2 font-medium text-blue-600">
                                {item.score?.toFixed(0) || '?'}점
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* 상품 정보 */}
                {log.category === '상품' && log.product_info && (
                  <div className="mt-3 p-3 bg-white rounded border">
                    <div className="text-sm font-medium text-blue-700 mb-1">
                      🛍️ 상품 정보
                    </div>
                    <div className="text-sm">{log.product_info.productName}</div>
                    {log.product_info.productPrice && (
                      <div className="text-sm text-gray-600 mt-1">
                        {log.product_info.productPrice.toLocaleString()}원
                      </div>
                    )}
                  </div>
                )}

                {/* 실패 시: 에러 메시지 */}
                {log.status === 'failed' && log.error_message && (
                  <div className="mt-3 p-3 bg-red-100 rounded border border-red-200">
                    <div className="text-sm font-medium text-red-700 mb-1">
                      ❌ 에러
                    </div>
                    <div className="text-sm text-red-600">{log.error_message}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
