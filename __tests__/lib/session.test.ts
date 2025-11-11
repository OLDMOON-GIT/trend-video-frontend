/**
 * session.ts 단위 테스트
 *
 * 세션 관리 유틸리티 함수들의 테스트
 * 파일 시스템이 필요한 함수는 스킵하고, 순수 로직만 테스트
 */

import { NextRequest } from 'next/server';
import { getSessionIdFromRequest } from '@/lib/session';

// NextRequest를 모킹하는 헬퍼 함수
function createMockRequest(headers: Record<string, string> = {}, cookies: Record<string, string> = {}): NextRequest {
  const mockHeaders = new Map(Object.entries(headers));
  const mockCookies = new Map(Object.entries(cookies));

  return {
    headers: {
      get: (name: string) => mockHeaders.get(name.toLowerCase()) || null
    },
    cookies: {
      get: (name: string) => {
        const value = mockCookies.get(name);
        return value ? { name, value } : undefined;
      }
    }
  } as any as NextRequest;
}

describe('session', () => {
  describe('getSessionIdFromRequest', () => {
    it('Authorization Bearer 토큰에서 세션 ID를 추출해야 함', () => {
      const request = createMockRequest({
        'authorization': 'Bearer test-session-id-123'
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe('test-session-id-123');
    });

    it('쿠키에서 세션 ID를 추출해야 함', () => {
      const request = createMockRequest({}, {
        'sessionId': 'cookie-session-id-456'
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe('cookie-session-id-456');
    });

    it('Authorization 헤더가 우선순위를 가져야 함', () => {
      const request = createMockRequest({
        'authorization': 'Bearer bearer-session-id'
      }, {
        'sessionId': 'cookie-session-id'
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe('bearer-session-id');
    });

    it('Bearer가 아닌 Authorization 헤더는 무시하고 쿠키를 사용해야 함', () => {
      const request = createMockRequest({
        'authorization': 'Basic base64-encoded'
      }, {
        'sessionId': 'cookie-session-id'
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe('cookie-session-id');
    });

    it('세션 ID가 없으면 null을 반환해야 함', () => {
      const request = createMockRequest();

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBeNull();
    });

    it('Authorization 헤더가 "Bearer "만 있으면 빈 문자열을 반환해야 함', () => {
      const request = createMockRequest({
        'authorization': 'Bearer '
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe('');
    });

    it('여러 쿠키 중 sessionId 쿠키를 찾아야 함', () => {
      const request = createMockRequest({}, {
        'other': 'value',
        'sessionId': 'my-session',
        'another': 'data'
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe('my-session');
    });
  });

  describe('Edge Cases', () => {
    it('Authorization 헤더에 공백이 여러 개 있어도 처리해야 함', () => {
      const request = createMockRequest({
        'authorization': 'Bearer    session-with-spaces'
      });

      const sessionId = getSessionIdFromRequest(request);

      // "Bearer " 이후의 모든 문자열을 가져오므로 공백 포함
      expect(sessionId).toBe('   session-with-spaces');
    });

    it('특수 문자가 포함된 세션 ID를 처리해야 함', () => {
      const specialSessionId = 'session-123!@#$%^&*()';
      const request = createMockRequest({
        'authorization': `Bearer ${specialSessionId}`
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe(specialSessionId);
    });

    it('매우 긴 세션 ID를 처리해야 함', () => {
      const longSessionId = 'a'.repeat(1000);
      const request = createMockRequest({
        'authorization': `Bearer ${longSessionId}`
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe(longSessionId);
      expect(sessionId?.length).toBe(1000);
    });

    it('대소문자 구분이 있는 Authorization 헤더를 처리해야 함', () => {
      const request = createMockRequest({
        'authorization': 'bearer lowercase-bearer'
      });

      const sessionId = getSessionIdFromRequest(request);

      // 'Bearer '로 시작하지 않으므로 쿠키 확인 (없음 = null)
      expect(sessionId).toBeNull();
    });

    it('UUID 형식의 세션 ID를 처리해야 함', () => {
      const uuidSession = '123e4567-e89b-12d3-a456-426614174000';
      const request = createMockRequest({
        'authorization': `Bearer ${uuidSession}`
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe(uuidSession);
    });

    it('빈 Authorization 헤더는 쿠키로 폴백해야 함', () => {
      const request = createMockRequest({
        'authorization': ''
      }, {
        'sessionId': 'cookie-fallback-session'
      });

      const sessionId = getSessionIdFromRequest(request);

      expect(sessionId).toBe('cookie-fallback-session');
    });
  });
});
