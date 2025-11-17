import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

// 베스트셀러 캐시 (24시간)
interface CacheEntry {
  data: any;
  timestamp: number;
}

const bestsellerCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간 (밀리초)

// 주요 카테고리 목록 (여러 카테고리 조회용)
const MAJOR_CATEGORIES = [
  '1001', // 가전디지털
  '1002', // 패션의류
  '1010', // 식품
  '1011', // 뷰티
  '1012', // 생활용품
];

// 딜레이 함수 (API 부담 줄이기)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 사용자별 쿠팡 설정 로드
async function loadUserSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

// HMAC 서명 생성
function generateHMAC(method: string, url: string, accessKey: string, secretKey: string): { datetime: string; authorization: string } {
  // Datetime format: yymmddTHHMMSSZ (GMT+0)
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  // Message format: datetime + method + path (no spaces)
  const message = datetime + method + url;

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');

  // Authorization header format (with spaces after commas)
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  return { datetime, authorization };
}

// 쿠팡 API 호출 함수
async function callCoupangAPI(accessKey: string, secretKey: string, method: string, fullUrl: string) {
  // URL에서 PATH와 QUERY 분리
  const [path, query] = fullUrl.split('?');

  // HMAC 서명은 PATH만 사용 (쿼리 파라미터 제외)
  const { authorization } = generateHMAC(method, path, accessKey, secretKey);

  const DOMAIN = 'https://api-gateway.coupang.com';
  // 실제 API 호출은 전체 URL 사용 (쿼리 포함)
  const response = await fetch(DOMAIN + fullUrl, {
    method,
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json'
    }
  });

  return response;
}

/**
 * GET /api/coupang/products - 베스트셀러 상품 목록 가져오기
 * Query: categoryId (선택사항, 기본값: all - 모든 주요 카테고리)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 사용자 설정 로드
    const settings = await loadUserSettings(user.userId);
    if (!settings || !settings.accessKey || !settings.secretKey) {
      return NextResponse.json({ error: '쿠팡 API 설정이 필요합니다.' }, { status: 400 });
    }

    // 쿼리 파라미터
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId') || 'all'; // 기본: 모든 카테고리

    // 캐시 키: userId와 categoryId 조합
    const cacheKey = `${user.userId}_${categoryId}`;

    // 캐시 확인
    const cached = bestsellerCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      const hoursLeft = Math.floor((CACHE_DURATION - (now - cached.timestamp)) / 1000 / 60 / 60);
      console.log('💾 캐시에서 베스트셀러 반환:', cacheKey, `(${hoursLeft}시간 남음)`);
      return NextResponse.json({
        success: true,
        products: cached.data,
        total: cached.data.length,
        cached: true,
        cacheAge: Math.floor((now - cached.timestamp) / 1000) // 초 단위
      });
    }

    // 조회할 카테고리 목록 결정
    const categoriesToFetch = categoryId === 'all' || categoryId === '1001'
      ? MAJOR_CATEGORIES
      : [categoryId];

    console.log('🛒 베스트셀러 조회 시작:', categoriesToFetch.length, '개 카테고리');

    // 모든 카테고리에서 상품 조회 (천천히)
    const allProducts: any[] = [];

    for (let i = 0; i < categoriesToFetch.length; i++) {
      const catId = categoriesToFetch[i];

      try {
        const url = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/${catId}`;
        const response = await callCoupangAPI(settings.accessKey, settings.secretKey, 'GET', url);

        console.log(`🛒 [${i + 1}/${categoriesToFetch.length}] 카테고리 ${catId} 조회 중...`);

        if (response.ok) {
          const data = await response.json();
          const products = data.data?.map((item: any) => ({
            productId: item.productId,
            productName: item.productName,
            productPrice: item.productPrice,
            productImage: item.productImage,
            productUrl: item.productUrl,
            categoryName: item.categoryName,
            isRocket: item.isRocket || false,
            rank: item.rank,
            categoryId: catId
          })) || [];

          allProducts.push(...products);
          console.log(`✅ 카테고리 ${catId}: ${products.length}개 상품`);
        } else {
          console.error(`❌ 카테고리 ${catId} 조회 실패:`, response.status);
        }

        // 다음 카테고리 조회 전 대기 (API 부담 줄이기)
        if (i < categoriesToFetch.length - 1) {
          await delay(500); // 500ms 대기
        }
      } catch (error) {
        console.error(`❌ 카테고리 ${catId} 조회 중 오류:`, error);
      }
    }

    // 중복 제거 (productId 기준)
    const uniqueProducts = Array.from(
      new Map(allProducts.map(p => [p.productId, p])).values()
    );

    console.log(`✅ 총 ${uniqueProducts.length}개 상품 조회 완료 (중복 제거 전: ${allProducts.length})`);

    // 캐시에 저장
    bestsellerCache.set(cacheKey, {
      data: uniqueProducts,
      timestamp: now
    });
    console.log('💾 베스트셀러 캐시 저장:', cacheKey, `(24시간 유지, ${uniqueProducts.length}개 상품)`);

    return NextResponse.json({
      success: true,
      products: uniqueProducts,
      total: uniqueProducts.length,
      cached: false
    });

  } catch (error: any) {
    console.error('쿠팡 상품 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '상품 조회 중 오류 발생'
    }, { status: 500 });
  }
}
