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

function generateCoupangSignature(method: string, path: string, accessKey: string, secretKey: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  const message = datetime + method + path;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  return { authorization };
}

function extractProductId(affiliateUrl: string): string | null {
  // affiliate URL에서 pageKey 추출
  // 예: https://link.coupang.com/re/AFFSDP?lptag=AF5835292&pageKey=7230708295&...
  try {
    const url = new URL(affiliateUrl);
    const pageKey = url.searchParams.get('pageKey');
    return pageKey;
  } catch {
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
  const PATH = '/v2/providers/affiliate_open_api/apis/openapi/deeplink';

  const { authorization } = generateCoupangSignature(REQUEST_METHOD, PATH, accessKey, secretKey);

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
        return data.data[0].shortenUrl;
      }
    } else {
      const errorText = await response.text();
      console.error('❌ 딥링크 API 오류:', response.status, errorText);
    }
  } catch (error) {
    console.error('딥링크 생성 실패:', error);
  }

  // 실패 시 원본 affiliate URL 반환
  return affiliateUrl;
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
    const { products } = body as { products: Product[] };

    if (!products || products.length === 0) {
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

    try {
      for (const product of products) {
        // 딥링크(단축링크) 생성
        console.log('🔗 딥링크 생성 중:', product.productUrl);
        const shortUrl = await generateDeeplink(product.productUrl, settings.accessKey, settings.secretKey);
        console.log('✅ 단축링크:', shortUrl);

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
          shortUrl, // 딥링크 API로 생성한 단축링크
          product.productName,
          `${product.productName} - ${product.categoryName}`,
          product.categoryName || '기타',
          product.productPrice,
          product.productPrice,
          product.productImage,
          'active'
        );

        console.log('✅ 상품 등록 완료:', product.productName);
        addedCount++;
      }

      db.close();

      return NextResponse.json({
        success: true,
        message: `${addedCount}개 상품이 등록되었습니다.${skippedCount > 0 ? ` (${skippedCount}개 중복 제외)` : ''}`,
        added: addedCount,
        skipped: skippedCount
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
