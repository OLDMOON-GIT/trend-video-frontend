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

// 규칙 기반 제목 점수 평가
function evaluateTitleWithRules(title: string, category: string): number {
  let score = 0;

  // 1. 제목 길이 평가 (20-60자가 최적)
  const length = title.length;
  if (length >= 20 && length <= 60) {
    score += 30;
  } else if (length >= 15 && length < 20) {
    score += 20;
  } else if (length > 60 && length <= 80) {
    score += 20;
  } else if (length < 15) {
    score += 5;
  } else {
    score += 10;
  }

  // 2. 특수문자 평가 (호기심 유발)
  const hasQuestion = title.includes('?');
  const hasExclamation = title.includes('!');
  const hasEllipsis = title.includes('...');
  const hasQuotes = title.includes('"') || title.includes("'");

  if (hasQuestion) score += 10;
  if (hasExclamation) score += 8;
  if (hasEllipsis) score += 5;
  if (hasQuotes) score += 5;

  // 3. 감정 키워드 평가
  const emotionalKeywords = [
    '후회', '복수', '반전', '충격', '눈물', '감동',
    '배신', '비밀', '진실', '최후', '귀환', '성공',
    '통쾌', '화려', '무릎', '외면', '당당', '전설',
    '알고보니', '결국', '드디어', '끝판왕', '최고'
  ];

  let emotionalCount = 0;
  for (const keyword of emotionalKeywords) {
    if (title.includes(keyword)) {
      emotionalCount++;
    }
  }
  score += Math.min(emotionalCount * 5, 20);

  // 4. 숫자 포함 여부 (구체성)
  if (/\d+/.test(title)) {
    score += 8;
  }

  // 5. 카테고리 관련 키워드 평가
  const categoryKeywords: Record<string, string[]> = {
    '시니어사연': ['시어머니', '며느리', '고부갈등', '시댁', '양로원'],
    '복수극': ['복수', '무시', 'CEO', '귀환', '배신자', '신입'],
    '탈북자사연': ['탈북', '북한', '남한', '자유', '대한민국'],
    '막장드라마': ['출생', '비밀', '재벌', '배다른', '친자확인'],
  };

  const keywords = categoryKeywords[category] || [];
  let categoryCount = 0;
  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      categoryCount++;
    }
  }
  score += Math.min(categoryCount * 7, 15);

  // 6. 문장 구조 평가
  const hasComma = (title.match(/,/g) || []).length;
  if (hasComma >= 1 && hasComma <= 2) {
    score += 7;
  }

  return Math.min(100, Math.max(0, score));
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
            claude: { input: 1, output: 5 }, // Claude 3.5 Haiku
            chatgpt: { input: 2.5, output: 10 }, // GPT-4o
            gemini: { input: 0.075, output: 0.3 } // Gemini 2.0 Flash
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

            // 상품 카테고리는 쿠팡 API 사용
            if (category === '상품') {
              try {
                sendLog(`🛍️ 쿠팡 베스트셀러 상품 조회 중...`);
                const { createCoupangClient } = await import('@/lib/coupang-client');
                const coupangClient = createCoupangClient();

                // 베스트 상품 1개 가져오기 (카테고리 1001 = 가전디지털)
                const bestProducts = await coupangClient.getBestProducts(1001, 1);
                if (!bestProducts || bestProducts.length === 0) {
                  throw new Error('쿠팡 베스트셀러 조회 결과가 없습니다');
                }

                const product = bestProducts[0];
                sendLog(`✅ 상품 발견: ${product.productName}`);

                // 딥링크 생성
                sendLog(`🔗 제휴 딥링크 생성 중...`);
                const deepLink = await coupangClient.generateDeepLink(product.productUrl);
                sendLog(`✅ 딥링크 생성 완료`);

                // DB에 저장
                const dbForInsert = new Database(dbPath);
                const titleId = `title_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                const productData = JSON.stringify({
                  productName: product.productName,
                  productPrice: product.productPrice,
                  productImage: product.productImage,
                  productUrl: product.productUrl,
                  deepLink
                });

                dbForInsert.prepare(`
                  INSERT INTO video_titles (
                    title_id, user_id, title, category, type, status,
                    channel_id, product_url, product_data, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                `).run(
                  titleId,
                  user.userId,
                  product.productName,
                  category,
                  'product',
                  'pending',
                  setting.channel_id,
                  deepLink,
                  productData
                );
                dbForInsert.close();

                sendLog(`💾 상품 등록 완료! (DB에 저장)`);
                sendLog(`   📦 제목: ${product.productName}`);
                sendLog(`   💰 비용: $0.000000 (≈₩0.00) - 쿠팡 API 무료`);
                sendLog('');
                sendLog(`✨ 최종 선택된 제목:`);
                sendLog(`   💡 "${product.productName}"`);
                sendLog(`   🎯 점수: N/A (상품은 실제 쿠팡 제목 사용)`);

                successCount++;
              } catch (error: any) {
                sendLog(`❌ 쿠팡 상품 조회 실패: ${error.message}`);
                failedCount++;
              }
              sendLog('');
              continue;
            }

            // 일반 카테고리는 AI 모델 사용 (실제 생성 함수 호출)
            const aiModel = settings.ai_model || 'claude';
            sendLog(`🤖 AI 모델: ${aiModel}`);

            try {
              sendLog(`⏳ ${aiModel.toUpperCase()} 모델로 제목 생성 중...`);

              let titles: string[] = [];
              let inputTokens = 0;
              let outputTokens = 0;
              let cost = 0;

              // 실제 제목 생성 함수 사용 (카테고리별 예시 포함)
              if (aiModel === 'claude') {
                titles = await generateTitlesWithClaude(category, 5);
                // 토큰 수는 추정값 (실제로는 함수가 반환하지 않음)
                inputTokens = 350;
                outputTokens = 280;
                cost = (inputTokens * pricing.claude.input + outputTokens * pricing.claude.output) / 1_000_000;
              } else if (aiModel === 'chatgpt') {
                titles = await generateTitlesWithChatGPT(category, 5);
                inputTokens = 350;
                outputTokens = 280;
                cost = (inputTokens * pricing.chatgpt.input + outputTokens * pricing.chatgpt.output) / 1_000_000;
              } else if (aiModel === 'gemini') {
                titles = await generateTitlesWithGemini(category, 5);
                inputTokens = 350;
                outputTokens = 280;
                cost = (inputTokens * pricing.gemini.input + outputTokens * pricing.gemini.output) / 1_000_000;
              }

              if (titles.length > 0) {
                sendLog(`✅ 제목 생성 성공! (총 ${titles.length}개)`);
                sendLog(`   📊 토큰: 입력 ${inputTokens.toLocaleString()} / 출력 ${outputTokens.toLocaleString()}`);
                sendLog(`   💰 비용: $${cost.toFixed(6)} (≈₩${(cost * 1300).toFixed(2)})`);
                sendLog('');

                // 규칙 기반 평가
                sendLog(`📈 규칙 기반 평가 시작...`);
                const scoredTitles = titles.map((title) => ({
                  title,
                  score: evaluateTitleWithRules(title, category)
                }));

                // 점수 순으로 정렬
                scoredTitles.sort((a, b) => b.score - a.score);

                // 상위 3개 제목 표시
                sendLog(`🏆 상위 제목 순위:`);
                scoredTitles.slice(0, Math.min(3, scoredTitles.length)).forEach((item, index) => {
                  sendLog(`   ${index + 1}위. [${item.score}점] ${item.title}`);
                });

                // 최고 점수 제목 선택
                const bestTitle = scoredTitles[0];
                sendLog('');
                sendLog(`✨ 최종 선택된 제목:`);
                sendLog(`   💡 "${bestTitle.title}"`);
                sendLog(`   🎯 점수: ${bestTitle.score}점`);

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
