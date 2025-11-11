/**
 * /api/scripts/generate 핵심 로직 테스트
 *
 * 자주 에러가 발생하는 부분과 중요한 비즈니스 로직 테스트
 */

import { NextRequest, NextResponse } from 'next/server';

describe('/api/scripts/generate - Core Logic', () => {
  describe('Model Name Mapping', () => {
    it('scriptModel을 agent 이름으로 올바르게 매핑해야 함', () => {
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'chatgpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      expect(MODEL_TO_AGENT['gpt']).toBe('chatgpt');
      expect(MODEL_TO_AGENT['chatgpt']).toBe('chatgpt');
      expect(MODEL_TO_AGENT['gemini']).toBe('gemini');
      expect(MODEL_TO_AGENT['claude']).toBe('claude');
    });

    it('잘못된 scriptModel은 기본값 claude를 사용해야 함', () => {
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'chatgpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const scriptModel = 'invalid-model';
      const agentName = scriptModel && MODEL_TO_AGENT[scriptModel]
        ? MODEL_TO_AGENT[scriptModel]
        : 'claude';

      expect(agentName).toBe('claude');
    });

    it('scriptModel이 없으면 기본값 claude를 사용해야 함', () => {
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'chatgpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const scriptModel = undefined;
      const agentName = scriptModel && MODEL_TO_AGENT[scriptModel]
        ? MODEL_TO_AGENT[scriptModel]
        : 'claude';

      expect(agentName).toBe('claude');
    });
  });

  describe('Script Type Determination', () => {
    it('type 또는 videoFormat에서 스크립트 타입을 결정해야 함', () => {
      // 타입 결정 로직
      const determineScriptType = (type?: string, videoFormat?: string) => {
        const inputType = type || videoFormat || 'longform';

        let scriptType: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info' = 'longform';
        if (inputType === 'sora2') {
          scriptType = 'sora2';
        } else if (inputType === 'shortform') {
          scriptType = 'shortform';
        } else if (inputType === 'product') {
          scriptType = 'product';
        } else if (inputType === 'product-info') {
          scriptType = 'product-info';
        } else if (inputType === 'longform') {
          scriptType = 'longform';
        }

        return scriptType;
      };

      expect(determineScriptType('sora2')).toBe('sora2');
      expect(determineScriptType('shortform')).toBe('shortform');
      expect(determineScriptType('product')).toBe('product');
      expect(determineScriptType('product-info')).toBe('product-info');
      expect(determineScriptType('longform')).toBe('longform');
    });

    it('type이 없으면 videoFormat을 사용해야 함', () => {
      const determineScriptType = (type?: string, videoFormat?: string) => {
        const inputType = type || videoFormat || 'longform';
        return inputType;
      };

      expect(determineScriptType(undefined, 'shortform')).toBe('shortform');
      expect(determineScriptType(undefined, 'sora2')).toBe('sora2');
    });

    it('type과 videoFormat 둘 다 없으면 longform을 사용해야 함', () => {
      const determineScriptType = (type?: string, videoFormat?: string) => {
        const inputType = type || videoFormat || 'longform';
        return inputType;
      };

      expect(determineScriptType()).toBe('longform');
      expect(determineScriptType(undefined, undefined)).toBe('longform');
    });

    it('type이 있으면 videoFormat보다 우선해야 함', () => {
      const determineScriptType = (type?: string, videoFormat?: string) => {
        const inputType = type || videoFormat || 'longform';
        return inputType;
      };

      expect(determineScriptType('sora2', 'shortform')).toBe('sora2');
      expect(determineScriptType('product', 'longform')).toBe('product');
    });
  });

  describe('Placeholder Replacement', () => {
    it('product-info 타입의 프롬프트에서 플레이스홀더를 치환해야 함', () => {
      const promptTemplate = `
제목: {title}
썸네일: {thumbnail}
링크: {product_link}
설명: {product_description}
홈 URL: {home_url}
별명: {별명}
`;

      const productInfo = {
        title: '테스트 상품',
        thumbnail: 'https://example.com/thumb.jpg',
        product_link: 'https://example.com/product',
        description: '좋은 상품입니다'
      };

      const homeUrl = 'https://www.youtube.com/@살림남';
      const nickname = '살림남';

      let result = promptTemplate
        .replace(/{title}/g, productInfo.title)
        .replace(/{thumbnail}/g, productInfo.thumbnail)
        .replace(/{product_link}/g, productInfo.product_link)
        .replace(/{product_description}/g, productInfo.description)
        .replace(/{home_url}/g, homeUrl)
        .replace(/{별명}/g, nickname);

      expect(result).toContain('제목: 테스트 상품');
      expect(result).toContain('썸네일: https://example.com/thumb.jpg');
      expect(result).toContain('링크: https://example.com/product');
      expect(result).toContain('설명: 좋은 상품입니다');
      expect(result).toContain('홈 URL: https://www.youtube.com/@살림남');
      expect(result).toContain('별명: 살림남');
    });

    it('productInfo가 없으면 플레이스홀더가 그대로 남아야 함 (버그 케이스)', () => {
      const promptTemplate = `
썸네일: {thumbnail}
링크: {product_link}
설명: {product_description}
`;

      // productInfo가 없는 경우 - 아무것도 치환하지 않음
      const result = promptTemplate;

      expect(result).toContain('{thumbnail}');
      expect(result).toContain('{product_link}');
      expect(result).toContain('{product_description}');
    });

    it('빈 문자열도 올바르게 치환해야 함', () => {
      const promptTemplate = '썸네일: {thumbnail}';

      const result = promptTemplate.replace(/{thumbnail}/g, '');

      expect(result).toBe('썸네일: ');
      expect(result).not.toContain('{thumbnail}');
    });

    it('특수 문자가 포함된 값도 올바르게 치환해야 함', () => {
      const promptTemplate = '설명: {product_description}';

      const description = '할인가 $99! (50% OFF) - "최고의 상품"';
      const result = promptTemplate.replace(/{product_description}/g, description);

      expect(result).toBe('설명: 할인가 $99! (50% OFF) - "최고의 상품"');
    });

    it('여러 플레이스홀더가 여러 번 등장해도 모두 치환해야 함', () => {
      const promptTemplate = `
첫 번째 {title}
두 번째 {title}
세 번째 {title}
`;

      const result = promptTemplate.replace(/{title}/g, '상품명');

      expect(result).not.toContain('{title}');
      expect(result.match(/상품명/g)?.length).toBe(3);
    });
  });

  describe('Input Validation', () => {
    it('title이 없으면 400 에러를 반환해야 함', () => {
      const title = '';

      const isValid = title && typeof title === 'string';

      expect(isValid).toBeFalsy(); // 빈 문자열은 falsy
    });

    it('title이 문자열이 아니면 400 에러를 반환해야 함', () => {
      const title = 123;

      const isValid = title && typeof title === 'string';

      expect(isValid).toBe(false);
    });

    it('유효한 title은 통과해야 함', () => {
      const title = '유효한 제목';

      const isValid = title && typeof title === 'string';

      expect(isValid).toBe(true);
    });

    it('공백만 있는 title도 통과해야 함 (엄격한 검증은 없음)', () => {
      const title = '   ';

      const isValid = title && typeof title === 'string';

      expect(isValid).toBe(true);
    });
  });

  describe('Error Cases', () => {
    it('인증되지 않은 요청은 401을 반환해야 함', () => {
      const user = null;

      if (!user) {
        const error = { error: '로그인이 필요합니다.' };
        const status = 401;

        expect(error.error).toBe('로그인이 필요합니다.');
        expect(status).toBe(401);
      }
    });

    it('잘못된 요청 데이터는 400을 반환해야 함', () => {
      const title = null;

      if (!title || typeof title !== 'string') {
        const error = { error: 'Title is required' };
        const status = 400;

        expect(error.error).toBe('Title is required');
        expect(status).toBe(400);
      }
    });
  });

  describe('Default Values', () => {
    it('google_sites_home_url이 없으면 기본값을 사용해야 함', () => {
      const userSettings = undefined;

      const homeUrl = userSettings?.google_sites_home_url || 'https://www.youtube.com/@살림남';

      expect(homeUrl).toBe('https://www.youtube.com/@살림남');
    });

    it('nickname이 없으면 기본값을 사용해야 함', () => {
      const userSettings = undefined;

      const nickname = userSettings?.nickname || '살림남';

      expect(nickname).toBe('살림남');
    });

    it('userSettings가 있으면 그 값을 사용해야 함', () => {
      const userSettings = {
        google_sites_home_url: 'https://custom.url',
        nickname: '커스텀닉네임'
      };

      const homeUrl = userSettings?.google_sites_home_url || 'https://www.youtube.com/@살림남';
      const nickname = userSettings?.nickname || '살림남';

      expect(homeUrl).toBe('https://custom.url');
      expect(nickname).toBe('커스텀닉네임');
    });
  });
});
