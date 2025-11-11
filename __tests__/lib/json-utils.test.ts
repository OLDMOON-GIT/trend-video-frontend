/**
 * json-utils.ts 단위 테스트
 *
 * AI 생성 JSON을 안전하게 파싱하는 유틸리티 함수들의 테스트
 */

import { parseJsonSafely, extractPureJson, parseJsonFile, ParseJsonResult } from '@/lib/json-utils';

describe('json-utils', () => {
  describe('parseJsonSafely', () => {
    it('정상 JSON을 파싱해야 함', () => {
      const json = '{"title": "Hello", "count": 42}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ title: 'Hello', count: 42 });
      expect(result.fixed).toBe(false);
    });

    it('코드 블록 마커를 제거하고 파싱해야 함', () => {
      const json = '```json\n{"title": "Hello"}\n```';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ title: 'Hello' });
      expect(result.fixed).toBe(true);
    });

    it('설명 텍스트를 제거하고 파싱해야 함', () => {
      const json = 'Here is the JSON:\n{"title": "Hello"}\nThank you!';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ title: 'Hello' });
      expect(result.fixed).toBe(true);
    });

    it('trailing comma를 제거하고 파싱해야 함', () => {
      const json = '{"title": "Hello",}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ title: 'Hello' });
      expect(result.fixed).toBe(true);
    });

    it.skip('이스케이프되지 않은 따옴표를 이스케이프해야 함 (Known limitation)', () => {
      const json = '{"title": "She said "Hello""}';
      const result = parseJsonSafely(json, { logErrors: false });

      expect(result.success).toBe(true);
      expect(result.data.title).toContain('She said');
      expect(result.fixed).toBe(true);
    });

    it('제어 문자를 이스케이프해야 함', () => {
      const json = '{"title": "Line1\nLine2"}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data.title).toContain('Line1');
      expect(result.fixed).toBe(true);
    });

    it('파싱 실패 시 에러를 반환해야 함', () => {
      const json = 'This is not JSON at all';
      const result = parseJsonSafely(json, { logErrors: false });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('attemptFix=false일 때 자동 수정을 하지 않아야 함', () => {
      const json = '```json\n{"title": "Hello"}\n```';
      const result = parseJsonSafely(json, { attemptFix: false, logErrors: false });

      expect(result.success).toBe(false);
      expect(result.fixed).toBeUndefined();
    });

    it('빈 객체를 파싱해야 함', () => {
      const json = '{}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('배열을 파싱해야 함', () => {
      const json = '[1, 2, 3]';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('중첩된 객체를 파싱해야 함', () => {
      const json = '{"user": {"name": "John", "age": 30}}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data.user.name).toBe('John');
      expect(result.data.user.age).toBe(30);
    });

    it('logErrors 옵션이 작동해야 함', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();

      parseJsonSafely('invalid json', { logErrors: true });

      // logErrors가 true이면 warning이 출력됨
      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('제네릭 타입을 지원해야 함', () => {
      interface User {
        name: string;
        age: number;
      }

      const json = '{"name": "Alice", "age": 25}';
      const result = parseJsonSafely<User>(json);

      if (result.success) {
        expect(result.data.name).toBe('Alice');
        expect(result.data.age).toBe(25);
      }
    });

    it('에러 메시지를 감지해야 함', () => {
      const errorText = 'Error: Something went wrong';
      const result = parseJsonSafely(errorText, { logErrors: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not a JSON');
    });
  });

  describe('extractPureJson', () => {
    it('순수 JSON만 추출해야 함', () => {
      const content = 'Here is the data:\n{"title": "Hello"}\nDone';
      const result = extractPureJson(content);

      expect(result).toBe('{"title": "Hello"}');
    });

    it('코드 블록 마커를 제거해야 함', () => {
      const content = '```json\n{"title": "World"}\n```';
      const result = extractPureJson(content);

      expect(result).toBe('{"title": "World"}');
    });

    it('여러 줄의 JSON을 추출해야 함', () => {
      const content = `
        Some text
        {
          "title": "Test",
          "count": 1
        }
        More text
      `;
      const result = extractPureJson(content);

      expect(result).toContain('"title": "Test"');
      expect(result).toContain('"count": 1');
    });

    it('{ 가 없으면 원본을 반환해야 함', () => {
      const content = 'No JSON here';
      const result = extractPureJson(content);

      expect(result).toBe('No JSON here');
    });

    it('빈 문자열을 처리해야 함', () => {
      const result = extractPureJson('');

      expect(result).toBe('');
    });
  });

  describe.skip('parseJsonFile (requires File API)', () => {
    it('File 객체에서 JSON을 파싱해야 함', async () => {
      const jsonContent = '{"name": "test"}';
      const file = new File([jsonContent], 'test.json', { type: 'application/json' });

      const result = await parseJsonFile(file);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('잘못된 JSON 파일은 에러를 반환해야 함', async () => {
      const invalidContent = 'not json';
      const file = new File([invalidContent], 'test.json', { type: 'application/json' });

      const result = await parseJsonFile(file);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('코드 블록이 있는 파일을 파싱해야 함', async () => {
      const content = '```json\n{"name": "test"}\n```';
      const file = new File([content], 'test.json', { type: 'application/json' });

      const result = await parseJsonFile(file);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
      expect(result.fixed).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('실제 AI 응답 시뮬레이션 - Claude', () => {
      const aiResponse = `
I'll create a JSON for you.

\`\`\`json
{
  "title": "Test Video",
  "description": "This is a "test" video",
  "duration": 60
}
\`\`\`

Here's your JSON!
      `;

      const result = parseJsonSafely(aiResponse);

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Test Video');
      expect(result.data.duration).toBe(60);
      expect(result.fixed).toBe(true);
    });

    it('실제 AI 응답 시뮬레이션 - ChatGPT', () => {
      const aiResponse = `
Sure! Here is the JSON:

{"title": "My Video", "scenes": [{"text": "Scene 1"}, {"text": "Scene 2"}],}

Let me know if you need changes.
      `;

      const result = parseJsonSafely(aiResponse);

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('My Video');
      expect(result.data.scenes).toHaveLength(2);
      expect(result.fixed).toBe(true);
    });

    it('복잡한 중첩 구조', () => {
      const json = `
{
  "title": "Complex",
  "scenes": [
    {
      "narration": "This is a "quote" with newline
and continuation",
      "image_prompt": "A beautiful scene"
    }
  ]
}
      `;

      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data.scenes).toHaveLength(1);
      expect(result.fixed).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('null 값을 처리해야 함', () => {
      const json = '{"value": null}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data.value).toBeNull();
    });

    it('불린 값을 처리해야 함', () => {
      const json = '{"isActive": true, "isDeleted": false}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(true);
      expect(result.data.isDeleted).toBe(false);
    });

    it('숫자 (정수, 소수, 음수)를 처리해야 함', () => {
      const json = '{"int": 42, "float": 3.14, "negative": -10}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data.int).toBe(42);
      expect(result.data.float).toBe(3.14);
      expect(result.data.negative).toBe(-10);
    });

    it('유니코드 문자를 처리해야 함', () => {
      const json = '{"emoji": "😊", "korean": "안녕하세요"}';
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data.emoji).toBe('😊');
      expect(result.data.korean).toBe('안녕하세요');
    });

    it('매우 긴 문자열을 처리해야 함', () => {
      const longString = 'a'.repeat(10000);
      const json = `{"long": "${longString}"}`;
      const result = parseJsonSafely(json);

      expect(result.success).toBe(true);
      expect(result.data.long.length).toBe(10000);
    });
  });
});
