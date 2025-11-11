export type PublishedProduct = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  original_price?: number | string | null;
  discount_price?: number | string | null;
  image_url?: string | null;
  deep_link: string;
};

export function generateShopHtml(products: PublishedProduct[], nickname?: string): string {
  const normalizedCategories = Array.from(
    new Set(products.map((product) => normalizeCategoryName(product.category)))
  );

  const categoryTabs = [
    '<button class="active" data-category="all">전체</button>',
    '<button data-category="bookmarks">⭐ 잠시저장</button>',
    ...normalizedCategories.map(
      (category) =>
        `<button data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
    ),
  ].join('\n');

  const productCards = products
    .map((product) => {
      const categoryLabel = escapeHtml(normalizeCategoryName(product.category));
      const discountPrice = formatCurrency(product.discount_price);
      const originalPrice = formatCurrency(product.original_price);

      return `
    <div class="coupang-product-card" data-category="${categoryLabel}" data-product-id="${escapeHtml(product.id)}" style="background: #1e293b; border-radius: 12px; overflow: hidden; transition: transform 0.2s; position: relative; display: flex; flex-direction: column; height: 100%;">
      <button
        class="bookmark-btn"
        data-product-id="${escapeHtml(product.id)}"
        onclick="window.toggleBookmark && window.toggleBookmark('${escapeHtml(product.id)}'); return false;"
        style="position: absolute; top: 12px; right: 12px; z-index: 10; background: rgba(0,0,0,0.6); border: none; color: #fbbf24; font-size: 24px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(4px);"
        onmouseover="this.style.background='rgba(0,0,0,0.8)'; this.style.transform='scale(1.1)';"
        onmouseout="this.style.background='rgba(0,0,0,0.6)'; this.style.transform='scale(1)';">☆</button>
      ${product.image_url ? `
      <img
        src="${product.image_url}"
        alt="${escapeHtml(product.title)}"
        style="width: 100%; height: 200px; object-fit: cover; flex-shrink: 0;"
      />
      ` : ''}

      <div style="padding: 16px; display: flex; flex-direction: column; flex: 1;">
        <div style="flex: 1;">
          <span style="display: inline-block; background: #9333ea; color: white; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 8px;">
            ${categoryLabel}
          </span>

          <h3 style="color: white; font-size: 16px; font-weight: bold; margin: 8px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(product.title)}
          </h3>

          <p style="color: #94a3b8; font-size: 14px; margin: 8px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(product.description || '')}
          </p>

          ${discountPrice ? `
          <div style="margin: 12px 0;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="color: #f87171; font-size: 20px; font-weight: bold;">
                ${discountPrice}원
              </span>
              ${originalPrice ? `
              <span style="color: #64748b; font-size: 14px; text-decoration: line-through;">
                ${originalPrice}원
              </span>
              ` : ''}
            </div>
          </div>
          ` : originalPrice ? `
          <div style="margin: 12px 0;">
            <span style="color: white; font-size: 20px; font-weight: bold;">
              ${originalPrice}원
            </span>
          </div>
          ` : ''}
        </div>

        <a
          href="${product.deep_link}"
          target="_blank"
          rel="noopener noreferrer"
          style="display: block; width: 100%; background: linear-gradient(to right, #ea580c, #dc2626); color: white; text-align: center; padding: 12px; border-radius: 8px; font-weight: 600; text-decoration: none; margin-top: 12px; flex-shrink: 0;"
        >
          🛒 쿠팡에서 보기
        </a>
      </div>
    </div>
  `;
    })
    .join('\n');

  const hasProducts = products.length > 0;
  const gridMarkup = hasProducts
    ? `
  <div class="coupang-category-tabs">
    ${categoryTabs}
  </div>
  <div class="coupang-bookmark-notice" style="display: none; background-color: #fef3c7; color: #92400e; padding: 12px; border-radius: 8px; text-align: center; margin-bottom: 16px; font-size: 14px; border: 1px solid #fbbf24;">
    ⚠️ 잠시저장은 임시 기능입니다. 새로고침하면 목록이 사라집니다.
  </div>
  <div class="coupang-shop-grid">
    ${productCards}
  </div>`
    : `
  <div class="coupang-empty">
    <p>퍼블리시된 상품이 없습니다.</p>
  </div>`;

  const script = hasProducts
    ? `
<script>
  (function() {
    // Multi-level fallback storage for restricted environments
    if (!window.__shopBookmarks) {
      window.__shopBookmarks = [];
    }

    // IndexedDB helper
    var dbPromise = null;
    function openDB() {
      if (dbPromise) return dbPromise;

      dbPromise = new Promise(function(resolve, reject) {
        try {
          var request = indexedDB.open('ShopBookmarksDB', 1);

          request.onerror = function() {
            console.log('[Bookmark] IndexedDB blocked');
            reject(request.error);
          };

          request.onsuccess = function() {
            console.log('[Bookmark] IndexedDB opened');
            resolve(request.result);
          };

          request.onupgradeneeded = function(event) {
            var db = event.target.result;
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
    }

    function getFromIndexedDB(callback) {
      openDB().then(function(db) {
        var tx = db.transaction('bookmarks', 'readonly');
        var store = tx.objectStore('bookmarks');
        var request = store.get('bookmarks');

        request.onsuccess = function() {
          if (request.result) {
            console.log('[Bookmark] Loaded from IndexedDB');
            callback(request.result);
          } else {
            callback(null);
          }
        };

        request.onerror = function() {
          callback(null);
        };
      }).catch(function() {
        callback(null);
      });
    }

    function saveToIndexedDB(bookmarks) {
      openDB().then(function(db) {
        var tx = db.transaction('bookmarks', 'readwrite');
        var store = tx.objectStore('bookmarks');
        store.put(bookmarks, 'bookmarks');
        console.log('[Bookmark] Saved to IndexedDB');
      }).catch(function() {
        // IndexedDB failed
      });
    }

    // Cookie helpers for cross-origin iframe
    function getCookie(name) {
      var value = '; ' + document.cookie;
      var parts = value.split('; ' + name + '=');
      if (parts.length === 2) {
        var cookieValue = parts.pop().split(';').shift();
        console.log('[Bookmark] Cookie read:', cookieValue ? 'exists' : 'empty');
        return cookieValue;
      }
      return '';
    }

    function setCookie(name, value, days) {
      var expires = '';
      if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = '; expires=' + date.toUTCString();
      }
      // Try SameSite=None for cross-origin (requires HTTPS in production)
      // For HTTP, use SameSite=Lax
      var sameSite = window.location.protocol === 'https:' ? '; SameSite=None; Secure' : '; SameSite=Lax';
      document.cookie = name + '=' + (value || '') + expires + '; path=/' + sameSite;
      console.log('[Bookmark] Cookie set with SameSite:', window.location.protocol === 'https:' ? 'None' : 'Lax');
    }

    // Storage helper functions with multi-level fallback
    function getBookmarks() {
      // Level 1: Try Cookie (works in some iframes)
      try {
        var cookieData = getCookie('shop_bookmarks');
        if (cookieData) {
          var decoded = JSON.parse(decodeURIComponent(cookieData));
          console.log('[Bookmark] Loaded from Cookie:', decoded.length, 'items');
          return decoded;
        }
      } catch (e) {
        console.log('[Bookmark] Cookie read failed:', e.message);
      }

      // Level 2: Try localStorage (best - survives page reload)
      try {
        var stored = localStorage.getItem('shop_bookmarks');
        if (stored) {
          console.log('[Bookmark] Loaded from localStorage');
          return JSON.parse(stored);
        }
      } catch (e) {
        console.log('[Bookmark] localStorage blocked');
      }

      // Level 3: Try sessionStorage (survives page reload in same tab)
      try {
        var sessionStored = sessionStorage.getItem('shop_bookmarks');
        if (sessionStored) {
          console.log('[Bookmark] Loaded from sessionStorage');
          return JSON.parse(sessionStored);
        }
      } catch (e) {
        console.log('[Bookmark] sessionStorage blocked');
      }

      // Level 4: Use window object (synchronous fallback)
      console.log('[Bookmark] Using in-memory storage');
      return (window.__shopBookmarks || []).slice();
    }

    function saveBookmarks(bookmarks) {
      var saved = false;

      // Save to Cookie (priority 1 - for iframe support)
      try {
        setCookie('shop_bookmarks', encodeURIComponent(JSON.stringify(bookmarks)), 365);
        console.log('[Bookmark] Saved to Cookie');
        saved = true;
      } catch (e) {
        console.log('[Bookmark] Cookie save failed:', e.message);
      }

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

      // Always save to window object
      window.__shopBookmarks = bookmarks.slice();

      if (!saved) {
        console.warn('[Bookmark] Only saved to memory - will be lost on reload!');
      }
    }

    // Global toggle function
    window.toggleBookmark = function(productId) {
      console.log('[Bookmark] Toggle clicked for product:', productId);
      var bookmarks = getBookmarks();
      console.log('[Bookmark] Current bookmarks:', bookmarks);
      var index = bookmarks.indexOf(productId);

      if (index > -1) {
        bookmarks.splice(index, 1);
        console.log('[Bookmark] Removed from bookmarks');
      } else {
        bookmarks.push(productId);
        console.log('[Bookmark] Added to bookmarks');
      }

      saveBookmarks(bookmarks);
      console.log('[Bookmark] Saved bookmarks:', bookmarks);
      updateBookmarkButtons();

      // If we're on bookmark tab, re-filter
      var activeTab = document.querySelector('.coupang-category-tabs button.active');
      if (activeTab && activeTab.getAttribute('data-category') === 'bookmarks') {
        filterProducts('bookmarks');
      }
    };

    function updateBookmarkButtons() {
      var bookmarks = getBookmarks();
      var buttons = document.querySelectorAll('.bookmark-btn');
      buttons.forEach(function(btn) {
        var productId = btn.getAttribute('data-product-id');
        if (bookmarks.indexOf(productId) > -1) {
          btn.textContent = '⭐';
        } else {
          btn.textContent = '☆';
        }
      });
    }

    document.addEventListener('DOMContentLoaded', function() {
      console.log('[Bookmark] Script initialized');

      // Try to load from IndexedDB first (async)
      getFromIndexedDB(function(storedBookmarks) {
        if (storedBookmarks && storedBookmarks.length > 0) {
          window.__shopBookmarks = storedBookmarks.slice();
          console.log('[Bookmark] Restored', storedBookmarks.length, 'bookmarks from IndexedDB');
          // Update UI after restoring
          setTimeout(function() {
            updateBookmarkButtons();
          }, 100);
        }
      });

      var container = document.querySelector('.coupang-shop-container');
      if (!container) {
        console.error('[Bookmark] Container not found!');
        return;
      }

      var tabs = container.querySelectorAll('.coupang-category-tabs button');
      var cards = container.querySelectorAll('.coupang-product-card');
      console.log('[Bookmark] Found', tabs.length, 'tabs and', cards.length, 'cards');

      function filterProducts(category) {
        // Show/hide bookmark notice
        var bookmarkNotice = container.querySelector('.coupang-bookmark-notice');
        if (bookmarkNotice) {
          bookmarkNotice.style.display = category === 'bookmarks' ? 'block' : 'none';
        }

        if (category === 'bookmarks') {
          var bookmarks = getBookmarks();
          cards.forEach(function(card) {
            var productId = card.getAttribute('data-product-id');
            if (bookmarks.indexOf(productId) > -1) {
              card.style.display = '';
            } else {
              card.style.display = 'none';
            }
          });
        } else {
          cards.forEach(function(card) {
            var cardCategory = card.getAttribute('data-category');
            if (category === 'all' || cardCategory === category) {
              card.style.display = '';
            } else {
              card.style.display = 'none';
            }
          });
        }
      }

      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(button) { button.classList.remove('active'); });
          tab.classList.add('active');
          var selected = tab.getAttribute('data-category') || 'all';
          filterProducts(selected);
        });
      });

      // Initialize bookmark buttons
      console.log('[Bookmark] Initializing bookmark buttons...');
      updateBookmarkButtons();
      console.log('[Bookmark] Bookmark buttons initialized');

      if (tabs.length > 0) {
        var defaultTab = Array.from(tabs).find(function(btn) {
          return btn.getAttribute('data-category') === 'all';
        }) || tabs[0];
        if (defaultTab) {
          defaultTab.classList.add('active');
          var selected = defaultTab.getAttribute('data-category') || 'all';
          console.log('[Bookmark] Setting default tab:', selected);
          filterProducts(selected);
        }
      }
      console.log('[Bookmark] Setup complete!');
    });
  })();
</script>`
    : '';

  const displayName = nickname || '운영자';
  const noticeText = `하단 링크로 구매하면 알리, 쿠팡, 네이버, 무신사로부터 일정액의 수수료를 ${displayName} 채널로 제공받아 채널 운영에 도움이 됩니다.`;

  return `
<!-- 쿠팡 샵 - 자동 생성 HTML -->
<style>
  .coupang-shop-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  }
  .coupang-main-notice {
    background-color: #1e293b;
    color: #f1f5f9;
    padding: 16px;
    border-radius: 12px;
    text-align: center;
    margin-bottom: 24px;
    font-size: 14px;
    border: 1px solid #334155;
  }
  .coupang-shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 24px;
    align-items: stretch;
  }
  .coupang-product-card {
    min-height: 500px;
  }
  .coupang-category-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-bottom: 24px;
  }
  .coupang-category-tabs button {
    background: #334155;
    color: #e2e8f0;
    border: none;
    padding: 10px 18px;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .coupang-category-tabs button.active,
  .coupang-category-tabs button:hover {
    background: #7c3aed;
    color: #fff;
    box-shadow: 0 8px 20px rgba(124, 58, 237, 0.35);
  }
  .coupang-empty {
    text-align: center;
    color: #94a3b8;
    padding: 60px 0;
    border: 1px dashed #475569;
    border-radius: 16px;
    background: #0f172a;
  }
  .coupang-disclaimer {
    text-align: center;
    color: #64748b;
    font-size: 12px;
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #334155;
  }
  @media (max-width: 768px) {
    .coupang-shop-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

<div class="coupang-shop-container">
  <div class="coupang-main-notice">
    ${noticeText}
  </div>
${gridMarkup}

  <div class="coupang-disclaimer">
    본 포스팅에는 쿠팡 파트너스 활동으로, 일정액의 수수료를 제공받습니다.
  </div>
</div>
${script}
`;
}

export function normalizeCategoryName(category?: string | null): string {
  const trimmed = (category || '').trim();
  return trimmed.length > 0 ? trimmed : '기타';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(value?: number | string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(numeric)) {
    return null;
  }
  return numeric.toLocaleString('ko-KR');
}
