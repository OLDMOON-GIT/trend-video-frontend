import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getApiCostStats } from '@/lib/db';

/**
 * GET /api/admin/api-costs/summary
 * API 비용 요약 통계 (관리자 전용)
 */
export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'all'; // all, today, week, month

    let startDate: string | undefined;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        break;
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString();
        break;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString();
        break;
      default:
        startDate = undefined;
    }

    const stats = getApiCostStats(startDate);

    // 서비스별 비용을 퍼센트로 계산
    const serviceBreakdown = Object.entries(stats.byService).map(([service, data]) => ({
      service,
      ...data,
      percentage: stats.totalCost > 0 ? (data.totalCost / stats.totalCost) * 100 : 0
    }));

    // 비용 타입별 비용을 퍼센트로 계산
    const typeBreakdown = Object.entries(stats.byCostType).map(([type, data]) => ({
      type,
      ...data,
      percentage: stats.totalCost > 0 ? (data.totalCost / stats.totalCost) * 100 : 0
    }));

    return NextResponse.json({
      period,
      totalCost: stats.totalCost,
      totalCredits: stats.totalCredits,
      serviceBreakdown: serviceBreakdown.sort((a, b) => b.totalCost - a.totalCost),
      typeBreakdown: typeBreakdown.sort((a, b) => b.totalCost - a.totalCost)
    });
  } catch (error: any) {
    console.error('❌ API 비용 요약 조회 오류:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
