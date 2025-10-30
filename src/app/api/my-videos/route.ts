import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getJobsByUserId, getActiveJobsByUserId } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter'); // 'all' | 'active'
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';

    let allJobs;
    if (filter === 'active') {
      allJobs = await getActiveJobsByUserId(user.userId);
    } else {
      allJobs = await getJobsByUserId(user.userId);
    }

    // 검색 필터링
    let filteredJobs = allJobs;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredJobs = allJobs.filter(job =>
        job.title?.toLowerCase().includes(searchLower) ||
        job.id.toLowerCase().includes(searchLower) ||
        job.status.toLowerCase().includes(searchLower)
      );
    }

    // 전체 개수
    const total = filteredJobs.length;

    // 페이징
    const jobs = filteredJobs.slice(offset, offset + limit);

    return NextResponse.json({
      jobs,
      total,
      hasMore: offset + limit < total
    });

  } catch (error: any) {
    console.error('Error fetching videos:', error);
    return NextResponse.json(
      { error: '영상 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
