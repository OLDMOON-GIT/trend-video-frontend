'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RefundPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [failedJobs, setFailedJobs] = useState<any[]>([]);

  useEffect(() => {
    fetchFailedJobs();
  }, []);

  async function fetchFailedJobs() {
    try {
      const response = await fetch('/api/automation/refund');
      const data = await response.json();
      if (data.failedJobs) {
        setFailedJobs(data.failedJobs);
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch failed jobs:', error);
      setLoading(false);
    }
  }

  async function handleRefund(scheduleId: string, amount: number, title: string, userId: string) {
    try {
      const response = await fetch('/api/automation/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          userId,
          amount,
          reason: `자동화 작업 실패 환불: ${title}`
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ 환불 완료: ${amount} 크레딧 → ${userId}`);
        await fetchFailedJobs();
      } else {
        alert(`❌ 환불 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Refund error:', error);
      alert('환불 처리 중 오류가 발생했습니다.');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-white">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">💰 수동 환불 처리</h1>
            <p className="text-slate-400">실패한 자동화 작업에 대한 환불 처리</p>
          </div>
          <button
            onClick={() => router.push('/automation')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
          >
            ← 자동화 페이지로
          </button>
        </div>

        {/* 환불 대상 목록 */}
        <div className="bg-slate-800/50 backdrop-blur rounded-xl p-6 border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-4">
            환불 대상 작업 ({failedJobs.length}건)
          </h2>

          {failedJobs.length === 0 ? (
            <p className="text-slate-400 text-center py-8">환불 대상이 없습니다</p>
          ) : (
            <div className="space-y-3">
              {failedJobs.map((job: any) => (
                <div
                  key={job.schedule_id}
                  className="bg-slate-700/50 rounded-lg p-4 border border-slate-600"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="text-white font-semibold text-lg mb-1">{job.title}</h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded ${
                          job.type === 'longform' ? 'bg-blue-600/30 text-blue-300' :
                          job.type === 'shortform' ? 'bg-purple-600/30 text-purple-300' :
                          'bg-orange-600/30 text-orange-300'
                        }`}>
                          {job.type === 'longform' ? '롱폼' : job.type === 'shortform' ? '숏폼' : '상품'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-red-600/30 text-red-300">
                          실패
                        </span>
                        {job.failed_stage && (
                          <span className="px-2 py-0.5 rounded bg-yellow-600/30 text-yellow-300">
                            단계: {job.failed_stage}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {job.error_message && (
                    <div className="mb-3 p-2 bg-red-900/20 border border-red-800/30 rounded text-xs text-red-300">
                      <span className="font-semibold">오류: </span>
                      {job.error_message}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                    <span>📅 {new Date(job.created_at).toLocaleString('ko-KR')}</span>
                    {job.started_at && (
                      <span>🚀 시작: {new Date(job.started_at).toLocaleString('ko-KR')}</span>
                    )}
                    {job.completed_at && (
                      <span>⏹️ 종료: {new Date(job.completed_at).toLocaleString('ko-KR')}</span>
                    )}
                  </div>

                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      id={`userId-${job.schedule_id}`}
                      placeholder="사용자 ID 입력"
                      className="flex-1 px-3 py-2 bg-slate-600 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                    <input
                      type="number"
                      id={`amount-${job.schedule_id}`}
                      placeholder="환불 크레딧"
                      defaultValue={100}
                      className="w-32 px-3 py-2 bg-slate-600 text-white rounded border border-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                    />
                    <button
                      onClick={() => {
                        const userIdInput = (document.getElementById(`userId-${job.schedule_id}`) as HTMLInputElement).value;
                        const amountInput = (document.getElementById(`amount-${job.schedule_id}`) as HTMLInputElement).value;

                        if (!userIdInput) {
                          alert('사용자 ID를 입력하세요');
                          return;
                        }

                        const amount = parseInt(amountInput) || 100;
                        handleRefund(job.schedule_id, amount, job.title, userIdInput);
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-semibold transition text-sm whitespace-nowrap"
                    >
                      💰 환불 처리
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
