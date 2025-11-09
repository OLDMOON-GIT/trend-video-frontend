import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchProductById, fetchAllProductIds } from '@/lib/shop-data';
import CoupangButton from './CoupangButton';

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  image_url: string;
  deep_link?: string;
  original_price?: number;
  discount_price?: number;
  view_count: number;
  click_count: number;
}

// 서버 컴포넌트 - 빌드 타임에 실행
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 데이터 소스: 로컬=SQLite, Vercel=관리서버API
  const product = await fetchProductById(id) as Product | null;

  if (!product) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/shop/category/${encodeURIComponent(product.category)}`}
              className="text-slate-400 hover:text-white transition"
            >
              ← {product.category}
            </Link>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* 좌측: 이미지 */}
          <div className="space-y-6">
            {product.image_url && (
              <div className="rounded-3xl overflow-hidden bg-white">
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="w-full aspect-square object-cover"
                />
              </div>
            )}

            {/* 통계 제거 */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-600 p-6 text-center text-slate-400 text-sm">
              파트너스 클릭 데이터는 내부에서만 확인됩니다.
            </div>
          </div>

          {/* 우측: 상품 정보 */}
          <div className="space-y-6">
            {/* 카테고리 */}
            <div>
              <Link
                href={`/shop/category/${encodeURIComponent(product.category)}`}
                className="inline-block rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 transition"
              >
                {product.category}
              </Link>
            </div>

            {/* 제목 */}
            <h1 className="text-4xl font-bold text-white leading-tight">
              {product.title}
            </h1>

            {/* 가격 */}
            {product.discount_price && (
              <div className="rounded-2xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 p-6">
                {product.original_price && (
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg text-slate-400 line-through">
                      {product.original_price.toLocaleString()}원
                    </span>
                    <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
                      {Math.round((1 - product.discount_price / product.original_price) * 100)}% 할인
                    </span>
                  </div>
                )}
                <div className="text-4xl font-bold text-purple-400">
                  {product.discount_price.toLocaleString()}원
                </div>
              </div>
            )}

            {/* 설명 */}
            <div className="rounded-2xl bg-slate-800/50 border border-slate-600 p-6">
              <h2 className="text-xl font-bold text-white mb-4">상품 설명</h2>
              <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                {product.description}
              </p>
            </div>

            {/* 상품 링크 */}
            {product.deep_link && (
              <div className="rounded-2xl bg-slate-800/50 border border-slate-600 p-6">
                <h2 className="text-xl font-bold text-white mb-4">🔗 상품 링크</h2>
                <div className="bg-slate-900/50 rounded-lg p-4 break-all">
                  <a
                    href={product.deep_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm font-mono transition"
                  >
                    {product.deep_link}
                  </a>
                </div>
              </div>
            )}

            {/* 구매 버튼 (클라이언트 컴포넌트) */}
            <CoupangButton productId={product.id} deepLink={product.deep_link || ''} />

            {/* 파트너스 고지 */}
            <div className="rounded-2xl bg-slate-800/30 border border-slate-700 p-4">
              <p className="text-xs text-slate-500 text-center">
                이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="bg-slate-900/95 border-t border-white/10 mt-20">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="text-center text-slate-400 text-sm">
            <p>© 2025 트렌드 쇼핑몰. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// 정적 경로 생성 (SSG) - Vercel 빌드 시에만
export async function generateStaticParams() {
  try {
    const productIds = await fetchAllProductIds();
    return productIds.map((id) => ({
      id
    }));
  } catch (error) {
    console.error('상품 ID 목록 생성 실패:', error);
    return [];
  }
}

// 개발 모드: 동적 생성, 프로덕션: 정적 생성 + ISR
export const dynamicParams = true; // 빌드 시 없던 상품도 동적 생성 허용
export const revalidate = 60; // 1분마다 재생성 (상품 업데이트 빠른 반영)
