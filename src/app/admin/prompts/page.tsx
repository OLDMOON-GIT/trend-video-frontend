'use client';

import Link from 'next/link';

export default function PromptsAdminPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
<div className="mb-8">
          <h1 className="text-3xl font-bold">📝 프롬프트 관리</h1>
          <p className="mt-2 text-slate-400">
            Sora2, 롱폼, 숏폼, 상품 영상 생성을 위한 프롬프트를 관리합니다.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* 롱폼 프롬프트 */}
          <Link
            href="/api/prompt"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 p-8 backdrop-blur transition hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/20"
          >
            <div className="mb-4 text-6xl">🎬</div>
            <h2 className="mb-3 text-2xl font-bold">롱폼 프롬프트</h2>
            <p className="mb-4 text-sm text-slate-300">
              16:9 가로형 롱폼 영상 생성 프롬프트 편집
            </p>
            <div className="rounded-lg bg-slate-900/50 p-4 text-sm text-slate-400">
              <p className="mb-2 font-semibold text-slate-300">💡 포함 내용:</p>
              <ul className="space-y-1">
                <li>• YouTube, TV 최적화</li>
                <li>• 가로형 화면 구성</li>
                <li>• 상세한 씬 설명</li>
              </ul>
            </div>
            <div className="mt-6 flex items-center text-sm font-semibold text-indigo-300 transition group-hover:translate-x-2">
              편집하기 →
            </div>
          </Link>

          {/* 숏폼 프롬프트 */}
          <Link
            href="/api/shortform-prompt"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-pink-500/20 to-rose-500/20 p-8 backdrop-blur transition hover:border-pink-500/50 hover:shadow-2xl hover:shadow-pink-500/20"
          >
            <div className="mb-4 text-6xl">📱</div>
            <h2 className="mb-3 text-2xl font-bold">숏폼 프롬프트</h2>
            <p className="mb-4 text-sm text-slate-300">
              9:16 세로형 숏폼 영상 생성 프롬프트 편집
            </p>
            <div className="rounded-lg bg-slate-900/50 p-4 text-sm text-slate-400">
              <p className="mb-2 font-semibold text-slate-300">💡 포함 내용:</p>
              <ul className="space-y-1">
                <li>• TikTok, Reels 최적화</li>
                <li>• 세로형 화면 구성</li>
                <li>• 빠르고 강렬한 전개</li>
              </ul>
            </div>
            <div className="mt-6 flex items-center text-sm font-semibold text-pink-300 transition group-hover:translate-x-2">
              편집하기 →
            </div>
          </Link>

          {/* Sora2 프롬프트 */}
          <Link
            href="/api/sora2-prompt"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-8 backdrop-blur transition hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/20"
          >
            <div className="mb-4 text-6xl">🎥</div>
            <h2 className="mb-3 text-2xl font-bold">Sora2 프롬프트</h2>
            <p className="mb-4 text-sm text-slate-300">
              AI 비디오 생성 프롬프트 편집
            </p>
            <div className="rounded-lg bg-slate-900/50 p-4 text-sm text-slate-400">
              <p className="mb-2 font-semibold text-slate-300">💡 포함 내용:</p>
              <ul className="space-y-1">
                <li>• OpenAI Sora2 최적화</li>
                <li>• 세그먼트 연속성</li>
                <li>• 고품질 비디오</li>
              </ul>
            </div>
            <div className="mt-6 flex items-center text-sm font-semibold text-cyan-300 transition group-hover:translate-x-2">
              편집하기 →
            </div>
          </Link>

          {/* 상품 프롬프트 */}
          <Link
            href="/api/product-prompt"
            className="group rounded-2xl border border-white/10 bg-gradient-to-br from-green-500/20 to-emerald-500/20 p-8 backdrop-blur transition hover:border-green-500/50 hover:shadow-2xl hover:shadow-green-500/20"
          >
            <div className="mb-4 text-6xl">🛍️</div>
            <h2 className="mb-3 text-2xl font-bold">상품 프롬프트</h2>
            <p className="mb-4 text-sm text-slate-300">
              상품 마케팅 영상 생성 프롬프트 편집
            </p>
            <div className="rounded-lg bg-slate-900/50 p-4 text-sm text-slate-400">
              <p className="mb-2 font-semibold text-slate-300">💡 포함 내용:</p>
              <ul className="space-y-1">
                <li>• 상품 정보 자동 반영</li>
                <li>• 4씬 마케팅 구조</li>
                <li>• 구매 유도 CTA</li>
              </ul>
            </div>
            <div className="mt-6 flex items-center text-sm font-semibold text-green-300 transition group-hover:translate-x-2">
              편집하기 →
            </div>
          </Link>

          {/* ⚠️ DEPRECATED: 상품정보 프롬프트는 상품 프롬프트에 통합됨 (youtube_description 포함) */}
        </div>

        {/* 안내 */}
        <div className="mt-8 rounded-xl border border-blue-500/30 bg-blue-500/10 p-6 backdrop-blur">
          <h3 className="mb-3 text-lg font-bold text-blue-300">💡 프롬프트 관리 안내</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>• 각 프롬프트 카드를 클릭하면 편집 페이지로 이동합니다.</p>
            <p>• 롱폼, 숏폼, Sora2, 상품 프롬프트는 서로 독립적으로 관리됩니다.</p>
            <p>• 편집 후 저장하면 즉시 영상 생성에 반영됩니다.</p>
            <p>• 버전 히스토리 기능으로 이전 버전 복원이 가능합니다.</p>
            <p>• 상품 프롬프트는 상품 정보(제목, 썸네일, 링크, 설명)와 YouTube 설명을 한번에 생성합니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
