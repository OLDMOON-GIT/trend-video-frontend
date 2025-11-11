/**
 * fetch-utils.ts 단위 테스트
 *
 * API 응답을 안전하게 처리하는 유틸리티 함수들의 테스트
 */

import { safeJsonResponse, fetchJson } from '@/lib/fetch-utils';

describe('fetch-utils', () => {
  describe('safeJsonResponse', () => {
    it('정상 JSON 응답을 파싱해야 함', async () => {
      const mockData = { success: true, message: 'OK' };
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const result = await safeJsonResponse(mockResponse);

      expect(result).toEqual(mockData);
    });

    it('JSON 응답이지만 에러 상태일 때 에러를 던져야 함', async () => {
      const mockError = { error: 'Not Found' };
      const mockResponse = new Response(JSON.stringify(mockError), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });

      await expect(safeJsonResponse(mockResponse)).rejects.toThrow('Not Found');
    });

    it('JSON 응답에 message 필드가 있으면 그것을 에러로 사용해야 함', async () => {
      const mockError = { message: 'Bad Request' };
      const mockResponse = new Response(JSON.stringify(mockError), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });

      await expect(safeJsonResponse(mockResponse)).rejects.toThrow('Bad Request');
    });

    it('JSON 응답에 error와 message가 모두 없으면 상태 코드를 에러로 사용해야 함', async () => {
      const mockResponse = new Response(JSON.stringify({}), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });

      await expect(safeJsonResponse(mockResponse)).rejects.toThrow('API Error: 500');
    });

    it('HTML 응답이고 에러 상태일 때 에러를 던져야 함', async () => {
      const mockResponse = new Response('<html>404 Not Found</html>', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      });

      await expect(safeJsonResponse(mockResponse)).rejects.toThrow('API Error (404)');
    });

    it('HTML 응답이고 OK 상태일 때 에러를 던져야 함', async () => {
      const mockResponse = new Response('<html>OK</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });

      await expect(safeJsonResponse(mockResponse)).rejects.toThrow('Expected JSON response but got');
    });

    it('Content-Type이 없으면 에러를 던져야 함', async () => {
      const mockResponse = new Response('Plain text', {
        status: 200,
        headers: {},
      });

      await expect(safeJsonResponse(mockResponse)).rejects.toThrow('Expected JSON response but got');
    });

    it('Content-Type이 application/json을 포함하면 OK', async () => {
      const mockData = { success: true };
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });

      const result = await safeJsonResponse(mockResponse);

      expect(result).toEqual(mockData);
    });

    it('HTML 에러 응답은 200자로 잘라야 함', async () => {
      const longHtml = '<html>' + 'a'.repeat(300) + '</html>';
      const mockResponse = new Response(longHtml, {
        status: 500,
        headers: { 'content-type': 'text/html' },
      });

      try {
        await safeJsonResponse(mockResponse);
        fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.message).toContain('API Error (500)');
        expect(err.message.length).toBeLessThanOrEqual(250); // "API Error (500): " + 200자
      }
    });
  });

  describe('fetchJson', () => {
    beforeEach(() => {
      // fetch mock 초기화
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('fetch를 호출하고 JSON을 반환해야 함', async () => {
      const mockData = { id: 1, name: 'Test' };
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await fetchJson('/api/test');

      expect(global.fetch).toHaveBeenCalledWith('/api/test', undefined);
      expect(result).toEqual(mockData);
    });

    it('fetch 옵션을 전달해야 함', async () => {
      const mockData = { success: true };
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'value' }),
      };

      await fetchJson('/api/test', options);

      expect(global.fetch).toHaveBeenCalledWith('/api/test', options);
    });

    it('fetch 에러를 전파해야 함', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network Error'));

      await expect(fetchJson('/api/test')).rejects.toThrow('Network Error');
    });

    it('API 에러를 전파해야 함', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      );

      await expect(fetchJson('/api/test')).rejects.toThrow('Unauthorized');
    });
  });

  describe('Edge Cases', () => {
    it('빈 JSON 객체를 처리해야 함', async () => {
      const mockResponse = new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const result = await safeJsonResponse(mockResponse);

      expect(result).toEqual({});
    });

    it('JSON 배열을 처리해야 함', async () => {
      const mockData = [1, 2, 3];
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const result = await safeJsonResponse(mockResponse);

      expect(result).toEqual(mockData);
    });

    it('null을 처리해야 함', async () => {
      const mockResponse = new Response('null', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const result = await safeJsonResponse(mockResponse);

      expect(result).toBeNull();
    });

    it('Content-Type이 대소문자 섞여있어도 OK', async () => {
      const mockData = { ok: true };
      const mockResponse = new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'Application/JSON' },
      });

      const result = await safeJsonResponse(mockResponse);

      expect(result).toEqual(mockData);
    });

    it('빈 문자열 응답은 에러를 던져야 함', async () => {
      const mockResponse = new Response('', {
        status: 200,
        headers: {},
      });

      await expect(safeJsonResponse(mockResponse)).rejects.toThrow();
    });
  });

  describe('Type Safety', () => {
    it('제네릭 타입으로 응답을 받아야 함', async () => {
      interface User {
        id: number;
        name: string;
      }

      const mockUser: User = { id: 1, name: 'John' };
      const mockResponse = new Response(JSON.stringify(mockUser), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const result = await safeJsonResponse<User>(mockResponse);

      expect(result.id).toBe(1);
      expect(result.name).toBe('John');
    });

    it('fetchJson도 제네릭 타입을 지원해야 함', async () => {
      interface Product {
        id: number;
        title: string;
      }

      const mockProduct: Product = { id: 123, title: 'Test Product' };
      (global.fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(mockProduct), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const result = await fetchJson<Product>('/api/products/123');

      expect(result.id).toBe(123);
      expect(result.title).toBe('Test Product');
    });
  });
});
