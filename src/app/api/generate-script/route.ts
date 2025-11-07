import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getCurrentUser } from '@/lib/session';
import { createScript, updateScript } from '@/lib/db';
import { parseJsonSafely } from '@/lib/json-utils';

export async function POST(request: NextRequest) {
  // 사용자 인증
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    );
  }


  try {
    const { prompt, topic, suggestTitles, format, productInfo } = await request.json();

    console.log('📝 대본 생성 요청:', {
      hasPrompt: !!prompt,
      hasTopic: !!topic,
      suggestTitles,
      format,
      hasProductInfo: !!productInfo
    });

    if (!prompt) {
      return NextResponse.json(
        { error: '프롬프트가 필요합니다.' },
        { status: 400 }
      );
    }

    // API 키 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('❌ ANTHROPIC_API_KEY가 설정되지 않음');
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local 파일을 확인하세요.' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: apiKey,
      baseURL: 'https://api.anthropic.com',
      timeout: 60 * 60 * 1000, // 1시간 타임아웃
      maxRetries: 0 // 재시도 없음
    });

    // 제목 제안 모드
    if (suggestTitles && topic) {
      console.log('💡 제목 제안 모드:', topic);

      // 입력된 주제의 길이 계산 (공백 제외)
      const topicLength = topic.replace(/\s/g, '').length;
      const minLength = Math.max(topicLength, 20);

      const titlePrompt = `다음 주제에 대해 유튜브 쇼츠 영상에 적합한 제목을 3개 제안해주세요.

주제: ${topic}

요구사항:
- 임팩트 있고 구체적인 제목 (공백 제외 ${minLength}~50자)
- 입력한 주제보다 더 구체적이고 자세하게 작성
- 클릭을 유도하는 제목
- 궁금증을 자극하는 제목
- 각 제목은 한 줄로

응답 형식 (다른 설명 없이 제목만):
1. [제목1]
2. [제목2]
3. [제목3]`;

      console.log('🤖 Claude API 호출 중 (제목 제안)...');
      const titleMessage = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: titlePrompt,
                cache_control: { type: 'ephemeral' }
              }
            ]
          }
        ]
      });

      console.log('✅ 제목 제안 완료');
      console.log('📊 토큰 사용량:', {
        입력_토큰: titleMessage.usage.input_tokens,
        출력_토큰: titleMessage.usage.output_tokens,
        캐시_읽기: titleMessage.usage.cache_read_input_tokens || 0,
        캐시_생성: titleMessage.usage.cache_creation_input_tokens || 0
      });

      const titleContent = titleMessage.content[0].type === 'text'
        ? titleMessage.content[0].text
        : '';

      console.log('💡 제안된 제목:', titleContent);

      // 제목 파싱 (1. 2. 3. 형식)
      const titleLines = titleContent.split('\n').filter(line => line.trim());
      const suggestedTitles = titleLines
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(title => title.length > 0)
        .slice(0, 3);

      return NextResponse.json({
        suggestedTitles,
        usage: {
          input_tokens: titleMessage.usage.input_tokens,
          output_tokens: titleMessage.usage.output_tokens
        }
      });
    }

    // 일반 대본 생성 모드 - 백그라운드 작업으로 변경

    // 1. 먼저 pending 상태로 대본 생성
    const script = await createScript(
      user.userId,
      topic || '제목 없음',
      '', // 초기에는 빈 내용
      undefined, // tokenUsage
      topic // 사용자가 입력한 원본 제목
    );

    console.log('📝 대본 생성 작업 시작:', script.id);

    // 2. 백그라운드에서 실제 생성 작업 수행
    (async () => {
      try {
        // 상태를 processing으로 변경
        await updateScript(script.id, {
          status: 'processing',
          progress: 10,
          logs: ['🤖 Claude API 호출 시작...']
        });

        // 프롬프트와 주제를 하나로 합쳐서 캐시 효율 향상
        let combinedPrompt = topic ? `${prompt}\n\n주제: ${topic}` : prompt;

        // 상품 정보 추가 (product 포맷인 경우)
        if (format === 'product' && productInfo) {
          console.log('🛍️ 상품 정보 포함:', productInfo);

          // 프롬프트의 {title}, {thumbnail}, {product_link}, {product_description} 플레이스홀더 치환
          combinedPrompt = combinedPrompt
            .replace(/{title}/g, productInfo.title || '')
            .replace(/{thumbnail}/g, productInfo.thumbnail || '')
            .replace(/{product_link}/g, productInfo.product_link || '')
            .replace(/{product_description}/g, productInfo.description || '');

          console.log('✅ 상품 정보 치환 완료');
        }

        console.log('🤖 Claude API 호출 중 (대본 생성)...');
        console.log('📄 프롬프트 길이:', combinedPrompt.length);

        await updateScript(script.id, {
          progress: 30,
          logs: ['🤖 Claude API 호출 시작...', '📝 스트리밍 시작...']
        });

        // 스트리밍으로 대본 생성
        let scriptContent = '';
        let lastUpdateTime = Date.now();
        const updateInterval = 500; // 500ms마다 업데이트

        // 비디오 타입별 예상 대본 길이 (프롬프트 기준)
        const estimatedLengths: Record<string, number> = {
          'longform': 33000,  // 씨당 3,800~4,200자 × 8개 + 폭탄/구독 씬 700자 = 약 31,000~34,000자
          'shortform': 3000,  // 숏폼은 훨씬 짧음 (200~300자 × 10씬 정도)
          'sora2': 500,       // SORA2는 영어 프롬프트로 매우 짧음
          'product': 600      // 상품 프롬프트는 SORA2와 유사 (4씬, 영어 프롬프트)
        };
        const estimatedTotalChars = estimatedLengths[format || 'longform'] || 33000;

        // SORA2/Product 전용 system prompt (JSON 전용 모드 강제)
        const systemPrompt = (format === 'sora2' || format === 'product')
          ? `YOU ARE A JSON-ONLY MACHINE. NOT AN ASSISTANT. NOT A CHATBOT.

YOUR ENTIRE RESPONSE = ONE SINGLE JSON OBJECT

ABSOLUTE RULES:
1. First character MUST be: {
2. Last character MUST be: }
3. Everything between { and } MUST be valid JSON
4. ZERO text before {
5. ZERO text after }

FORBIDDEN (INSTANT FAILURE):
❌ Code fences: \`\`\`json, \`\`\`, \`\`\`
❌ Explanations: "Here's", "다음은", "제공합니다"
❌ Greetings: "Hello", "안녕하세요"
❌ Confirmations: "Sure", "알겠습니다"
❌ ANY text before {
❌ ANY text after }

YOU ARE A JSON PRINTER. NOTHING ELSE.
START YOUR RESPONSE WITH { NOW.`
          : undefined;

        const stream = await anthropic.messages.stream({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 64000, // Claude Sonnet 4.5 최대 출력 토큰
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: combinedPrompt,
                  cache_control: { type: 'ephemeral' }
                }
              ]
            }
          ]
        });

        // 스트리밍 데이터 처리
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            scriptContent += chunk.delta.text;

            // 일정 간격마다 DB 업데이트 (너무 자주 업데이트하면 DB 부하)
            const now = Date.now();
            if (now - lastUpdateTime >= updateInterval) {
              // 예상 길이 기준으로 진행률 계산 (최대 90%까지)
              // 실제 길이가 예상보다 길어질 수 있으므로 최대치를 90%로 제한
              const rawProgress = (scriptContent.length / estimatedTotalChars) * 100;
              const progress = Math.min(Math.floor(rawProgress), 90);

              await updateScript(script.id, {
                progress,
                content: scriptContent,
                logs: [
                  '🤖 Claude API 호출 시작...',
                  '📝 스트리밍 시작...',
                  `📊 생성 중... (${scriptContent.length.toLocaleString()} / ~${estimatedTotalChars.toLocaleString()}자)`
                ]
              });
              lastUpdateTime = now;
              console.log(`📝 생성 중: ${scriptContent.length}자 (${progress}%)`);
            }
          }
        }

        // 최종 메시지 가져오기
        const message = await stream.finalMessage();

        console.log('✅ 대본 생성 완료');
        console.log('📊 토큰 사용량:', {
          입력_토큰: message.usage.input_tokens,
          출력_토큰: message.usage.output_tokens,
          캐시_읽기: message.usage.cache_read_input_tokens || 0,
          캐시_생성: message.usage.cache_creation_input_tokens || 0
        });

        if (message.usage.cache_read_input_tokens) {
          console.log(`💰 캐시 히트: ${message.usage.cache_read_input_tokens} 토큰 (90% 절감)`);
        }
        if (message.usage.cache_creation_input_tokens) {
          console.log(`🔄 신규 캐시: ${message.usage.cache_creation_input_tokens} 토큰`);
        }

        console.log('📝 생성된 대본:', scriptContent.substring(0, 500) + '...');

        // JSON 형식인 경우 정리 및 포맷팅 (모든 타입)
        let finalContent = scriptContent;

        // JSON 포맷인지 확인 (롱폼, 숏폼, SORA2 모두 JSON)
        console.log('🔧 JSON 정리 시작...');

        // 코드펜스 제거
        finalContent = finalContent.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

        // 앞뒤 설명문 제거 (JSON이 시작되기 전과 끝난 후의 텍스트)
        const jsonStart = finalContent.indexOf('{');
        const jsonEnd = finalContent.lastIndexOf('}');

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          finalContent = finalContent.substring(jsonStart, jsonEnd + 1);
          console.log('✅ JSON 추출 완료');

          // JSON 유효성 검증 및 포맷팅 (유도리있는 파서 사용)
          const parseResult = parseJsonSafely(finalContent, { logErrors: true });
          if (parseResult.success) {
            console.log('✅ JSON 파싱 성공');
            if (parseResult.fixed) {
              console.log('🔧 JSON 자동 수정 적용됨');
            }

            // narration 필드에서 \n 문자 제거 (JSON 파싱 오류 방지)
            if (parseResult.data.scenes && Array.isArray(parseResult.data.scenes)) {
              let cleanedCount = 0;
              parseResult.data.scenes.forEach((scene: any) => {
                if (scene.narration && typeof scene.narration === 'string') {
                  const original = scene.narration;
                  scene.narration = scene.narration.replace(/\\n/g, ' ').replace(/\n/g, ' ');
                  if (original !== scene.narration) {
                    cleanedCount++;
                  }
                }
              });
              if (cleanedCount > 0) {
                console.log(`🔧 ${cleanedCount}개 씬의 narration에서 줄바꿈 문자 제거`);
              }
            }

            // JSON 포맷팅 (예쁘게 정리)
            finalContent = JSON.stringify(parseResult.data, null, 2);
            console.log('✨ JSON 포맷팅 완료');
          } else {
            console.error('❌ JSON 파싱 실패:', parseResult.error);
            console.log('원본 내용:', finalContent.substring(0, 500));
          }
        } else if (format === 'sora2' || format === 'product') {
          // SORA2/Product는 JSON이 필수이므로 경고
          console.warn('⚠️ JSON 구조를 찾을 수 없음');
        }

        // 기존 SORA2 전용 처리 제거 (위에서 통합 처리)
        if (false && format === 'sora2') {
          console.log('🔧 SORA2 JSON 정리 중...');

          // 코드펜스 제거
          finalContent = finalContent.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

          // 앞뒤 설명문 제거 (JSON이 시작되기 전과 끝난 후의 텍스트)
          const jsonStart = finalContent.indexOf('{');
          const jsonEnd = finalContent.lastIndexOf('}');

          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            finalContent = finalContent.substring(jsonStart, jsonEnd + 1);
            console.log('✅ JSON 추출 완료');

            // JSON 유효성 검증 및 포맷팅 (유도리있는 파서 사용)
            const legacyParseResult = parseJsonSafely(finalContent, { logErrors: true });
            if (legacyParseResult.success) {
              console.log('✅ JSON 파싱 성공');
              if (legacyParseResult.fixed) {
                console.log('🔧 JSON 자동 수정 적용됨');
              }

              // JSON 포맷팅 (예쁘게 정리)
              finalContent = JSON.stringify(legacyParseResult.data, null, 2);
              console.log('✨ JSON 포맷팅 완료');
            } else {
              console.error('❌ JSON 파싱 실패:', legacyParseResult.error);
              console.log('원본 내용:', finalContent.substring(0, 500));
            }
          } else {
            console.warn('⚠️ JSON 구조를 찾을 수 없음');
          }
        }

        // 완료 상태로 업데이트
        await updateScript(script.id, {
          status: 'completed',
          progress: 100,
          content: finalContent,
          logs: [
            '✅ 대본 생성 완료!',
            `📊 입력: ${message.usage.input_tokens} 토큰`,
            `📊 출력: ${message.usage.output_tokens} 토큰`,
            message.usage.cache_read_input_tokens ? `💰 캐시 절감: ${message.usage.cache_read_input_tokens} 토큰` : '',
            `📝 대본 길이: ${scriptContent.length}자`
          ].filter(Boolean),
          tokenUsage: {
            input_tokens: message.usage.input_tokens,
            output_tokens: message.usage.output_tokens
          }
        });

        console.log('💾 대본 저장 완료:', script.id);

      } catch (error: any) {
        console.error('❌ 대본 생성 오류:', error);
        await updateScript(script.id, {
          status: 'failed',
          error: error?.message || '대본 생성 중 오류가 발생했습니다.',
          logs: ['❌ 오류 발생: ' + (error?.message || '대본 생성 중 오류가 발생했습니다.')]
        });
      }
    })();

    // 3. 즉시 scriptId 반환
    return NextResponse.json({
      scriptId: script.id,
      status: 'pending',
      message: '대본 생성이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 대본 생성 오류:', error);
    console.error('오류 상세:', {
      status: error?.status,
      message: error?.message,
      type: error?.type,
      error: error?.error
    });

    if (error?.status === 401) {
      return NextResponse.json(
        { error: 'API 키가 유효하지 않습니다.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error?.error || error?.message || '대본 생성 중 오류가 발생했습니다.' },
      { status: error?.status || 500 }
    );
  }
}
