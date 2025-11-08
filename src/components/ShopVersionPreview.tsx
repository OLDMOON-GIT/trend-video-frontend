// C:\Users\oldmoon\workspace\trend-video-frontend\src\components\ShopVersionPreview.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { generateShopHtml, type PublishedProduct } from '@/lib/shop-html';

interface ShopVersionPreviewProps {
  versionId: string;
  onClose: () => void;
}

export default function ShopVersionPreview({ versionId, onClose }: ShopVersionPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [htmlPreview, setHtmlPreview] = useState('');
  const [versionName, setVersionName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [productCount, setProductCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);

        const url = `/api/shop/products/public?versionId=${versionId}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || '상품을 불러오지 못했습니다.');
        }

        const data = await res.json();
        const received: PublishedProduct[] = Array.isArray(data.products) ? data.products : [];
        setProductCount(received.length);
        setHtmlPreview(generateShopHtml(received));
        if (data.version) {
          setVersionName(data.version.name || `버전 ${data.version.versionNumber}`);
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

    if (versionId) {
      fetchProducts();
    }
  }, [versionId]);

  useEffect(() => {
    if (!htmlPreview) return;
    const container = containerRef.current;
    if (!container) return;

    // Multi-level fallback storage for restricted environments
    if (!(window as any).__shopBookmarks) {
      (window as any).__shopBookmarks = [];
    }

    // IndexedDB helper
    let dbPromise: Promise<IDBDatabase> | null = null;
    const openDB = (): Promise<IDBDatabase> => {
      if (dbPromise) return dbPromise;

      dbPromise = new Promise((resolve, reject) => {
        try {
          const request = indexedDB.open('ShopBookmarksDB', 1);

          request.onerror = () => {
            console.log('[Bookmark] IndexedDB blocked');
            reject(request.error);
          };

          request.onsuccess = () => {
            console.log('[Bookmark] IndexedDB opened');
            resolve(request.result);
          };

          request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('bookmarks')) {
              db.createObjectStore('bookmarks');
            }
          };
        } catch (e) {
          console.log('[Bookmark] IndexedDB error:', e);
          reject(e);
        }
      });

      return dbPromise;
    };

    const getFromIndexedDB = (callback: (bookmarks: string[] | null) => void) => {
      openDB().then(db => {
        const tx = db.transaction('bookmarks', 'readonly');
        const store = tx.objectStore('bookmarks');
        const request = store.get('bookmarks');

        request.onsuccess = () => {
          if (request.result) {
            console.log('[Bookmark] Loaded from IndexedDB');
            callback(request.result);
          } else {
            callback(null);
          }
        };

        request.onerror = () => {
          callback(null);
        };
      }).catch(() => {
        callback(null);
      });
    };

    const saveToIndexedDB = (bookmarks: string[]) => {
      openDB().then(db => {
        const tx = db.transaction('bookmarks', 'readwrite');
        const store = tx.objectStore('bookmarks');
        store.put(bookmarks, 'bookmarks');
        console.log('[Bookmark] Saved to IndexedDB');
      }).catch(() => {
        // IndexedDB failed
      });
    };

    // Storage helper functions with multi-level fallback
    const getBookmarks = (): string[] => {
      // Level 1: Try localStorage (best - survives page reload)
      try {
        const stored = localStorage.getItem('shop_bookmarks');
        if (stored) {
          console.log('[Bookmark] Loaded from localStorage');
          return JSON.parse(stored);
        }
      } catch (e) {
        console.log('[Bookmark] localStorage blocked');
      }

      // Level 2: Try sessionStorage (survives page reload in same tab)
      try {
        const sessionStored = sessionStorage.getItem('shop_bookmarks');
        if (sessionStored) {
          console.log('[Bookmark] Loaded from sessionStorage');
          return JSON.parse(sessionStored);
        }
      } catch (e) {
        console.log('[Bookmark] sessionStorage blocked');
      }

      // Level 3: Use window object (synchronous fallback)
      console.log('[Bookmark] Using in-memory storage');
      return [...((window as any).__shopBookmarks || [])];
    };

    const saveBookmarks = (bookmarks: string[]) => {
      let saved = false;

      // Save to localStorage
      try {
        localStorage.setItem('shop_bookmarks', JSON.stringify(bookmarks));
        console.log('[Bookmark] Saved to localStorage');
        saved = true;
      } catch (e) {
        // localStorage blocked
      }

      // Save to sessionStorage (fallback)
      try {
        sessionStorage.setItem('shop_bookmarks', JSON.stringify(bookmarks));
        console.log('[Bookmark] Saved to sessionStorage');
        saved = true;
      } catch (e) {
        // sessionStorage blocked
      }

      // Save to IndexedDB (async, best for iframe)
      saveToIndexedDB(bookmarks);
      saved = true; // Assume it will work

      // Always save to window object
      (window as any).__shopBookmarks = [...bookmarks];

      if (!saved) {
        console.warn('[Bookmark] Only saved to memory - will be lost on reload!');
      }
    };

    const updateBookmarkButtons = () => {
      const bookmarks = getBookmarks();
      const buttons = container.querySelectorAll<HTMLButtonElement>('.bookmark-btn');
      buttons.forEach((btn) => {
        const productId = btn.getAttribute('data-product-id');
        if (productId && bookmarks.includes(productId)) {
          btn.textContent = '⭐';
        } else {
          btn.textContent = '☆';
        }
      });
    };

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.coupang-category-tabs button'));
    const cards = Array.from(container.querySelectorAll<HTMLElement>('.coupang-product-card'));
    if (!tabs.length) return;

    const filterProducts = (category: string) => {
      if (category === 'bookmarks') {
        const bookmarks = getBookmarks();
        cards.forEach((card) => {
          const productId = card.getAttribute('data-product-id');
          if (productId && bookmarks.includes(productId)) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
      } else {
        cards.forEach((card) => {
          const cardCategory = card.getAttribute('data-category');
          card.style.display = category === 'all' || cardCategory === category ? '' : 'none';
        });
      }
    };

    const setActiveCategory = (target: HTMLButtonElement) => {
      const selected = target.getAttribute('data-category') || 'all';
      tabs.forEach((tab) => tab.classList.remove('active'));
      target.classList.add('active');
      filterProducts(selected);
    };

    const toggleBookmark = (productId: string) => {
      const bookmarks = getBookmarks();
      const index = bookmarks.indexOf(productId);

      if (index > -1) {
        bookmarks.splice(index, 1);
      } else {
        bookmarks.push(productId);
      }

      saveBookmarks(bookmarks);
      updateBookmarkButtons();

      // If we're on bookmark tab, re-filter without changing tab
      const activeTab = container.querySelector<HTMLButtonElement>('.coupang-category-tabs button.active');
      if (activeTab && activeTab.getAttribute('data-category') === 'bookmarks') {
        filterProducts('bookmarks');
      }
    };

    // Event listeners
    const tabListeners = new Map<HTMLButtonElement, () => void>();
    tabs.forEach((tab) => {
      const handler = () => setActiveCategory(tab);
      tabListeners.set(tab, handler);
      tab.addEventListener('click', handler);
    });

    const bookmarkBtnListeners = new Map<HTMLButtonElement, () => void>();
    const bookmarkButtons = container.querySelectorAll<HTMLButtonElement>('.bookmark-btn');
    bookmarkButtons.forEach((btn) => {
      const handler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const productId = btn.getAttribute('data-product-id');
        if (productId) toggleBookmark(productId);
      };
      bookmarkBtnListeners.set(btn, handler as any);
      btn.addEventListener('click', handler);
    });

    // Initialize - Try to restore from IndexedDB first
    getFromIndexedDB((storedBookmarks) => {
      if (storedBookmarks && storedBookmarks.length > 0) {
        (window as any).__shopBookmarks = [...storedBookmarks];
        console.log('[Bookmark] Restored', storedBookmarks.length, 'bookmarks from IndexedDB');
        // Update UI after restoring
        setTimeout(() => {
          updateBookmarkButtons();
        }, 100);
      }
    });

    updateBookmarkButtons();
    const defaultTab = tabs.find((tab) => tab.getAttribute('data-category') === 'all') || tabs[0];
    if (defaultTab) setActiveCategory(defaultTab);

    return () => {
      tabListeners.forEach((handler, tab) => tab.removeEventListener('click', handler));
      bookmarkBtnListeners.forEach((handler, btn) => btn.removeEventListener('click', handler as any));
    };
  }, [htmlPreview]);

  return (
    <div className="my-12">
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 text-amber-100 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="font-semibold">미리보기 모드: {versionName || versionId}</p>
                    <p className="text-xs opacity-80">총 {productCount}개 상품</p>
                </div>
                <button 
                    onClick={onClose}
                    className="bg-amber-500/20 hover:bg-amber-500/40 text-white font-bold py-2 px-4 rounded-lg transition"
                >
                    미리보기 닫기
                </button>
            </div>
        </div>

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
  );
}
