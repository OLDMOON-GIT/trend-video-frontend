import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { v4 as uuidv4 } from 'uuid';

/**
 * 쿠팡 상품 관리 API
 *
 * GET: 상품 목록 조회
 * POST: 새 상품 추가 (자동 크롤링 + AI 분류)
 */

// 상품 목록 조회 (큐 상태 포함)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = `
      SELECT
        p.*,
        q.status as queue_status,
        q.retry_count as queue_retry_count,
        q.error_message as queue_error
      FROM coupang_products p
      LEFT JOIN coupang_crawl_queue q ON p.queue_id = q.id
      WHERE p.user_id = ? AND p.status != 'deleted'
    `;
    const params: any[] = [user.userId];

    if (category) {
      query += ` AND p.category = ?`;
      params.push(category);
    }

    query += ` ORDER BY p.created_at DESC`;

    const products = db.prepare(query).all(...params);

    return NextResponse.json({
      products,
      total: products.length
    });

  } catch (error: any) {
    console.error('❌ 상품 조회 오류:', error);
    return NextResponse.json(
      { error: error?.message || '상품 조회 실패' },
      { status: 500 }
    );
  }
}

// 새 상품 추가 (큐에 등록)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { productUrl, customCategory } = body;

    if (!productUrl) {
      return NextResponse.json(
        { error: '상품 URL을 입력해주세요.' },
        { status: 400 }
      );
    }

    console.log('🚀 쿠팡 상품 크롤링 큐에 추가:', productUrl);

    // 크롤링 큐에 추가
    const queueId = uuidv4();
    db.prepare(`
      INSERT INTO coupang_crawl_queue (
        id, user_id, product_url, status, retry_count, max_retries,
        timeout_seconds, custom_category
      ) VALUES (?, ?, ?, 'pending', 0, 3, 60, ?)
    `).run(queueId, user.userId, productUrl, customCategory || null);

    console.log('✅ 큐에 추가 완료:', queueId);

    // 즉시 Worker 호출하여 처리 시작 (백그라운드)
    fetch(`${request.nextUrl.origin}/api/coupang-crawl-worker`, {
      method: 'GET'
    }).catch(err => {
      console.error('Worker 호출 실패:', err);
    });

    return NextResponse.json({
      success: true,
      queueId,
      message: '상품이 크롤링 큐에 추가되었습니다. 잠시 후 처리됩니다.'
    });

  } catch (error: any) {
    console.error('❌ 큐 추가 오류:', error);
    return NextResponse.json(
      {
        error: error?.message || '큐 추가 실패',
        details: error?.stack
      },
      { status: 500 }
    );
  }
}

/**
 * 쿠팡 상품 페이지 크롤링
 */
async function scrapeProductInfo(productUrl: string): Promise<{
  title: string;
  description: string;
  imageUrl: string;
  originalPrice?: number;
  discountPrice?: number;
}> {
  console.log('🔍 상품 정보 크롤링 시작:', productUrl);

  try {
    // timeout을 60초로 설정 (쿠팡 파트너스 링크는 리다이렉트가 많아 느림)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('⏰ 60초 타임아웃 발생, 크롤링 중단');
      controller.abort();
    }, 60000);

    console.log('📡 Fetch 요청 시작...');
    const fetchStartTime = Date.now();

    const response = await fetch(productUrl, {
      signal: controller.signal,
      redirect: 'follow', // 리다이렉트 자동 따라가기
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
      throw new Error('크롤링 타임아웃 (60초 초과) - 쿠팡 서버 응답이 느립니다. 잠시 후 다시 시도해주세요.');
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
