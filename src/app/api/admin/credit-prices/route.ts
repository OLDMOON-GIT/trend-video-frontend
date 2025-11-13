import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CREDIT_PRICES_FILE = path.join(DATA_DIR, 'credit-prices.json');

interface CreditPrices {
  scriptGeneration: number;
  videoGeneration: number;
  longformScript: number;
  shortformScript: number;
  sora2Video: number;
  productVideo: number;
}

const DEFAULT_PRICES: CreditPrices = {
  scriptGeneration: 100,
  videoGeneration: 500,
  longformScript: 3050,     // 롱폼 대본 + 이미지 8장: 약 1,020원 × 3 = 3,050원
  shortformScript: 1400,    // 숏폼 대본 + 이미지 4장: 약 461원 × 3 = 1,400원
  sora2Video: 1000,
  productVideo: 300
};

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadPrices(): Promise<CreditPrices> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(CREDIT_PRICES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    // 파일이 없으면 기본값 저장
    await fs.writeFile(CREDIT_PRICES_FILE, JSON.stringify(DEFAULT_PRICES, null, 2));
    return DEFAULT_PRICES;
  }
}

async function savePrices(prices: CreditPrices): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CREDIT_PRICES_FILE, JSON.stringify(prices, null, 2));
}

/**
 * GET /api/admin/credit-prices - 크레딧 가격 조회
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    const prices = await loadPrices();
    return NextResponse.json({ prices });

  } catch (error: any) {
    console.error('크레딧 가격 조회 실패:', error);
    return NextResponse.json({ error: '크레딧 가격 조회 실패' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/credit-prices - 크레딧 가격 설정
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    const { prices } = await request.json();

    if (!prices) {
      return NextResponse.json({ error: 'prices가 필요합니다' }, { status: 400 });
    }

    // 유효성 검증
    const requiredFields: (keyof CreditPrices)[] = [
      'scriptGeneration',
      'videoGeneration',
      'longformScript',
      'shortformScript',
      'sora2Video',
      'productVideo'
    ];

    for (const field of requiredFields) {
      if (typeof prices[field] !== 'number' || prices[field] < 0) {
        return NextResponse.json({
          error: `${field}는 0 이상의 숫자여야 합니다`
        }, { status: 400 });
      }
    }

    await savePrices(prices);

    return NextResponse.json({
      success: true,
      prices
    });

  } catch (error: any) {
    console.error('크레딧 가격 저장 실패:', error);
    return NextResponse.json({ error: '크레딧 가격 저장 실패' }, { status: 500 });
  }
}

/**
 * POST /api/admin/credit-prices - 기본값으로 초기화
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    await savePrices(DEFAULT_PRICES);

    return NextResponse.json({
      success: true,
      prices: DEFAULT_PRICES
    });

  } catch (error: any) {
    console.error('크레딧 가격 초기화 실패:', error);
    return NextResponse.json({ error: '크레딧 가격 초기화 실패' }, { status: 500 });
  }
}
