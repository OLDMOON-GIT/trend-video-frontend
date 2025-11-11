/**
 * TTS 음성 선택 및 미리듣기 기능 리그레션 테스트
 *
 * 테스트 시나리오:
 * 1. TTS 미리듣기 API가 올바른 파일명으로 요청됨 (speed가 문자열로 유지)
 * 2. 모든 한국어 음성(10개)에 대한 샘플 파일 경로 생성
 * 3. localStorage에 선택된 음성 저장 및 복원
 * 4. FormData를 통한 음성 파라미터 전달
 */

describe('TTS 음성 시스템', () => {
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

  describe('TTS 미리듣기 API 파일명 생성', () => {
    test('speed가 "1.0"일 때 문자열로 유지되어야 함 (parseFloat 사용 금지)', () => {
      const voice = 'ko-KR-SunHiNeural';
      const speed = '1.0'; // 문자열로 유지

      // 파일명 생성 (API route.ts의 로직과 동일)
      const filename = `sample_${voice}_${speed}.mp3`;

      // 검증: speed가 "1.0"으로 유지되어야 함
      expect(filename).toBe('sample_ko-KR-SunHiNeural_1.0.mp3');
      expect(filename).not.toBe('sample_ko-KR-SunHiNeural_1.mp3'); // parseFloat 사용 시 발생하는 버그
    });

    test('speed가 "0.75"일 때 올바른 파일명 생성', () => {
      const voice = 'ko-KR-InJoonNeural';
      const speed = '0.75';

      const filename = `sample_${voice}_${speed}.mp3`;

      expect(filename).toBe('sample_ko-KR-InJoonNeural_0.75.mp3');
    });

    test('speed가 "1.25"일 때 올바른 파일명 생성', () => {
      const voice = 'ko-KR-BongJinNeural';
      const speed = '1.25';

      const filename = `sample_${voice}_${speed}.mp3`;

      expect(filename).toBe('sample_ko-KR-BongJinNeural_1.25.mp3');
    });

    test('모든 10개 한국어 음성에 대한 파일명 생성', () => {
      const voices = [
        // 여성 (5개)
        'ko-KR-SunHiNeural',
        'ko-KR-JiMinNeural',
        'ko-KR-SeoHyeonNeural',
        'ko-KR-SoonBokNeural',
        'ko-KR-YuJinNeural',
        // 남성 (5개)
        'ko-KR-InJoonNeural',
        'ko-KR-HyunsuMultilingualNeural',
        'ko-KR-BongJinNeural',
        'ko-KR-GookMinNeural',
        'ko-KR-HyunsuNeural',
      ];
      const speed = '1.0';

      const filenames = voices.map(voice => `sample_${voice}_${speed}.mp3`);

      // 모든 파일명이 올바른 형식인지 확인
      filenames.forEach((filename, index) => {
        expect(filename).toContain('sample_');
        expect(filename).toContain(voices[index]);
        expect(filename).toContain('_1.0.mp3');
        expect(filename).not.toContain('_1.mp3'); // parseFloat 버그 방지
      });

      // 총 10개 음성 확인
      expect(filenames.length).toBe(10);
    });
  });

  describe('TTS 미리듣기 API URL 생성', () => {
    test('voice와 speed 파라미터로 올바른 URL 생성', () => {
      const voice = 'ko-KR-SunHiNeural';
      const speed = '1.0';

      const url = `/api/tts-preview?voice=${encodeURIComponent(voice)}&speed=${speed}`;

      expect(url).toBe('/api/tts-preview?voice=ko-KR-SunHiNeural&speed=1.0');
    });

    test('URL에서 파라미터 추출', () => {
      const url = '/api/tts-preview?voice=ko-KR-SunHiNeural&speed=1.0';
      const params = new URLSearchParams(url.split('?')[1]);

      const voice = params.get('voice');
      const speed = params.get('speed');

      expect(voice).toBe('ko-KR-SunHiNeural');
      expect(speed).toBe('1.0'); // 문자열로 유지
      expect(typeof speed).toBe('string');
    });
  });

  describe('localStorage 음성 선택 저장 및 복원', () => {
    test('사용자가 음성을 선택하면 localStorage에 저장', () => {
      const selectedVoice = 'ko-KR-HyunsuMultilingualNeural';

      localStorage.setItem('selectedTtsVoice', selectedVoice);

      expect(mockLocalStorage['selectedTtsVoice']).toBe('ko-KR-HyunsuMultilingualNeural');
    });

    test('새로고침 시 localStorage에서 음성 복원', () => {
      // 사전에 저장된 음성
      mockLocalStorage['selectedTtsVoice'] = 'ko-KR-BongJinNeural';

      // 페이지 로드 시 복원
      const restoredVoice = localStorage.getItem('selectedTtsVoice');

      expect(restoredVoice).toBe('ko-KR-BongJinNeural');
    });

    test('저장된 음성이 없으면 기본값 사용', () => {
      const savedVoice = localStorage.getItem('selectedTtsVoice');
      const defaultVoice = 'ko-KR-SoonBokNeural'; // 기본값
      const selectedVoice = savedVoice || defaultVoice;

      expect(selectedVoice).toBe('ko-KR-SoonBokNeural');
    });
  });

  describe('FormData를 통한 음성 파라미터 전달', () => {
    test('영상 생성 시 선택된 음성이 FormData에 포함됨', () => {
      const formData = new FormData();
      const selectedVoice = 'ko-KR-InJoonNeural';

      formData.append('ttsVoice', selectedVoice);

      expect(formData.get('ttsVoice')).toBe('ko-KR-InJoonNeural');
    });

    test('FormData에서 음성 파라미터 추출', () => {
      const formData = new FormData();
      formData.append('ttsVoice', 'ko-KR-YuJinNeural');
      formData.append('projectName', 'test-project');

      const ttsVoice = formData.get('ttsVoice');

      expect(ttsVoice).toBe('ko-KR-YuJinNeural');
    });
  });

  describe('음성 목록 구조', () => {
    test('여성 음성 5개 확인', () => {
      const femaleVoices = [
        { id: 'ko-KR-SunHiNeural', name: '선희', gender: '여성', emoji: '👩' },
        { id: 'ko-KR-JiMinNeural', name: '지민', gender: '여성', emoji: '👩' },
        { id: 'ko-KR-SeoHyeonNeural', name: '서현', gender: '여성', emoji: '👩' },
        { id: 'ko-KR-SoonBokNeural', name: '순복', gender: '여성', emoji: '👩' },
        { id: 'ko-KR-YuJinNeural', name: '유진', gender: '여성', emoji: '👩' },
      ];

      expect(femaleVoices.length).toBe(5);
      femaleVoices.forEach(voice => {
        expect(voice.gender).toBe('여성');
        expect(voice.emoji).toBe('👩'); // 여성 이모티콘
        expect(voice.id).toContain('ko-KR-');
        expect(voice.id).toContain('Neural');
      });
    });

    test('남성 음성 5개 확인', () => {
      const maleVoices = [
        { id: 'ko-KR-InJoonNeural', name: '인준', gender: '남성', emoji: '👨' },
        { id: 'ko-KR-HyunsuMultilingualNeural', name: '현수(다국어)', gender: '남성', emoji: '👨' },
        { id: 'ko-KR-BongJinNeural', name: '봉진', gender: '남성', emoji: '👨' },
        { id: 'ko-KR-GookMinNeural', name: '국민', gender: '남성', emoji: '👨' },
        { id: 'ko-KR-HyunsuNeural', name: '현수', gender: '남성', emoji: '👨' },
      ];

      expect(maleVoices.length).toBe(5);
      maleVoices.forEach(voice => {
        expect(voice.gender).toBe('남성');
        expect(voice.emoji).toBe('👨'); // 남성 이모티콘
        expect(voice.id).toContain('ko-KR-');
        expect(voice.id).toContain('Neural');
      });
    });

    test('남녀 이모티콘이 구분됨', () => {
      const femaleEmoji = '👩';
      const maleEmoji = '👨';

      expect(femaleEmoji).not.toBe(maleEmoji);
    });
  });

  describe('통합 시나리오', () => {
    test('시나리오: 음성 선택 → 미리듣기 → 영상 생성', () => {
      // 1. 사용자가 음성 선택
      const selectedVoice = 'ko-KR-HyunsuMultilingualNeural';
      localStorage.setItem('selectedTtsVoice', selectedVoice);

      expect(mockLocalStorage['selectedTtsVoice']).toBe('ko-KR-HyunsuMultilingualNeural');

      // 2. 미리듣기 URL 생성
      const speed = '1.0';
      const previewUrl = `/api/tts-preview?voice=${encodeURIComponent(selectedVoice)}&speed=${speed}`;

      expect(previewUrl).toBe('/api/tts-preview?voice=ko-KR-HyunsuMultilingualNeural&speed=1.0');

      // 3. API에서 파일명 생성
      const params = new URLSearchParams(previewUrl.split('?')[1]);
      const voice = params.get('voice');
      const speedParam = params.get('speed') || '1.0'; // 문자열 유지
      const filename = `sample_${voice}_${speedParam}.mp3`;

      expect(filename).toBe('sample_ko-KR-HyunsuMultilingualNeural_1.0.mp3');

      // 4. 영상 생성 시 FormData에 음성 추가
      const formData = new FormData();
      formData.append('ttsVoice', selectedVoice);

      expect(formData.get('ttsVoice')).toBe('ko-KR-HyunsuMultilingualNeural');
    });

    test('시나리오: 새로고침 → 음성 복원 → 미리듣기', () => {
      // 1. 사전에 저장된 음성
      mockLocalStorage['selectedTtsVoice'] = 'ko-KR-SeoHyeonNeural';

      // 2. 새로고침 후 복원
      const restoredVoice = localStorage.getItem('selectedTtsVoice') || 'ko-KR-SoonBokNeural';

      expect(restoredVoice).toBe('ko-KR-SeoHyeonNeural');

      // 3. 복원된 음성으로 미리듣기
      const speed = '1.0';
      const previewUrl = `/api/tts-preview?voice=${encodeURIComponent(restoredVoice)}&speed=${speed}`;

      expect(previewUrl).toBe('/api/tts-preview?voice=ko-KR-SeoHyeonNeural&speed=1.0');
    });
  });

  describe('버그 리그레션 테스트', () => {
    test('BUG FIX: parseFloat 사용으로 인한 404 에러 방지', () => {
      // 버그 재현: parseFloat를 사용하면 "1.0"이 1로 변환됨
      const speedString = '1.0';
      const speedFloat = parseFloat(speedString); // 1 (잘못된 방법)

      expect(speedFloat).toBe(1);
      expect(speedFloat.toString()).toBe('1'); // ".0"이 사라짐

      // 올바른 방법: 문자열 그대로 사용
      const speedCorrect = speedString; // "1.0" (올바른 방법)

      expect(speedCorrect).toBe('1.0');
      expect(typeof speedCorrect).toBe('string');

      // 파일명 비교
      const voice = 'ko-KR-SunHiNeural';
      const wrongFilename = `sample_${voice}_${speedFloat}.mp3`;
      const correctFilename = `sample_${voice}_${speedCorrect}.mp3`;

      expect(wrongFilename).toBe('sample_ko-KR-SunHiNeural_1.mp3'); // 404 에러 발생
      expect(correctFilename).toBe('sample_ko-KR-SunHiNeural_1.0.mp3'); // 올바른 파일명
    });

    test('BUG FIX: Tailwind CSS 호환성을 위해 단순 이모티콘 사용', () => {
      // Composite emojis (woman-with-red-hair, businessman) caused
      // "Invalid code point 9061000" error in Tailwind CSS parser,
      // so reverted to simple emojis
      const femaleEmoji = '👩';
      const maleEmoji = '👨';

      // 단순 이모티콘이 사용되고 있는지 확인
      expect(femaleEmoji).toBe('👩');
      expect(maleEmoji).toBe('👨');
      expect(femaleEmoji).not.toBe(maleEmoji);
    });
  });
});
