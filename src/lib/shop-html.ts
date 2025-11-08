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

export function generateShopHtml(products: PublishedProduct[]): string {
  const normalizedCategories = Array.from(
    new Set(products.map((product) => normalizeCategoryName(product.category)))
  );

  const categoryTabs = [
    '<button class="active" data-category="all">전체</button>',
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
    <div class="coupang-product-card" data-category="${categoryLabel}" style="background: #1e293b; border-radius: 12px; overflow: hidden; transition: transform 0.2s;">
      ${product.image_url ? `
      <img
        src="${product.image_url}"
        alt="${escapeHtml(product.title)}"
        style="width: 100%; height: 200px; object-fit: cover;"
      />
      ` : ''}

      <div style="padding: 16px;">
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
          <div style="display: flex; align-items: center; gap: 8px;">
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

        <a
          href="${product.deep_link}"
          target="_blank"
          rel="noopener noreferrer"
          style="display: block; width: 100%; background: linear-gradient(to right, #ea580c, #dc2626); color: white; text-align: center; padding: 12px; border-radius: 8px; font-weight: 600; text-decoration: none; margin-top: 12px;"
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
  document.addEventListener('DOMContentLoaded', function() {
    var container = document.querySelector('.coupang-shop-container');
    if (!container) return;

    var tabs = container.querySelectorAll('.coupang-category-tabs button');
    var cards = container.querySelectorAll('.coupang-product-card');

    function filterProducts(category) {
      cards.forEach(function(card) {
        var cardCategory = card.getAttribute('data-category');
        if (category === 'all' || cardCategory === category) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    }

    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(button) { button.classList.remove('active'); });
        tab.classList.add('active');
        var selected = tab.getAttribute('data-category') || 'all';
        filterProducts(selected);
      });
    });

    if (tabs.length > 0) {
      var defaultTab = Array.from(tabs).find(function(btn) {
        return btn.getAttribute('data-category') === 'all';
      }) || tabs[0];
      if (defaultTab) {
        defaultTab.classList.add('active');
        var selected = defaultTab.getAttribute('data-category') || 'all';
        filterProducts(selected);
      }
    }
  });
</script>`
    : '';

  const noticeText = '하단 링크로 구매하면 알리, 쿠팡, 네이버, 무신사로부터 일정액의 수수료를 살림남 채널이 제공받아 채널 운영에 도움이 됩니다.';

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
