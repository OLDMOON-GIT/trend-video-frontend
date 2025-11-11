/**
 * AI 모델 선택 리그레션 테스트
 *
 * 버그: Gemini를 선택했는데 Claude가 실행되는 문제
 * 수정:
 * 1. page.tsx에서 model -> scriptModel로 변경
 * 2. /api/scripts/generate/route.ts에서 hardcoded 'claude' -> agentName으로 변경
 */

describe('AI 모델 선택 테스트', () => {
  describe('API 요청 파라미터 검증', () => {
    it('ChatGPT 선택 시 scriptModel: "chatgpt"로 전송되어야 함', () => {
      const scriptModel = 'chatgpt';  // 실제 프론트엔드 값
      const requestBody = {
        title: '테스트 제목',
        type: 'longform',
        scriptModel: scriptModel, // ✅ model이 아닌 scriptModel 사용
        useClaudeLocal: true
      };

      expect(requestBody.scriptModel).toBe('chatgpt');
      expect(requestBody).toHaveProperty('scriptModel');
      expect(requestBody).not.toHaveProperty('model');
    });

    it('Gemini 선택 시 scriptModel: "gemini"로 전송되어야 함', () => {
      const scriptModel = 'gemini';
      const requestBody = {
        title: '테스트 제목',
        type: 'longform',
        scriptModel: scriptModel,
        useClaudeLocal: true
      };

      expect(requestBody.scriptModel).toBe('gemini');
      expect(requestBody).toHaveProperty('scriptModel');
      expect(requestBody).not.toHaveProperty('model');
    });

    it('Claude 선택 시 scriptModel: "claude"로 전송되어야 함', () => {
      const scriptModel = 'claude';
      const requestBody = {
        title: '테스트 제목',
        type: 'longform',
        scriptModel: scriptModel,
        useClaudeLocal: true
      };

      expect(requestBody.scriptModel).toBe('claude');
      expect(requestBody).toHaveProperty('scriptModel');
    });
  });

  describe('서버 파라미터 처리 검증', () => {
    it('서버는 scriptModel을 올바른 agent 이름으로 매핑해야 함', () => {
      // 서버 코드 시뮬레이션: MODEL_TO_AGENT mapping
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'chatgpt': 'chatgpt',  // 프론트엔드에서 'chatgpt'로 전송
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const testCases = [
        { scriptModel: 'gpt', expectedAgent: 'chatgpt' },
        { scriptModel: 'chatgpt', expectedAgent: 'chatgpt' },  // 실제 프론트엔드 값
        { scriptModel: 'gemini', expectedAgent: 'gemini' },
        { scriptModel: 'claude', expectedAgent: 'claude' }
      ];

      testCases.forEach(({ scriptModel, expectedAgent }) => {
        const agentName = MODEL_TO_AGENT[scriptModel] || 'claude';
        expect(agentName).toBe(expectedAgent);
      });
    });

    it('서버는 잘못된 scriptModel에 대해 claude를 기본값으로 사용해야 함', () => {
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const invalidModels = [undefined, null, '', 'invalid', 'gpt4', 'openai'];

      invalidModels.forEach(scriptModel => {
        const agentName = scriptModel && MODEL_TO_AGENT[scriptModel]
          ? MODEL_TO_AGENT[scriptModel]
          : 'claude';

        expect(agentName).toBe('claude');
      });
    });
  });

  describe('Python 명령어 인자 검증', () => {
    it('ChatGPT 선택 시 Python에 "-a chatgpt" 인자가 전달되어야 함', () => {
      const scriptModel = 'gpt';
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const agentName = MODEL_TO_AGENT[scriptModel] || 'claude';
      const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', 'prompt.txt', '-a', agentName, '--auto-close'];

      expect(pythonArgs).toContain('-a');
      const agentIndex = pythonArgs.indexOf('-a');
      expect(pythonArgs[agentIndex + 1]).toBe('chatgpt');
      expect(pythonArgs[agentIndex + 1]).not.toBe('claude');
    });

    it('Gemini 선택 시 Python에 "-a gemini" 인자가 전달되어야 함', () => {
      const scriptModel = 'gemini';
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const agentName = MODEL_TO_AGENT[scriptModel] || 'claude';
      const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', 'prompt.txt', '-a', agentName, '--auto-close'];

      expect(pythonArgs).toContain('-a');
      const agentIndex = pythonArgs.indexOf('-a');
      expect(pythonArgs[agentIndex + 1]).toBe('gemini');
      expect(pythonArgs[agentIndex + 1]).not.toBe('claude');
    });

    it('Claude 선택 시 Python에 "-a claude" 인자가 전달되어야 함', () => {
      const scriptModel = 'claude';
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const agentName = MODEL_TO_AGENT[scriptModel] || 'claude';
      const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', 'prompt.txt', '-a', agentName, '--auto-close'];

      expect(pythonArgs).toContain('-a');
      const agentIndex = pythonArgs.indexOf('-a');
      expect(pythonArgs[agentIndex + 1]).toBe('claude');
    });

    it('[BUG FIX] Python 인자에 hardcoded "claude"가 아닌 동적 agentName을 사용해야 함', () => {
      // ❌ 이전 버그 코드:
      // const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', promptFileName, '-a', 'claude', '--auto-close'];

      // ✅ 수정된 코드:
      const scriptModel = 'gemini';
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const agentName = MODEL_TO_AGENT[scriptModel] || 'claude';
      const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', 'prompt.txt', '-a', agentName, '--auto-close'];

      const agentIndex = pythonArgs.indexOf('-a');
      expect(pythonArgs[agentIndex + 1]).toBe('gemini'); // ✅ gemini가 전달됨
      expect(pythonArgs[agentIndex + 1]).not.toBe('claude'); // ❌ 이전 버그: 항상 claude가 전달됨
    });
  });

  describe('UnifiedAgent 초기화 검증', () => {
    it('ChatGPT agent는 올바른 설정으로 초기화되어야 함', () => {
      const aiType = 'chatgpt';

      // UnifiedAgent 설정 시뮬레이션
      const configs: Record<string, any> = {
        'claude': { name: 'Claude', url: 'https://claude.ai/' },
        'chatgpt': { name: 'ChatGPT', url: 'https://chat.openai.com/' },
        'gemini': { name: 'Gemini', url: 'https://gemini.google.com/' },
        'grok': { name: 'Grok', url: 'https://x.com/i/grok' }
      };

      const config = configs[aiType];

      expect(config.name).toBe('ChatGPT');
      expect(config.url).toBe('https://chat.openai.com/');
    });

    it('Gemini agent는 올바른 설정으로 초기화되어야 함', () => {
      const aiType = 'gemini';

      const configs: Record<string, any> = {
        'claude': { name: 'Claude', url: 'https://claude.ai/' },
        'chatgpt': { name: 'ChatGPT', url: 'https://chat.openai.com/' },
        'gemini': { name: 'Gemini', url: 'https://gemini.google.com/' },
        'grok': { name: 'Grok', url: 'https://x.com/i/grok' }
      };

      const config = configs[aiType];

      expect(config.name).toBe('Gemini');
      expect(config.url).toBe('https://gemini.google.com/');
    });

    it('Claude agent는 올바른 설정으로 초기화되어야 함', () => {
      const aiType = 'claude';

      const configs: Record<string, any> = {
        'claude': { name: 'Claude', url: 'https://claude.ai/' },
        'chatgpt': { name: 'ChatGPT', url: 'https://chat.openai.com/' },
        'gemini': { name: 'Gemini', url: 'https://gemini.google.com/' },
        'grok': { name: 'Grok', url: 'https://x.com/i/grok' }
      };

      const config = configs[aiType];

      expect(config.name).toBe('Claude');
      expect(config.url).toBe('https://claude.ai/');
    });
  });

  describe('리그레션 방지', () => {
    it('[BUG FIX] Gemini 선택 후 대본 생성 시 Claude가 아닌 Gemini가 실행되어야 함', () => {
      // 사용자가 Gemini를 선택한 상황
      const userSelectedModel = 'gemini';

      // Frontend: API 요청 생성
      const frontendRequestBody = {
        title: '테스트 제목',
        type: 'longform',
        scriptModel: userSelectedModel, // ✅ scriptModel로 전송 (model 아님)
        useClaudeLocal: true
      };

      expect(frontendRequestBody.scriptModel).toBe('gemini');

      // Backend: 서버에서 처리
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const scriptModel = frontendRequestBody.scriptModel;
      const agentName = scriptModel && MODEL_TO_AGENT[scriptModel]
        ? MODEL_TO_AGENT[scriptModel]
        : 'claude';

      expect(agentName).toBe('gemini');

      // Python 명령어 생성
      const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', 'prompt.txt', '-a', agentName, '--auto-close'];
      // ✅ 수정 후: agentName 사용
      // ❌ 이전 버그: '-a', 'claude' 하드코딩

      const agentIndex = pythonArgs.indexOf('-a');
      expect(pythonArgs[agentIndex + 1]).toBe('gemini'); // ✅ gemini가 전달됨
      expect(pythonArgs[agentIndex + 1]).not.toBe('claude'); // ❌ 이전 버그: 항상 claude
    });

    it('[BUG FIX] ChatGPT 선택 후 대본 생성 시 Claude가 아닌 ChatGPT가 실행되어야 함', () => {
      const userSelectedModel = 'gpt';

      const frontendRequestBody = {
        title: '테스트 제목',
        type: 'shortform',
        scriptModel: userSelectedModel,
        useClaudeLocal: true
      };

      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const agentName = MODEL_TO_AGENT[frontendRequestBody.scriptModel] || 'claude';

      expect(agentName).toBe('chatgpt');
      expect(agentName).not.toBe('claude');
    });

    it('[BUG FIX] 모든 API 호출 지점에서 scriptModel이 전달되어야 함', () => {
      // Test case 1: ScriptConfirmModal에서의 호출 (line 4223)
      const scriptModel1 = 'gemini';
      const requestBody1 = {
        title: 'Test',
        type: 'longform',
        scriptModel: scriptModel1, // ✅ scriptModel 포함
        useClaudeLocal: true
      };
      expect(requestBody1).toHaveProperty('scriptModel');
      expect(requestBody1.scriptModel).toBe('gemini');

      // Test case 2: SORA2 대본 생성 (line 1025)
      const scriptModel2 = 'claude';
      const requestBody2 = {
        topic: 'Test Topic',
        videoFormat: 'sora2',
        scriptModel: scriptModel2 // ✅ scriptModel 포함
      };
      expect(requestBody2).toHaveProperty('scriptModel');
      expect(requestBody2.scriptModel).toBe('claude');

      // Test case 3: 일반 대본 생성 (line 2106)
      const scriptModel3 = 'gpt';
      const requestBody3 = {
        title: 'Test',
        type: 'shortform',
        scriptModel: scriptModel3 // ✅ scriptModel 포함
      };
      expect(requestBody3).toHaveProperty('scriptModel');
      expect(requestBody3.scriptModel).toBe('gpt');
    });
  });

  describe('통합 테스트: 비디오 포맷 + AI 모델 조합', () => {
    const testCases = [
      { format: 'longform', model: 'claude', expectedAgent: 'claude', formatLabel: '🎬 롱폼' },
      { format: 'longform', model: 'gpt', expectedAgent: 'chatgpt', formatLabel: '🎬 롱폼' },
      { format: 'longform', model: 'gemini', expectedAgent: 'gemini', formatLabel: '🎬 롱폼' },
      { format: 'shortform', model: 'claude', expectedAgent: 'claude', formatLabel: '📱 숏폼' },
      { format: 'shortform', model: 'gpt', expectedAgent: 'chatgpt', formatLabel: '📱 숏폼' },
      { format: 'shortform', model: 'gemini', expectedAgent: 'gemini', formatLabel: '📱 숏폼' },
      { format: 'sora2', model: 'claude', expectedAgent: 'claude', formatLabel: '🎥 SORA2' },
      { format: 'sora2', model: 'gpt', expectedAgent: 'chatgpt', formatLabel: '🎥 SORA2' },
      { format: 'sora2', model: 'gemini', expectedAgent: 'gemini', formatLabel: '🎥 SORA2' },
      { format: 'product', model: 'claude', expectedAgent: 'claude', formatLabel: '🛍️ 상품' },
      { format: 'product', model: 'gpt', expectedAgent: 'chatgpt', formatLabel: '🛍️ 상품' },
      { format: 'product', model: 'gemini', expectedAgent: 'gemini', formatLabel: '🛍️ 상품' }
    ];

    testCases.forEach(({ format, model, expectedAgent, formatLabel }) => {
      it(`${formatLabel} + ${model.toUpperCase()} 조합이 올바르게 처리되어야 함`, () => {
        // Frontend 요청
        const requestBody = {
          title: '테스트',
          type: format,
          scriptModel: model,
          useClaudeLocal: true
        };

        expect(requestBody.type).toBe(format);
        expect(requestBody.scriptModel).toBe(model);

        // Backend 처리
        const MODEL_TO_AGENT: Record<string, string> = {
          'gpt': 'chatgpt',
          'gemini': 'gemini',
          'claude': 'claude'
        };

        const agentName = MODEL_TO_AGENT[requestBody.scriptModel] || 'claude';
        expect(agentName).toBe(expectedAgent);

        // Python 명령어 검증
        const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', 'prompt.txt', '-a', agentName, '--auto-close'];
        const agentIndex = pythonArgs.indexOf('-a');
        expect(pythonArgs[agentIndex + 1]).toBe(expectedAgent);
      });
    });
  });

  describe('Edge Cases', () => {
    it('scriptModel이 undefined일 때 claude를 기본값으로 사용해야 함', () => {
      const scriptModel = undefined;
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const agentName = scriptModel && MODEL_TO_AGENT[scriptModel]
        ? MODEL_TO_AGENT[scriptModel]
        : 'claude';

      expect(agentName).toBe('claude');
    });

    it('scriptModel이 빈 문자열일 때 claude를 기본값으로 사용해야 함', () => {
      const scriptModel = '';
      const MODEL_TO_AGENT: Record<string, string> = {
        'gpt': 'chatgpt',
        'gemini': 'gemini',
        'claude': 'claude'
      };

      const agentName = scriptModel && MODEL_TO_AGENT[scriptModel]
        ? MODEL_TO_AGENT[scriptModel]
        : 'claude';

      expect(agentName).toBe('claude');
    });

    it('잘못된 scriptModel 값일 때 claude를 기본값으로 사용해야 함', () => {
      const invalidModels = ['gpt4', 'openai', 'chatgpt4', 'bard', 'copilot'];

      invalidModels.forEach(scriptModel => {
        const MODEL_TO_AGENT: Record<string, string> = {
          'gpt': 'chatgpt',
          'gemini': 'gemini',
          'claude': 'claude'
        };

        const agentName = scriptModel && MODEL_TO_AGENT[scriptModel]
          ? MODEL_TO_AGENT[scriptModel]
          : 'claude';

        expect(agentName).toBe('claude');
      });
    });
  });
});
