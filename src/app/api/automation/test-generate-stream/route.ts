import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAutomationSettings } from '@/lib/automation';
import { getAllSettings } from '@/lib/db';
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
            sendLog('⚠️ 자동 제목 생성이 비활성화되어 있습니다.');
            sendLog('');
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
            return;
          }

          // 모든 채널 설정 조회
          const allSettings = getAllSettings() as ChannelSetting[];
          sendLog(`🔍 총 ${allSettings.length}개 채널 설정을 찾았습니다.`);
          sendLog('');

          let processedCount = 0;
          let successCount = 0;
          let skippedCount = 0;
          let failedCount = 0;

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
              sendLog(`⏳ 제목 생성 중...`);

              let titles: string[] = [];
              if (aiModel === 'claude') {
                titles = await generateTitlesWithClaude(category, 1);
              } else if (aiModel === 'chatgpt') {
                titles = await generateTitlesWithChatGPT(category, 1);
              } else if (aiModel === 'gemini') {
                titles = await generateTitlesWithGemini(category, 1);
              }

              if (titles.length > 0) {
                sendLog(`✅ 제목 생성 성공!`);
                sendLog(`   💡 "${titles[0]}"`);
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
