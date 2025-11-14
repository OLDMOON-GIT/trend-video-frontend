import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCurrentUser } from '@/lib/session';
import { createScript, updateScript } from '@/lib/db';
import { parseJsonSafely } from '@/lib/json-utils';
import { getDb } from '@/lib/sqlite';

const SUPPORTED_MODELS = ['claude', 'chatgpt', 'gemini'] as const;
type AIModel = (typeof SUPPORTED_MODELS)[number];

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
    const { prompt, topic, suggestTitles, format, productInfo, model, category } = await request.json();

    /**
     * format 파라미터: 프롬프트 포맷 (구 videoFormat)
     * - 'longform': 롱폼 영상용 프롬프트 (16:9 가로)
     * - 'shortform': 숏폼 영상용 프롬프트 (9:16 세로)
     * - 'sora2': SORA2 AI 생성 영상용 프롬프트
     * - 'product': 상품 영상 제작용 프롬프트 (상품관리 → 영상제작하기)
     * - 'product-info': 상품 설명 텍스트 생성용 프롬프트 (내 콘텐츠 → 상품정보)
     *
     * 참고: 이름은 format이지만 실제로는 어떤 프롬프트 템플릿을 사용할지 결정
     *      영상 생성 시에도 이 값을 기준으로 영상 포맷이 결정됨
     */

    // 모델 선택 (기본값: claude)
    let selectedModel: AIModel = 'claude';
    if (typeof model === 'string') {
      const normalizedModel = model.trim().toLowerCase();
      // 'gpt' -> 'chatgpt' 매핑
      const mappedModel = normalizedModel === 'gpt' ? 'chatgpt' : normalizedModel;
      if ((SUPPORTED_MODELS as readonly string[]).includes(mappedModel)) {
        selectedModel = mappedModel as AIModel;
      } else {
        console.warn(`⚠️ 지원하지 않는 모델: ${model}, Claude로 폴백`);
      }
    }

    console.log('🤖 선택된 AI 모델:', selectedModel);
    const modelDisplay = selectedModel === 'claude' ? 'Claude' : selectedModel === 'chatgpt' ? 'ChatGPT' : 'Gemini';

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

    // 제목 제안 모드
    if (suggestTitles && topic) {
      console.log(`💡 제목 제안 모드 (${modelDisplay}):`, topic);

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

      console.log(`🤖 ${modelDisplay} API 호출 중 (제목 제안)...`);

      let titleContent = '';
      let usage = { input_tokens: 0, output_tokens: 0 };

      if (selectedModel === 'claude') {
        // Claude API
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
        }
        const anthropic = new Anthropic({ apiKey });
        const titleMessage = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [{
              type: 'text',
              text: titlePrompt,
              cache_control: { type: 'ephemeral' }
            }]
          }]
        });
        titleContent = titleMessage.content[0].type === 'text' ? titleMessage.content[0].text : '';
        usage = {
          input_tokens: titleMessage.usage.input_tokens,
          output_tokens: titleMessage.usage.output_tokens
        };
      } else if (selectedModel === 'chatgpt') {
        // ChatGPT API
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
        }
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: titlePrompt }],
          max_tokens: 500
        });
        titleContent = completion.choices[0]?.message?.content || '';
        usage = {
          input_tokens: completion.usage?.prompt_tokens || 0,
          output_tokens: completion.usage?.completion_tokens || 0
        };
      } else if (selectedModel === 'gemini') {
        // Gemini API
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
        }
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        const result = await model.generateContent(titlePrompt);
        const response = result.response;
        titleContent = response.text();
        usage = {
          input_tokens: result.response.usageMetadata?.promptTokenCount || 0,
          output_tokens: result.response.usageMetadata?.candidatesTokenCount || 0
        };
      }

      console.log('✅ 제목 제안 완료');
      console.log('📊 토큰 사용량:', usage);
      console.log('💡 제안된 제목:', titleContent);

      // 제목 파싱 (1. 2. 3. 형식)
      const titleLines = titleContent.split('\n').filter(line => line.trim());
      const suggestedTitles = titleLines
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(title => title.length > 0)
        .slice(0, 3);

      return NextResponse.json({
        suggestedTitles,
        usage
      });
    }

    // 일반 대본 생성 모드 - 백그라운드 작업으로 변경

    console.log('🔍🔍🔍 === createScript 호출 준비 ===');
    console.log('🔍 format 파라미터:', format);
    console.log('🔍 format 타입:', typeof format);

    // 1. 먼저 pending 상태로 대본 생성
    const script = await createScript(
      user.userId,
      topic || '제목 없음',
      '', // 초기에는 빈 내용
      undefined, // tokenUsage
      topic, // 사용자가 입력한 원본 제목
      format || 'longform', // 포맷 전달 (기본값: longform)
      category // 카테고리 전달
    );

    console.log('📝 대본 생성 작업 시작:', script.id);
    console.log('📝 저장된 format:', format || 'longform');

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

        // 상품 정보 추가 (product 또는 product-info 포맷인 경우)
        console.log('🔍🔍🔍 백엔드 - 상품 정보 체크');
        console.log('  - format:', format);
        console.log('  - productInfo:', productInfo);

        if (format === 'product' || format === 'product-info') {
          if (!productInfo) {
            console.error('❌❌❌ 상품 포맷인데 productInfo가 없습니다!');
            console.error('❌ 프롬프트의 플레이스홀더가 치환되지 않을 것입니다!');
          } else {
            console.log('🛍️🛍️🛍️ 상품 정보 포함:', productInfo);
            console.log('  - title:', productInfo.title);
            console.log('  - thumbnail:', productInfo.thumbnail);
            console.log('  - product_link:', productInfo.product_link);
            console.log('  - description:', productInfo.description);

            // 프롬프트에 플레이스홀더가 있는지 확인
            const hasTitle = combinedPrompt.includes('{title}');
            const hasThumbnail = combinedPrompt.includes('{thumbnail}');
            const hasProductLink = combinedPrompt.includes('{product_link}');
            const hasProductDescription = combinedPrompt.includes('{product_description}');
            const hasHomeUrl = combinedPrompt.includes('{home_url}');
            const hasNickname = combinedPrompt.includes('{별명}');

            console.log('🔍 프롬프트 플레이스홀더 존재 여부:');
            console.log('  - {title}:', hasTitle);
            console.log('  - {thumbnail}:', hasThumbnail);
            console.log('  - {product_link}:', hasProductLink);
            console.log('  - {product_description}:', hasProductDescription);
            console.log('  - {home_url}:', hasHomeUrl);
            console.log('  - {별명}:', hasNickname);

            // 치환 전 프롬프트 일부 확인
            console.log('🔍 치환 전 프롬프트 샘플 (처음 800자):', combinedPrompt.substring(0, 800));

            // DB에서 사용자 설정 가져오기
            const db = getDb();
            const userSettings = db.prepare('SELECT google_sites_home_url, nickname FROM users WHERE id = ?').get(user.userId) as { google_sites_home_url?: string; nickname?: string } | undefined;
            const homeUrl = userSettings?.google_sites_home_url || 'https://www.youtube.com/@살림남';
            const nickname = userSettings?.nickname || '살림남';

            console.log('🏠 home_url 설정:', homeUrl);
            console.log('👤 별명 설정:', nickname);

            // 프롬프트의 {title}, {thumbnail}, {product_link}, {product_description}, {home_url}, {별명} 플레이스홀더 치환
            const beforeReplace = combinedPrompt;
            combinedPrompt = combinedPrompt
              .replace(/{title}/g, productInfo.title || '')
              .replace(/{thumbnail}/g, productInfo.thumbnail || '')
              .replace(/{product_link}/g, productInfo.product_link || '')
              .replace(/{product_description}/g, productInfo.description || '')
              .replace(/{home_url}/g, homeUrl) // DB에서 가져온 홈 URL
              .replace(/{별명}/g, nickname); // DB에서 가져온 채널 별명

            // 치환 후 확인
            console.log('🔍 치환 후 프롬프트 샘플 (처음 800자):', combinedPrompt.substring(0, 800));

            // 치환 여부 확인
            const wasReplaced = beforeReplace !== combinedPrompt;
            console.log(wasReplaced ? '✅ 상품 정보 치환 완료 (프롬프트가 변경됨)' : '⚠️ 프롬프트가 변경되지 않음 (플레이스홀더 없음?)');

            // 치환 후에도 플레이스홀더가 남아있는지 확인
            if (combinedPrompt.includes('{title}') || combinedPrompt.includes('{thumbnail}') ||
                combinedPrompt.includes('{product_link}') || combinedPrompt.includes('{product_description}') ||
                combinedPrompt.includes('{home_url}') || combinedPrompt.includes('{별명}')) {
              console.warn('⚠️⚠️⚠️ 치환 후에도 플레이스홀더가 남아있습니다!');
            }
          }
        }

        console.log(`🤖 ${modelDisplay} API 호출 중 (대본 생성)...`);
        console.log('📄 프롬프트 길이:', combinedPrompt.length);

        await updateScript(script.id, {
          progress: 30,
          logs: [`🤖 ${modelDisplay} API 호출 시작...`, '📝 스트리밍 시작...']
        });

        // 스트리밍으로 대본 생성
        let scriptContent = '';
        let lastUpdateTime = Date.now();
        const updateInterval = 500; // 500ms마다 업데이트

        // 비디오 타입별 예상 대본 길이 (프롬프트 기준)
        const estimatedLengths: Record<string, number> = {
          'longform': 33000,  // 씬당 3,800~4,200자 × 8개 + 폭탄/구독 씬 700자 = 약 31,000~34,000자
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

        let tokenUsage = { input_tokens: 0, output_tokens: 0 };

        // 모델별 스트리밍 처리
        if (selectedModel === 'claude') {
          // Claude API
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
          }
          const anthropic = new Anthropic({ apiKey, timeout: 60 * 60 * 1000, maxRetries: 0 });

          const stream = await anthropic.messages.stream({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 64000,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: [{
                type: 'text',
                text: combinedPrompt,
                cache_control: { type: 'ephemeral' }
              }]
            }]
          });

          // 스트리밍 데이터 처리
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              scriptContent += chunk.delta.text;

              const now = Date.now();
              if (now - lastUpdateTime >= updateInterval) {
                const rawProgress = (scriptContent.length / estimatedTotalChars) * 100;
                const progress = Math.min(Math.floor(rawProgress), 90);

                await updateScript(script.id, {
                  progress,
                  content: scriptContent,
                  logs: [
                    `🤖 ${modelDisplay} API 호출 시작...`,
                    '📝 스트리밍 시작...',
                    `📊 생성 중... (${scriptContent.length.toLocaleString()} / ~${estimatedTotalChars.toLocaleString()}자)`
                  ]
                });
                lastUpdateTime = now;
                console.log(`📝 생성 중: ${scriptContent.length}자 (${progress}%)`);
              }
            }
          }

          const message = await stream.finalMessage();
          tokenUsage = {
            input_tokens: message.usage.input_tokens,
            output_tokens: message.usage.output_tokens
          };

          if (message.usage.cache_read_input_tokens) {
            console.log(`💰 캐시 히트: ${message.usage.cache_read_input_tokens} 토큰 (90% 절감)`);
          }
          if (message.usage.cache_creation_input_tokens) {
            console.log(`🔄 신규 캐시: ${message.usage.cache_creation_input_tokens} 토큰`);
          }

        } else if (selectedModel === 'chatgpt') {
          // ChatGPT API
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
          }
          const openai = new OpenAI({ apiKey });

          const messages: Array<{role: 'system' | 'user'; content: string}> = [];
          if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
          }
          messages.push({ role: 'user', content: combinedPrompt });

          const stream = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            max_tokens: 16000,
            stream: true
          });

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            scriptContent += content;

            const now = Date.now();
            if (now - lastUpdateTime >= updateInterval) {
              const rawProgress = (scriptContent.length / estimatedTotalChars) * 100;
              const progress = Math.min(Math.floor(rawProgress), 90);

              await updateScript(script.id, {
                progress,
                content: scriptContent,
                logs: [
                  `🤖 ${modelDisplay} API 호출 시작...`,
                  '📝 스트리밍 시작...',
                  `📊 생성 중... (${scriptContent.length.toLocaleString()} / ~${estimatedTotalChars.toLocaleString()}자)`
                ]
              });
              lastUpdateTime = now;
              console.log(`📝 생성 중: ${scriptContent.length}자 (${progress}%)`);
            }
          }

          // ChatGPT는 스트리밍에서 토큰 사용량을 제공하지 않으므로 추정
          tokenUsage = {
            input_tokens: Math.ceil(combinedPrompt.length / 4),
            output_tokens: Math.ceil(scriptContent.length / 4)
          };

        } else if (selectedModel === 'gemini') {
          // Gemini API
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
          }
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp',
            systemInstruction: systemPrompt
          });

          const result = await model.generateContentStream(combinedPrompt);

          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            scriptContent += chunkText;

            const now = Date.now();
            if (now - lastUpdateTime >= updateInterval) {
              const rawProgress = (scriptContent.length / estimatedTotalChars) * 100;
              const progress = Math.min(Math.floor(rawProgress), 90);

              await updateScript(script.id, {
                progress,
                content: scriptContent,
                logs: [
                  `🤖 ${modelDisplay} API 호출 시작...`,
                  '📝 스트리밍 시작...',
                  `📊 생성 중... (${scriptContent.length.toLocaleString()} / ~${estimatedTotalChars.toLocaleString()}자)`
                ]
              });
              lastUpdateTime = now;
              console.log(`📝 생성 중: ${scriptContent.length}자 (${progress}%)`);
            }
          }

          const response = await result.response;
          tokenUsage = {
            input_tokens: response.usageMetadata?.promptTokenCount || 0,
            output_tokens: response.usageMetadata?.candidatesTokenCount || 0
          };
        }

        console.log('✅ 대본 생성 완료');
        console.log('📊 토큰 사용량:', tokenUsage);
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
            `📊 입력: ${tokenUsage.input_tokens} 토큰`,
            `📊 출력: ${tokenUsage.output_tokens} 토큰`,
            `📝 대본 길이: ${scriptContent.length}자`
          ].filter(Boolean),
          tokenUsage
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
