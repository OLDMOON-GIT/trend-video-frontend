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
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
    setIsModalOpen(true);
  };

  // 모달 닫기
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedStatus(null);
  };

  // 상태 라벨
  const statusLabels: Record<string, string> = {
    pending: '대기중',
    processing: '처리중',
    done: '완료',
    failed: '실패'
  };

  const selectedItems = selectedStatus ? getItemsByStatus(selectedStatus) : [];

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

      {/* 모달 - 상태별 항목 목록 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-slate-800 rounded-2xl border border-white/10 max-w-4xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h3 className="text-xl font-semibold text-white">
                {selectedStatus ? statusLabels[selectedStatus] : ''} 항목 ({selectedItems.length})
              </h3>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 모달 콘텐츠 */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-88px)]">
              {selectedItems.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  항목이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedItems.map((item, index) => (
                    <div key={item.id} className="bg-slate-700/50 border border-white/10 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm">#{index + 1}</span>
                          <a
                            href={item.product_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline text-sm font-medium flex items-center gap-1"
                          >
                            {item.product_url}
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(item.created_at).toLocaleString('ko-KR')}
                        </span>
                      </div>

                      {item.error_message && (
                        <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
                          {item.error_message}
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                        <span>재시도: {item.retry_count}/3</span>
                        {selectedStatus === 'failed' && (
                          <button
                            onClick={() => {
                              retryItem(item.id);
                              closeModal();
                            }}
                            className="ml-auto px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          >
                            다시 시도
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
