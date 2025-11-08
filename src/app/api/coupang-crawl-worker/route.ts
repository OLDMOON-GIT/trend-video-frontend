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

      // 5. 카테고리 설정 (AI 비활성화 - 크레딧 부족)
      const category = queueItem.custom_category || '기타';
      console.log(`✅ 카테고리: ${category} ${queueItem.custom_category ? '(사용자 지정)' : '(기본값)'}`);

      // 6. 상세 설명 (AI 비활성화 - 원본 설명 사용)
      const detailedDescription = productInfo.description || '상품 설명이 없습니다.';
      console.log(`✅ 상세 설명: ${detailedDescription.length}자 (원본 사용)`);

      // 7. 큐 상태를 done으로 변경
      console.log('💾 큐 상태 업데이트 중...');
      db.prepare(`
        UPDATE coupang_crawl_queue
        SET
          status = 'done',
          product_info = ?,
          processed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(productInfo), queueItem.id);
      console.log('✅ 큐 상태 업데이트 완료');

      // 8. destination에 따라 다른 테이블에 저장
      const destination = queueItem.destination || 'my_list';
      const productId = uuidv4();

      if (destination === 'pending_list') {
        // 대기 목록 (crawled_product_links)에 저장
        console.log('💾 대기 목록에 저장 중...');
        db.prepare(`
          INSERT INTO crawled_product_links (
            id, user_id, product_url, source_url, title, description,
            category, image_url, original_price, discount_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          productId,
          queueItem.user_id,
          queueItem.product_url,
          queueItem.source_url || queueItem.product_url,
          productInfo.title,
          detailedDescription,
          category,
          productInfo.imageUrl,
          productInfo.originalPrice || null,
          productInfo.discountPrice || null
        );
        console.log(`✅ 대기 목록에 저장 완료: ${productId}`);
      } else {
        // 내 목록 (coupang_products)에 저장
        console.log('💾 내 목록에 저장 중...');
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
        console.log(`✅ 내 목록에 저장 완료: ${productId}`);
      }

      // 9. 다음 항목이 있는지 확인
      const hasMore = db.prepare(`
        SELECT COUNT(*) as count FROM coupang_crawl_queue
        WHERE status = 'pending'
      `).get() as any;

      console.log(`📊 처리 완료! 대기 중인 항목: ${hasMore.count}개`);

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
 * HTML head에서 meta 태그 추출
 */
function extractMetaTag(html: string, property: string): string | null {
  // og: 태그
  const ogPattern = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
  let match = html.match(ogPattern);
  if (match) return match[1];

  // content가 먼저 오는 경우
  const ogPattern2 = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`, 'i');
  match = html.match(ogPattern2);
  if (match) return match[1];

  // name 태그
  const namePattern = new RegExp(`<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
  match = html.match(namePattern);
  if (match) return match[1];

  // content가 먼저 오는 경우
  const namePattern2 = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${property}["']`, 'i');
  match = html.match(namePattern2);
  if (match) return match[1];

  return null;
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&quot;/g, '"')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&nbsp;/g, ' ')
             .replace(/&#39;/g, "'")
             .replace(/&apos;/g, "'");
}

/**
 * JSON-LD structured data에서 정보 추출
 */
function extractFromJsonLd(html: string): {
  title?: string;
  description?: string;
  imageUrl?: string;
  price?: number;
} {
  const result: any = {};

  try {
    // JSON-LD 스크립트 찾기
    const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const matches = html.matchAll(jsonLdPattern);

    for (const match of matches) {
      try {
        const jsonData = JSON.parse(match[1]);

        // Product 타입 찾기
        if (jsonData['@type'] === 'Product' || (Array.isArray(jsonData['@graph']) && jsonData['@graph'].some((item: any) => item['@type'] === 'Product'))) {
          const product = jsonData['@type'] === 'Product' ? jsonData : jsonData['@graph'].find((item: any) => item['@type'] === 'Product');

          if (product.name) result.title = product.name;
          if (product.description) result.description = product.description;
          if (product.image) {
            result.imageUrl = Array.isArray(product.image) ? product.image[0] : product.image;
          }

          // 가격 정보
          if (product.offers) {
            const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
            if (offers.price) {
              result.price = parseFloat(offers.price);
            } else if (offers.lowPrice) {
              result.price = parseFloat(offers.lowPrice);
            }
          }
        }
      } catch (e) {
        // 개별 JSON 파싱 실패는 무시
      }
    }
  } catch (error) {
    console.log('⚠️ JSON-LD 파싱 실패');
  }

  return result;
}

/**
 * body 콘텐츠에서 상품 정보 추출 (meta 태그 실패 시 fallback)
 */
function extractFromBody(html: string): {
  title?: string;
  imageUrl?: string;
  price?: number;
  description?: string;
} {
  const result: any = {};

  // 상품명: 쿠팡 특화 + 일반 패턴
  const titlePatterns = [
    // 쿠팡 특화
    /class=["']prod-buy-header__title["'][^>]*>([^<]+)</i,
    /class=["']prod-buy-header__name["'][^>]*>([^<]+)</i,
    /class=["']product-title["'][^>]*>([^<]+)</i,
    /class=["']prod_title["'][^>]*>([^<]+)</i,
    // 일반 패턴
    /class=["'][^"']*product[_-]?name[^"']*["'][^>]*>([^<]+)</i,
    /class=["'][^"']*product[_-]?title[^"']*["'][^>]*>([^<]+)</i,
    /<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)</i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /id=["']productTitle["'][^>]*>([^<]+)</i,
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.title = match[1].trim();
      console.log('✅ Body에서 상품명 추출:', result.title.substring(0, 50));
      break;
    }
  }

  // 이미지: 쿠팡 특화 + 일반 패턴
  const imagePatterns = [
    // 쿠팡 특화
    /class=["']prod-image__detail["'][^>]*src=["']([^"']+)["']/i,
    /class=["']prod-image__main["'][^>]*src=["']([^"']+)["']/i,
    // 일반 패턴
    /class=["'][^"']*product[_-]?image[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /class=["'][^"']*main[_-]?image[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /data-src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
    /id=["']productImage["'][^>]*src=["']([^"']+)["']/i,
  ];

  for (const pattern of imagePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.imageUrl = match[1].trim();
      console.log('✅ Body에서 이미지 추출:', result.imageUrl.substring(0, 50));
      break;
    }
  }

  // 가격: 쿠팡 특화 + 일반 패턴
  const pricePatterns = [
    // 쿠팡 특화
    /class=["']total-price["'][^>]*>[\s\S]*?<strong[^>]*>(\d{1,3}(?:,\d{3})*)/i,
    /class=["']prod-sale-price["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
    /class=["']prod-price["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
    // 일반 패턴
    /class=["'][^"']*total[_-]?price[^"']*["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
    /class=["'][^"']*sale[_-]?price[^"']*["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
    /class=["'][^"']*product[_-]?price[^"']*["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
    /id=["']priceblock_dealprice["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const priceStr = match[1].replace(/,/g, '');
      const price = parseInt(priceStr);
      if (!isNaN(price) && price > 0) {
        result.price = price;
        console.log('✅ Body에서 가격 추출:', result.price);
        break;
      }
    }
  }

  // 설명: 쿠팡 특화 + 일반 패턴
  const descPatterns = [
    /class=["']prod-description["'][^>]*>([^<]+)</i,
    /class=["']product-description["'][^>]*>([^<]+)</i,
    /class=["'][^"']*description[^"']*["'][^>]*>([^<]+)</i,
    /id=["']productDescription["'][^>]*>([^<]+)</i,
  ];

  for (const pattern of descPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.description = match[1].trim();
      console.log('✅ Body에서 설명 추출:', result.description.substring(0, 50));
      break;
    }
  }

  return result;
}

/**
 * HTML head 파싱 방식의 빠른 크롤링
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
  console.log(`🔍 HTML 크롤링 시작: ${productUrl}`);

  const startTime = Date.now();

  try {
    // 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    console.log('📡 HTML 가져오는 중 (리다이렉트 자동 추적)...');

    // 실제 브라우저처럼 보이기 위한 헤더
    const response = await fetch(productUrl, {
      signal: controller.signal,
      redirect: 'follow',  // 리다이렉트 자동 추적
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Referer': 'https://www.coupang.com/',
      }
    });

    clearTimeout(timeoutId);
    const fetchTime = Date.now() - startTime;
    const finalUrl = response.url;
    console.log(`✅ HTML 다운로드 완료 (${fetchTime}ms)`);
    console.log(`🔗 최종 URL: ${finalUrl}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 HTML 크기: ${html.length.toLocaleString()} bytes`);

    // HTML이 너무 작으면 에러 (봇 차단 가능성)
    if (html.length < 1000) {
      console.error('❌ HTML 크기가 너무 작음 (봇 차단 가능성)');
      console.log('받은 HTML 일부:', html.substring(0, 500));
      throw new Error('HTML 크기가 너무 작습니다. 봇 차단되었을 수 있습니다.');
    }

    // Cloudflare 차단 확인
    if (html.includes('Checking your browser') || html.includes('Just a moment')) {
      console.error('❌ Cloudflare 봇 차단 감지');
      throw new Error('Cloudflare 봇 차단이 감지되었습니다.');
    }

    // head 부분만 추출 (효율성)
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headHtml = headMatch ? headMatch[1] : html;
    console.log(`📄 HEAD 크기: ${headHtml.length.toLocaleString()} bytes`);

    // 디버깅: 어떤 meta 태그들이 있는지 확인
    const metaTagCount = (headHtml.match(/<meta/gi) || []).length;
    console.log(`🔍 발견된 meta 태그 개수: ${metaTagCount}개`);

    // title 태그 추출
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : '';

    // 상품명 추출 (여러 방법 시도)
    console.log('📝 상품명 추출 중...');
    let title = extractMetaTag(headHtml, 'og:title')
                || extractMetaTag(headHtml, 'twitter:title')
                || extractMetaTag(headHtml, 'title')
                || pageTitle.split('|')[0].split('-')[0].trim()
                || '';

    // HTML 엔티티 디코딩
    if (title) {
      title = decodeHtmlEntities(title);
    }

    console.log(`${title ? '✅' : '⚠️'} 상품명 (meta): ${title ? title.substring(0, 80) + (title.length > 80 ? '...' : '') : '없음'}`);

    // 썸네일 추출 (여러 방법 시도)
    console.log('🖼️ 썸네일 추출 중...');
    let imageUrl = extractMetaTag(headHtml, 'og:image')
                   || extractMetaTag(headHtml, 'og:image:secure_url')
                   || extractMetaTag(headHtml, 'twitter:image')
                   || extractMetaTag(headHtml, 'twitter:image:src')
                   || '';

    // 상대 URL을 절대 URL로 변환
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = new URL(imageUrl, finalUrl).href;
    }

    console.log(`${imageUrl ? '✅' : '⚠️'} 썸네일 (meta): ${imageUrl ? imageUrl.substring(0, 80) + '...' : '없음'}`);

    // 설명 추출 (여러 방법 시도)
    console.log('📄 상세 설명 추출 중...');
    let description = extractMetaTag(headHtml, 'og:description')
                      || extractMetaTag(headHtml, 'twitter:description')
                      || extractMetaTag(headHtml, 'description')
                      || '';

    // HTML 엔티티 디코딩
    if (description) {
      description = decodeHtmlEntities(description);
    }

    // 설명 길이 제한 (200자)
    if (description.length > 200) {
      description = description.substring(0, 200);
    }

    console.log(`${description ? '✅' : '⚠️'} 설명 (meta): ${description ? description.substring(0, 80) + (description.length > 80 ? '...' : '') : '없음'}`);

    // 가격 시도 (product:price, og:price 등)
    console.log('💰 가격 추출 시도 중...');
    const priceStr = extractMetaTag(headHtml, 'product:price:amount')
                     || extractMetaTag(headHtml, 'og:price:amount')
                     || extractMetaTag(headHtml, 'product:sale_price')
                     || null;

    let discountPrice: number | undefined;
    if (priceStr) {
      const parsed = parseInt(priceStr.replace(/[^0-9]/g, ''));
      if (!isNaN(parsed)) {
        discountPrice = parsed;
        console.log(`✅ 가격 (meta): ${discountPrice.toLocaleString()}원`);
      }
    } else {
      console.log('⚠️ 가격 (meta): 추출 불가');
    }

    // Fallback 1: JSON-LD structured data 시도
    console.log('🔍 JSON-LD structured data 추출 시도...');
    const jsonLdData = extractFromJsonLd(html);

    if (!title && jsonLdData.title) {
      title = decodeHtmlEntities(jsonLdData.title);
      console.log(`✅ 상품명 (JSON-LD): ${title.substring(0, 80)}${title.length > 80 ? '...' : ''}`);
    }

    if (!imageUrl && jsonLdData.imageUrl) {
      imageUrl = jsonLdData.imageUrl;
      if (!imageUrl.startsWith('http')) {
        imageUrl = new URL(imageUrl, finalUrl).href;
      }
      console.log(`✅ 썸네일 (JSON-LD): ${imageUrl.substring(0, 80)}...`);
    }

    if (!description && jsonLdData.description) {
      description = decodeHtmlEntities(jsonLdData.description);
      if (description.length > 200) {
        description = description.substring(0, 200);
      }
      console.log(`✅ 설명 (JSON-LD): ${description.substring(0, 80)}...`);
    }

    if (!discountPrice && jsonLdData.price) {
      discountPrice = jsonLdData.price;
      console.log(`✅ 가격 (JSON-LD): ${discountPrice.toLocaleString()}원`);
    }

    // Fallback 2: body 콘텐츠에서 추출 시도
    if (!title || !imageUrl || !description) {
      console.log('🔄 body 콘텐츠에서 fallback 추출 시도...');
      const bodyData = extractFromBody(html);

      if (!title && bodyData.title) {
        title = decodeHtmlEntities(bodyData.title);
        console.log(`✅ 상품명 (body fallback): ${title.substring(0, 80)}${title.length > 80 ? '...' : ''}`);
      }

      if (!imageUrl && bodyData.imageUrl) {
        imageUrl = bodyData.imageUrl;
        if (!imageUrl.startsWith('http')) {
          imageUrl = new URL(imageUrl, finalUrl).href;
        }
        console.log(`✅ 썸네일 (body fallback): ${imageUrl.substring(0, 80)}...`);
      }

      if (!description && bodyData.description) {
        description = decodeHtmlEntities(bodyData.description);
        if (description.length > 200) {
          description = description.substring(0, 200);
        }
        console.log(`✅ 설명 (body fallback): ${description.substring(0, 80)}...`);
      }

      if (!discountPrice && bodyData.price) {
        discountPrice = bodyData.price;
        console.log(`✅ 가격 (body fallback): ${discountPrice.toLocaleString()}원`);
      }
    }

    // 최종 검증
    if (!title) {
      title = '상품명';
      console.log('⚠️ 상품명을 추출할 수 없어 기본값 사용');
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ 크롤링 완료 (총 ${totalTime}ms)`);
    console.log('📊 추출 요약:');
    console.log(`  - 상품명: ${title && title !== '상품명' ? 'O' : 'X'}`);
    console.log(`  - 썸네일: ${imageUrl ? 'O' : 'X'}`);
    console.log(`  - 설명: ${description ? 'O' : 'X'}`);
    console.log(`  - 가격: ${discountPrice ? 'O' : 'X'}`);

    return {
      title,
      description,
      imageUrl,
      originalPrice: undefined,
      discountPrice
    };

  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    console.error('❌ 크롤링 실패:', error?.message);
    console.error(`   소요 시간: ${totalTime}ms`);
    console.error(`   에러 타입: ${error?.name || 'Unknown'}`);
    console.error(`   URL: ${productUrl}`);

    if (error.name === 'AbortError') {
      throw new Error(`크롤링 타임아웃 (${timeoutSeconds}초 초과)`);
    }

    if (error.message.includes('봇 차단')) {
      throw new Error('봇 차단으로 인해 크롤링 실패. Puppeteer 크롤러가 필요할 수 있습니다.');
    }

    // 네트워크 에러
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('네트워크 연결 실패. URL을 확인해주세요.');
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
    console.log('⚠️ ANTHROPIC_API_KEY 없음, 기본 카테고리 사용');
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

    if (!response.ok) {
      console.error(`❌ AI API 에러 (${response.status}):`, await response.text());
      return '기타';
    }

    const data = await response.json();

    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      console.error('❌ AI 응답 구조 이상:', JSON.stringify(data));
      return '기타';
    }

    const category = data.content[0].text.trim();
    return category || '기타';
  } catch (error: any) {
    console.error('❌ AI 카테고리 분류 실패:', error?.message);
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
    console.log('⚠️ ANTHROPIC_API_KEY 없음, 기본 설명 사용');
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

    if (!response.ok) {
      console.error(`❌ AI API 에러 (${response.status}):`, await response.text());
      return productInfo.description;
    }

    const data = await response.json();

    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      console.error('❌ AI 응답 구조 이상:', JSON.stringify(data));
      return productInfo.description;
    }

    return data.content[0].text.trim();
  } catch (error: any) {
    console.error('❌ AI 설명 생성 실패:', error?.message);
    return productInfo.description;
  }
}
