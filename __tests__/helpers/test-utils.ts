/**
 * 통합테스트 유틸리티
 * 모든 통합테스트에서 공통으로 사용하는 헬퍼 함수들
 */

import { v4 as uuidv4 } from 'uuid';

// Mock 사용자 데이터
export const mockUsers = {
  admin: {
    userId: 'test-admin-user-id',
    email: 'admin@test.com',
    isAdmin: true,
  },
  regular: {
    userId: 'test-regular-user-id',
    email: 'user@test.com',
    isAdmin: false,
  },
};

// Mock 세션 ID
export const mockSessionIds = {
  admin: 'test-admin-session-id',
  regular: 'test-regular-session-id',
  invalid: 'invalid-session-id',
};

// Mock 대본 데이터
export const createMockScript = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  userId: mockUsers.regular.userId,
  title: '테스트 대본',
  content: '이것은 테스트용 대본 내용입니다.',
  status: 'completed',
  progress: 100,
  type: 'shortform',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// Mock 영상 Job 데이터
export const createMockJob = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  userId: mockUsers.regular.userId,
  scriptId: uuidv4(),
  title: '테스트 영상',
  status: 'completed',
  progress: 100,
  step: 'completed',
  type: 'shortform',
  videoPath: '/test/video.mp4',
  thumbnailPath: '/test/thumbnail.jpg',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// Mock 쿠팡 상품 데이터
export const createMockCoupangProduct = (overrides?: Partial<any>) => ({
  productId: 'test-product-' + Date.now(),
  productName: '테스트 상품',
  productPrice: 29900,
  productImage: 'https://example.com/product.jpg',
  productUrl: 'https://www.coupang.com/vp/products/123456',
  categoryName: '전자기기',
  isRocket: true,
  ...overrides,
});

// Mock 쿠팡 딥링크 데이터
export const createMockCoupangLink = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  userId: mockUsers.regular.userId,
  productName: '테스트 상품',
  shortUrl: 'https://link.coupang.com/a/test123',
  productUrl: 'https://www.coupang.com/vp/products/123456',
  imageUrl: 'https://example.com/product.jpg',
  category: '전자기기',
  price: 29900,
  clicks: 0,
  createdAt: new Date().toISOString(),
  ...overrides,
});

// Mock YouTube 채널 데이터
export const createMockYouTubeChannel = (overrides?: Partial<any>) => ({
  id: 'UC' + uuidv4().replace(/-/g, '').substring(0, 22),
  title: '테스트 채널',
  description: '테스트용 YouTube 채널',
  customUrl: '@testchannel',
  thumbnails: {
    default: { url: 'https://example.com/thumb-default.jpg' },
    medium: { url: 'https://example.com/thumb-medium.jpg' },
    high: { url: 'https://example.com/thumb-high.jpg' },
  },
  subscriberCount: '1000',
  videoCount: '50',
  viewCount: '10000',
  ...overrides,
});

// Mock YouTube 업로드 데이터
export const createMockYouTubeUpload = (overrides?: Partial<any>) => ({
  id: uuidv4(),
  userId: mockUsers.regular.userId,
  jobId: uuidv4(),
  videoId: 'test-video-id-' + Date.now(),
  videoUrl: 'https://www.youtube.com/watch?v=testVideoId',
  title: '테스트 영상',
  description: '테스트용 영상 설명',
  thumbnailUrl: 'https://img.youtube.com/vi/testVideoId/maxresdefault.jpg',
  channelId: 'UC' + uuidv4().replace(/-/g, '').substring(0, 22),
  channelTitle: '테스트 채널',
  privacyStatus: 'public',
  publishedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  ...overrides,
});

// Mock 자동화 타이틀 데이터
export const createMockAutomationTitle = (overrides?: Partial<any>) => ({
  id: 'title_' + Date.now() + '_' + Math.random().toString(36).substring(7),
  userId: mockUsers.regular.userId,
  prompt: '테스트 프롬프트',
  maxVideos: 5,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// Mock 자동화 스케줄 데이터
export const createMockAutomationSchedule = (overrides?: Partial<any>) => ({
  id: 'schedule_' + Date.now() + '_' + Math.random().toString(36).substring(7),
  titleId: 'title_test',
  userId: mockUsers.regular.userId,
  scheduledTime: new Date(Date.now() + 3600000).toISOString(), // 1시간 후
  status: 'pending',
  createdAt: new Date().toISOString(),
  ...overrides,
});

// API 요청 헬퍼
export const makeAuthenticatedRequest = (
  url: string,
  options: RequestInit = {},
  sessionId: string = mockSessionIds.regular
) => {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionId}`,
      ...options.headers,
    },
  });
};

// localStorage mock
export const mockLocalStorage = () => {
  const store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
  };
};

// fetch mock helper
export const mockFetch = (response: any, status: number = 200) => {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
};

// 대기 헬퍼 (비동기 작업 완료 대기)
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 조건 만족까지 대기
export const waitForCondition = async (
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> => {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await waitFor(interval);
  }
};

// 테스트 데이터 정리 헬퍼
export const cleanupTestData = {
  scripts: [] as string[],
  jobs: [] as string[],
  users: [] as string[],
  sessions: [] as string[],

  addScript: (id: string) => cleanupTestData.scripts.push(id),
  addJob: (id: string) => cleanupTestData.jobs.push(id),
  addUser: (id: string) => cleanupTestData.users.push(id),
  addSession: (id: string) => cleanupTestData.sessions.push(id),

  clear: () => {
    cleanupTestData.scripts = [];
    cleanupTestData.jobs = [];
    cleanupTestData.users = [];
    cleanupTestData.sessions = [];
  },
};

// 테스트 환경 초기화
export const setupTestEnvironment = () => {
  // localStorage mock
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage(),
    writable: true,
  });

  // fetch mock (필요시 개별 테스트에서 override)
  global.fetch = mockFetch({ success: true });
};

// 테스트 환경 정리
export const teardownTestEnvironment = () => {
  cleanupTestData.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
};

// 에러 응답 생성
export const createErrorResponse = (message: string, status: number = 400) => ({
  success: false,
  error: message,
  status,
});

// 성공 응답 생성
export const createSuccessResponse = (data: any) => ({
  success: true,
  ...data,
});
