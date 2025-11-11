'use client';

import { useState } from 'react';

interface CoupangButtonProps {
  productId: string;
  deepLink: string;
}

export default function CoupangButton({ productId, deepLink }: CoupangButtonProps) {
  const [isClicking, setIsClicking] = useState(false);

  const handleClick = async () => {
    if (isClicking) return;
    setIsClicking(true);

    try {
      // 클릭 추적 API 호출
      await fetch(`/api/coupang-products/${productId}/click`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('클릭 추적 실패:', error);
    } finally {
      setIsClicking(false);
      // 쿠팡으로 이동
      window.open(deepLink, '_blank');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isClicking}
      className="w-full rounded-2xl bg-gradient-to-r from-orange-600 to-red-600 px-8 py-6 text-white text-xl font-bold hover:from-orange-500 hover:to-red-500 transition shadow-2xl shadow-orange-500/20 hover:shadow-orange-500/40 disabled:opacity-50"
    >
      {isClicking ? '로딩 중...' : '🛒 쿠팡에서 구매하기'}
    </button>
  );
}
