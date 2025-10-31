import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_LINKS_FILE = path.join(DATA_DIR, 'coupang-links.json');

async function loadAllLinks() {
  try {
    const data = await fs.readFile(COUPANG_LINKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// GET - 통계 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const allLinks = await loadAllLinks();
    const userLinks = allLinks.filter((link: any) => link.userId === user.userId);

    // 통계 계산
    const totalLinks = userLinks.length;
    const totalClicks = userLinks.reduce((sum: number, link: any) => sum + (link.clicks || 0), 0);

    // 쿠팡 파트너스 평균 수수료율 3% 가정, 클릭당 평균 주문액 50,000원 가정
    // 실제로는 쿠팡 파트너스 리포트 API를 통해 실제 수익을 가져와야 함
    const estimatedRevenue = Math.floor(totalClicks * 0.03 * 50000 * 0.1); // 10% 전환율 가정

    const conversionRate = totalClicks > 0 ? ((totalClicks * 0.1) / totalClicks * 100).toFixed(1) : 0;

    return NextResponse.json({
      success: true,
      stats: {
        totalLinks,
        totalClicks,
        estimatedRevenue,
        conversionRate: parseFloat(conversionRate as string)
      }
    });
  } catch (error: any) {
    console.error('통계 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: '통계 조회 실패',
      stats: {
        totalLinks: 0,
        totalClicks: 0,
        estimatedRevenue: 0,
        conversionRate: 0
      }
    }, { status: 500 });
  }
}
