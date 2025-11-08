// C:\Users\oldmoon\workspace\trend-video-frontend\src\components\ShopClientView.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import ShopVersionManager from '@/components/ShopVersionManager';
import ShopVersionPreview from '@/components/ShopVersionPreview';

interface Category {
  name: string;
  count: number;
  thumbnail?: string;
}

interface ShopClientViewProps {
  initialCategories: Category[];
  initialTotalProducts: number;
}

export default function ShopClientView({ initialCategories, initialTotalProducts }: ShopClientViewProps) {
  const [categories] = useState<Category[]>(initialCategories);
  const [totalProducts] = useState(initialTotalProducts);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

  return (
    <>
      <ShopVersionManager onPreview={setPreviewVersionId} />

      {previewVersionId ? (
        <ShopVersionPreview 
          versionId={previewVersionId} 
          onClose={() => setPreviewVersionId(null)} 
        />
      ) : (
        <>
          {/* 타이틀 */}
          <div className="mb-12 text-center">
            <h2 className="text-4xl font-bold text-white mb-4">
              카테고리별 상품 둘러보기
            </h2>
            <p className="text-xl text-slate-300">
              엄선된 쿠팡 상품을 카테고리별로 만나보세요
            </p>
          </div>

          {/* 카테고리 그리드 */}
          {categories.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {categories.map((category) => (
                <Link
                  key={category.name}
                  href={`/shop/category/${encodeURIComponent(category.name)}`}
                  className="group relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-600 hover:border-purple-500 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20"
                >
                  {/* 썸네일 배경 */}
                  {category.thumbnail ? (
                    <div className="aspect-square relative">
                      <img
                        src={category.thumbnail}
                        alt={category.name}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent"></div>
                    </div>
                  ) : (
                    <div className="aspect-square bg-gradient-to-br from-purple-600 to-pink-600 opacity-60"></div>
                  )}

                  {/* 카테고리 정보 */}
                  <div className="absolute inset-0 flex flex-col justify-end p-6">
                    <h3 className="text-2xl font-bold text-white mb-2">
                      {category.name}
                    </h3>
                    <p className="text-slate-300 text-sm">
                      {category.count}개 상품
                    </p>
                    <div className="mt-4 inline-flex items-center text-purple-400 text-sm font-semibold group-hover:text-purple-300 transition">
                      상품 보기
                      <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🛍️</div>
              <p className="text-xl text-slate-400">아직 등록된 상품이 없습니다.</p>
              <p className="text-sm text-slate-500 mt-2">관리자가 곧 멋진 상품을 추가할 예정입니다!</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
