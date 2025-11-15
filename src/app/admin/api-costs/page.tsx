'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface CostStats {
  period: string;
  totalCost: number;
  totalCredits: number;
  serviceBreakdown: Array<{
    service: string;
    count: number;
    totalCost: number;
    totalCredits: number;
    percentage: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    count: number;
    totalCost: number;
    totalCredits: number;
    percentage: number;
  }>;
}

interface ApiCost {
  id: string;
  userId: string;
  costType: string;
  serviceName: string;
  amount: number;
  creditsDeducted?: number;
  contentId?: string;
  metadata?: any;
  createdAt: string;
}

export default function ApiCostsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [stats, setStats] = useState<CostStats | null>(null);
  const [recentCosts, setRecentCosts] = useState<ApiCost[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      loadData();
    }
  }, [period, isLoading]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await response.json();

      if (!data.user || !data.user.isAdmin) {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
        return;
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  const loadData = async () => {
    try {
      // 통계 로드
      const statsRes = await fetch(`/api/admin/api-costs/summary?period=${period}`, {
        credentials: 'include'
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // 최근 비용 목록 로드
      const costsRes = await fetch('/api/admin/api-costs?limit=50', {
        credentials: 'include'
      });
      if (costsRes.ok) {
        const costsData = await costsRes.json();
        setRecentCosts(costsData.costs || []);
      }
    } catch (error) {
      console.error('데이터 로드 오류:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(4)}`;
  };

  const getCostTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      ai_script: '🤖 AI 대본 생성',
      image_generation: '🖼️ 이미지 생성',
      tts: '🔊 TTS 음성 합성',
      video_generation: '🎬 영상 생성'
    };
    return labels[type] || type;
  };

  const getServiceLabel = (service: string) => {
    const labels: Record<string, string> = {
      claude: 'Claude (Anthropic)',
      chatgpt: 'ChatGPT (OpenAI)',
      gemini: 'Gemini (Google)',
      grok: 'Grok (xAI)',
      dalle3: 'DALL-E 3 (OpenAI)',
      imagen3: 'Imagen 3 (Google)',
      azure_tts: 'Azure TTS (무료)',
      google_tts: 'Google TTS',
      aws_polly: 'AWS Polly'
    };
    return labels[service] || service;
  };

  // AI 모델별 가격 정보
  const AI_PRICING: Record<string, { input: number; output: number }> = {
    claude: { input: 3.00, output: 15.00 },      // Claude Sonnet 4.5 ($/MTok)
    chatgpt: { input: 2.50, output: 10.00 },    // GPT-4o ($/MTok)
    gemini: { input: 0, output: 0 },             // Gemini 2.0 Flash (무료)
    grok: { input: 5.00, output: 15.00 }         // Grok (추정)
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">💰 API 비용 관리</h1>
            <p className="mt-2 text-slate-300">서비스별 비용 현황 및 통계</p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-slate-700 px-4 py-2 text-white transition hover:bg-slate-600"
          >
            ← 관리자 페이지
          </Link>
        </div>

        {/* 기간 선택 */}
        <div className="mb-6 flex gap-2">
          {(['today', 'week', 'month', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-4 py-2 font-semibold transition ${
                period === p
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {p === 'today' && '오늘'}
              {p === 'week' && '최근 7일'}
              {p === 'month' && '최근 30일'}
              {p === 'all' && '전체'}
            </button>
          ))}
        </div>

        {/* AI 모델 단가표 */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
          <h2 className="mb-4 text-xl font-bold text-white">💵 AI 모델 단가표</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 text-left text-sm text-slate-400">
                  <th className="pb-3">모델</th>
                  <th className="pb-3 text-right">입력 토큰 단가</th>
                  <th className="pb-3 text-right">출력 토큰 단가</th>
                  <th className="pb-3 text-right">비고</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(AI_PRICING).map(([service, pricing]) => (
                  <tr key={service} className="border-b border-slate-700/50 text-sm">
                    <td className="py-3 text-white font-semibold">{getServiceLabel(service)}</td>
                    <td className="py-3 text-right font-mono text-slate-300">
                      {pricing.input > 0 ? `$${pricing.input.toFixed(2)} / MTok` : '무료'}
                    </td>
                    <td className="py-3 text-right font-mono text-slate-300">
                      {pricing.output > 0 ? `$${pricing.output.toFixed(2)} / MTok` : '무료'}
                    </td>
                    <td className="py-3 text-right text-slate-400 text-xs">
                      {pricing.input === 0 && pricing.output === 0 ? '✅ 완전 무료' : '💳 종량제'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">* MTok = 100만 토큰 기준</p>
        </div>

        {stats && (
          <>
            {/* 요약 카드 */}
            <div className="mb-8 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 p-6 backdrop-blur">
                <div className="mb-2 text-sm font-semibold text-blue-300">총 비용 (달러)</div>
                <div className="text-4xl font-bold text-white">{formatCurrency(stats.totalCost)}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-6 backdrop-blur">
                <div className="mb-2 text-sm font-semibold text-purple-300">총 크레딧 차감</div>
                <div className="text-4xl font-bold text-white">{stats.totalCredits.toLocaleString()}</div>
              </div>
            </div>

            {/* 서비스별 비용 */}
            <div className="mb-8 rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
              <h2 className="mb-4 text-xl font-bold text-white">📊 서비스별 비용</h2>
              <div className="space-y-4">
                {stats.serviceBreakdown.map((item) => (
                  <div key={item.service} className="rounded-lg bg-slate-700/50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-white">{getServiceLabel(item.service)}</span>
                      <span className="text-sm text-slate-300">{item.count}회</span>
                    </div>
                    <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-600">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{formatCurrency(item.totalCost)}</span>
                      <span className="text-slate-400">{item.totalCredits.toLocaleString()} 크레딧</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 타입별 비용 */}
            <div className="mb-8 rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
              <h2 className="mb-4 text-xl font-bold text-white">🎯 비용 타입별 분류</h2>
              <div className="space-y-4">
                {stats.typeBreakdown.map((item) => (
                  <div key={item.type} className="rounded-lg bg-slate-700/50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-white">{getCostTypeLabel(item.type)}</span>
                      <span className="text-sm text-slate-300">{item.count}회</span>
                    </div>
                    <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-600">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{formatCurrency(item.totalCost)}</span>
                      <span className="text-slate-400">{item.totalCredits.toLocaleString()} 크레딧</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 비용 기록 */}
            <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
              <h2 className="mb-4 text-xl font-bold text-white">📋 최근 비용 기록 (최근 50개)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs text-slate-400">
                      <th className="pb-3">시간</th>
                      <th className="pb-3">타입</th>
                      <th className="pb-3">서비스</th>
                      <th className="pb-3 text-right">입력 토큰</th>
                      <th className="pb-3 text-right">출력 토큰</th>
                      <th className="pb-3 text-right">단가</th>
                      <th className="pb-3 text-right">비용</th>
                      <th className="pb-3 text-right">크레딧</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCosts.map((cost) => {
                      const metadata = cost.metadata || {};
                      const inputTokens = metadata.inputTokens || 0;
                      const outputTokens = metadata.outputTokens || 0;
                      const pricing = AI_PRICING[cost.serviceName];

                      return (
                        <tr key={cost.id} className="border-b border-slate-700/50">
                          <td className="py-3 text-slate-300 text-xs whitespace-nowrap">
                            {new Date(cost.createdAt).toLocaleString('ko-KR', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="py-3 text-white text-xs">{getCostTypeLabel(cost.costType)}</td>
                          <td className="py-3 text-slate-300 text-xs">{getServiceLabel(cost.serviceName)}</td>
                          <td className="py-3 text-right font-mono text-slate-400 text-xs">
                            {inputTokens > 0 ? inputTokens.toLocaleString() : '-'}
                          </td>
                          <td className="py-3 text-right font-mono text-slate-400 text-xs">
                            {outputTokens > 0 ? outputTokens.toLocaleString() : '-'}
                          </td>
                          <td className="py-3 text-right text-xs">
                            {pricing ? (
                              <div className="space-y-0.5">
                                <div className="text-blue-400">${pricing.input}/MTok</div>
                                <div className="text-purple-400">${pricing.output}/MTok</div>
                              </div>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="py-3 text-right font-mono text-white font-semibold">
                            {formatCurrency(cost.amount)}
                          </td>
                          <td className="py-3 text-right text-slate-300 text-xs">
                            {cost.creditsDeducted?.toLocaleString() || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
