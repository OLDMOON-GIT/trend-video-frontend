import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getUserYouTubeUploads, deleteYouTubeUpload } from '@/lib/db';

/**
 * GET /api/youtube/published - YouTube 업로드 기록 조회
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    const allUploads = getUserYouTubeUploads(user.userId);

    // 최신순 정렬 (publishedAt 기준)
    allUploads.sort((a, b) => {
      const dateA = new Date(a.publishedAt || 0).getTime();
      const dateB = new Date(b.publishedAt || 0).getTime();
      return dateB - dateA; // 최신순 (내림차순)
    });

    // 전체 개수
    const total = allUploads.length;

    // 페이징
    const uploads = allUploads.slice(offset, offset + limit);

    return NextResponse.json({
      uploads,
      total,
      hasMore: offset + limit < total
    });
  } catch (error: any) {
    console.error('YouTube 업로드 기록 조회 실패:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/youtube/published?id=... - YouTube 업로드 기록 삭제
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('id');

    if (!uploadId) {
      return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });
    }

    const success = deleteYouTubeUpload(uploadId);

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: '삭제 실패' }, { status: 404 });
    }
  } catch (error: any) {
    console.error('YouTube 업로드 기록 삭제 실패:', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
