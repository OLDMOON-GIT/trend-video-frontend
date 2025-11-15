import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

interface CoupangSettings {
  userId: string;
  accessKey: string;
  secretKey: string;
  trackingId: string;
  openaiApiKey?: string;
  isConnected: boolean;
  lastChecked?: string;
}

async function loadSettings(): Promise<Record<string, CoupangSettings>> {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// 쿠팡 파트너스 API 연결 테스트
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 저장된 설정 파일에서 실제 키 읽어오기
    const allSettings = await loadSettings();
    const userSettings = allSettings[user.userId];

    if (!userSettings || !userSettings.accessKey || !userSettings.secretKey) {
      console.error('❌ 저장된 API 키 없음');
      return NextResponse.json({ error: '먼저 API 키를 저장하세요.' }, { status: 400 });
    }

    const { accessKey, secretKey } = userSettings;

    console.log('🔍 Coupang API Test - 요청 받음');
    console.log('   accessKey:', accessKey ? `${accessKey.substring(0, 10)}...` : 'undefined');
    console.log('   secretKey:', secretKey ? 'provided (from saved settings)' : 'undefined');

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

    // Message format: datetime + method + URL (쿼리 파라미터 제외!)
    const message = datetime + REQUEST_METHOD + URL;

    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(message)
      .digest('hex');

    // Authorization header (spaces after commas)
    const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

    console.log('🔐 인증 정보:');
    console.log('   datetime:', datetime);
    console.log('   message:', message);
    console.log('   signature:', signature);
    console.log('   authorization:', authorization);

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
