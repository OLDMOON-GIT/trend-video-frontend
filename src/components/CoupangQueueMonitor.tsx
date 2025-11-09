'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

interface QueueStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

interface QueueItem {
  id: string;
  product_url: string;
  status: string;
  retry_count: number;
  error_message?: string;
  created_at: string;
  source_url?: string; // 대기목록에서 온 경우 원본 URL
}

export default function CoupangQueueMonitor() {
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, done: 0, failed: 0 });
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoProcess, setAutoProcess] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');

  // 큐 상태 조회
  const fetchQueueStatus = async () => {
    try {
      const response = await fetch('/api/coupang-crawl-queue', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setItems(data.items);
      }
    } catch (error) {
      console.error('큐 상태 조회 실패:', error);
    }
  };

  // Worker 실행
  const triggerWorker = async () => {
    if (stats.pending === 0 && stats.processing === 0) {
      return;
    }

    try {
      const response = await fetch('/api/coupang-crawl-worker', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Worker 응답:', data);

        // 성공 시 토스트
        if (data.success) {
          toast.success('상품 크롤링 완료!');
        }

        // 상태 업데이트
        fetchQueueStatus();

        // 다음 항목이 있으면 계속 처리
        if (data.hasMore && autoProcess) {
          setTimeout(triggerWorker, 2000);
        }
      }
    } catch (error) {
      console.error('Worker 실행 실패:', error);
    }
  };

  // 재시도
  const retryItem = async (queueId: string) => {
    try {
      const response = await fetch('/api/coupang-crawl-queue', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ queueId })
      });

      if (response.ok) {
        toast.success('재시도가 시작되었습니다.');
        fetchQueueStatus();
      } else {
        const data = await response.json();
        toast.error(data.error || '재시도 실패');
      }
    } catch (error) {
      toast.error('재시도 요청 실패');
    }
  };

  // 큐 항목 삭제
  const deleteItem = async (queueId: string) => {
    if (!confirm('이 큐 항목을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`/api/coupang-crawl-queue?id=${queueId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('큐 항목이 삭제되었습니다.');
        fetchQueueStatus();
      } else {
        toast.error(data.error || '삭제 실패');
      }
    } catch (error) {
      toast.error('삭제 요청 실패');
    }
  };

  // 전체 삭제
  const deleteAll = async (status?: string) => {
    const confirmMessage = status
      ? `${statusLabels[status]} 상태의 모든 항목을 삭제하시겠습니까?`
      : '모든 큐 항목을 삭제하시겠습니까?';

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const params = new URLSearchParams({ all: 'true' });
      if (status) {
        params.append('status', status);
      }

      const response = await fetch(`/api/coupang-crawl-queue?${params}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || '항목이 삭제되었습니다.');
        fetchQueueStatus();
      } else {
        toast.error(data.error || '삭제 실패');
      }
    } catch (error) {
      toast.error('삭제 요청 실패');
    }
  };

  // 주기적 업데이트
  useEffect(() => {
    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 5000); // 5초마다 업데이트
    return () => clearInterval(interval);
  }, []);

  // 자동 처리
  useEffect(() => {
    if (autoProcess && (stats.pending > 0 || stats.processing > 0)) {
      const timer = setTimeout(triggerWorker, 1000);
      return () => clearTimeout(timer);
    }
  }, [stats, autoProcess]);

  const failedItems = items.filter(item => item.status === 'failed');

  // 상태별 항목 필터링
  const getItemsByStatus = (status: string) => {
    return items.filter(item => item.status === status);
  };

  // 상태 클릭 핸들러
  const handleStatusClick = (status: string) => {
    setSelectedStatus(status);
  };

  // 상태 라벨
  const statusLabels: Record<string, string> = {
    pending: '대기중',
    processing: '처리중',
    done: '완료',
    failed: '실패'
  };

  const selectedItems = getItemsByStatus(selectedStatus);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-purple-500/20 bg-purple-950/20 p-6 backdrop-blur">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white">⚙️ 크롤링 큐 상태</h3>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={autoProcess}
            onChange={(e) => setAutoProcess(e.target.checked)}
            className="rounded bg-white/10 border-white/20 text-purple-500 focus:ring-purple-500"
          />
          <span className="text-sm text-slate-300">자동 처리</span>
        </label>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <button
          onClick={() => handleStatusClick('pending')}
          className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl hover:bg-yellow-500/20 transition-colors text-left cursor-pointer"
        >
          <div className="text-sm text-yellow-400 mb-1">대기중</div>
          <div className="text-3xl font-bold text-yellow-300">{stats.pending}</div>
        </button>
        <button
          onClick={() => handleStatusClick('processing')}
          className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl hover:bg-blue-500/20 transition-colors text-left cursor-pointer"
        >
          <div className="text-sm text-blue-400 mb-1">처리중</div>
          <div className="text-3xl font-bold text-blue-300">{stats.processing}</div>
        </button>
        <button
          onClick={() => handleStatusClick('done')}
          className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl hover:bg-emerald-500/20 transition-colors text-left cursor-pointer"
        >
          <div className="text-sm text-emerald-400 mb-1">완료</div>
          <div className="text-3xl font-bold text-emerald-300">{stats.done}</div>
        </button>
        <button
          onClick={() => handleStatusClick('failed')}
          className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl hover:bg-red-500/20 transition-colors text-left cursor-pointer"
        >
          <div className="text-sm text-red-400 mb-1">실패</div>
          <div className="text-3xl font-bold text-red-300">{stats.failed}</div>
        </button>
      </div>

      </div>

      {/* 상태별 항목 목록 */}
      <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {statusLabels[selectedStatus]} 항목 ({selectedItems.length})
          </h3>
          {selectedItems.length > 0 && (
            <button
              onClick={() => deleteAll(selectedStatus)}
              className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              전체 삭제 ({selectedItems.length})
            </button>
          )}
        </div>

        {selectedItems.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            항목이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedItems.map((item, index) => (
              <div key={item.id} className="bg-slate-700/50 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                    <span className="text-slate-400 text-sm flex-shrink-0">#{index + 1}</span>
                    {/* 출처 표시 */}
                    {item.source_url ? (
                      <span className="inline-block rounded-full bg-blue-600/30 px-2 py-1 text-xs font-medium text-blue-300 border border-blue-500/40 flex-shrink-0" title={`대기목록: ${item.source_url}`}>
                        📋 대기목록
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-amber-600/30 px-2 py-1 text-xs font-medium text-amber-300 border border-amber-500/40 flex-shrink-0" title="직접 링크로 추가된 상품">
                        🔗 직접추가
                      </span>
                    )}
                    <a
                      href={item.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline text-sm font-medium flex items-center gap-1 truncate"
                    >
                      <span className="truncate">{item.product_url}</span>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0 ml-4">
                    {new Date(item.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>

                {item.error_message && (
                  <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
                    {item.error_message}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <span>재시도: {item.retry_count}/3</span>
                  <div className="ml-auto flex gap-2">
                    {selectedStatus === 'failed' && (
                      <button
                        onClick={() => retryItem(item.id)}
                        className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                      >
                        다시 시도
                      </button>
                    )}
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
