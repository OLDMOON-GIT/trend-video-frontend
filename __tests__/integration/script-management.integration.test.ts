/**
 * 대본 생성 및 관리 통합테스트
 */

import {
  mockSessionIds,
  mockFetch,
  createMockScript,
  createSuccessResponse,
  createErrorResponse,
  setupTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/test-utils';

describe('대본 생성 및 관리 통합테스트', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe('대본 생성', () => {
    it('새로운 대본 생성 요청 성공', async () => {
      const mockScript = createMockScript({ status: 'pending' });
      const mockResponse = createSuccessResponse({
        scriptId: mockScript.id,
        message: '대본 생성이 시작되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          prompt: '재미있는 쇼츠 영상 대본을 작성해주세요',
          type: 'shortform',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.scriptId).toBeDefined();
    });

    it('프롬프트 없이 대본 생성 요청 시 실패', async () => {
      const mockResponse = createErrorResponse('프롬프트를 입력하세요', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          prompt: '',
          type: 'shortform',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });
  });

  describe('대본 목록 조회', () => {
    it('사용자의 대본 목록 조회 성공', async () => {
      const mockScripts = [
        createMockScript(),
        createMockScript({ title: '두 번째 대본' }),
      ];

      const mockResponse = createSuccessResponse({
        scripts: mockScripts,
        total: 2,
        hasMore: false,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/my-scripts?limit=20&offset=0', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.scripts).toBeDefined();
      expect(Array.isArray(data.scripts)).toBe(true);
      expect(data.total).toBe(2);
    });
  });

  describe('대본 상세 조회', () => {
    it('특정 대본 상세 조회 성공', async () => {
      const mockScript = createMockScript();
      const mockResponse = createSuccessResponse({ script: mockScript });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/my-scripts/${mockScript.id}`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.script).toBeDefined();
      expect(data.script.id).toBe(mockScript.id);
    });
  });

  describe('대본 수정', () => {
    it('대본 제목 수정 성공', async () => {
      const mockScript = createMockScript();
      const newTitle = '수정된 대본 제목';
      const mockResponse = createSuccessResponse({
        script: { ...mockScript, title: newTitle },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/my-scripts/${mockScript.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({ title: newTitle }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.script.title).toBe(newTitle);
    });
  });

  describe('대본 삭제', () => {
    it('대본 삭제 성공', async () => {
      const mockScript = createMockScript();
      const mockResponse = createSuccessResponse({ message: '대본이 삭제되었습니다' });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/my-scripts/${mockScript.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('대본 생성 취소', () => {
    it('진행 중인 대본 생성 취소 성공', async () => {
      const mockScript = createMockScript({ status: 'processing' });
      const mockResponse = createSuccessResponse({ message: '대본 생성이 취소되었습니다' });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/scripts/${mockScript.id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('대본 변환', () => {
    it('롱폼 대본을 쇼츠 형식으로 변환 요청 성공', async () => {
      const mockScript = createMockScript({ type: 'longform' });
      const mockResponse = createSuccessResponse({
        newScriptId: 'new-converted-script-id',
        message: '대본 변환이 시작되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/scripts/${mockScript.id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({ targetType: 'shortform' }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.newScriptId).toBeDefined();
    });
  });
});
