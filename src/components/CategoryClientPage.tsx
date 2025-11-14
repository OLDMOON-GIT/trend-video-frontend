'use client';

import Link from 'next/link';
import { useState } from 'react';
import ProductPreviewModal from '@/components/ProductPreviewModal';

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

export default function CategoryClientPage({ products, category }: { products: Product[], category: string }) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  return (
    <>
      {/* 상품 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {products.map((product) => (
          <div
            key={product.id}
            className="group rounded-2xl bg-slate-800/50 border border-slate-600 hover:border-purple-500 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20 overflow-hidden flex flex-col"
          >
            {/* 상품 이미지 */}
            {product.image_url && (
              <div className="aspect-square relative overflow-hidden">
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              </div>
            )}

            {/* 상품 정보 */}
            <div className="p-4 flex flex-col flex-grow">
              <h3 className="text-lg font-bold text-white mb-2 line-clamp-2 group-hover:text-purple-400 transition">
                {product.title}
              </h3>

              <p className="text-sm text-slate-400 mb-3 line-clamp-2 flex-grow">
                {product.description}
              </p>

              {/* 가격 */}
              {product.discount_price && (
                <div className="mb-3">
                  {product.original_price && (
                    <span className="text-sm text-slate-500 line-through mr-2">
                      {product.original_price.toLocaleString()}원
                    </span>
                  )}
                  <span className="text-xl font-bold text-purple-400">
                    {product.discount_price.toLocaleString()}원
                  </span>
                </div>
              )}

              {/* 쿠팡 링크 상태 */}
              <div className="mb-3 flex items-center gap-2">
                {product.deep_link ? (
                  <>
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs text-green-400 font-medium">쿠팡 링크 있음</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-xs text-red-400 font-medium">쿠팡 링크 없음</span>
                  </>
                )}
              </div>

              {/* 버튼 그룹 */}
              <div className="mt-auto pt-4 border-t border-slate-700/50 flex gap-2">
                <button
                  onClick={() => setSelectedProduct(product)}
                  className="flex-1 inline-flex justify-center items-center bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2 px-3 rounded-md transition"
                >
                  미리보기
                </button>
                <Link
                  href={`/shop/product/${product.id}`}
                  className="flex-1 inline-flex justify-center items-center bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold py-2 px-3 rounded-md transition"
                >
                  상세 페이지
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ProductPreviewModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </>
  );
}
