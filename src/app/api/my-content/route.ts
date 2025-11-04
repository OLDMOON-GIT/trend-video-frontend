// 통합 Content API (scripts + videos)
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getContentsByUserId, deleteContent } from '@/lib/content';

// GET - 사용자의 모든 컨텐츠 조회 (대본 + 영상 통합)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // URL 파라미터
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'script' | 'video' | null;  // 필터: script, video
    const format = searchParams.get('format') as 'longform' | 'shortform' | 'sora2' | null;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 통합 조회
    const contents = getContentsByUserId(user.userId, {
      type: type || undefined,
      format: format || undefined,
      limit,
      offset
    });

    // 전체 개수 (페이징용)
    const allContents = getContentsByUserId(user.userId, {
      type: type || undefined,
      format: format || undefined
    });
    const total = allContents.length;

    return NextResponse.json({
      contents,
      total,
      hasMore: offset + limit < total
    });

  } catch (error: any) {
    console.error('❌ Content 조회 에러:', error);
    return NextResponse.json(
      { error: error?.message || '컨텐츠 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE - 컨텐츠 삭제 (대본/영상 모두)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');

    if (!contentId) {
      return NextResponse.json(
        { error: 'contentId가 필요합니다.' },
        { status: 400 }
      );
    }

    // ID + userId로 바로 삭제 (소유자 확인 포함)
    const success = deleteContent(contentId, user.userId);

    if (success) {
      return NextResponse.json({
        success: true,
        message: '컨텐츠가 삭제되었습니다.'
      });
    } else {
      return NextResponse.json(
        { error: '컨텐츠를 찾을 수 없거나 권한이 없습니다.' },
        { status: 404 }
      );
    }

  } catch (error: any) {
    console.error('❌ Content 삭제 에러:', error);
    return NextResponse.json(
      { error: error?.message || '컨텐츠 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
