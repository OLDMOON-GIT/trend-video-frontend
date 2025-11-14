import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';

// 쿠팡 파트너스 API 연결 테스트
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { accessKey, secretKey } = body;

    console.log('🔍 Coupang API Test - 요청 받음');
    console.log('   accessKey:', accessKey ? `${accessKey.substring(0, 10)}...` : 'undefined');
    console.log('   secretKey:', secretKey ? 'provided' : 'undefined');

    if (!accessKey || !secretKey) {
      console.error('❌ API 키 누락');
      return NextResponse.json({ error: 'API 키를 입력하세요.' }, { status: 400 });
    }

    // 쿠팡 파트너스 API 테스트 요청
    // 실제로는 쿠팡 API를 호출해야 하지만, 여기서는 간단한 검증만 수행
    // 쿠팡 API 문서: https://developers.coupang.com/hc/ko/articles/115002503013

    const REQUEST_METHOD = 'GET';
    const DOMAIN = 'https://api-gateway.coupang.com';
    const URL = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1001';

    // Datetime format: yymmddTHHMMSSZ (GMT+0)
    const now = new Date();
    const year = String(now.getUTCFullYear()).slice(-2);
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

    // Message format: datetime + method + path (no spaces, no query for this endpoint)
    const message = datetime + REQUEST_METHOD + URL;

    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(message)
      .digest('hex');

    // HMAC 인증 헤더 - 쉼표 뒤 공백 있어야 함 (CEA 형식)
    const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

    console.log('🔐 인증 정보:');
    console.log('   datetime:', datetime);
    console.log('   message:', message);
    console.log('   signature:', signature.substring(0, 20) + '...');

    // 실제 API 호출
    console.log('🌐 쿠팡 API 호출 시작:', DOMAIN + URL);
    const response = await fetch(DOMAIN + URL, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 쿠팡 API 응답 상태:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ 쿠팡 API 성공:', data);

      return NextResponse.json({
        success: true,
        message: '쿠팡 파트너스 API 연결 성공!',
        data: {
          categories: data.rCode === '0' ? data.data?.length : 0
        }
      });
    } else {
      const errorText = await response.text();
      console.error('❌ 쿠팡 API 실패 응답:', response.status, errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      return NextResponse.json({
        success: false,
        error: errorData.message || `API 연결 실패 (${response.status})`,
        details: errorText
      }, { status: 400 });
    }
  } catch (error: any) {
    console.error('쿠팡 API 테스트 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'API 연결 테스트 실패'
    }, { status: 500 });
  }
}
