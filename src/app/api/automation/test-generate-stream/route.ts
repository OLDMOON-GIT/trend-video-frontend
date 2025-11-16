import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAutomationSettings } from '@/lib/automation';
import Database from 'better-sqlite3';
import path from 'path';
import { generateTitlesWithClaude, generateTitlesWithChatGPT, generateTitlesWithGemini } from '@/lib/ai-title-generation';

interface ChannelSetting {
  channel_id: string;
  channel_name: string;
  categories: string;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendLog = (message: string) => {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        };

        try {
          sendLog('🧪 [테스트] 자동 제목 생성 테스트를 시작합니다...');
          sendLog('');

          // 자동화 설정 가져오기
          const settings = getAutomationSettings();
          const enabled = settings.auto_title_generation === 'true';
          sendLog(`📋 자동 제목 생성 설정: ${enabled ? '활성화 중' : '꺼짐'}`);

          if (!enabled) {
            sendLog('💡 자동 제목 생성이 비활성화되어 있지만, 테스트는 진행합니다.');
          }
          sendLog('');

          // 모든 채널 설정 조회
          const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
          const db = new Database(dbPath);
          const allSettings = db.prepare(`
            SELECT * FROM youtube_channel_settings
            WHERE is_active = 1
          `).all() as ChannelSetting[];
          db.close();

          sendLog(`🔍 총 ${allSettings.length}개 채널 설정을 찾았습니다.`);
          sendLog('');

          let processedCount = 0;
          let successCount = 0;
          let skippedCount = 0;
          let failedCount = 0;
          let totalCost = 0; // 총 비용 (USD)

          // AI 모델별 가격 (USD per 1M tokens)
          const pricing: any = {
            claude: { input: 3, output: 15 }, // Claude Sonnet
            chatgpt: { input: 2.5, output: 10 }, // GPT-4o
            gemini: { input: 0.075, output: 0.3 } // Gemini Flash
          };

          for (const setting of allSettings) {
            processedCount++;
            sendLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            sendLog(`📺 [${processedCount}/${allSettings.length}] 채널: ${setting.channel_name}`);

            // categories 검증
            if (!setting.categories || setting.categories.trim() === '') {
              sendLog(`⏸️ 카테고리가 설정되지 않았습니다. 스킵합니다.`);
              skippedCount++;
              sendLog('');
              continue;
            }

            let categories;
            try {
              categories = JSON.parse(setting.categories);
            } catch (parseError) {
              sendLog(`❌ 카테고리 JSON 파싱 실패. 스킵합니다.`);
              skippedCount++;
              sendLog('');
              continue;
            }

            if (!categories || !Array.isArray(categories) || categories.length === 0) {
              sendLog(`⏸️ 카테고리 배열이 비어있습니다. 스킵합니다.`);
              skippedCount++;
              sendLog('');
              continue;
            }

            sendLog(`✅ 카테고리: ${categories.join(', ')}`);

            // 각 카테고리별로 제목 생성 테스트
            const category = categories[0]; // 첫 번째 카테고리로 테스트
            sendLog(`🎯 테스트 카테고리: ${category}`);
            sendLog('');

            // AI 모델 선택 (설정에서 가져오기)
            const aiModel = settings.ai_model || 'claude';
            sendLog(`🤖 AI 모델: ${aiModel}`);

            try {
              sendLog(`⏳ ${aiModel.toUpperCase()} 모델로 제목 생성 중...`);

              let titles: string[] = [];
              let inputTokens = 0;
              let outputTokens = 0;
              let cost = 0;

              if (aiModel === 'claude') {
                const Anthropic = (await import('@anthropic-ai/sdk')).default;
                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

                const prompt = `유튜브 ${category} 카테고리의 제목을 1개만 생성해주세요. 40~60자 길이로, 클릭을 유도하는 제목이어야 합니다. 제목만 출력하세요.`;
                const message = await anthropic.messages.create({
                  model: 'claude-3-5-sonnet-20240620',
                  max_tokens: 200,
                  messages: [{ role: 'user', content: prompt }],
                });

                inputTokens = message.usage.input_tokens;
                outputTokens = message.usage.output_tokens;
                cost = (inputTokens * pricing.claude.input + outputTokens * pricing.claude.output) / 1_000_000;

                const content = message.content[0];
                if (content.type === 'text') {
                  titles = [content.text.trim()];
                }
              } else if (aiModel === 'chatgpt') {
                const { OpenAI } = await import('openai');
                const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

                const prompt = `유튜브 ${category} 카테고리의 제목을 1개만 생성해주세요. 40~60자 길이로, 클릭을 유도하는 제목이어야 합니다. 제목만 출력하세요.`;
                const completion = await openai.chat.completions.create({
                  model: 'gpt-4o',
                  messages: [{ role: 'user', content: prompt }],
                  max_tokens: 200,
                });

                inputTokens = completion.usage?.prompt_tokens || 0;
                outputTokens = completion.usage?.completion_tokens || 0;
                cost = (inputTokens * pricing.chatgpt.input + outputTokens * pricing.chatgpt.output) / 1_000_000;

                const text = completion.choices[0]?.message?.content || '';
                titles = [text.trim()];
              } else if (aiModel === 'gemini') {
                const { GoogleGenerativeAI } = await import('@google/generative-ai');
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
                const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

                const prompt = `유튜브 ${category} 카테고리의 제목을 1개만 생성해주세요. 40~60자 길이로, 클릭을 유도하는 제목이어야 합니다. 제목만 출력하세요.`;
                const result = await model.generateContent(prompt);
                const response = result.response;

                inputTokens = response.usageMetadata?.promptTokenCount || 0;
                outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
                cost = (inputTokens * pricing.gemini.input + outputTokens * pricing.gemini.output) / 1_000_000;

                titles = [response.text().trim()];
              }

              if (titles.length > 0 && titles[0]) {
                sendLog(`✅ 제목 생성 성공!`);
                sendLog(`   💡 "${titles[0]}"`);
                sendLog(`   📊 토큰: 입력 ${inputTokens.toLocaleString()} / 출력 ${outputTokens.toLocaleString()}`);
                sendLog(`   💰 비용: $${cost.toFixed(6)} (≈₩${(cost * 1300).toFixed(2)})`);
                totalCost += cost;
                successCount++;
              } else {
                sendLog(`❌ 제목 생성 실패 (빈 결과)`);
                failedCount++;
              }
            } catch (error: any) {
              sendLog(`❌ 제목 생성 중 오류: ${error.message}`);
              failedCount++;
            }

            sendLog('');
          }

          sendLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          sendLog('');
          sendLog('📊 테스트 결과 요약:');
          sendLog(`   ✅ 성공: ${successCount}개 채널`);
          sendLog(`   ❌ 실패: ${failedCount}개 채널`);
          sendLog(`   ⏸️ 스킵: ${skippedCount}개 채널`);
          sendLog('');
          sendLog('💰 총 비용:');
          sendLog(`   📍 합계: $${totalCost.toFixed(6)} (≈₩${(totalCost * 1300).toFixed(2)})`);
          if (successCount > 0) {
            sendLog(`   📍 평균: $${(totalCost / successCount).toFixed(6)} (≈₩${((totalCost / successCount) * 1300).toFixed(2)}) / 채널`);
          }
          sendLog('');
          sendLog('✨ 테스트가 완료되었습니다!');

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (error: any) {
          sendLog(`❌ 테스트 중 오류 발생: ${error.message}`);
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Failed to start streaming test:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start test' },
      { status: 500 }
    );
  }
}
