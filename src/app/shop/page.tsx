import { fetchShopData } from '@/lib/shop-data';
import ShopClientView from '@/components/ShopClientView';

// 서버 컴포넌트 - 빌드 타임 또는 요청 시에 실행
export default async function ShopPage() {
  // 데이터 소스: 로컬=SQLite, Vercel=관리서버API
  const { categories: categoryData } = await fetchShopData();

  const categories = categoryData.map((row) => ({
    name: row.category,
    count: row.count,
    thumbnail: row.thumbnail
  }));

  const totalProducts = categories.reduce((sum, cat) => sum + cat.count, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">
              🏪 트렌드 쇼핑몰
            </h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-400">
                총 {totalProducts}개 상품
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        <ShopClientView 
          initialCategories={categories} 
          initialTotalProducts={totalProducts} 
        />
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

// 정적 생성 활성화 (SSG)
export const dynamic = 'force-dynamic';
export const revalidate = 60; // 1분마다 재생성 (상품 업데이트 빠른 반영)
