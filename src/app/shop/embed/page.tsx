'use client';

import { useEffect, useRef, useState } from 'react';

import { generateShopHtml, type PublishedProduct } from '@/lib/shop-html';

export default function ShopEmbedPage() {
  const [loading, setLoading] = useState(true);
  const [htmlPreview, setHtmlPreview] = useState('');
  const [userId, setUserId] = useState('');
  const [versionId, setVersionId] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [versionName, setVersionName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [productCount, setProductCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userParam = params.get('userId');
    const versionParam = params.get('versionId');
    const previewParam = params.get('preview');

    setIsPreview(previewParam === '1');
    if (userParam) {
      setUserId(userParam);
    }
    if (versionParam) {
      setVersionId(versionParam);
    }
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);

        const params = new URLSearchParams();
        if (userId) {
          params.set('userId', userId);
        }
        if (versionId) {
          params.set('versionId', versionId);
        }

        const url = `/api/shop/products/public${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error('상품을 불러오지 못했습니다.');
        }

        const data = await res.json();
        const received: PublishedProduct[] = Array.isArray(data.products) ? data.products : [];
        setProductCount(received.length);
        setHtmlPreview(generateShopHtml(received, data.nickname));
        if (data.version) {
          setVersionName(data.version.name || data.version.id || null);
        } else {
          setVersionName(null);
        }
      } catch (error: any) {
        console.error('상품 로드 실패:', error);
        setErrorMessage(error?.message || '상품을 불러오지 못했습니다.');
        setProductCount(0);
        setHtmlPreview('');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [userId, versionId]);

  useEffect(() => {
    if (!htmlPreview) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.coupang-category-tabs button')
    );
    const cards = Array.from(container.querySelectorAll<HTMLElement>('.coupang-product-card'));

    if (!tabs.length) {
      return;
    }

    const setActiveCategory = (target: HTMLButtonElement) => {
      const selected = target.getAttribute('data-category') || 'all';
      tabs.forEach((tab) => tab.classList.remove('active'));
      target.classList.add('active');

      cards.forEach((card) => {
        const cardCategory = card.getAttribute('data-category');
        card.style.display = selected === 'all' || cardCategory === selected ? '' : 'none';
      });
    };

    const listeners = new Map<HTMLButtonElement, () => void>();
    tabs.forEach((tab) => {
      const handler = () => setActiveCategory(tab);
      listeners.set(tab, handler);
      tab.addEventListener('click', handler);
    });

    const defaultTab = tabs.find((tab) => tab.getAttribute('data-category') === 'all') || tabs[0];
    if (defaultTab) {
      setActiveCategory(defaultTab);
    }

    return () => {
      listeners.forEach((handler, tab) => tab.removeEventListener('click', handler));
    };
  }, [htmlPreview]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 p-4 text-white">
      <div className="mx-auto max-w-6xl w-full space-y-6">
        {versionId && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              isPreview
                ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                : 'border-blue-400/40 bg-blue-500/10 text-blue-100'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {isPreview ? '미리보기 모드' : '선택 버전 미리보기'}: {versionName || versionId}
                </p>
                <p className="text-xs opacity-80">
                  {isPreview
                    ? '이 화면은 관리자 미리보기용입니다. 퍼블리시된 버전만 Google Sites에 노출됩니다.'
                    : '현재 선택한 버전이 퍼블리시된 상태입니다.'}
                </p>
              </div>
              <div className="text-xs opacity-80">총 {productCount}개 상품</div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-slate-300">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-purple-400" />
            상품을 불러오는 중입니다...
          </div>
        ) : (
          <div
            ref={containerRef}
            className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-2xl shadow-purple-900/30"
            dangerouslySetInnerHTML={{ __html: htmlPreview }}
          />
        )}
      </div>
    </div>
  );
}
