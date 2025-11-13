'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

interface CreditPrices {
  scriptGeneration: number;      // AI 대본 생성 비용
  videoGeneration: number;        // 영상 생성 비용
  longformScript: number;         // 롱폼 대본 생성 비용
  shortformScript: number;        // 숏폼 대본 생성 비용
  sora2Video: number;            // Sora2 영상 생성 비용
  productVideo: number;          // 상품 영상 생성 비용
}

export default function CreditSettingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [prices, setPrices] = useState<CreditPrices>({
    scriptGeneration: 100,
    videoGeneration: 500,
    longformScript: 3050,     // 롱폼: 약 1,020원 × 3
    shortformScript: 1400,    // 숏폼: 약 461원 × 3
    sora2Video: 1000,
    productVideo: 300
  });

  useEffect(() => {
    loadPrices();
  }, []);

  const loadPrices = async () => {
    try {
      const res = await fetch('/api/admin/credit-prices', {
        credentials: 'include'
      });

      if (res.status === 401) {
        router.push('/auth');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.prices) {
          setPrices(data.prices);
        }
      }
    } catch (error) {
      console.error('크레딧 가격 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/credit-prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prices })
      });

      if (res.ok) {
        toast.success('✅ 크레딧 가격이 저장되었습니다!');
      } else {
        const data = await res.json();
        toast.error(data.error || '저장 실패');
      }
    } catch (error) {
      console.error('저장 실패:', error);
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('기본값으로 초기화하시겠습니까?')) {
      return;
    }

    setPrices({
      scriptGeneration: 100,
      videoGeneration: 500,
      longformScript: 3050,
      shortformScript: 1400,
      sora2Video: 1000,
      productVideo: 300
    });
    toast.success('기본값으로 초기화되었습니다');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-300 text-lg">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <Toaster position="top-right" />

      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">💰 크레딧 가격 설정</h1>
          <p className="text-slate-400">
            AI 대본 생성 및 영상 생성 시 차감되는 크레딧 금액을 설정합니다
          </p>
        </div>

        {/* 크레딧 가격 설정 */}
        <div className="rounded-2xl border border-slate-600 bg-slate-800/50 backdrop-blur">
          {/* AI 대본 생성 비용 */}
          <div className="p-6 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white mb-6">📝 AI 대본 생성 비용</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  롱폼 대본 생성 (Longform) <span className="text-purple-400">(원가: 대본 ~170원 + 이미지8장 ~850원 = ~1,020원)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={prices.longformScript}
                    onChange={(e) => setPrices({ ...prices, longformScript: Number(e.target.value) })}
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                  <span className="text-slate-300 font-semibold">크레딧</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  롱폼 대본 생성 + 영상 생성 시 차감되는 크레딧
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  숏폼 대본 생성 (Shortform) <span className="text-purple-400">(원가: 대본 ~35원 + 이미지4장 ~426원 = ~461원)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={prices.shortformScript}
                    onChange={(e) => setPrices({ ...prices, shortformScript: Number(e.target.value) })}
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                  <span className="text-slate-300 font-semibold">크레딧</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  숏폼 대본 생성 + 영상 생성 시 차감되는 크레딧
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  기본 대본 생성 (Legacy)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={prices.scriptGeneration}
                    onChange={(e) => setPrices({ ...prices, scriptGeneration: Number(e.target.value) })}
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                  <span className="text-slate-300 font-semibold">크레딧</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  일반 AI 대본 생성 시 차감되는 크레딧 (하위 호환용)
                </p>
              </div>
            </div>
          </div>

          {/* 영상 생성 비용 */}
          <div className="p-6">
            <h2 className="text-xl font-bold text-white mb-6">🎬 영상 생성 비용</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sora2 영상 생성 <span className="text-purple-400">(원가: OpenAI API 미공개)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={prices.sora2Video}
                    onChange={(e) => setPrices({ ...prices, sora2Video: Number(e.target.value) })}
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                  <span className="text-slate-300 font-semibold">크레딧</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Sora2 AI를 이용한 영상 생성 시 차감되는 크레딧
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  상품 영상 생성 <span className="text-purple-400">(원가: 이미지4장 ~426원)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={prices.productVideo}
                    onChange={(e) => setPrices({ ...prices, productVideo: Number(e.target.value) })}
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                  <span className="text-slate-300 font-semibold">크레딧</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  쿠팡 상품 영상 생성 시 차감되는 크레딧
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  기본 영상 생성 (Legacy) <span className="text-purple-400">(원가: 롱폼 ~850원 / 숏폼 ~426원)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={prices.videoGeneration}
                    onChange={(e) => setPrices({ ...prices, videoGeneration: Number(e.target.value) })}
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-600 px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  />
                  <span className="text-slate-300 font-semibold">크레딧</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  일반 영상 생성 시 차감되는 크레딧 (영상만 생성, 대본 제외)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="mt-6 flex gap-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-white font-bold hover:from-purple-500 hover:to-pink-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '저장 중...' : '💾 설정 저장'}
          </button>
          <button
            onClick={handleReset}
            className="rounded-lg bg-slate-700 px-6 py-3 text-white font-bold hover:bg-slate-600 transition"
          >
            🔄 기본값 복원
          </button>
        </div>

        {/* 안내 */}
        <div className="mt-8 p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-400 mb-3">💡 사용 안내</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>• 설정한 크레딧 금액은 사용자가 해당 기능을 사용할 때 자동으로 차감됩니다.</p>
            <p>• 크레딧이 부족한 사용자는 해당 기능을 사용할 수 없습니다.</p>
            <p>• 설정 변경은 즉시 적용되며, 이전 작업에는 영향을 주지 않습니다.</p>
            <p>• Legacy 항목은 이전 버전과의 호환성을 위해 유지됩니다.</p>
          </div>
        </div>

        {/* API 비용 정보 */}
        <div className="mt-6 p-6 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <h3 className="text-lg font-semibold text-purple-400 mb-3">📊 실제 API 비용 정보 (참고용)</h3>
          <div className="space-y-4">
            {/* 롱폼 비용 */}
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <div className="font-semibold text-white mb-2">🎬 롱폼 (16:9) - 1개 제작 기준</div>
              <div className="space-y-1 text-sm text-slate-300 ml-4">
                <div className="flex justify-between">
                  <span>• Claude 대본 생성 (33,000자):</span>
                  <span className="font-mono text-purple-300">약 170원</span>
                </div>
                <div className="flex justify-between">
                  <span>• DALL-E 3 HD 이미지 8장 (1792×1024):</span>
                  <span className="font-mono text-purple-300">약 850원</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-1 mt-1 font-semibold">
                  <span>총 API 비용:</span>
                  <span className="font-mono text-purple-400">약 1,020원</span>
                </div>
                <div className="flex justify-between text-yellow-400">
                  <span>권장 크레딧 (3배):</span>
                  <span className="font-mono font-bold">3,050원</span>
                </div>
              </div>
            </div>

            {/* 숏폼 비용 */}
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <div className="font-semibold text-white mb-2">📱 숏폼 (9:16) - 1개 제작 기준</div>
              <div className="space-y-1 text-sm text-slate-300 ml-4">
                <div className="flex justify-between">
                  <span>• Claude 대본 생성 (3,000자):</span>
                  <span className="font-mono text-purple-300">약 35원</span>
                </div>
                <div className="flex justify-between">
                  <span>• DALL-E 3 HD 이미지 4장 (1024×1792):</span>
                  <span className="font-mono text-purple-300">약 426원</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-1 mt-1 font-semibold">
                  <span>총 API 비용:</span>
                  <span className="font-mono text-purple-400">약 461원</span>
                </div>
                <div className="flex justify-between text-yellow-400">
                  <span>권장 크레딧 (3배):</span>
                  <span className="font-mono font-bold">1,400원</span>
                </div>
              </div>
            </div>

            {/* 추가 정보 */}
            <div className="text-xs text-slate-400 mt-3 space-y-1">
              <p>• 이미지 비용이 전체의 약 85~92%를 차지합니다.</p>
              <p>• Claude는 프롬프트 캐싱을 사용하여 반복 사용 시 입력 비용이 90% 절감됩니다.</p>
              <p>• 환율 기준: $1 = 1,330원 (2025년)</p>
              <p>• 권장 크레딧은 API 비용의 3배로 설정하여 운영 비용 및 마진을 포함한 금액입니다.</p>
            </div>
          </div>
        </div>

        {/* 돌아가기 버튼 */}
        <div className="text-center mt-8">
          <button
            onClick={() => router.push('/admin')}
            className="text-slate-400 hover:text-white transition"
          >
            ← 관리자 페이지로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
