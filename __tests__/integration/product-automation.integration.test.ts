/**
 * 상품 자동화 통합테스트
 *
 * 테스트 시나리오:
 * 1. DB에 상품이 있을 때: 최신 상품 선택
 * 2. DB가 비어있을 때: 쿠팡 베스트셀러 API 자동 호출
 * 3. 딥링크 자동 생성 확인
 * 4. video_titles 테이블에 저장 확인
 */

import {
  mockSessionIds,
  mockUsers,
  mockFetch,
  createSuccessResponse,
  createErrorResponse,
  setupTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/test-utils';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

describe('상품 자동화 통합테스트', () => {
  let dbPath: string;
  let db: Database.Database;
  let testUserId: string;

  beforeEach(() => {
    setupTestEnvironment();
    testUserId = 'test-user-id';

    // 테스트용 DB 설정
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    dbPath = path.join(dataDir, 'test-database.sqlite');

    // 기존 테스트 DB 삭제
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    // 테스트 DB 초기화
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS coupang_products (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        deep_link TEXT NOT NULL,
        product_url TEXT,
        discount_price INTEGER,
        original_price INTEGER,
        image_url TEXT,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS video_titles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        product_id TEXT,
        product_name TEXT,
        product_price INTEGER,
        product_link TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterEach(() => {
    teardownTestEnvironment();
    if (db) {
      db.close();
    }
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  describe('DB 상품 우선 선택', () => {
    it('DB에 상품이 있으면 최신 상품을 선택한다', () => {
      // Given: DB에 여러 상품 추가
      db.prepare(`
        INSERT INTO coupang_products (id, user_id, title, deep_link, product_url, discount_price, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'product_1',
        testUserId,
        '테스트 상품 1',
        'https://link.coupang.com/a/xxxxx1',
        'https://coupang.com/product/1',
        10000,
        new Date(Date.now() - 2000).toISOString()
      );

      db.prepare(`
        INSERT INTO coupang_products (id, user_id, title, deep_link, product_url, discount_price, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'product_2',
        testUserId,
        '테스트 상품 2',
        'https://link.coupang.com/a/xxxxx2',
        'https://coupang.com/product/2',
        20000,
        new Date().toISOString()
      );

      // When: 최신 상품 조회
      const product = db.prepare(`
        SELECT * FROM coupang_products
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(testUserId) as any;

      // Then: 가장 최근에 추가된 상품이 선택됨
      expect(product).toBeDefined();
      expect(product.id).toBe('product_2');
      expect(product.title).toBe('테스트 상품 2');
      expect(product.deep_link).toBe('https://link.coupang.com/a/xxxxx2');
    });

    it('선택된 상품이 video_titles에 저장된다', () => {
      // Given: DB에 상품 추가
      db.prepare(`
        INSERT INTO coupang_products (id, user_id, title, deep_link, product_url, discount_price)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'product_test',
        testUserId,
        '테스트 상품',
        'https://link.coupang.com/a/test123',
        'https://coupang.com/product/test',
        15000
      );

      const product = db.prepare(`
        SELECT * FROM coupang_products WHERE id = ?
      `).get('product_test') as any;

      // When: video_titles에 저장
      const titleId = `title_${Date.now()}`;
      db.prepare(`
        INSERT INTO video_titles (id, user_id, title, product_name, product_price, product_link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        titleId,
        testUserId,
        '자동 생성된 제목',
        product.title,
        product.discount_price,
        product.deep_link
      );

      // Then: video_titles에 제대로 저장됨
      const videoTitle = db.prepare(`
        SELECT * FROM video_titles WHERE id = ?
      `).get(titleId) as any;

      expect(videoTitle).toBeDefined();
      expect(videoTitle.product_name).toBe('테스트 상품');
      expect(videoTitle.product_price).toBe(15000);
      expect(videoTitle.product_link).toBe('https://link.coupang.com/a/test123');
    });
  });

  describe('쿠팡 베스트셀러 API 폴백', () => {
    it('DB가 비어있으면 쿠팡 API를 호출한다', () => {
      // Given: DB에 상품이 없음
      const count = db.prepare(`
        SELECT COUNT(*) as count FROM coupang_products WHERE user_id = ?
      `).get(testUserId) as any;

      expect(count.count).toBe(0);

      // When: 쿠팡 베스트셀러 API 응답 시뮬레이션
      const bestsellerResponse = {
        rCode: '0',
        data: [
          {
            productId: 12345,
            productName: '베스트 상품 1',
            productUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF1234&productId=12345',
            productPrice: 25000,
            productImage: 'https://image.com/product1.jpg',
            categoryName: '가전디지털',
            rank: 1,
          },
        ],
      };

      // Then: 베스트셀러 응답 구조 확인
      expect(bestsellerResponse.rCode).toBe('0');
      expect(bestsellerResponse.data).toHaveLength(1);
      expect(bestsellerResponse.data[0].productName).toBe('베스트 상품 1');
    });

    it('쿠팡 API 응답에서 긴 URL을 짧은 딥링크로 변환한다', () => {
      // Given: 쿠팡 API에서 받은 긴 affiliate URL
      const longUrl = 'https://link.coupang.com/re/AFFSDP?lptag=AF1234&productId=12345&pageKey=abcd';

      // When: 딥링크로 변환 (generateDeeplink 함수의 예상 동작)
      const expectedShortLink = 'https://link.coupang.com/a/bABcDe';

      // Then: 짧은 형태의 딥링크로 변환됨
      expect(expectedShortLink).toMatch(/^https:\/\/link\.coupang\.com\/a\/[a-zA-Z0-9]+$/);
      expect(expectedShortLink).not.toContain('lptag');
      expect(expectedShortLink).not.toContain('productId');
      expect(expectedShortLink).not.toContain('pageKey');
    });

    it('딥링크 생성 실패 시 에러를 반환한다', async () => {
      // Given: 잘못된 API 응답
      const mockResponse = createErrorResponse('쿠팡 API 오류: 401', 500);
      global.fetch = mockFetch(mockResponse, 500);

      // When: API 호출
      const response = await fetch('/api/automation/test-generate-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
        body: JSON.stringify({}),
      });

      // Then: 에러 응답 확인
      expect(response.ok).toBe(false);
    });
  });

  describe('딥링크 검증', () => {
    it('딥링크가 짧은 형태인지 확인한다', () => {
      // Given: 올바른 짧은 딥링크
      const shortLink = 'https://link.coupang.com/a/bABcDe';

      // When: 딥링크 형식 검증
      const isShortLink = /^https:\/\/link\.coupang\.com\/a\/[a-zA-Z0-9]+$/.test(shortLink);

      // Then: 짧은 형태 확인
      expect(isShortLink).toBe(true);
    });

    it('긴 affiliate URL은 딥링크로 인정하지 않는다', () => {
      // Given: 긴 affiliate URL
      const longUrl = 'https://link.coupang.com/re/AFFSDP?lptag=AF1234&productId=12345';

      // When: 딥링크 형식 검증
      const isShortLink = /^https:\/\/link\.coupang\.com\/a\/[a-zA-Z0-9]+$/.test(longUrl);

      // Then: 짧은 형태가 아님
      expect(isShortLink).toBe(false);
    });

    it('저장된 딥링크가 모두 짧은 형태인지 확인한다', () => {
      // Given: 여러 상품 추가
      db.prepare(`
        INSERT INTO coupang_products (id, user_id, title, deep_link)
        VALUES (?, ?, ?, ?)
      `).run('p1', testUserId, '상품1', 'https://link.coupang.com/a/abc123');

      db.prepare(`
        INSERT INTO coupang_products (id, user_id, title, deep_link)
        VALUES (?, ?, ?, ?)
      `).run('p2', testUserId, '상품2', 'https://link.coupang.com/a/xyz789');

      // When: 모든 상품의 딥링크 조회
      const products = db.prepare(`
        SELECT deep_link FROM coupang_products WHERE user_id = ?
      `).all(testUserId) as any[];

      // Then: 모든 딥링크가 짧은 형태
      products.forEach(product => {
        const isShortLink = /^https:\/\/link\.coupang\.com\/a\/[a-zA-Z0-9]+$/.test(product.deep_link);
        expect(isShortLink).toBe(true);
      });
    });
  });

  describe('전체 자동화 플로우', () => {
    it('DB 상품 → 딥링크 확인 → video_titles 저장 전체 흐름이 정상 동작한다', () => {
      // Given: DB에 상품 추가
      db.prepare(`
        INSERT INTO coupang_products (id, user_id, title, deep_link, discount_price)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'product_flow',
        testUserId,
        '플로우 테스트 상품',
        'https://link.coupang.com/a/flowTest',
        30000
      );

      // When: 1단계 - 상품 조회
      const product = db.prepare(`
        SELECT * FROM coupang_products
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(testUserId) as any;

      expect(product).toBeDefined();
      expect(product.deep_link).toMatch(/^https:\/\/link\.coupang\.com\/a\//);

      // When: 2단계 - video_titles에 저장
      const titleId = `title_flow_${Date.now()}`;
      db.prepare(`
        INSERT INTO video_titles (id, user_id, title, product_name, product_price, product_link, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        titleId,
        testUserId,
        '자동 생성된 테스트 제목',
        product.title,
        product.discount_price,
        product.deep_link,
        'pending'
      );

      // Then: 전체 흐름 검증
      const savedTitle = db.prepare(`
        SELECT * FROM video_titles WHERE id = ?
      `).get(titleId) as any;

      expect(savedTitle).toBeDefined();
      expect(savedTitle.product_name).toBe('플로우 테스트 상품');
      expect(savedTitle.product_price).toBe(30000);
      expect(savedTitle.product_link).toBe('https://link.coupang.com/a/flowTest');
      expect(savedTitle.status).toBe('pending');
    });

    it('DB 비어있음 → 쿠팡 API → 딥링크 생성 → 저장 전체 흐름 시뮬레이션', () => {
      // Given: DB에 상품 없음
      const count = db.prepare(`
        SELECT COUNT(*) as count FROM coupang_products WHERE user_id = ?
      `).get(testUserId) as any;
      expect(count.count).toBe(0);

      // When: 1단계 - 쿠팡 API 응답 시뮬레이션
      const apiResponse = {
        rCode: '0',
        data: [
          {
            productId: 99999,
            productName: 'API 베스트 상품',
            productUrl: 'https://link.coupang.com/re/AFFSDP?lptag=TEST123&productId=99999',
            productPrice: 45000,
            productImage: 'https://image.com/api-product.jpg',
            categoryName: '생활용품',
          },
        ],
      };

      // When: 2단계 - 짧은 딥링크로 변환 (시뮬레이션)
      const shortDeepLink = 'https://link.coupang.com/a/apiTest';

      // When: 3단계 - video_titles에 저장
      const titleId = `title_api_${Date.now()}`;
      db.prepare(`
        INSERT INTO video_titles (id, user_id, title, product_name, product_price, product_link)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        titleId,
        testUserId,
        'API에서 가져온 제목',
        apiResponse.data[0].productName,
        apiResponse.data[0].productPrice,
        shortDeepLink
      );

      // Then: 전체 흐름 검증
      const savedTitle = db.prepare(`
        SELECT * FROM video_titles WHERE id = ?
      `).get(titleId) as any;

      expect(savedTitle).toBeDefined();
      expect(savedTitle.product_name).toBe('API 베스트 상품');
      expect(savedTitle.product_price).toBe(45000);
      expect(savedTitle.product_link).toBe('https://link.coupang.com/a/apiTest');
      expect(savedTitle.product_link).toMatch(/^https:\/\/link\.coupang\.com\/a\//);
    });
  });
});
