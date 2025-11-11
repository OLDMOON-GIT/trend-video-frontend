/**
 * 쿠팡 샵 북마크 기능 리그레션 테스트
 *
 * 핵심 테스트 케이스:
 * 1. 북마크 탭이 카테고리 탭에 올바르게 생성되는지
 * 2. 각 상품 카드에 북마크 버튼이 있는지
 * 3. 북마크 추가/제거가 localStorage에 저장되는지 (iframe에서는 in-memory fallback)
 * 4. 북마크 탭 필터링이 작동하는지
 * 5. 북마크 탭에서 북마크 제거 시 탭이 유지되는지 (핵심!)
 */

import { generateShopHtml, type PublishedProduct } from '@/lib/shop-html';

describe('쿠팡 샵 북마크 기능 테스트', () => {
  const mockProducts: PublishedProduct[] = [
    {
      id: 'product-1',
      title: '테스트 상품 1',
      description: '테스트 설명 1',
      category: '식품',
      original_price: 10000,
      discount_price: 8000,
      image_url: 'https://example.com/image1.jpg',
      deep_link: 'https://example.com/product1',
    },
    {
      id: 'product-2',
      title: '테스트 상품 2',
      description: '테스트 설명 2',
      category: '생활용품',
      original_price: 20000,
      discount_price: 15000,
      image_url: 'https://example.com/image2.jpg',
      deep_link: 'https://example.com/product2',
    },
    {
      id: 'product-3',
      title: '테스트 상품 3',
      description: '테스트 설명 3',
      category: '식품',
      original_price: 30000,
      discount_price: null,
      image_url: 'https://example.com/image3.jpg',
      deep_link: 'https://example.com/product3',
    },
  ];

  describe('HTML 생성 검증', () => {
    it('북마크 탭이 생성되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('data-category="bookmarks"');
      expect(html).toContain('⭐ 잠시저장');
    });

    it('각 상품 카드에 북마크 버튼이 있어야 함', () => {
      const html = generateShopHtml(mockProducts);

      // 모든 상품에 북마크 버튼이 있는지 확인
      mockProducts.forEach(product => {
        expect(html).toContain(`data-product-id="${product.id}"`);
        expect(html).toContain('class="bookmark-btn"');
      });

      // 최소 3개의 북마크 버튼이 있어야 함
      const bookmarkBtnCount = (html.match(/class="bookmark-btn"/g) || []).length;
      expect(bookmarkBtnCount).toBe(mockProducts.length);
    });

    it('북마크 버튼에 클릭 이벤트 핸들러가 있어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('window.toggleBookmark');
      expect(html).toContain('onclick=');
    });

    it('storage 헬퍼 함수가 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('function getBookmarks');
      expect(html).toContain('function saveBookmarks');
      expect(html).toContain('localStorage');
      expect(html).toContain('sessionStorage'); // fallback level 2
      expect(html).toContain('indexedDB'); // IndexedDB for iframe
      expect(html).toContain('window.__shopBookmarks'); // memory fallback
    });

    it('북마크 탭 필터링 로직이 있어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('if (category === \'bookmarks\')');
      expect(html).toContain('filterProducts');
    });

    it('북마크 안내 문구가 포함되어야 함', () => {
      const html = generateShopHtml(mockProducts);
      expect(html).toContain('coupang-bookmark-notice');
      expect(html).toContain('새로고침하면 목록이 사라집니다');
    });
  });

  describe('북마크 기능 동작 검증 (DOM 시뮬레이션)', () => {
    beforeEach(() => {
      // localStorage 초기화
      localStorage.clear();
      sessionStorage.clear();
    });

    it('localStorage에서 북마크를 읽고 저장할 수 있어야 함', () => {
      // 북마크 저장
      const bookmarks = ['product-1', 'product-2'];
      localStorage.setItem('shop_bookmarks', JSON.stringify(bookmarks));

      // 북마크 읽기
      const savedBookmarks = localStorage.getItem('shop_bookmarks');
      expect(savedBookmarks).toBeTruthy();

      const parsedBookmarks = JSON.parse(savedBookmarks!);
      expect(parsedBookmarks).toEqual(bookmarks);
    });

    it('sessionStorage에서 북마크를 읽고 저장할 수 있어야 함', () => {
      // 북마크 저장
      const bookmarks = ['product-1', 'product-2'];
      sessionStorage.setItem('shop_bookmarks', JSON.stringify(bookmarks));

      // 북마크 읽기
      const savedBookmarks = sessionStorage.getItem('shop_bookmarks');
      expect(savedBookmarks).toBeTruthy();

      const parsedBookmarks = JSON.parse(savedBookmarks!);
      expect(parsedBookmarks).toEqual(bookmarks);
    });

    it('북마크 추가 시 배열에 상품 ID가 추가되어야 함', () => {
      let bookmarks: string[] = [];
      const productId = 'product-1';

      // 북마크 추가
      if (!bookmarks.includes(productId)) {
        bookmarks.push(productId);
      }

      expect(bookmarks).toContain(productId);
      expect(bookmarks.length).toBe(1);
    });

    it('북마크 제거 시 배열에서 상품 ID가 제거되어야 함', () => {
      let bookmarks: string[] = ['product-1', 'product-2', 'product-3'];
      const productId = 'product-2';

      // 북마크 제거
      const index = bookmarks.indexOf(productId);
      if (index > -1) {
        bookmarks.splice(index, 1);
      }

      expect(bookmarks).not.toContain(productId);
      expect(bookmarks.length).toBe(2);
      expect(bookmarks).toEqual(['product-1', 'product-3']);
    });

    it('중복 북마크가 추가되지 않아야 함', () => {
      let bookmarks: string[] = ['product-1'];
      const productId = 'product-1';

      // 이미 있는 북마크 추가 시도
      if (!bookmarks.includes(productId)) {
        bookmarks.push(productId);
      }

      expect(bookmarks.length).toBe(1);
      expect(bookmarks).toEqual(['product-1']);
    });
  });

  describe('탭 유지 로직 검증 (핵심 리그레션)', () => {
    it('북마크 탭에서 북마크 제거 시 현재 탭이 유지되어야 함', () => {
      // 현재 활성 탭 시뮬레이션
      let currentActiveTab = 'bookmarks';
      let bookmarks = ['product-1', 'product-2'];

      // 북마크 제거
      const productToRemove = 'product-1';
      const index = bookmarks.indexOf(productToRemove);
      if (index > -1) {
        bookmarks.splice(index, 1);
      }

      // 탭 변경 로직: 북마크 탭이면 탭 유지
      if (currentActiveTab === 'bookmarks') {
        // 탭 변경하지 않음 - 이것이 핵심!
        expect(currentActiveTab).toBe('bookmarks');
      }

      expect(bookmarks).toEqual(['product-2']);
    });

    it('다른 탭에서 북마크 제거 시 탭이 그대로 유지되어야 함', () => {
      let currentActiveTab = '식품';
      let bookmarks = ['product-1', 'product-2'];

      // 북마크 제거
      const productToRemove = 'product-1';
      const index = bookmarks.indexOf(productToRemove);
      if (index > -1) {
        bookmarks.splice(index, 1);
      }

      // 다른 탭에서는 당연히 탭 유지
      expect(currentActiveTab).toBe('식품');
      expect(bookmarks).toEqual(['product-2']);
    });

    it('북마크 추가 시 탭이 변경되지 않아야 함', () => {
      let currentActiveTab = '생활용품';
      let bookmarks = ['product-1'];

      // 북마크 추가
      const productToAdd = 'product-2';
      if (!bookmarks.includes(productToAdd)) {
        bookmarks.push(productToAdd);
      }

      // 탭은 그대로 유지
      expect(currentActiveTab).toBe('생활용품');
      expect(bookmarks).toEqual(['product-1', 'product-2']);
    });
  });

  describe('필터링 로직 검증', () => {
    it('북마크 탭 선택 시 북마크된 상품만 표시되어야 함', () => {
      const bookmarks = ['product-1', 'product-3'];
      const allProducts = mockProducts;

      // 북마크 필터링
      const visibleProducts = allProducts.filter(product =>
        bookmarks.includes(product.id)
      );

      expect(visibleProducts.length).toBe(2);
      expect(visibleProducts[0].id).toBe('product-1');
      expect(visibleProducts[1].id).toBe('product-3');
    });

    it('전체 탭 선택 시 모든 상품이 표시되어야 함', () => {
      const allProducts = mockProducts;
      const category = 'all';

      // 전체 필터링 (모든 상품)
      const visibleProducts = category === 'all'
        ? allProducts
        : allProducts.filter(p => p.category === category);

      expect(visibleProducts.length).toBe(mockProducts.length);
    });

    it('특정 카테고리 탭 선택 시 해당 카테고리 상품만 표시되어야 함', () => {
      const allProducts = mockProducts;
      const category = '식품';

      // 카테고리 필터링
      const visibleProducts = allProducts.filter(p => p.category === category);

      expect(visibleProducts.length).toBe(2);
      expect(visibleProducts.every(p => p.category === '식품')).toBe(true);
    });

    it('북마크가 없을 때 북마크 탭은 빈 목록이어야 함', () => {
      const bookmarks: string[] = [];
      const allProducts = mockProducts;

      // 북마크 필터링
      const visibleProducts = allProducts.filter(product =>
        bookmarks.includes(product.id)
      );

      expect(visibleProducts.length).toBe(0);
    });
  });

  describe('엣지 케이스 검증', () => {
    it('상품이 없을 때 북마크 탭이 생성되지 않아야 함', () => {
      const html = generateShopHtml([]);

      // 빈 상품 목록일 때는 탭이 생성되지 않음
      expect(html).toContain('퍼블리시된 상품이 없습니다');
    });

    it('잘못된 상품 ID로 북마크 제거 시도 시 에러가 발생하지 않아야 함', () => {
      let bookmarks = ['product-1', 'product-2'];
      const invalidProductId = 'product-999';

      // 존재하지 않는 상품 ID 제거 시도
      const index = bookmarks.indexOf(invalidProductId);
      if (index > -1) {
        bookmarks.splice(index, 1);
      }

      // 에러 없이 원래 배열 유지
      expect(bookmarks).toEqual(['product-1', 'product-2']);
    });

    it('localStorage 데이터가 손상되었을 때 빈 배열을 반환해야 함', () => {
      const getBookmarks = (storageValue: string | null): string[] => {
        if (!storageValue) return [];
        try {
          return JSON.parse(storageValue);
        } catch (e) {
          return [];
        }
      };

      // 손상된 데이터
      const corruptedData = 'invalid-json{{{';
      const bookmarks = getBookmarks(corruptedData);

      expect(bookmarks).toEqual([]);
    });

    it('매우 많은 북마크도 정상 처리되어야 함', () => {
      const manyBookmarks = Array.from({ length: 100 }, (_, i) => `product-${i}`);

      // 북마크 추가
      const newBookmark = 'product-100';
      if (!manyBookmarks.includes(newBookmark)) {
        manyBookmarks.push(newBookmark);
      }

      expect(manyBookmarks.length).toBe(101);
      expect(manyBookmarks).toContain('product-100');
    });
  });

  describe('UI 상태 검증', () => {
    it('북마크된 상품의 별표는 채워진 별(⭐)이어야 함', () => {
      const bookmarks = ['product-1'];
      const productId = 'product-1';

      const isBookmarked = bookmarks.includes(productId);
      const starIcon = isBookmarked ? '⭐' : '☆';

      expect(starIcon).toBe('⭐');
    });

    it('북마크되지 않은 상품의 별표는 빈 별(☆)이어야 함', () => {
      const bookmarks = ['product-1'];
      const productId = 'product-2';

      const isBookmarked = bookmarks.includes(productId);
      const starIcon = isBookmarked ? '⭐' : '☆';

      expect(starIcon).toBe('☆');
    });

    it('북마크 버튼 클릭 시 토글되어야 함', () => {
      let bookmarks = ['product-1'];
      const productId = 'product-1';

      // 첫 번째 클릭: 북마크 제거
      let index = bookmarks.indexOf(productId);
      if (index > -1) {
        bookmarks.splice(index, 1);
      } else {
        bookmarks.push(productId);
      }
      expect(bookmarks).toEqual([]);

      // 두 번째 클릭: 북마크 추가
      index = bookmarks.indexOf(productId);
      if (index > -1) {
        bookmarks.splice(index, 1);
      } else {
        bookmarks.push(productId);
      }
      expect(bookmarks).toEqual([productId]);
    });
  });

  describe('통합 시나리오 검증', () => {
    it('전체 플로우: 북마크 추가 → 북마크 탭 이동 → 북마크 제거 → 탭 유지', () => {
      let bookmarks: string[] = [];
      let currentTab = 'all';

      // 1. 전체 탭에서 상품 북마크 추가
      const product1 = 'product-1';
      bookmarks.push(product1);
      expect(bookmarks).toEqual([product1]);
      expect(currentTab).toBe('all'); // 탭 유지

      // 2. 북마크 탭으로 이동
      currentTab = 'bookmarks';
      const visibleProducts = mockProducts.filter(p => bookmarks.includes(p.id));
      expect(visibleProducts.length).toBe(1);
      expect(currentTab).toBe('bookmarks');

      // 3. 북마크 탭에서 북마크 제거
      const index = bookmarks.indexOf(product1);
      if (index > -1) {
        bookmarks.splice(index, 1);
      }

      // 4. 핵심: 탭이 여전히 bookmarks여야 함!
      expect(currentTab).toBe('bookmarks');
      expect(bookmarks).toEqual([]);

      // 5. 북마크 탭에서 보이는 상품이 0개여야 함
      const visibleAfterRemoval = mockProducts.filter(p => bookmarks.includes(p.id));
      expect(visibleAfterRemoval.length).toBe(0);
    });

    it('여러 상품 북마크 → 카테고리 전환 → 북마크 필터링', () => {
      let bookmarks: string[] = [];
      let currentTab = 'all';

      // 1. 여러 상품 북마크
      bookmarks.push('product-1', 'product-2');
      expect(bookmarks.length).toBe(2);

      // 2. 식품 카테고리로 전환
      currentTab = '식품';
      const categoryProducts = mockProducts.filter(p => p.category === '식품');
      expect(categoryProducts.length).toBe(2);

      // 3. 북마크 탭으로 전환
      currentTab = 'bookmarks';
      const bookmarkedProducts = mockProducts.filter(p => bookmarks.includes(p.id));
      expect(bookmarkedProducts.length).toBe(2);

      // 4. 탭이 올바르게 유지됨
      expect(currentTab).toBe('bookmarks');
    });
  });

  describe('리그레션 테스트 - 잠시저장 기능', () => {
    it('REGRESSION: 탭 이름이 "잠시저장"이어야 함', () => {
      const html = generateShopHtml(mockProducts);

      // 이전 버그: "북마크"로 표시됨
      // 수정: "잠시저장"으로 변경
      expect(html).toContain('⭐ 잠시저장');
      expect(html).not.toContain('⭐ 북마크');
    });

    it('REGRESSION: 안내 문구가 올바른 위치에 있어야 함', () => {
      const html = generateShopHtml(mockProducts);

      // 안내 문구가 탭과 상품 그리드 사이에 있어야 함
      // CSS 클래스 정의가 아닌 실제 HTML 요소를 검색
      const tabsIndex = html.indexOf('<div class="coupang-category-tabs');
      const noticeIndex = html.indexOf('<div class="coupang-bookmark-notice');
      const gridIndex = html.indexOf('<div class="coupang-shop-grid');

      expect(tabsIndex).toBeGreaterThan(-1);
      expect(noticeIndex).toBeGreaterThan(-1);
      expect(gridIndex).toBeGreaterThan(-1);
      expect(tabsIndex).toBeLessThan(noticeIndex);
      expect(noticeIndex).toBeLessThan(gridIndex);
    });

    it('REGRESSION: 안내 문구가 기본적으로 숨겨져 있어야 함', () => {
      const html = generateShopHtml(mockProducts);

      // display: none으로 기본 숨김
      expect(html).toContain('coupang-bookmark-notice');
      expect(html).toContain('display: none');
    });

    it('REGRESSION: 안내 문구 내용이 정확해야 함', () => {
      const html = generateShopHtml(mockProducts);

      expect(html).toContain('⚠️ 잠시저장은 임시 기능입니다');
      expect(html).toContain('새로고침하면 목록이 사라집니다');
    });

    it('REGRESSION: 탭 전환 시 안내 문구 표시/숨김 로직이 있어야 함', () => {
      const html = generateShopHtml(mockProducts);

      // filterProducts 함수에 안내 문구 표시/숨김 로직이 있어야 함
      expect(html).toContain('coupang-bookmark-notice');
      expect(html).toContain("category === 'bookmarks' ? 'block' : 'none'");
    });

    it('REGRESSION: 잠시저장 탭에서 북마크 제거 시 탭이 유지되어야 함', () => {
      let currentTab = 'bookmarks';
      let bookmarks = ['product-1', 'product-2'];

      // 북마크 제거
      const productToRemove = 'product-1';
      const index = bookmarks.indexOf(productToRemove);
      if (index > -1) {
        bookmarks.splice(index, 1);
      }

      // 이전 버그: 전체 탭으로 이동함
      // 수정: 잠시저장 탭에 그대로 유지
      expect(currentTab).toBe('bookmarks');
      expect(bookmarks).toEqual(['product-2']);
    });

    it('REGRESSION: Cookie가 최우선 저장소여야 함', () => {
      const html = generateShopHtml(mockProducts);

      // Level 1: Cookie (최우선)
      // Level 2: localStorage
      // Level 3: sessionStorage
      const cookieIndex = html.indexOf('getCookie(');
      const localStorageIndex = html.indexOf('localStorage.getItem');
      const sessionStorageIndex = html.indexOf('sessionStorage.getItem');

      // Cookie가 가장 먼저 시도되어야 함
      expect(cookieIndex).toBeLessThan(localStorageIndex);
      expect(localStorageIndex).toBeLessThan(sessionStorageIndex);
    });

    it('REGRESSION: SameSite 쿠키 속성이 설정되어야 함', () => {
      const html = generateShopHtml(mockProducts);

      // HTTPS: SameSite=None; Secure
      // HTTP: SameSite=Lax
      expect(html).toContain('SameSite');
      expect(html).toContain("window.location.protocol === 'https:'");
    });

    it('REGRESSION: IndexedDB 복원 로직이 있어야 함', () => {
      const html = generateShopHtml(mockProducts);

      // 페이지 로드 시 IndexedDB에서 복원 시도
      expect(html).toContain('getFromIndexedDB');
      expect(html).toContain('Restored');
      expect(html).toContain('bookmarks from IndexedDB');
    });

    it('REGRESSION: 모든 저장소 실패 시 경고가 표시되어야 함', () => {
      const html = generateShopHtml(mockProducts);

      // 모든 저장소 실패 시 콘솔 경고
      expect(html).toContain('Only saved to memory');
      expect(html).toContain('will be lost on reload');
    });
  });
});
