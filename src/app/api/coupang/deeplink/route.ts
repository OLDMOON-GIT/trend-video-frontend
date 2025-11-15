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
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  const message = datetime + method + path;

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');

  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  return { datetime, signature, authorization };
}

// POST - 딥링크(단축링크) 생성
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
    const { coupangUrls } = body;

    if (!coupangUrls || coupangUrls.length === 0) {
      return NextResponse.json({ error: 'URL을 입력하세요.' }, { status: 400 });
    }

    const REQUEST_METHOD = 'POST';
    const DOMAIN = 'https://api-gateway.coupang.com';
    const PATH = '/v2/providers/affiliate_open_api/apis/openapi/deeplink';

    const { authorization } = generateCoupangSignature(REQUEST_METHOD, PATH, settings.accessKey, settings.secretKey);

    console.log('🔗 딥링크 생성 요청:', { coupangUrls });

    const response = await fetch(DOMAIN + PATH, {
      method: REQUEST_METHOD,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        coupangUrls: Array.isArray(coupangUrls) ? coupangUrls : [coupangUrls]
      })
    });

    console.log('📡 딥링크 API 응답 상태:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ 딥링크 생성 성공:', data);

      if (data.rCode === '0' && data.data) {
        return NextResponse.json({
          success: true,
          data: data.data
        });
      } else {
        return NextResponse.json({
          success: false,
          error: data.message || '딥링크 생성 실패'
        }, { status: 400 });
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ 딥링크 API 실패:', errorData);
      return NextResponse.json({
        success: false,
        error: errorData.message || '딥링크 생성 실패'
      }, { status: response.status });
    }
  } catch (error: any) {
    console.error('딥링크 생성 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '딥링크 생성 중 오류 발생'
    }, { status: 500 });
  }
}
