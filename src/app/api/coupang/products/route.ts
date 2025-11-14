import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

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
async function callCoupangAPI(accessKey: string, secretKey: string, method: string, url: string) {
  const { authorization } = generateHMAC(method, url, accessKey, secretKey);

  const DOMAIN = 'https://api-gateway.coupang.com';
  const response = await fetch(DOMAIN + url, {
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
 * Query: categoryId (선택사항, 기본값: 1001 - 가전디지털)
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
    const categoryId = searchParams.get('categoryId') || '1001'; // 기본: 가전디지털
    const limit = searchParams.get('limit') || '20';

    // 쿠팡 베스트셀러 API 호출
    const url = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/${categoryId}?limit=${limit}`;
    const response = await callCoupangAPI(settings.accessKey, settings.secretKey, 'GET', url);

    console.log('🛒 쿠팡 베스트셀러 API 호출:', url);
    console.log('📡 응답 상태:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ 쿠팡 API 성공:', data);

      // 상품 데이터 파싱
      const products = data.data?.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        productPrice: item.productPrice,
        productImage: item.productImage,
        productUrl: item.productUrl,
        categoryName: item.categoryName,
        isRocket: item.isRocket || false,
        rank: item.rank
      })) || [];

      return NextResponse.json({
        success: true,
        products,
        total: products.length
      });
    } else {
      const errorText = await response.text();
      console.error('❌ 쿠팡 API 실패:', response.status, errorText);

      return NextResponse.json({
        success: false,
        error: `쿠팡 API 호출 실패 (${response.status})`,
        details: errorText
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error('쿠팡 상품 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '상품 조회 중 오류 발생'
    }, { status: 500 });
  }
}
