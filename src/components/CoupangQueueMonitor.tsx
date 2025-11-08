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
}

export default function CoupangQueueMonitor() {
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, done: 0, failed: 0 });
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoProcess, setAutoProcess] = useState(true);

  // 큐 상태 조회
  const fetchQueueStatus = async () => {
    try {
      const response = await fetch('/api/coupang-crawl-queue', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
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
      const response = await fetch('/api/coupang-crawl-worker');
      if (response.ok) {
        const data = await response.json();
        console.log('Worker 응답:', data);

        // 성공 시 토스트
        if (data.success) {
          toast.success('상품 크롤링 완료!');
        }

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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
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

  return (
    <div className="mb-8 rounded-2xl border border-purple-500/20 bg-purple-950/20 p-6 backdrop-blur">
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
        <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl">
          <div className="text-sm text-yellow-400 mb-1">대기중</div>
          <div className="text-3xl font-bold text-yellow-300">{stats.pending}</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
          <div className="text-sm text-blue-400 mb-1">처리중</div>
          <div className="text-3xl font-bold text-blue-300">{stats.processing}</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
          <div className="text-sm text-emerald-400 mb-1">완료</div>
          <div className="text-3xl font-bold text-emerald-300">{stats.done}</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
          <div className="text-sm text-red-400 mb-1">실패</div>
          <div className="text-3xl font-bold text-red-300">{stats.failed}</div>
        </div>
      </div>

      {/* 실패한 항목 */}
      {failedItems.length > 0 && (
        <div className="border-t border-white/10 pt-4 mt-4">
          <h4 className="font-semibold text-white mb-3">❌ 실패한 항목 ({failedItems.length})</h4>
          <div className="space-y-2">
            {failedItems.map(item => (
              <div key={item.id} className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{item.product_url}</div>
                  <div className="text-xs text-red-400 mt-2">
                    {item.error_message}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    재시도 횟수: {item.retry_count}/3
                  </div>
                </div>
                <button
                  onClick={() => retryItem(item.id)}
                  className="ml-4 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                >
                  다시 시도
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
