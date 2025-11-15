import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

async function loadUserSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

function generateCoupangSignature(method: string, path: string, secretKey: string) {
  // ISO 8601 형식의 datetime (밀리초 제외)
  const datetime = new Date().toISOString().slice(0, -5) + 'Z';

  const message = datetime + method + path;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');

  return { datetime, signature };
}

// 쿠팡 카테고리를 사용자 정의 카테고리로 매핑
function mapCategory(coupangCategory: string): string {
  if (!coupangCategory) return '기타';

  const categoryMap: Record<string, string> = {
    // 패션/의류
    '패션의류': '패션',
    '남성패션': '패션',
    '여성패션': '패션',
    '신발': '패션',
    '가방': '패션',
    '잡화': '패션',
    '시계': '패션',
    '쥬얼리': '패션',

    // 뷰티
    '뷰티': '뷰티',
    '화장품': '뷰티',
    '향수': '뷰티',
    '헤어': '뷰티',
    '바디': '뷰티',

    // 식품
    '식품': '식품',
    '건강식품': '식품',
    '신선식품': '식품',
    '음료': '식품',
    '커피': '식품',

    // 생활용품
    '생활': '생활용품',
    '주방': '생활용품',
    '욕실': '생활용품',
    '청소': '생활용품',
    '세탁': '생활용품',
    '수납': '생활용품',

    // 디지털/가전
    '가전': '가전',
    '디지털': '디지털',
    '컴퓨터': '디지털',
    '노트북': '디지털',
    '태블릿': '디지털',
    '스마트폰': '디지털',
    '카메라': '디지털',
    '게임': '디지털',

    // 스포츠/레저
    '스포츠': '스포츠',
    '운동': '스포츠',
    '자전거': '스포츠',
    '캠핑': '스포츠',
    '등산': '스포츠',

    // 완구/취미
    '완구': '완구',
    '장난감': '완구',
    '취미': '완구',
    '악기': '완구',

    // 도서
    '도서': '도서',
    '책': '도서',

    // 반려동물
    '반려동물': '반려동물',
    '애완': '반려동물',
    '펫': '반려동물',

    // 자동차
    '자동차': '자동차',
    '카': '자동차',
    '오토': '자동차'
  };

  // 부분 매칭으로 카테고리 찾기
  const lowerCategory = coupangCategory.toLowerCase();
  for (const [keyword, category] of Object.entries(categoryMap)) {
    if (lowerCategory.includes(keyword.toLowerCase())) {
      return category;
    }
  }

  return '기타';
}

function extractProductId(affiliateUrl: string): string | null {
  try {
    const url = new URL(affiliateUrl);

    // 1. pageKey 파라미터에서 추출 (affiliate 링크)
    const pageKey = url.searchParams.get('pageKey');
    if (pageKey) return pageKey;

    // 2. itemId 파라미터에서 추출
    const itemId = url.searchParams.get('itemId');
    if (itemId) return itemId;

    // 3. productId 파라미터에서 추출
    const productId = url.searchParams.get('productId');
    if (productId) return productId;

    // 4. URL 경로에서 추출 (/vp/products/{productId})
    const pathMatch = affiliateUrl.match(/\/vp\/products\/(\d+)/);
    if (pathMatch) return pathMatch[1];

    console.error('상품 ID 추출 실패, URL:', affiliateUrl);
    return null;
  } catch (error) {
    console.error('URL 파싱 실패:', error);
    return null;
  }
}

async function generateDeeplink(affiliateUrl: string, accessKey: string, secretKey: string): Promise<string> {
  // affiliate URL에서 상품 ID 추출
  const productId = extractProductId(affiliateUrl);
  if (!productId) {
    console.error('상품 ID 추출 실패:', affiliateUrl);
    return affiliateUrl;
  }

  // 일반 상품 URL 생성
  const productUrl = `https://www.coupang.com/vp/products/${productId}`;
  console.log('📦 일반 상품 URL:', productUrl);

  const REQUEST_METHOD = 'POST';
  const DOMAIN = 'https://api-gateway.coupang.com';
  const PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';

  const { datetime, signature } = generateCoupangSignature(REQUEST_METHOD, PATH, secretKey);
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  console.log('🔑 딥링크 요청:', {
    url: DOMAIN + PATH,
    productUrl,
    datetime,
    signature: signature.substring(0, 10) + '...'
  });

  try {
    const response = await fetch(DOMAIN + PATH, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        coupangUrls: [productUrl]
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('📡 딥링크 API 응답:', JSON.stringify(data, null, 2));

      if (data.rCode === '0' && data.data && data.data[0]?.shortenUrl) {
        const deeplink = data.data[0].shortenUrl;
        console.log('✅ 사용자 딥링크 생성 성공:', deeplink);
        return deeplink;
      } else {
        console.error('❌ 딥링크 API 응답 오류:', data);
        throw new Error(`딥링크 생성 실패: ${data.rMessage || '알 수 없음'}`);
      }
    } else {
      const errorText = await response.text();
      console.error('❌ 딥링크 API HTTP 오류:', response.status, errorText);
      throw new Error(`딥링크 API 호출 실패 (${response.status}): ${errorText}`);
    }
  } catch (error: any) {
    console.error('❌ 딥링크 생성 중 오류:', error);
    throw new Error(`딥링크 생성 실패: ${error.message}`);
  }
}

interface Product {
  productId: string | number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName: string;
  isRocket: boolean;
  rank?: number;
}

/**
 * POST /api/coupang/products/add
 * 베스트셀러 상품을 크롤링 없이 바로 상품관리에 등록
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();

    // 단일 상품 또는 배열 처리
    let products: Product[];
    if (body.products) {
      products = body.products;
    } else if (body.productId) {
      // 단일 상품
      products = [body as Product];
    } else {
      return NextResponse.json({ error: '상품 정보가 없습니다.' }, { status: 400 });
    }

    if (products.length === 0) {
      return NextResponse.json({ error: '상품을 선택하세요.' }, { status: 400 });
    }

    // 사용자 설정 로드 (딥링크 생성용)
    const settings = await loadUserSettings(user.userId);
    if (!settings || !settings.accessKey || !settings.secretKey) {
      return NextResponse.json({ error: 'API 키를 먼저 설정하세요.' }, { status: 400 });
    }

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    let addedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      for (const product of products) {
        try {
          // 딥링크(단축링크) 생성
          console.log('🔗 딥링크 생성 중:', product.productUrl);
          const shortUrl = await generateDeeplink(product.productUrl, settings.accessKey, settings.secretKey);
          console.log('✅ 사용자 딥링크:', shortUrl);

          // 이미 등록된 상품인지 확인 (단축링크로 중복 체크)
          const existing = db.prepare(`
            SELECT id FROM coupang_products
            WHERE deep_link = ? AND user_id = ?
          `).get(shortUrl, user.userId);

          if (existing) {
            console.log('⏭️  중복 상품:', product.productName);
            skippedCount++;
            continue;
          }

        // 고유 ID 생성
        const productId = `coupang_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

        // 카테고리 분류
        const mappedCategory = mapCategory(product.categoryName);
        console.log(`📂 카테고리: ${product.categoryName} → ${mappedCategory}`);

        // 상품 등록
        db.prepare(`
          INSERT INTO coupang_products (
            id,
            user_id,
            product_url,
            deep_link,
            title,
            description,
            category,
            original_price,
            discount_price,
            image_url,
            status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          productId,
          user.userId,
          product.productUrl, // 원본 affiliate link
          shortUrl, // 딥링크 API로 생성한 사용자 딥링크
          product.productName,
          `${product.productName} - ${product.categoryName}`,
          mappedCategory, // 매핑된 카테고리
          product.productPrice,
          product.productPrice,
          product.productImage,
          'active'
        );

          console.log('✅ 상품 등록 완료:', product.productName);
          addedCount++;
        } catch (productError: any) {
          console.error(`❌ 상품 처리 실패 (${product.productName}):`, productError.message);
          failedCount++;
          errors.push(`${product.productName}: ${productError.message}`);
        }
      }

      db.close();

      return NextResponse.json({
        success: addedCount > 0,
        message: `${addedCount}개 상품이 등록되었습니다.${skippedCount > 0 ? ` (${skippedCount}개 중복 제외)` : ''}${failedCount > 0 ? ` (${failedCount}개 실패)` : ''}`,
        added: addedCount,
        skipped: skippedCount,
        failed: failedCount,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      db.close();
      throw error;
    }

  } catch (error: any) {
    console.error('상품 등록 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '상품 등록 중 오류 발생'
    }, { status: 500 });
  }
}
