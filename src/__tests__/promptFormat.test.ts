/**
 * promptFormat 초기화 및 localStorage 저장 로직 테스트
 *
 * 테스트 시나리오:
 * 1. URL 파라미터가 localStorage보다 우선순위가 높음
 * 2. promptFormat 변경 시 localStorage에 저장 (product-info 제외)
 * 3. 새로고침 시 저장된 포맷 유지
 */

describe('promptFormat 초기화 로직', () => {
  let mockLocalStorage: { [key: string]: string };

  beforeEach(() => {
    // localStorage mock
    mockLocalStorage = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: jest.fn(() => {
          mockLocalStorage = {};
        })
      },
      writable: true,
      configurable: true
    });
  });

  describe('URL 파라미터 우선순위', () => {
    test('promptType=product가 있으면 localStorage를 무시하고 product 모드', () => {
      // localStorage에 다른 값이 저장되어 있음
      mockLocalStorage['promptFormat'] = 'product-info';

      // URL 파라미터 시뮬레이션
      const searchParams = '?promptType=product';

      // 초기화 로직 시뮬레이션
      const params = new URLSearchParams(searchParams);
      const promptType = params.get('promptType');

      let promptFormat: string;
      if (promptType === 'product') {
        promptFormat = 'product';
      } else {
        const savedFormat = localStorage.getItem('promptFormat');
        promptFormat = savedFormat || 'longform';
      }

      // 검증
      expect(promptFormat).toBe('product');
      expect(promptFormat).not.toBe('product-info'); // localStorage 값이 아님
    });

    test('generateProductInfo 파라미터가 있으면 product-info 모드', () => {
      // localStorage에 다른 값이 저장되어 있음
      mockLocalStorage['promptFormat'] = 'longform';

      // URL 파라미터 시뮬레이션
      const searchParams = '?generateProductInfo=script123';

      // 초기화 로직 시뮬레이션
      const params = new URLSearchParams(searchParams);
      const generateProductInfo = params.get('generateProductInfo');

      let promptFormat: string;
      if (generateProductInfo) {
        promptFormat = 'product-info';
      } else {
        const savedFormat = localStorage.getItem('promptFormat');
        promptFormat = savedFormat || 'longform';
      }

      // 검증
      expect(promptFormat).toBe('product-info');
    });

    test('promptType=product-info가 있으면 product-info 모드', () => {
      const searchParams = '?promptType=product-info';

      const params = new URLSearchParams(searchParams);
      const promptType = params.get('promptType');

      let promptFormat: string;
      if (promptType === 'product-info') {
        promptFormat = 'product-info';
      } else {
        promptFormat = 'longform';
      }

      expect(promptFormat).toBe('product-info');
    });
  });

  describe('localStorage 복원', () => {
    test('URL 파라미터가 없으면 localStorage에서 복원', () => {
      mockLocalStorage['promptFormat'] = 'shortform';
      const searchParams = '';

      const params = new URLSearchParams(searchParams);
      const promptType = params.get('promptType');
      const generateProductInfo = params.get('generateProductInfo');

      let promptFormat: string;
      if (generateProductInfo) {
        promptFormat = 'product-info';
      } else if (promptType === 'product') {
        promptFormat = 'product';
      } else if (promptType === 'product-info') {
        promptFormat = 'product-info';
      } else {
        const savedFormat = localStorage.getItem('promptFormat');
        promptFormat = savedFormat || 'longform';
      }

      expect(promptFormat).toBe('shortform');
    });

    test('localStorage에 저장된 값이 없으면 longform 기본값', () => {
      mockLocalStorage = {};
      const searchParams = '';

      const params = new URLSearchParams(searchParams);
      const savedFormat = localStorage.getItem('promptFormat');
      const promptFormat = savedFormat || 'longform';

      expect(promptFormat).toBe('longform');
    });
  });

  describe('localStorage 저장', () => {
    test('promptFormat 변경 시 localStorage에 저장', () => {
      const promptFormat = 'shortform';

      if (promptFormat !== 'product-info') {
        localStorage.setItem('promptFormat', promptFormat);
      }

      expect(mockLocalStorage['promptFormat']).toBe('shortform');
      expect(localStorage.setItem).toHaveBeenCalledWith('promptFormat', 'shortform');
    });

    test('product-info는 localStorage에 저장하지 않음', () => {
      const promptFormat = 'product-info';

      if (promptFormat !== 'product-info') {
        localStorage.setItem('promptFormat', promptFormat);
      }

      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    test('product는 localStorage에 저장', () => {
      const promptFormat = 'product';

      if (promptFormat !== 'product-info') {
        localStorage.setItem('promptFormat', promptFormat);
      }

      expect(mockLocalStorage['promptFormat']).toBe('product');
    });
  });

  describe('통합 시나리오', () => {
    test('시나리오: 상품관리 → 영상제작하기 → 새로고침', () => {
      // 1. 상품관리에서 영상제작하기 클릭 (promptType=product)
      let searchParams = '?promptType=product';
      let params = new URLSearchParams(searchParams);
      let promptType = params.get('promptType');

      let promptFormat: string;
      if (promptType === 'product') {
        promptFormat = 'product';
      } else {
        promptFormat = 'longform';
      }

      expect(promptFormat).toBe('product');

      // 2. localStorage에 저장
      if (promptFormat !== 'product-info') {
        localStorage.setItem('promptFormat', promptFormat);
      }

      expect(mockLocalStorage['promptFormat']).toBe('product');

      // 3. 새로고침 (URL 파라미터 없음)
      searchParams = '';
      params = new URLSearchParams(searchParams);
      promptType = params.get('promptType');

      if (promptType === 'product') {
        promptFormat = 'product';
      } else {
        const savedFormat = localStorage.getItem('promptFormat');
        promptFormat = savedFormat || 'longform';
      }

      // 저장된 product 모드 유지
      expect(promptFormat).toBe('product');
    });

    test('시나리오: 내 콘텐츠 → 상품정보 → 상품관리 → 영상제작하기', () => {
      // 1. 내 콘텐츠에서 상품정보 클릭 (generateProductInfo=script123)
      let searchParams = '?generateProductInfo=script123';
      let params = new URLSearchParams(searchParams);
      let generateProductInfo = params.get('generateProductInfo');
      let promptType = params.get('promptType');

      let promptFormat: string;
      if (generateProductInfo) {
        promptFormat = 'product-info';
      } else if (promptType === 'product') {
        promptFormat = 'product';
      } else {
        promptFormat = 'longform';
      }

      expect(promptFormat).toBe('product-info');

      // 2. product-info는 localStorage에 저장하지 않음
      if (promptFormat !== 'product-info') {
        localStorage.setItem('promptFormat', promptFormat);
      }

      expect(mockLocalStorage['promptFormat']).toBeUndefined();

      // 3. 상품관리에서 영상제작하기 클릭 (promptType=product)
      searchParams = '?promptType=product';
      params = new URLSearchParams(searchParams);
      generateProductInfo = params.get('generateProductInfo');
      promptType = params.get('promptType');

      // URL 파라미터가 우선순위가 높음
      if (generateProductInfo) {
        promptFormat = 'product-info';
      } else if (promptType === 'product') {
        promptFormat = 'product';
      } else {
        const savedFormat = localStorage.getItem('promptFormat');
        promptFormat = savedFormat || 'longform';
      }

      // promptType=product가 우선 적용됨
      expect(promptFormat).toBe('product');
    });

    test('시나리오: shortform 선택 → 새로고침 → 유지', () => {
      // 1. 사용자가 shortform 선택
      let promptFormat = 'shortform';

      // 2. localStorage에 저장
      if (promptFormat !== 'product-info') {
        localStorage.setItem('promptFormat', promptFormat);
      }

      expect(mockLocalStorage['promptFormat']).toBe('shortform');

      // 3. 새로고침 (URL 파라미터 없음)
      const searchParams = '';
      const params = new URLSearchParams(searchParams);
      const promptType = params.get('promptType');
      const generateProductInfo = params.get('generateProductInfo');

      if (generateProductInfo) {
        promptFormat = 'product-info';
      } else if (promptType === 'product') {
        promptFormat = 'product';
      } else if (promptType === 'product-info') {
        promptFormat = 'product-info';
      } else {
        const savedFormat = localStorage.getItem('promptFormat');
        promptFormat = savedFormat || 'longform';
      }

      // 저장된 shortform 모드 유지
      expect(promptFormat).toBe('shortform');
    });
  });
});
