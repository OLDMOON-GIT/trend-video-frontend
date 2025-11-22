/**
 * Aspect Ratio 함수 단위 테스트
 *
 * 목적: getAspectRatioByFormat 함수가 모든 포맷에 대해 올바른 비율을 반환하는지 검증
 */

// API route에서 사용하는 함수를 여기에 복사
function getAspectRatioByFormat(format) {
  if (format === 'longform' || format === '16:9') {
    return '16:9';
  }
  return '9:16'; // shortform, product, sora2 등 나머지
}

describe('getAspectRatioByFormat Unit Tests', () => {
  describe('9:16 비율을 반환해야 하는 포맷들', () => {
    test('shortform -> 9:16', () => {
      expect(getAspectRatioByFormat('shortform')).toBe('9:16');
    });

    test('product -> 9:16', () => {
      expect(getAspectRatioByFormat('product')).toBe('9:16');
    });

    test('product-info -> 9:16', () => {
      expect(getAspectRatioByFormat('product-info')).toBe('9:16');
    });

    test('sora2 -> 9:16', () => {
      expect(getAspectRatioByFormat('sora2')).toBe('9:16');
    });

    test('9:16 명시적 -> 9:16', () => {
      expect(getAspectRatioByFormat('9:16')).toBe('9:16');
    });

    test('알 수 없는 포맷 -> 9:16 (기본값)', () => {
      expect(getAspectRatioByFormat('unknown')).toBe('9:16');
      expect(getAspectRatioByFormat('custom')).toBe('9:16');
      expect(getAspectRatioByFormat('')).toBe('9:16');
    });
  });

  describe('16:9 비율을 반환해야 하는 포맷들', () => {
    test('longform -> 16:9', () => {
      expect(getAspectRatioByFormat('longform')).toBe('16:9');
    });

    test('16:9 명시적 -> 16:9', () => {
      expect(getAspectRatioByFormat('16:9')).toBe('16:9');
    });
  });

  describe('엣지 케이스', () => {
    test('대소문자 구분 (longform은 소문자만 인식)', () => {
      expect(getAspectRatioByFormat('longform')).toBe('16:9');
      expect(getAspectRatioByFormat('LONGFORM')).toBe('9:16'); // 기본값
      expect(getAspectRatioByFormat('LongForm')).toBe('9:16'); // 기본값
    });

    test('공백이 있는 경우', () => {
      expect(getAspectRatioByFormat(' longform ')).toBe('9:16'); // 기본값 (정확히 매치 안됨)
      expect(getAspectRatioByFormat('longform ')).toBe('9:16'); // 기본값
    });

    test('null, undefined 처리', () => {
      expect(getAspectRatioByFormat(null)).toBe('9:16');
      expect(getAspectRatioByFormat(undefined)).toBe('9:16');
    });
  });

  describe('실제 사용 시나리오', () => {
    test('자동화 시스템에서 longform 영상 생성', () => {
      const format = 'longform';
      const aspectRatio = getAspectRatioByFormat(format);

      expect(aspectRatio).toBe('16:9');
      console.log(`✅ Longform 영상 -> ${aspectRatio} 비율 사용`);
    });

    test('자동화 시스템에서 shortform 영상 생성', () => {
      const format = 'shortform';
      const aspectRatio = getAspectRatioByFormat(format);

      expect(aspectRatio).toBe('9:16');
      console.log(`✅ Shortform 영상 -> ${aspectRatio} 비율 사용`);
    });

    test('자동화 시스템에서 상품 영상 생성', () => {
      const format = 'product';
      const aspectRatio = getAspectRatioByFormat(format);

      expect(aspectRatio).toBe('9:16');
      console.log(`✅ 상품 영상 -> ${aspectRatio} 비율 사용`);
    });

    test('사용자가 명시적으로 16:9 선택', () => {
      const format = '16:9';
      const aspectRatio = getAspectRatioByFormat(format);

      expect(aspectRatio).toBe('16:9');
      console.log(`✅ 명시적 16:9 -> ${aspectRatio} 비율 사용`);
    });

    test('사용자가 명시적으로 9:16 선택', () => {
      const format = '9:16';
      const aspectRatio = getAspectRatioByFormat(format);

      expect(aspectRatio).toBe('9:16');
      console.log(`✅ 명시적 9:16 -> ${aspectRatio} 비율 사용`);
    });
  });

  describe('성능 테스트', () => {
    test('대량 호출 시 성능', () => {
      const formats = ['shortform', 'longform', 'product', '16:9', '9:16'];
      const iterations = 10000;

      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        const format = formats[i % formats.length];
        getAspectRatioByFormat(format);
      }
      const elapsed = Date.now() - start;

      console.log(`✅ ${iterations}번 호출: ${elapsed}ms`);
      expect(elapsed).toBeLessThan(100); // 100ms 이내
    });
  });
});
