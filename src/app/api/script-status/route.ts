import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findScriptById } from '@/lib/db';

export async function GET(request: NextRequest) {
  // 사용자 인증
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    const script = await findScriptById(scriptId);

    if (!script) {
      return NextResponse.json(
        { error: '대본을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 본인의 대본인지 확인
    if (script.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      status: script.status || 'completed',
      title: script.title,
      content: script.content,
      progress: script.progress || 100,
      logs: script.logs || [],
      error: script.error
    });

  } catch (error: any) {
    console.error('❌ 대본 상태 조회 오류:', error);
    return NextResponse.json(
      { error: '대본 상태 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
