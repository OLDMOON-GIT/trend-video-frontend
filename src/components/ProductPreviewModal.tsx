// C:\Users\oldmoon\workspace\trend-video-frontend\src\components\ProductPreviewModal.tsx
'use client';

import { useEffect } from 'react';

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

interface ProductPreviewModalProps {
  product: Product | null;
  onClose: () => void;
}

export default function ProductPreviewModal({ product, onClose }: ProductPreviewModalProps) {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!product) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[99999] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden shadow-2xl shadow-purple-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 이미지 섹션 */}
        <div className="w-full md:w-1/2 relative aspect-square md:aspect-auto">
          <img
            src={product.image_url}
            alt={product.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* 정보 섹션 */}
        <div className="w-full md:w-1/2 p-8 flex flex-col overflow-y-auto">
          <h2 className="text-3xl font-bold text-white mb-4">{product.title}</h2>
          <p className="text-slate-300 mb-6 flex-grow">{product.description}</p>
          
          {/* 가격 */}
          {product.discount_price && (
            <div className="mb-6">
              {product.original_price && (
                <span className="text-lg text-slate-500 line-through mr-3">
                  {product.original_price.toLocaleString()}원
                </span>
              )}
              <span className="text-4xl font-bold text-purple-400">
                {product.discount_price.toLocaleString()}원
              </span>
            </div>
          )}

          {/* 카테고리 및 통계 */}
          <div className="text-sm text-slate-400 mb-8 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-300">카테고리:</span>
              <span>{product.category}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-300">조회수:</span>
              <span>{product.view_count.toLocaleString()}</span>
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="mt-auto pt-6 border-t border-slate-700">
            {product.deep_link ? (
              <a
                href={product.deep_link}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full block text-center bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-transform hover:scale-105"
              >
                쿠팡에서 구매하기
              </a>
            ) : (
              <div className="text-center text-slate-500 py-3">
                구매 링크가 준비되지 않았습니다.
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full mt-3 text-center bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-3 px-4 rounded-lg transition"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
