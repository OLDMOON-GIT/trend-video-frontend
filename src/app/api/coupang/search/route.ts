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

function generateCoupangSignature(method: string, url: string, secretKey: string) {
  const datetime = new Date().toISOString().slice(0, -5) + 'Z';
  const message = datetime + method + url;
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');
  return { datetime, signature };
}

// POST - 상품 검색
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
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
    const URL = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/search?keyword=${encodeURIComponent(keyword)}&limit=20`;

    const { datetime, signature } = generateCoupangSignature(REQUEST_METHOD, URL, settings.secretKey);
    const authorization = `CEA algorithm=HmacSHA256, access-key=${settings.accessKey}, signed-date=${datetime}, signature=${signature}`;

    const response = await fetch(DOMAIN + URL, {
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
