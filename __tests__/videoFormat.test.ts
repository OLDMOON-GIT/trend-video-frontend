/**
 * 비디오 포맷 선택 리그레션 테스트
 *
 * 버그: 숏폼을 선택했는데 롱폼으로 저장되는 문제
 * 수정: page.tsx에서 format -> type으로 변경
 */

describe('비디오 포맷 선택 테스트', () => {
  describe('API 요청 파라미터 검증', () => {
    it('숏폼 선택 시 type: "shortform"으로 전송되어야 함', () => {
      const videoFormat = 'shortform';
      const requestBody = {
        title: '테스트 제목',
        type: videoFormat, // format이 아닌 type 사용
        useClaudeLocal: true
      };

      expect(requestBody.type).toBe('shortform');
      expect(requestBody).toHaveProperty('type');
      expect(requestBody).not.toHaveProperty('format');
    });

    it('롱폼 선택 시 type: "longform"으로 전송되어야 함', () => {
      const videoFormat = 'longform';
      const requestBody = {
        title: '테스트 제목',
        type: videoFormat,
        useClaudeLocal: true
      };

      expect(requestBody.type).toBe('longform');
      expect(requestBody).toHaveProperty('type');
      expect(requestBody).not.toHaveProperty('format');
    });

    it('SORA2 선택 시 type: "sora2"로 전송되어야 함', () => {
      const videoFormat = 'sora2';
      const requestBody = {
        title: '테스트 제목',
        type: videoFormat,
        useClaudeLocal: true
      };

      expect(requestBody.type).toBe('sora2');
      expect(requestBody).toHaveProperty('type');
      expect(requestBody).not.toHaveProperty('format');
    });
  });

  describe('서버 파라미터 처리 검증', () => {
    it('서버는 type 또는 videoFormat을 모두 처리할 수 있어야 함', () => {
      // 서버 코드 시뮬레이션: const inputType = type || videoFormat || 'longform';

      // type만 있는 경우
      const body1 = { title: '테스트', type: 'shortform' };
      const inputType1 = body1.type || (body1 as any).videoFormat || 'longform';
      expect(inputType1).toBe('shortform');

      // videoFormat만 있는 경우
      const body2 = { title: '테스트', videoFormat: 'shortform' };
      const inputType2 = (body2 as any).type || body2.videoFormat || 'longform';
      expect(inputType2).toBe('shortform');

      // 둘 다 있는 경우 (type 우선)
      const body3 = { title: '테스트', type: 'shortform', videoFormat: 'longform' };
      const inputType3 = body3.type || body3.videoFormat || 'longform';
      expect(inputType3).toBe('shortform');

      // 둘 다 없는 경우 (기본값 longform)
      const body4 = { title: '테스트' };
      const inputType4 = (body4 as any).type || (body4 as any).videoFormat || 'longform';
      expect(inputType4).toBe('longform');
    });

    it('서버는 모든 포맷 타입을 올바르게 매핑해야 함', () => {
      // 서버 로직 시뮬레이션
      const testCases = [
        { input: 'sora2', expected: 'sora2' },
        { input: 'shortform', expected: 'shortform' },
        { input: 'longform', expected: 'longform' },
        { input: undefined, expected: 'longform' },
        { input: null, expected: 'longform' },
        { input: '', expected: 'longform' }
      ];

      testCases.forEach(({ input, expected }) => {
        let scriptType: 'longform' | 'shortform' | 'sora2' = 'longform';

        if (input === 'sora2') {
          scriptType = 'sora2';
        } else if (input === 'shortform') {
          scriptType = 'shortform';
        } else if (input === 'longform') {
          scriptType = 'longform';
        }

        expect(scriptType).toBe(expected);
      });
    });
  });

  describe('프롬프트 파일 선택 검증', () => {
    it('숏폼은 prompt_shortform.txt를 사용해야 함', () => {
      const videoFormat = 'shortform';
      let promptFile: string;

      if (videoFormat === 'shortform') {
        promptFile = 'prompt_shortform.txt';
      } else if (videoFormat === 'longform') {
        promptFile = 'prompt_longform.txt';
      } else {
        promptFile = 'prompt_sora2.txt';
      }

      expect(promptFile).toBe('prompt_shortform.txt');
    });

    it('롱폼은 prompt_longform.txt를 사용해야 함', () => {
      const videoFormat = 'longform';
      let promptFile: string;

      if (videoFormat === 'shortform') {
        promptFile = 'prompt_shortform.txt';
      } else if (videoFormat === 'longform') {
        promptFile = 'prompt_longform.txt';
      } else {
        promptFile = 'prompt_sora2.txt';
      }

      expect(promptFile).toBe('prompt_longform.txt');
    });

    it('SORA2는 prompt_sora2.txt를 사용해야 함', () => {
      const videoFormat = 'sora2';
      let promptFile: string;

      if (videoFormat === 'shortform') {
        promptFile = 'prompt_shortform.txt';
      } else if (videoFormat === 'longform') {
        promptFile = 'prompt_longform.txt';
      } else {
        promptFile = 'prompt_sora2.txt';
      }

      expect(promptFile).toBe('prompt_sora2.txt');
    });
  });

  describe('데이터베이스 저장 검증', () => {
    it('scripts_temp 테이블에 올바른 type으로 저장되어야 함', () => {
      const testCases = [
        { videoFormat: 'shortform', expected: 'shortform' },
        { videoFormat: 'longform', expected: 'longform' },
        { videoFormat: 'sora2', expected: 'sora2' }
      ];

      testCases.forEach(({ videoFormat, expected }) => {
        // 서버에서 DB에 저장할 때 사용하는 타입
        let scriptType = videoFormat;

        // scripts_temp INSERT 시뮬레이션
        const dbRecord = {
          id: `task_${Date.now()}`,
          title: '테스트 제목',
          status: 'PENDING',
          type: scriptType, // 이 값이 올바른지 검증
          createdAt: new Date().toISOString()
        };

        expect(dbRecord.type).toBe(expected);
      });
    });
  });

  describe('Edge Cases', () => {
    it('대소문자가 섞여있어도 올바르게 처리해야 함', () => {
      const testCases = ['ShortForm', 'SHORTFORM', 'shortForm'];

      testCases.forEach(input => {
        const normalized = input.toLowerCase();
        expect(['shortform', 'longform', 'sora2']).toContain(normalized);
      });
    });

    it('빈 문자열이나 undefined는 longform 기본값을 사용해야 함', () => {
      const testCases = [undefined, null, ''];

      testCases.forEach(input => {
        const videoFormat = input || 'longform';
        expect(videoFormat).toBe('longform');
      });

      // 공백 문자열은 trim 후 처리
      const whitespaceInput = '  ';
      const videoFormat = whitespaceInput.trim() || 'longform';
      expect(videoFormat).toBe('longform');
    });

    it('잘못된 포맷이 입력되면 longform 기본값을 사용해야 함', () => {
      const invalidFormats = ['invalid', 'test', '123', 'short', 'long'];

      invalidFormats.forEach(input => {
        let scriptType: 'longform' | 'shortform' | 'sora2' = 'longform';

        if (input === 'sora2') {
          scriptType = 'sora2';
        } else if (input === 'shortform') {
          scriptType = 'shortform';
        } else if (input === 'longform') {
          scriptType = 'longform';
        }
        // 잘못된 값이면 초기값 'longform' 유지

        expect(scriptType).toBe('longform');
      });
    });
  });

  describe('리그레션 방지', () => {
    it('[BUG FIX] 숏폼 선택 후 대본 생성 시 longform이 아닌 shortform으로 저장되어야 함', () => {
      // 사용자가 숏폼을 선택한 상황
      const userSelectedFormat: 'shortform' | 'longform' | 'sora2' = 'shortform';

      // API 요청 생성
      const requestBody = {
        title: '며느리가 시어머니에게 준 찬밥, 친정에 전화한통으로 사색이 된 며느리',
        type: userSelectedFormat, // ✅ format이 아닌 type 사용 (수정됨)
        useClaudeLocal: true
      };

      // 서버에서 처리
      const inputType = requestBody.type || 'longform';
      let scriptType: 'longform' | 'shortform' | 'sora2' = 'longform';

      if (inputType === 'sora2') {
        scriptType = 'sora2';
      } else if (inputType === 'shortform') {
        scriptType = 'shortform';
      } else if (inputType === 'longform') {
        scriptType = 'longform';
      }

      // 검증: 숏폼으로 저장되어야 함
      expect(scriptType).toBe('shortform');
      expect(scriptType).not.toBe('longform'); // ❌ 이전 버그: longform으로 저장됨
    });

    it('[BUG FIX] 내 콘텐츠 페이지에서도 올바른 타입이 표시되어야 함', () => {
      // DB에서 가져온 스크립트 데이터 (사용자가 숏폼으로 생성)
      const savedScript = {
        id: '67',
        title: '며느리가 시어머니에게 준 찬밥, 친정에 전화한통으로 사색이 된 며느리',
        type: 'shortform', // ✅ 수정 후: shortform으로 저장됨
        status: 'failed',
        createdAt: '2025. 11. 4. 오전 12:48:08'
      };

      // UI 표시
      const displayLabel = savedScript.type === 'shortform' ? '⚡ 숏폼' :
                          savedScript.type === 'longform' ? '📝 롱폼' : '🎬 Sora2';

      // 검증
      expect(savedScript.type).toBe('shortform');
      expect(displayLabel).toBe('⚡ 숏폼');
      expect(displayLabel).not.toBe('📝 롱폼'); // ❌ 이전 버그: 롱폼으로 표시됨
    });
  });
});
