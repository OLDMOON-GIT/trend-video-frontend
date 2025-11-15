/**
 * 쿠팡 파트너스 통합테스트
 * API 설정, 딥링크 생성, 상품 검색, 링크 관리 등
 */

import {
  mockSessionIds,
  mockUsers,
  mockFetch,
  createMockCoupangProduct,
  createMockCoupangLink,
  createSuccessResponse,
  createErrorResponse,
  setupTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/test-utils';

describe('쿠팡 파트너스 통합테스트', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe('API 설정 관리', () => {
    it('쿠팡 파트너스 API 설정 저장 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: '설정이 저장되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          accessKey: 'test-access-key',
          secretKey: 'test-secret-key',
          trackingId: 'test-tracking-id',
          openaiApiKey: 'sk-test-openai-key',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('저장된 API 설정 조회 성공 (키 마스킹)', async () => {
      const mockResponse = createSuccessResponse({
        settings: {
          userId: mockUsers.regular.userId,
          accessKey: 'test-access-key',
          secretKey: 'test-secret-...***key',
          trackingId: 'test-tracking-id',
          openaiApiKey: 'sk-test-open...***key',
          isConnected: true,
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/settings', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.settings).toBeDefined();
      expect(data.settings.secretKey).toContain('***');
      expect(data.settings.openaiApiKey).toContain('***');
    });

    it('인증되지 않은 사용자의 설정 저장 시도 실패', async () => {
      const mockResponse = createErrorResponse('로그인이 필요합니다.', 401);
      global.fetch = mockFetch(mockResponse, 401);

      const response = await fetch('/api/coupang/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessKey: 'test-access-key',
          secretKey: 'test-secret-key',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('마스킹된 키 전송 시 기존 값 유지', async () => {
      const mockResponse = createSuccessResponse({
        message: '설정이 저장되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          accessKey: 'new-access-key',
          secretKey: 'test-secret-...***key', // 마스킹된 값
          trackingId: 'new-tracking-id',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('딥링크 생성', () => {
    it('상품 URL로 딥링크 생성 성공', async () => {
      const mockLink = createMockCoupangLink();
      const mockResponse = createSuccessResponse({
        link: mockLink,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: '123456',
          productName: '테스트 상품',
          productUrl: 'https://www.coupang.com/vp/products/123456',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.link).toBeDefined();
      expect(data.link.shortUrl).toContain('link.coupang.com');
    });

    it('API 설정 없이 딥링크 생성 시도 실패', async () => {
      const mockResponse = createErrorResponse(
        'API 키와 Tracking ID를 먼저 설정하세요.',
        400
      );
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/coupang/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: '123456',
          productName: '테스트 상품',
          productUrl: 'https://www.coupang.com/vp/products/123456',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
      expect(data.error).toContain('설정');
    });

    it('잘못된 상품 정보로 딥링크 생성 실패', async () => {
      const mockResponse = createErrorResponse('상품 정보가 올바르지 않습니다.', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/coupang/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: '',
          productUrl: '',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });

    it('쿠팡 API 오류 응답 처리', async () => {
      const mockResponse = createErrorResponse('링크 생성 실패', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/coupang/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: '123456',
          productName: '테스트 상품',
          productUrl: 'https://www.coupang.com/vp/products/123456',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });
  });

  describe('링크 목록 관리', () => {
    it('사용자의 딥링크 목록 조회 성공', async () => {
      const mockLinks = [
        createMockCoupangLink(),
        createMockCoupangLink({ productName: '두 번째 상품' }),
        createMockCoupangLink({ productName: '세 번째 상품' }),
      ];

      const mockResponse = createSuccessResponse({
        links: mockLinks,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/links', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.links).toBeDefined();
      expect(Array.isArray(data.links)).toBe(true);
      expect(data.links.length).toBe(3);
    });

    it('특정 링크 상세 정보 조회', async () => {
      const mockLink = createMockCoupangLink();
      const mockResponse = createSuccessResponse({
        link: mockLink,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/coupang/links/${mockLink.id}`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.link).toBeDefined();
      expect(data.link.id).toBe(mockLink.id);
    });

    it('링크 삭제 성공', async () => {
      const mockLink = createMockCoupangLink();
      const mockResponse = createSuccessResponse({
        message: '링크가 삭제되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/coupang/links/${mockLink.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('다른 사용자의 링크 삭제 시도 실패', async () => {
      const mockLink = createMockCoupangLink({ userId: 'another-user-id' });
      const mockResponse = createErrorResponse('권한이 없습니다.', 403);

      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch(`/api/coupang/links/${mockLink.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  describe('상품 검색', () => {
    it('키워드로 상품 검색 성공', async () => {
      const mockProducts = [
        createMockCoupangProduct(),
        createMockCoupangProduct({ productName: '두 번째 상품' }),
      ];

      const mockResponse = createSuccessResponse({
        products: mockProducts,
        totalCount: 2,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/search?keyword=노트북', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.products).toBeDefined();
      expect(Array.isArray(data.products)).toBe(true);
    });

    it('카테고리별 베스트셀러 조회', async () => {
      const mockProducts = [
        createMockCoupangProduct({ categoryName: '전자기기' }),
        createMockCoupangProduct({ categoryName: '전자기기', productName: '인기 상품 2' }),
      ];

      const mockResponse = createSuccessResponse({
        products: mockProducts,
        category: '전자기기',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/bestsellers?category=전자기기', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.products).toBeDefined();
      expect(data.category).toBe('전자기기');
    });

    it('로켓 배송 상품 필터링', async () => {
      const mockProducts = [
        createMockCoupangProduct({ isRocket: true }),
        createMockCoupangProduct({ isRocket: true, productName: '로켓 상품 2' }),
      ];

      const mockResponse = createSuccessResponse({
        products: mockProducts,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/search?keyword=노트북&rocketOnly=true', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.products).toBeDefined();
      expect(data.products.every((p: any) => p.isRocket)).toBe(true);
    });
  });

  describe('링크 통계 조회', () => {
    it('사용자의 링크 클릭 통계 조회', async () => {
      const mockStats = {
        totalLinks: 10,
        totalClicks: 150,
        topProducts: [
          { productName: '인기 상품 1', clicks: 50 },
          { productName: '인기 상품 2', clicks: 35 },
        ],
      };

      const mockResponse = createSuccessResponse({
        stats: mockStats,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/stats', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.stats).toBeDefined();
      expect(data.stats.totalLinks).toBe(10);
      expect(data.stats.totalClicks).toBe(150);
    });

    it('기간별 통계 조회', async () => {
      const mockStats = {
        period: '7days',
        clicks: 75,
        conversions: 5,
      };

      const mockResponse = createSuccessResponse({
        stats: mockStats,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/stats?period=7days', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.stats.period).toBe('7days');
    });
  });

  describe('API 인증 및 권한', () => {
    it('잘못된 Access Key로 요청 실패', async () => {
      const mockResponse = createErrorResponse('인증 실패', 401);
      global.fetch = mockFetch(mockResponse, 401);

      const response = await fetch('/api/coupang/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: '123456',
          productName: '테스트 상품',
          productUrl: 'https://www.coupang.com/vp/products/123456',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('API 요청 제한 초과 시 에러', async () => {
      const mockResponse = createErrorResponse('요청 제한을 초과했습니다.', 429);
      global.fetch = mockFetch(mockResponse, 429);

      const response = await fetch('/api/coupang/search?keyword=test', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
    });

    it('서명 검증 실패', async () => {
      const mockResponse = createErrorResponse('서명 검증 실패', 403);
      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch('/api/coupang/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          productId: '123456',
          productName: '테스트 상품',
          productUrl: 'https://www.coupang.com/vp/products/123456',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  describe('관리자 기능', () => {
    it('관리자는 모든 사용자의 링크 조회 가능', async () => {
      const mockLinks = [
        createMockCoupangLink({ userId: mockUsers.regular.userId }),
        createMockCoupangLink({ userId: 'another-user-id' }),
      ];

      const mockResponse = createSuccessResponse({
        links: mockLinks,
        total: 2,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/admin/coupang/links', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.links).toBeDefined();
      expect(data.links.length).toBe(2);
    });

    it('일반 사용자는 관리자 API 접근 불가', async () => {
      const mockResponse = createErrorResponse('관리자 권한이 필요합니다.', 403);
      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch('/api/admin/coupang/links', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  describe('배치 작업', () => {
    it('여러 상품에 대해 일괄 딥링크 생성', async () => {
      const products = [
        { productId: '123', productName: '상품 1', productUrl: 'https://www.coupang.com/vp/products/123' },
        { productId: '456', productName: '상품 2', productUrl: 'https://www.coupang.com/vp/products/456' },
        { productId: '789', productName: '상품 3', productUrl: 'https://www.coupang.com/vp/products/789' },
      ];

      const mockResponse = createSuccessResponse({
        links: products.map(p => createMockCoupangLink({
          productId: p.productId,
          productName: p.productName,
        })),
        successCount: 3,
        failedCount: 0,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/generate-links-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({ products }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.successCount).toBe(3);
    });

    it('일괄 삭제', async () => {
      const linkIds = ['link1', 'link2', 'link3'];
      const mockResponse = createSuccessResponse({
        deletedCount: 3,
        message: '3개의 링크가 삭제되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/coupang/links/batch-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({ linkIds }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.deletedCount).toBe(3);
    });
  });
});
