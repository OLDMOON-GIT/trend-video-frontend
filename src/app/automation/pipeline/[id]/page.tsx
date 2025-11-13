'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function PipelineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const scheduleId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<any>(null);

  useEffect(() => {
    fetchDetails();
    const interval = setInterval(fetchDetails, 5000); // 5초마다 갱신
    return () => clearInterval(interval);
  }, [scheduleId]);

  async function fetchDetails() {
    try {
      const response = await fetch(`/api/automation/schedules?id=${scheduleId}`);
      const data = await response.json();
      setDetails(data.details);
    } catch (error) {
      console.error('Failed to fetch details:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-white">로딩 중...</div>;
  }

  if (!details) {
    return <div className="p-8 text-white">데이터를 찾을 수 없습니다</div>;
  }

  const { pipelines, logs } = details;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'running': return 'bg-yellow-500 animate-pulse';
      case 'failed': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '대기 중';
      case 'running': return '실행 중';
      case 'completed': return '완료';
      case 'failed': return '실패';
      default: return status;
    }
  };

  const getStageText = (stage: string) => {
    switch (stage) {
      case 'script': return '대본 생성';
      case 'video': return '영상 생성';
      case 'upload': return '유튜브 업로드';
      case 'publish': return '유튜브 퍼블리시';
      default: return stage;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-6 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
        >
          뒤로 가기
        </button>

        <h1 className="text-4xl font-bold text-white mb-8">파이프라인 상세</h1>

        {/* 파이프라인 단계 */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8 border border-slate-700">
          <h2 className="text-2xl font-semibold text-white mb-6">실행 단계</h2>
          <div className="space-y-4">
            {pipelines && pipelines.length > 0 ? (
              pipelines.map((pipeline: any, index: number) => (
                <div key={pipeline.id} className="relative">
                  {/* 연결선 */}
                  {index < pipelines.length - 1 && (
                    <div className="absolute left-4 top-12 w-0.5 h-12 bg-slate-600"></div>
                  )}

                  <div className="flex items-start gap-4">
                    {/* 상태 아이콘 */}
                    <div className={`w-8 h-8 rounded-full ${getStatusColor(pipeline.status)} flex items-center justify-center text-white font-bold z-10`}>
                      {index + 1}
                    </div>

                    {/* 단계 정보 */}
                    <div className="flex-1 bg-slate-700 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xl font-semibold text-white">
                          {getStageText(pipeline.stage)}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          pipeline.status === 'completed' ? 'bg-green-600 text-white' :
                          pipeline.status === 'running' ? 'bg-yellow-600 text-white' :
                          pipeline.status === 'failed' ? 'bg-red-600 text-white' :
                          'bg-slate-600 text-slate-300'
                        }`}>
                          {getStatusText(pipeline.status)}
                        </span>
                      </div>

                      {pipeline.started_at && (
                        <p className="text-sm text-slate-400 mb-1">
                          시작: {new Date(pipeline.started_at).toLocaleString('ko-KR')}
                        </p>
                      )}

                      {pipeline.completed_at && (
                        <p className="text-sm text-slate-400 mb-1">
                          완료: {new Date(pipeline.completed_at).toLocaleString('ko-KR')}
                        </p>
                      )}

                      {pipeline.error_message && (
                        <div className="mt-2 p-3 bg-red-900 bg-opacity-30 rounded border border-red-700">
                          <p className="text-sm text-red-400">{pipeline.error_message}</p>
                        </div>
                      )}

                      {pipeline.retry_count > 0 && (
                        <p className="text-sm text-yellow-400 mt-2">
                          재시도 횟수: {pipeline.retry_count}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400">파이프라인 정보가 없습니다</p>
            )}
          </div>
        </div>

        {/* 로그 */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-2xl font-semibold text-white mb-6">실행 로그</h2>
          <div className="bg-slate-900 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-sm">
            {logs && logs.length > 0 ? (
              logs.map((log: any) => (
                <div key={log.id} className="mb-2">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold mr-2 ${
                    log.log_level === 'error' ? 'bg-red-600 text-white' :
                    log.log_level === 'warn' ? 'bg-yellow-600 text-white' :
                    log.log_level === 'info' ? 'bg-blue-600 text-white' :
                    'bg-slate-600 text-slate-300'
                  }`}>
                    {log.log_level.toUpperCase()}
                  </span>
                  <span className="text-slate-400 mr-2">
                    [{new Date(log.created_at).toLocaleTimeString('ko-KR')}]
                  </span>
                  <span className="text-slate-200">{log.message}</span>
                  {log.metadata && (
                    <pre className="mt-1 ml-20 text-xs text-slate-500 overflow-x-auto">
                      {JSON.stringify(JSON.parse(log.metadata), null, 2)}
                    </pre>
                  )}
                </div>
              ))
            ) : (
              <p className="text-slate-400">로그가 없습니다</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
