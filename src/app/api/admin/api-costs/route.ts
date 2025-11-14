import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAllApiCosts, getApiCostStats } from '@/lib/db';

/**
 * GET /api/admin/api-costs
 * 전체 API 비용 조회 (관리자 전용)
 */
export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    // 비용 목록 조회
    const costs = getAllApiCosts(startDate, endDate, limit);

    // 통계 조회
    const stats = getApiCostStats(startDate, endDate);

    return NextResponse.json({
      costs,
      stats,
      total: costs.length
    });
  } catch (error: any) {
    console.error('❌ API 비용 조회 오류:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
