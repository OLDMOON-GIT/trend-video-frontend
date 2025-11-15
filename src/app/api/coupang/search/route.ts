import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

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

function generateCoupangSignature(method: string, path: string, accessKey: string, secretKey: string) {
  // Datetime format: yymmddTHHMMSSZ (GMT+0)
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  // Message format: datetime + method + path (no query params)
  const message = datetime + method + path;

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');

  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  return { datetime, signature, authorization };
}

// POST - 상품 검색
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    console.log('🔍 [Coupang Search] Authorization 헤더:', authHeader);

    const user = await getCurrentUser(request);
    console.log('👤 [Coupang Search] 사용자 정보:', user);

    if (!user) {
      console.log('❌ [Coupang Search] 사용자 인증 실패');
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const settings = await loadUserSettings(user.userId);
    if (!settings || !settings.accessKey || !settings.secretKey) {
      return NextResponse.json({ error: 'API 키를 먼저 설정하세요.' }, { status: 400 });
    }

    const body = await request.json();
    const { keyword } = body;

    if (!keyword) {
      return NextResponse.json({ error: '검색어를 입력하세요.' }, { status: 400 });
    }

    const REQUEST_METHOD = 'GET';
    const DOMAIN = 'https://api-gateway.coupang.com';
    const PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
    const QUERY = `?keyword=${encodeURIComponent(keyword)}&limit=10`;
    const FULL_URL = PATH + QUERY;

    // HMAC 서명은 PATH만 사용 (쿼리 제외)
    const { authorization } = generateCoupangSignature(REQUEST_METHOD, PATH, settings.accessKey, settings.secretKey);

    // 실제 API 호출은 전체 URL 사용 (쿼리 포함)
    const response = await fetch(DOMAIN + FULL_URL, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();

      if (data.rCode === '0' && data.data) {
        const products = data.data.productData?.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          productPrice: item.productPrice,
          productImage: item.productImage,
          productUrl: item.productUrl,
          categoryName: item.categoryName || '기타',
          isRocket: item.isRocket || false
        })) || [];

        return NextResponse.json({
          success: true,
          products
        });
      } else {
        return NextResponse.json({
          success: false,
          error: data.message || '검색 결과가 없습니다.',
          products: []
        });
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: errorData.message || '상품 검색 실패'
      }, { status: response.status });
    }
  } catch (error: any) {
    console.error('상품 검색 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '상품 검색 중 오류 발생'
    }, { status: 500 });
  }
}
