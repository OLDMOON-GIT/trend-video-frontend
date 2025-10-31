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

    if (!accessKey || !secretKey) {
      return NextResponse.json({ error: 'API 키를 입력하세요.' }, { status: 400 });
    }

    // 쿠팡 파트너스 API 테스트 요청
    // 실제로는 쿠팡 API를 호출해야 하지만, 여기서는 간단한 검증만 수행
    // 쿠팡 API 문서: https://developers.coupang.com/hc/ko/articles/115002503013

    const REQUEST_METHOD = 'GET';
    const DOMAIN = 'https://api-gateway.coupang.com';
    const URL = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/1001';

    const datetime = new Date().toISOString().slice(0, -5) + 'Z';
    const message = datetime + REQUEST_METHOD + URL;

    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(message)
      .digest('hex');

    const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

    // 실제 API 호출
    const response = await fetch(DOMAIN + URL, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();

      // 설정 파일 업데이트는 별도로 처리하지 않음 (프론트엔드에서 처리)
      // const settingsResponse = await fetch('/api/coupang/settings', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     accessKey,
      //     secretKey,
      //     isConnected: true,
      //     lastChecked: new Date().toISOString()
      //   })
      // });

      return NextResponse.json({
        success: true,
        message: '쿠팡 파트너스 API 연결 성공!',
        data: {
          categories: data.rCode === '0' ? data.data?.length : 0
        }
      });
    } else {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: errorData.message || 'API 키가 올바르지 않습니다.'
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
