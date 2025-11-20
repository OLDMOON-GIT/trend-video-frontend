import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

export async function loadUserSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

export function generateCoupangSignature(method: string, path: string, secretKey: string) {
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
  const message = datetime + method + path;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');

  return { datetime, signature };
}

export function extractProductId(affiliateUrl: string): string | null {
  try {
    const url = new URL(affiliateUrl);

    // 1. URL 경로에서 추출 (/vp/products/{productId}) - 가장 정확함
    const pathMatch = affiliateUrl.match(/\/vp\/products\/(\d+)/);
    if (pathMatch) return pathMatch[1];

    // 2. productId 파라미터에서 추출
    const productId = url.searchParams.get('productId');
    if (productId) return productId;

    // 3. itemId 파라미터에서 추출 (상품 ID로 사용 가능)
    const itemId = url.searchParams.get('itemId');
    if (itemId) return itemId;

    // 4. pageKey는 마지막 우선순위 (추적/어필리에이트용)
    const pageKey = url.searchParams.get('pageKey');
    if (pageKey) return pageKey;

    console.error('상품 ID 추출 실패, URL:', affiliateUrl);
    return null;
  } catch (error) {
    console.error('URL 파싱 실패:', error);
    return null;
  }
}

/**
 * Coupang 딥링크 생성
 * @param affiliateUrl 쿠팡 affiliate URL
 * @param accessKey 쿠팡 파트너스 Access Key
 * @param secretKey 쿠팡 파트너스 Secret Key
 * @returns 단축된 딥링크 URL
 * @throws 딥링크 생성 실패 시 에러
 */
export async function generateDeeplink(
  affiliateUrl: string,
  accessKey: string,
  secretKey: string
): Promise<string> {
  // affiliate URL에서 상품 ID 추출
  const productId = extractProductId(affiliateUrl);
  if (!productId) {
    console.error('❌ 상품 ID 추출 실패:', affiliateUrl);
    throw new Error(`상품 ID를 추출할 수 없습니다: ${affiliateUrl}`);
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
