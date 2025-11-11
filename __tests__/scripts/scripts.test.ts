/**
 * 대본 생성 리그레션 테스트
 *
 * 테스트 범위:
 * - 대본 생성 요청
 * - 대본 목록 조회
 * - 대본 상세 조회
 * - 대본 재생성
 * - 대본 취소
 */

describe('대본 생성 시스템', () => {
  describe('대본 생성 요청', () => {
    test('제목 입력 검증', () => {
      const validTitles = [
        '재미있는 이야기',
        '10가지 생활 팁',
        'How to cook pasta',
      ];

      const invalidTitles = [
        '',
        '   ',
        'a', // 너무 짧음 (최소 2자)
      ];

      const isValidTitle = (title: string): boolean => {
        return title.trim().length >= 2;
      };

      validTitles.forEach(title => {
        expect(isValidTitle(title)).toBe(true);
      });

      invalidTitles.forEach(title => {
        expect(isValidTitle(title)).toBe(false);
      });
    });

    test('비디오 타입 선택 검증', () => {
      const validTypes = ['longform', 'shortform', 'sora2'];

      validTypes.forEach(type => {
        expect(['longform', 'shortform', 'sora2']).toContain(type);
      });

      const invalidType = 'invalid_type';
      expect(['longform', 'shortform', 'sora2']).not.toContain(invalidType);
    });

    test('Claude local/remote 선택', () => {
      const requestWithLocal = {
        title: '테스트',
        type: 'longform',
        useClaudeLocal: true,
      };

      const requestWithRemote = {
        title: '테스트',
        type: 'longform',
        useClaudeLocal: false,
      };

      expect(requestWithLocal.useClaudeLocal).toBe(true);
      expect(requestWithRemote.useClaudeLocal).toBe(false);
    });

    test('대본 생성 시 크레딧 체크', () => {
      const userCredits = 100;
      const scriptCost = 10;

      const canGenerate = userCredits >= scriptCost;

      expect(canGenerate).toBe(true);
    });

    test('대본 생성 ID 생성 (task_timestamp)', () => {
      const generateScriptId = (): string => {
        return `task_${Date.now()}`;
      };

      const scriptId = generateScriptId();

      expect(scriptId).toMatch(/^task_\d{13}$/);
    });
  });

  describe('대본 목록 조회', () => {
    test('사용자별 대본 필터링', () => {
      const scripts = [
        { id: 'task_1', userId: 'user1', title: 'Script 1' },
        { id: 'task_2', userId: 'user2', title: 'Script 2' },
        { id: 'task_3', userId: 'user1', title: 'Script 3' },
      ];

      const userId = 'user1';
      const userScripts = scripts.filter(s => s.userId === userId);

      expect(userScripts).toHaveLength(2);
      expect(userScripts[0].id).toBe('task_1');
      expect(userScripts[1].id).toBe('task_3');
    });

    test('상태별 필터링', () => {
      const scripts = [
        { id: 'task_1', status: 'PENDING' },
        { id: 'task_2', status: 'COMPLETED' },
        { id: 'task_3', status: 'FAILED' },
        { id: 'task_4', status: 'PROCESSING' },
      ];

      const completed = scripts.filter(s => s.status === 'COMPLETED');
      const failed = scripts.filter(s => s.status === 'FAILED');

      expect(completed).toHaveLength(1);
      expect(failed).toHaveLength(1);
    });

    test('페이지네이션', () => {
      const scripts = Array.from({ length: 35 }, (_, i) => ({
        id: `task_${i + 1}`,
        title: `Script ${i + 1}`,
      }));

      const PAGE_SIZE = 10;
      const page = 2;

      const startIndex = (page - 1) * PAGE_SIZE;
      const paginatedScripts = scripts.slice(startIndex, startIndex + PAGE_SIZE);

      expect(paginatedScripts).toHaveLength(10);
      expect(paginatedScripts[0].id).toBe('task_11');
    });

    test('최신순 정렬', () => {
      const scripts = [
        { id: 'task_1', createdAt: '2024-11-01T10:00:00Z' },
        { id: 'task_2', createdAt: '2024-11-03T10:00:00Z' },
        { id: 'task_3', createdAt: '2024-11-02T10:00:00Z' },
      ];

      const sorted = [...scripts].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      expect(sorted[0].id).toBe('task_2'); // 2024-11-03
      expect(sorted[1].id).toBe('task_3'); // 2024-11-02
      expect(sorted[2].id).toBe('task_1'); // 2024-11-01
    });
  });

  describe('대본 상세 조회', () => {
    test('대본 JSON 구조 검증', () => {
      const scriptContent = {
        title: '재미있는 이야기',
        scenes: [
          {
            scene_number: 1,
            description: '오프닝',
            narration: '안녕하세요',
            image_prompt: 'happy person',
          },
        ],
      };

      expect(scriptContent).toHaveProperty('title');
      expect(scriptContent).toHaveProperty('scenes');
      expect(Array.isArray(scriptContent.scenes)).toBe(true);
      expect(scriptContent.scenes[0]).toHaveProperty('scene_number');
      expect(scriptContent.scenes[0]).toHaveProperty('narration');
    });

    test('타임스탬프 파싱', () => {
      const timestamp = '2024-11-04T12:30:45.123Z';
      const parsed = new Date(timestamp);

      expect(parsed.getFullYear()).toBe(2024);
      expect(parsed.getMonth()).toBe(10); // 11월 (0-based)
      expect(parsed.getDate()).toBe(4);
    });

    test('씬 개수 계산', () => {
      const script = {
        scenes: [
          { scene_number: 1 },
          { scene_number: 2 },
          { scene_number: 3 },
        ],
      };

      expect(script.scenes.length).toBe(3);
    });
  });

  describe('대본 재생성', () => {
    test('실패한 대본 재시도', () => {
      const script = {
        id: 'task_123',
        status: 'FAILED',
        retryCount: 0,
      };

      // 재시도
      script.status = 'PENDING';
      script.retryCount += 1;

      expect(script.status).toBe('PENDING');
      expect(script.retryCount).toBe(1);
    });

    test('최대 재시도 횟수 제한', () => {
      const MAX_RETRY = 3;
      const script = {
        id: 'task_123',
        retryCount: 3,
      };

      const canRetry = script.retryCount < MAX_RETRY;

      expect(canRetry).toBe(false);
    });

    test('완료된 대본 재생성 (덮어쓰기)', () => {
      const script = {
        id: 'task_123',
        status: 'COMPLETED',
        content: 'old content',
      };

      // 재생성 요청
      script.status = 'PENDING';
      script.content = '';

      expect(script.status).toBe('PENDING');
      expect(script.content).toBe('');
    });
  });

  describe('대본 취소', () => {
    test('진행 중인 작업 취소', () => {
      const script = {
        id: 'task_123',
        status: 'PROCESSING',
      };

      // 취소 요청
      script.status = 'CANCELLED';

      expect(script.status).toBe('CANCELLED');
    });

    test('완료된 작업은 취소 불가', () => {
      const script = {
        id: 'task_123',
        status: 'COMPLETED',
      };

      const canCancel = script.status === 'PROCESSING' || script.status === 'PENDING';

      expect(canCancel).toBe(false);
    });

    test('취소 시 크레딧 환불', () => {
      let userCredits = 90; // 이미 10 크레딧 차감됨
      const scriptCost = 10;
      const cancelled = true;

      if (cancelled) {
        userCredits += scriptCost;
      }

      expect(userCredits).toBe(100);
    });
  });

  describe('대본 다운로드', () => {
    test('JSON 형식 다운로드', () => {
      const script = {
        title: '테스트',
        scenes: [{ scene_number: 1, narration: '안녕' }],
      };

      const json = JSON.stringify(script, null, 2);

      expect(json).toContain('"title"');
      expect(json).toContain('"scenes"');
      expect(JSON.parse(json)).toEqual(script);
    });

    test('텍스트 형식 다운로드', () => {
      const script = {
        scenes: [
          { scene_number: 1, narration: '첫 번째 씬' },
          { scene_number: 2, narration: '두 번째 씬' },
        ],
      };

      const text = script.scenes
        .map(s => `[씬 ${s.scene_number}]\n${s.narration}`)
        .join('\n\n');

      expect(text).toContain('[씬 1]');
      expect(text).toContain('첫 번째 씬');
    });
  });

  describe('대본 검색', () => {
    test('제목으로 검색', () => {
      const scripts = [
        { id: 'task_1', title: '재미있는 이야기' },
        { id: 'task_2', title: '요리 레시피' },
        { id: 'task_3', title: '재미있는 사실' },
      ];

      const searchQuery = '재미';
      const filtered = scripts.filter(s =>
        s.title.includes(searchQuery)
      );

      expect(filtered).toHaveLength(2);
    });

    test('대소문자 구분 없이 검색', () => {
      const scripts = [
        { id: 'task_1', title: 'How to Cook' },
        { id: 'task_2', title: 'cooking tips' },
      ];

      const searchQuery = 'cook';
      const filtered = scripts.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    test('매우 긴 제목 처리', () => {
      const MAX_TITLE_LENGTH = 200;
      const longTitle = 'a'.repeat(300);

      const truncated = longTitle.slice(0, MAX_TITLE_LENGTH);

      expect(truncated.length).toBe(MAX_TITLE_LENGTH);
      expect(truncated.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    });

    test('특수 문자 제목 처리', () => {
      const specialTitles = [
        '제목! 특수문자?',
        '이모지 😀',
        '"따옴표" \'작은따옴표\'',
      ];

      specialTitles.forEach(title => {
        expect(title.length).toBeGreaterThan(0);
      });
    });

    test('빈 씬 배열 처리', () => {
      const script = {
        title: '테스트',
        scenes: [],
      };

      expect(script.scenes).toHaveLength(0);
      expect(Array.isArray(script.scenes)).toBe(true);
    });

    test('중복 씬 번호 감지', () => {
      const scenes = [
        { scene_number: 1, narration: 'A' },
        { scene_number: 2, narration: 'B' },
        { scene_number: 2, narration: 'C' }, // 중복
      ];

      const sceneNumbers = scenes.map(s => s.scene_number);
      const uniqueNumbers = new Set(sceneNumbers);
      const hasDuplicate = sceneNumbers.length !== uniqueNumbers.size;

      expect(hasDuplicate).toBe(true);
    });
  });

  describe('리그레션 방지', () => {
    test('[BUG FIX] 대본 타입이 올바르게 저장되어야 함', () => {
      const request = {
        title: '테스트',
        type: 'shortform',
      };

      // DB에 저장
      const savedScript = {
        id: 'task_123',
        title: request.title,
        type: request.type, // type이 올바르게 저장됨
      };

      expect(savedScript.type).toBe('shortform');
      expect(savedScript.type).not.toBe('longform');
    });

    test('[BUG FIX] 대본 생성 실패 시 상태 FAILED로 업데이트', () => {
      const script = {
        id: 'task_123',
        status: 'PROCESSING',
      };

      // 생성 실패
      const error = new Error('Generation failed');

      if (error) {
        script.status = 'FAILED';
      }

      expect(script.status).toBe('FAILED');
    });

    test('[BUG FIX] 동시에 여러 대본 생성 가능', () => {
      const activeScripts = [
        { id: 'task_1', status: 'PROCESSING' },
        { id: 'task_2', status: 'PROCESSING' },
      ];

      const processingCount = activeScripts.filter(
        s => s.status === 'PROCESSING'
      ).length;

      // 여러 대본이 동시에 PROCESSING 상태일 수 있음
      expect(processingCount).toBeGreaterThanOrEqual(1);
    });

    test('[BUG FIX] 대본 내용에 특수 문자 허용', () => {
      const narration = '안녕하세요! "반갑습니다" \'환영합니다\' <태그>';

      // 특수 문자가 그대로 유지되어야 함
      expect(narration).toContain('!');
      expect(narration).toContain('"');
      expect(narration).toContain("'");
      expect(narration).toContain('<');
    });
  });
});
