import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';
import { v4 as uuidv4 } from 'uuid';

/**
 * 쿠팡 크롤링 Worker API
 *
 * GET: 큐에서 하나씩 처리
 * - pending 상태의 항목을 가져와서 processing으로 변경
 * - 크롤링 수행 (재시도 횟수에 따라 타임아웃 증가)
 * - 성공: done, 실패: 재시도 또는 failed
 */

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 크롤링 Worker 시작');

    // 1. pending 상태의 큐 항목 중 가장 오래된 것 하나 가져오기
    const queueItem = db.prepare(`
      SELECT * FROM coupang_crawl_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as any;

    if (!queueItem) {
      return NextResponse.json({
        message: '처리할 항목이 없습니다.',
        hasMore: false
      });
    }

    console.log('📦 큐 항목 처리 시작:', queueItem.id);

    // 2. processing 상태로 변경
    db.prepare(`
      UPDATE coupang_crawl_queue
      SET status = 'processing', updated_at = datetime('now')
      WHERE id = ?
    `).run(queueItem.id);

    // 3. 재시도 횟수에 따라 타임아웃 설정
    // 1차: 60초, 2차: 90초, 3차: 120초
    const timeouts = [60, 90, 120];
    const timeoutSeconds = timeouts[queueItem.retry_count] || 120;

    console.log(`⏱️ 타임아웃: ${timeoutSeconds}초 (재시도: ${queueItem.retry_count + 1}/${queueItem.max_retries})`);

    try {
      // 4. 크롤링 수행
      const productInfo = await scrapeProductInfo(queueItem.product_url, timeoutSeconds);
      console.log('✅ 크롤링 성공:', productInfo.title);

      // 5. AI 카테고리 분류
      const category = queueItem.custom_category || await classifyCategory(
        productInfo.title,
        productInfo.description
      );
      console.log('✅ 카테고리:', category);

      // 6. AI 상세 설명 생성
      const detailedDescription = await generateDetailedDescription(productInfo);
      console.log('✅ 상세 설명 생성 완료');

      // 7. 큐 상태를 done으로 변경
      db.prepare(`
        UPDATE coupang_crawl_queue
        SET
          status = 'done',
          product_info = ?,
          processed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(productInfo), queueItem.id);

      // 8. coupang_products 테이블에 저장
      const productId = uuidv4();
      db.prepare(`
        INSERT INTO coupang_products (
          id, user_id, queue_id, product_url, deep_link, title, description,
          category, original_price, discount_price, image_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        productId,
        queueItem.user_id,
        queueItem.id,
        queueItem.product_url,
        queueItem.product_url, // deep_link는 동일하게
        productInfo.title,
        detailedDescription,
        category,
        productInfo.originalPrice || null,
        productInfo.discountPrice || null,
        productInfo.imageUrl
      );

      console.log('✅ 상품 저장 완료:', productId);

      // 9. 다음 항목이 있는지 확인
      const hasMore = db.prepare(`
        SELECT COUNT(*) as count FROM coupang_crawl_queue
        WHERE status = 'pending'
      `).get() as any;

      return NextResponse.json({
        success: true,
        queueId: queueItem.id,
        productId,
        category,
        hasMore: hasMore.count > 0,
        message: '크롤링 성공'
      });

    } catch (error: any) {
      console.error('❌ 크롤링 실패:', error?.message);

      // 재시도 카운트 증가
      const newRetryCount = queueItem.retry_count + 1;

      if (newRetryCount >= queueItem.max_retries) {
        // 최대 재시도 횟수 초과 -> failed
        console.log('❌ 최대 재시도 횟수 초과, failed 처리');
        db.prepare(`
          UPDATE coupang_crawl_queue
          SET
            status = 'failed',
            retry_count = ?,
            error_message = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(newRetryCount, error?.message, queueItem.id);

        return NextResponse.json({
          success: false,
          queueId: queueItem.id,
          error: '최대 재시도 횟수 초과',
          message: `${queueItem.max_retries}번 재시도 후 실패`
        });
      } else {
        // 재시도 -> pending으로 되돌림
        console.log(`🔄 재시도 ${newRetryCount}/${queueItem.max_retries}`);
        db.prepare(`
          UPDATE coupang_crawl_queue
          SET
            status = 'pending',
            retry_count = ?,
            error_message = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(newRetryCount, error?.message, queueItem.id);

        return NextResponse.json({
          success: false,
          queueId: queueItem.id,
          retry: true,
          retryCount: newRetryCount,
          maxRetries: queueItem.max_retries,
          message: `재시도 예정 (${newRetryCount}/${queueItem.max_retries})`
        });
      }
    }

  } catch (error: any) {
    console.error('❌ Worker 오류:', error);
    return NextResponse.json(
      { error: error?.message || 'Worker 오류' },
      { status: 500 }
    );
  }
}

/**
 * 쿠팡 상품 페이지 크롤링
 */
async function scrapeProductInfo(
  productUrl: string,
  timeoutSeconds: number
): Promise<{
  title: string;
  description: string;
  imageUrl: string;
  originalPrice?: number;
  discountPrice?: number;
}> {
  console.log(`🔍 상품 정보 크롤링 시작: ${productUrl} (타임아웃: ${timeoutSeconds}초)`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log(`⏰ ${timeoutSeconds}초 타임아웃 발생, 크롤링 중단`);
      controller.abort();
    }, timeoutSeconds * 1000);

    console.log('📡 Fetch 요청 시작...');
    const fetchStartTime = Date.now();

    const response = await fetch(productUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    const fetchTime = Date.now() - fetchStartTime;
    clearTimeout(timeoutId);

    console.log(`📡 응답 받음 (${fetchTime}ms):`, response.status, response.url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('📄 HTML 파싱 시작...');
    const htmlStartTime = Date.now();
    const html = await response.text();
    const htmlTime = Date.now() - htmlStartTime;
    console.log(`📄 HTML 크기: ${html.length} bytes (파싱: ${htmlTime}ms)`);

    // Open Graph 태그에서 정보 추출
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

    const title = titleMatch ? titleMatch[1] : '상품명';
    const description = descMatch ? descMatch[1] : '';
    const imageUrl = imageMatch ? imageMatch[1] : '';

    console.log('✅ 크롤링 성공:', { title, hasImage: !!imageUrl });

    // 가격 추출 (선택적)
    let originalPrice: number | undefined;
    let discountPrice: number | undefined;

    const priceMatch = html.match(/data-price="(\d+)"/);
    if (priceMatch) {
      discountPrice = parseInt(priceMatch[1]);
    }

    return {
      title,
      description,
      imageUrl,
      originalPrice,
      discountPrice
    };
  } catch (error: any) {
    console.error('❌ 크롤링 실패:', error?.message);
    if (error.name === 'AbortError') {
      throw new Error(`크롤링 타임아웃 (${timeoutSeconds}초 초과)`);
    }
    throw new Error(`크롤링 실패: ${error?.message}`);
  }
}

/**
 * AI 카테고리 분류
 */
async function classifyCategory(title: string, description: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return '기타';
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `다음 상품을 카테고리로 분류해주세요. 카테고리 이름만 한글로 답변하세요.

카테고리 목록: 패션, 뷰티, 식품, 생활용품, 디지털, 가전, 스포츠, 완구, 도서, 반려동물, 자동차, 기타

상품명: ${title}
설명: ${description}

카테고리:`
        }]
      })
    });

    const data = await response.json();
    const category = data.content[0].text.trim();
    return category || '기타';
  } catch (error) {
    console.error('AI 카테고리 분류 실패:', error);
    return '기타';
  }
}

/**
 * AI 상세 설명 생성
 */
async function generateDetailedDescription(productInfo: {
  title: string;
  description: string;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return productInfo.description;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `다음 쿠팡 상품에 대한 매력적인 상품 설명을 작성해주세요. 구매를 유도하는 설득력 있는 문구로 2-3문단으로 작성하세요.

상품명: ${productInfo.title}
기본 설명: ${productInfo.description}

상품 설명:`
        }]
      })
    });

    const data = await response.json();
    return data.content[0].text.trim();
  } catch (error) {
    console.error('AI 설명 생성 실패:', error);
    return productInfo.description;
  }
}
