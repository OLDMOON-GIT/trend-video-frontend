/**
 * Mock Service Worker Handlers
 *
 * API mocking for regression tests
 * These handlers can be used with MSW (Mock Service Worker) if needed
 */

export const mockHandlers = {
  // Shop API handlers
  shop: {
    // GET /api/shop/products/public
    getPublicProducts: (products: any[] = [], nickname: string = '테스트') => ({
      products,
      nickname,
      version: null,
    }),

    // GET /api/shop/products/public?versionId=X
    getPublicProductsWithVersion: (products: any[], versionId: string, versionName: string = '버전 1') => ({
      products,
      nickname: '테스트',
      version: {
        id: versionId,
        name: versionName,
        versionNumber: 1,
      },
    }),

    // GET /api/shop/versions/:versionId/html
    getVersionHtml: (html: string = '<html><body>Test</body></html>') => html,
  },

  // Jobs API handlers
  jobs: {
    // POST /api/jobs/:jobId/convert-to-shorts
    convertToShorts: (success: boolean = true, newJobId: string = 'new-job-id') => {
      if (success) {
        return {
          ok: true,
          json: async () => ({ jobId: newJobId }),
        };
      } else {
        return {
          ok: false,
          json: async () => ({ error: '변환 실패' }),
        };
      }
    },

    // GET /api/jobs
    getJobs: (jobs: any[] = []) => ({
      jobs,
      total: jobs.length,
    }),

    // DELETE /api/jobs/:jobId
    deleteJob: (success: boolean = true) => {
      if (success) {
        return {
          ok: true,
          json: async () => ({ message: '삭제되었습니다.' }),
        };
      } else {
        return {
          ok: false,
          json: async () => ({ error: '삭제 실패' }),
        };
      }
    },
  },

  // Coupang Products API handlers
  coupang: {
    // GET /api/coupang/products
    getProducts: (products: any[] = []) => ({
      products,
      total: products.length,
    }),

    // POST /api/coupang/products
    createProduct: (product: any) => ({
      product,
      message: '상품이 추가되었습니다.',
    }),

    // PUT /api/coupang/products/:id
    updateProduct: (product: any) => ({
      product,
      message: '상품이 수정되었습니다.',
    }),

    // DELETE /api/coupang/products/:id
    deleteProduct: (success: boolean = true) => {
      if (success) {
        return {
          ok: true,
          json: async () => ({ message: '상품이 삭제되었습니다.' }),
        };
      } else {
        return {
          ok: false,
          json: async () => ({ error: '삭제 실패' }),
        };
      }
    },

    // POST /api/coupang/products/bulk-update
    bulkUpdate: (count: number) => ({
      updated: count,
      message: `${count}개 상품이 업데이트되었습니다.`,
    }),

    // POST /api/coupang/search
    searchProducts: (results: any[] = []) => ({
      results,
      total: results.length,
    }),
  },
};

// Error responses
export const mockErrors = {
  networkError: new Error('Network error'),
  timeoutError: new Error('Request timeout'),
  unauthorized: {
    ok: false,
    status: 401,
    json: async () => ({ error: '인증이 필요합니다.' }),
  },
  forbidden: {
    ok: false,
    status: 403,
    json: async () => ({ error: '권한이 없습니다.' }),
  },
  notFound: {
    ok: false,
    status: 404,
    json: async () => ({ error: '찾을 수 없습니다.' }),
  },
  serverError: {
    ok: false,
    status: 500,
    json: async () => ({ error: '서버 오류가 발생했습니다.' }),
  },
  badRequest: {
    ok: false,
    status: 400,
    json: async () => ({ error: '잘못된 요청입니다.' }),
  },
};

// Helper to create mock fetch responses
export function createMockResponse(data: any, ok: boolean = true, status: number = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => typeof data === 'string' ? data : JSON.stringify(data),
  };
}

// Helper to create delayed mock response (for testing loading states)
export function createDelayedMockResponse(
  data: any,
  delay: number = 100,
  ok: boolean = true,
  status: number = 200
) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(createMockResponse(data, ok, status));
    }, delay);
  });
}
