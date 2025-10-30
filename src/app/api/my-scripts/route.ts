import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getScriptsByUserId, findScriptById, deleteScript } from '@/lib/db';

// GET - 사용자의 대본 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const scripts = await getScriptsByUserId(user.userId);

    return NextResponse.json({
      scripts,
      total: scripts.length
    });

  } catch (error: any) {
    console.error('Error fetching scripts:', error);
    return NextResponse.json(
      { error: error?.message || '대본 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE - 대본 삭제
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
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 대본 소유자 확인
    const script = await findScriptById(scriptId);

    if (!script) {
      return NextResponse.json(
        { error: '대본을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (script.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 대본 삭제
    const success = await deleteScript(scriptId);

    if (success) {
      return NextResponse.json({
        success: true,
        message: '대본이 삭제되었습니다.'
      });
    } else {
      return NextResponse.json(
        { error: '대본 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error deleting script:', error);
    return NextResponse.json(
      { error: error?.message || '대본 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
