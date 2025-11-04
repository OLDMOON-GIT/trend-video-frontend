import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getJobsByUserId, getActiveJobsByUserId } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    console.log('=== 영상 목록 조회 요청 시작 ===');

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패');
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

    console.log('필터:', filter, '| 제한:', limit, '| 오프셋:', offset);

    let allJobs;
    if (filter === 'active') {
      console.log('진행 중인 작업 조회...');
      allJobs = getActiveJobsByUserId(user.userId); // await 제거 (동기 함수)
    } else {
      console.log('전체 작업 조회...');
      allJobs = getJobsByUserId(user.userId); // await 제거 (동기 함수)
    }

    console.log('조회된 작업 수:', allJobs.length);

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

    // 최신순 정렬 (createdAt 기준)
    filteredJobs.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // 최신순 (내림차순)
    });

    // 전체 개수
    const total = filteredJobs.length;

    // 페이징
    const jobs = filteredJobs.slice(offset, offset + limit);

    console.log('✅ 응답:', jobs.length, '개 작업 반환');

    return NextResponse.json({
      jobs,
      total,
      hasMore: offset + limit < total
    });

  } catch (error: any) {
    console.error('❌ Error fetching videos:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: '영상 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
