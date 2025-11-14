import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchProductsByCategory, fetchAllCategories } from '@/lib/shop-data';
import CategoryClientPage from '@/components/CategoryClientPage';

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
export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: categoryParam } = await params;
  const category = decodeURIComponent(categoryParam);

  // 데이터 소스: 로컬=SQLite, Vercel=관리서버API
  const products = await fetchProductsByCategory(category) as Product[];

  if (products.length === 0) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/shop"
              className="text-slate-400 hover:text-white transition"
            >
              ← 뒤로
            </Link>
            <h1 className="text-2xl font-bold text-white">
              {category}
            </h1>
            <span className="text-sm text-slate-400">
              {products.length}개 상품
            </span>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        <CategoryClientPage products={products} category={category} />
      </main>

      {/* 푸터 */}
      <footer className="bg-slate-900/95 border-t border-white/10 mt-20">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="text-center text-slate-400 text-sm">
            <p className="mb-2">이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
            <p>© 2025 트렌드 쇼핑몰. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// 정적 경로 생성 (SSG) - Client Component에서는 사용 불가
// export async function generateStaticParams() {
//   try {
//     const categories = await fetchAllCategories();
//     return categories.map((category) => ({
//       category: encodeURIComponent(category)
//     }));
//   } catch (error) {
//     console.error('카테고리 목록 생성 실패:', error);
//     return [];
//   }
// }

// 개발 모드: 동적 생성, 프로덕션: 정적 생성 + ISR
// Client Component에서는 사용 불가
// export const dynamicParams = true; // 빌드 시 없던 카테고리도 동적 생성 허용
// export const revalidate = 60; // 1분마다 재생성 (상품 업데이트 빠른 반영)
