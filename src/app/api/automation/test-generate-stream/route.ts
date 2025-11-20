import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAutomationSettings, getDefaultModelByType } from '@/lib/automation';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { generateTitlesWithClaude, generateTitlesWithChatGPT, generateTitlesWithGemini } from '@/lib/ai-title-generation';

interface ChannelSetting {
  channel_id: string;
  channel_name: string;
  categories: string;
}

// 규칙 기반 제목 점수 평가 (80점+ 고품질 기준)
function evaluateTitleWithRules(title: string, category: string): number {
  let score = 0;

  // 1. 제목 길이 평가 (40-60자가 최적, 짧으면 감점)
  const length = title.length;
  if (length >= 40 && length <= 60) {
    score += 25;
  } else if (length >= 30 && length < 40) {
    score += 15;
  } else if (length >= 20 && length < 30) {
    score += 8;
  } else if (length < 20) {
    score += 0; // 너무 짧으면 점수 없음
  } else if (length > 60 && length <= 70) {
    score += 15;
  } else {
    score += 5;
  }

  // 2. 명확한 주어 패턴 (고득점 필수)
  const subjectPatterns = [
    '무시당했던', '차별받던', '배신당한', '왕따 당했던',
    '내쫓았던', '괴롭혔던', '무능력자 취급받던',
    '탈북', '북한 출신', '평생'
  ];
  let hasSubject = false;
  for (const pattern of subjectPatterns) {
    if (title.includes(pattern)) {
      hasSubject = true;
      score += 15;
      break;
    }
  }

  // 3. 구체적 숫자/시간 (필수 요소)
  const timePatterns = [
    /\d+년/, /\d+개월/, /\d+일/,
    /\d+년 ?후/, /\d+년 ?만에/, /\d+년간/
  ];
  let hasTime = false;
  for (const pattern of timePatterns) {
    if (pattern.test(title)) {
      hasTime = true;
      score += 15;
      break;
    }
  }

  // 4. 과거→현재 대비 구조
  const contrastWords = ['되어', '된', '가 되', '로 성공한', '에서'];
  let hasContrast = false;
  for (const word of contrastWords) {
    if (title.includes(word)) {
      hasContrast = true;
      score += 10;
      break;
    }
  }

  // 5. 강한 훅 키워드 (호기심 유발)
  const hookKeywords = ['이유', '진실', '비밀', '반전', '방법', '비결', '순간'];
  let hasHook = false;
  for (const keyword of hookKeywords) {
    if (title.includes(keyword)) {
      hasHook = true;
      score += 12;
      break;
    }
  }

  // 6. 감정 키워드 평가 (강화)
  const emotionalKeywords = [
    '통쾌한', '눈물겨운', '충격적', '처절한', '놀라운',
    '후회', '복수', '반전', '충격', '감동',
    '배신', '성공', '귀환', '당당', '끝판왕'
  ];
  let emotionalCount = 0;
  for (const keyword of emotionalKeywords) {
    if (title.includes(keyword)) {
      emotionalCount++;
    }
  }
  score += Math.min(emotionalCount * 4, 12);

  // 7. 카테고리 관련 키워드 평가
  const categoryKeywords: Record<string, string[]> = {
    '시니어사연': ['시어머니', '며느리', '고부갈등', '시댁', '양로원'],
    '복수극': ['복수', '무시', 'CEO', '귀환', '배신자', '신입', '청소부', '판사'],
    '탈북자사연': ['탈북', '북한', '남한', '자유', '대한민국', '변호사', '유튜버'],
    '막장드라마': ['출생', '비밀', '재벌', '배다른', '친자확인', '재산'],
  };

  const keywords = categoryKeywords[category] || [];
  let categoryCount = 0;
  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      categoryCount++;
    }
  }
  score += Math.min(categoryCount * 4, 8);

  // 8. 문장 구조 평가 (쉼표 1-2개)
  const hasComma = (title.match(/,/g) || []).length;
  if (hasComma >= 1 && hasComma <= 2) {
    score += 3;
  }

  // 보너스: 모든 핵심 요소 충족 시
  if (hasSubject && hasTime && hasContrast && hasHook) {
    score += 10; // 완벽한 구조 보너스
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

            // 상품 카테고리는 쿠팡 베스트셀러에서만 가져오기 (상품관리 목록 사용 안 함)
            if (category === '상품') {
              try {
                sendLog(`🛍️ 쿠팡 베스트셀러에서 테스트 상품 조회 중...`);

                // 쿠팡 API 설정 로드
                const DATA_DIR = path.join(process.cwd(), 'data');
                const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');
                const settingsData = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
                const coupangApiSettings = JSON.parse(settingsData);
                const coupangSettings = coupangApiSettings[user.userId];

                if (!coupangSettings || !coupangSettings.accessKey || !coupangSettings.secretKey) {
                  throw new Error('쿠팡 API 설정이 없습니다');
                }

                // 쿠팡 베스트셀러 API 직접 호출
                const REQUEST_METHOD = 'GET';
                const API_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1001';

                // HMAC 서명 생성
                const now = new Date();
                const year = String(now.getUTCFullYear()).slice(-2);
                const month = String(now.getUTCMonth() + 1).padStart(2, '0');
                const day = String(now.getUTCDate()).padStart(2, '0');
                const hours = String(now.getUTCHours()).padStart(2, '0');
                const minutes = String(now.getUTCMinutes()).padStart(2, '0');
                const seconds = String(now.getUTCSeconds()).padStart(2, '0');
                const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
                const message = datetime + REQUEST_METHOD + API_PATH;
                const signature = crypto.createHmac('sha256', coupangSettings.secretKey).update(message).digest('hex');
                const authorization = `CEA algorithm=HmacSHA256, access-key=${coupangSettings.accessKey}, signed-date=${datetime}, signature=${signature}`;

                const response = await fetch(`https://api-gateway.coupang.com${API_PATH}`, {
                  method: REQUEST_METHOD,
                  headers: {
                    'Authorization': authorization,
                    'Content-Type': 'application/json'
                  }
                });

                if (!response.ok) {
                  throw new Error(`쿠팡 API 오류: ${response.status}`);
                }

                const data = await response.json();
                if (data.rCode !== '0' || !data.data || data.data.length === 0) {
                  throw new Error('베스트셀러 데이터가 비어있습니다');
                }

                const bestProduct = data.data[0];
                sendLog(`✅ 쿠팡 베스트셀러에서 상품 발견: ${bestProduct.productName}`);

                // 베스트셀러 API에서 반환한 상품 URL에서 상품 ID 추출
                sendLog(`🔗 딥링크 생성 중...`);
                let productIdFromUrl = '';
                const productUrlMatch = bestProduct.productUrl?.match(/\/vp\/products\/(\d+)/);
                if (productUrlMatch) {
                  productIdFromUrl = productUrlMatch[1];
                }

                // 상품 ID가 없으면 API 응답에서 직접 가져오기
                const productIdToUse = productIdFromUrl || bestProduct.productId;

                // 표준 쿠팡 상품 URL 생성 (딥링크 API용)
                const standardProductUrl = `https://www.coupang.com/vp/products/${productIdToUse}`;

                // 딥링크 생성
                const deeplinkPath = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
                const deeplinkNow = new Date();
                const deeplinkYear = String(deeplinkNow.getUTCFullYear()).slice(-2);
                const deeplinkMonth = String(deeplinkNow.getUTCMonth() + 1).padStart(2, '0');
                const deeplinkDay = String(deeplinkNow.getUTCDate()).padStart(2, '0');
                const deeplinkHours = String(deeplinkNow.getUTCHours()).padStart(2, '0');
                const deeplinkMinutes = String(deeplinkNow.getUTCMinutes()).padStart(2, '0');
                const deeplinkSeconds = String(deeplinkNow.getUTCSeconds()).padStart(2, '0');
                const deeplinkDatetime = `${deeplinkYear}${deeplinkMonth}${deeplinkDay}T${deeplinkHours}${deeplinkMinutes}${deeplinkSeconds}Z`;
                const deeplinkMessage = deeplinkDatetime + 'POST' + deeplinkPath;
                const deeplinkSignature = crypto.createHmac('sha256', coupangSettings.secretKey).update(deeplinkMessage).digest('hex');
                const deeplinkAuthorization = `CEA algorithm=HmacSHA256, access-key=${coupangSettings.accessKey}, signed-date=${deeplinkDatetime}, signature=${deeplinkSignature}`;

                const deeplinkResponse = await fetch('https://api-gateway.coupang.com' + deeplinkPath, {
                  method: 'POST',
                  headers: {
                    'Authorization': deeplinkAuthorization,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    coupangUrls: [standardProductUrl]
                  })
                });

                let deepLink = bestProduct.productUrl; // 실패 시 원본 URL 사용
                if (deeplinkResponse.ok) {
                  const deeplinkData = await deeplinkResponse.json();
                  if (deeplinkData.rCode === '0' && deeplinkData.data && deeplinkData.data[0]?.shortenUrl) {
                    deepLink = deeplinkData.data[0].shortenUrl;
                    sendLog(`✅ 딥링크 생성 완료: ${deepLink}`);
                  } else {
                    console.error('❌ 딥링크 API 응답 오류:', deeplinkData);
                    sendLog(`❌ 딥링크 생성 실패: ${deeplinkData.rMessage || deeplinkData.message || '알 수 없음'}`);
                    throw new Error(`딥링크 생성 실패: ${deeplinkData.rMessage || '알 수 없음'}`);
                  }
                } else {
                  const errorText = await deeplinkResponse.text();
                  console.error('❌ 딥링크 API HTTP 오류:', deeplinkResponse.status, errorText);
                  sendLog(`❌ 딥링크 API 오류: ${deeplinkResponse.status} - ${errorText}`);
                  throw new Error(`딥링크 API 호출 실패 (${deeplinkResponse.status}): ${errorText}`);
                }

                const product = {
                  id: `temp_${Date.now()}`,
                  title: bestProduct.productName,
                  deep_link: deepLink,
                  product_url: bestProduct.productUrl,
                  discount_price: bestProduct.productPrice,
                  original_price: bestProduct.productPrice,
                  image_url: bestProduct.productImage,
                  category: bestProduct.categoryName || '기타'
                };

                sendLog(`✅ 상품 발견: ${product.title}`);
                sendLog(`   🔗 딥링크: ${product.deep_link}`);
                sendLog(`   💰 가격: ${product.discount_price ? product.discount_price.toLocaleString() : 'N/A'}원`);

                // video_titles 테이블에 저장
                const dbForInsert = new Database(dbPath);
                const titleId = `title_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                const productData = JSON.stringify({
                  productId: product.id,
                  productName: product.title,
                  productPrice: product.discount_price || product.original_price,
                  productImage: product.image_url,
                  productUrl: product.product_url,
                  deepLink: product.deep_link,
                  category: product.category
                });

                dbForInsert.prepare(`
                  INSERT INTO video_titles (
                    id, user_id, title, category, type, status,
                    channel, product_url, product_data, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                `).run(
                  titleId,
                  user.userId,
                  product.title,
                  category,
                  'product',
                  'pending',
                  setting.channel_id,
                  product.deep_link,
                  productData
                );

                // Step 3: 내 목록(coupang_products)에 상품 추가
                sendLog(`📝 Step 3: 내 목록에 상품 추가 중...`);
                try {
                  const coupangProductId = `coupang_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                  dbForInsert.prepare(`
                    INSERT INTO coupang_products (
                      id, user_id, product_url, deep_link, title, category,
                      image_url, original_price, discount_price, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                  `).run(
                    coupangProductId,
                    user.userId,
                    bestProduct.productUrl,
                    product.deep_link,
                    product.title,
                    category,
                    product.image_url,
                    product.original_price,
                    product.discount_price,
                    'active'
                  );
                  sendLog(`✅ 내 목록 등록 완료! (coupang_products에 저장)`);
                } catch (error: any) {
                  console.error('❌ 내 목록 저장 실패:', error);
                  sendLog(`⚠️ 내 목록 저장 실패: ${error.message} (계속 진행)`);
                }

                dbForInsert.close();

                sendLog(`💾 상품 등록 완료! (video_titles에 저장)`);
                sendLog(`   💰 비용: $0.000000 (≈₩0.00) - 쿠팡 베스트셀러 API 사용`);
                sendLog('');
                sendLog(`✨ 최종 선택된 제목:`);
                sendLog(`   💡 "${product.title}"`);
                sendLog(`   🎯 점수: N/A (상품은 실제 쿠팡 제목 사용)`);

                successCount++;
              } catch (error: any) {
                sendLog(`❌ 상품 조회 실패: ${error.message}`);
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
