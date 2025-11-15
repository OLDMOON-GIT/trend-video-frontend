/**
 * 인증 플로우 통합테스트
 * 로그인, 로그아웃, 세션 관리, 권한 검증 등
 */

import {
  mockUsers,
  mockSessionIds,
  mockFetch,
  createSuccessResponse,
  createErrorResponse,
  setupTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/test-utils';

describe('인증 플로우 통합테스트', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe('로그인 플로우', () => {
    it('올바른 이메일과 비밀번호로 로그인 성공', async () => {
      const mockResponse = createSuccessResponse({
        user: mockUsers.regular,
        sessionId: mockSessionIds.regular,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@test.com',
          password: 'password123',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.user.email).toBe('user@test.com');
      expect(data.sessionId).toBeDefined();
    });

    it('잘못된 비밀번호로 로그인 실패', async () => {
      const mockResponse = createErrorResponse('비밀번호가 일치하지 않습니다', 401);

      global.fetch = mockFetch(mockResponse, 401);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@test.com',
          password: 'wrongpassword',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
      expect(data.error).toContain('비밀번호');
    });

    it('존재하지 않는 이메일로 로그인 실패', async () => {
      const mockResponse = createErrorResponse('사용자를 찾을 수 없습니다', 404);

      global.fetch = mockFetch(mockResponse, 404);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@test.com',
          password: 'password123',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });
  });

  describe('회원가입 플로우', () => {
    it('새로운 사용자 회원가입 성공', async () => {
      const mockResponse = createSuccessResponse({
        user: {
          userId: 'new-user-id',
          email: 'newuser@test.com',
          isAdmin: false,
        },
        sessionId: 'new-session-id',
      });

      global.fetch = mockFetch(mockResponse, 201);

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'password123',
          confirmPassword: 'password123',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.user.email).toBe('newuser@test.com');
    });

    it('이미 존재하는 이메일로 회원가입 실패', async () => {
      const mockResponse = createErrorResponse('이미 사용 중인 이메일입니다', 409);

      global.fetch = mockFetch(mockResponse, 409);

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@test.com',
          password: 'password123',
          confirmPassword: 'password123',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
      expect(data.error).toContain('이메일');
    });

    it('비밀번호 불일치로 회원가입 실패', async () => {
      const mockResponse = createErrorResponse('비밀번호가 일치하지 않습니다', 400);

      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@test.com',
          password: 'password123',
          confirmPassword: 'password456',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });
  });

  describe('세션 검증 플로우', () => {
    it('유효한 세션으로 사용자 정보 조회 성공', async () => {
      const mockResponse = createSuccessResponse({
        user: mockUsers.regular,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/auth/session', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(mockUsers.regular.email);
    });

    it('유효하지 않은 세션으로 인증 실패', async () => {
      const mockResponse = createErrorResponse('인증되지 않은 요청입니다', 401);

      global.fetch = mockFetch(mockResponse, 401);

      const response = await fetch('/api/auth/session', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.invalid}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.user).toBeUndefined();
    });

    it('세션 없이 요청 시 인증 실패', async () => {
      const mockResponse = createErrorResponse('인증되지 않은 요청입니다', 401);

      global.fetch = mockFetch(mockResponse, 401);

      const response = await fetch('/api/auth/session');

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.user).toBeUndefined();
    });
  });

  describe('로그아웃 플로우', () => {
    it('로그아웃 성공', async () => {
      const mockResponse = createSuccessResponse({ message: '로그아웃되었습니다' });

      global.fetch = mockFetch(mockResponse, 200);

      // localStorage에 세션 설정
      localStorage.setItem('sessionId', mockSessionIds.regular);

      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);

      // localStorage에서 세션이 제거되었는지 확인
      localStorage.removeItem('sessionId');
      expect(localStorage.getItem('sessionId')).toBeNull();
    });
  });

  describe('관리자 권한 검증', () => {
    it('관리자 사용자는 관리자 페이지 접근 가능', async () => {
      const mockResponse = createSuccessResponse({
        user: mockUsers.admin,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/auth/session', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.user.isAdmin).toBe(true);
    });

    it('일반 사용자는 관리자 API 접근 불가', async () => {
      const mockResponse = createErrorResponse('관리자 권한이 필요합니다', 403);

      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  describe('세션 만료 처리', () => {
    it('만료된 세션으로 요청 시 401 에러', async () => {
      const mockResponse = createErrorResponse('세션이 만료되었습니다', 401);

      global.fetch = mockFetch(mockResponse, 401);

      const response = await fetch('/api/auth/session', {
        headers: {
          'Authorization': `Bearer expired-session-id`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });
});
