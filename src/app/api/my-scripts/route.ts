import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getScriptsByUserId, findScriptById, deleteScript } from '@/lib/db';

// GET - 사용자의 대본 목록 조회
export async function GET(request: NextRequest) {
  try {
    console.log('=== 대본 목록 조회 요청 시작 ===');

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log('사용자 ID로 대본 조회 중:', user.userId);
    const scripts = await getScriptsByUserId(user.userId);
    console.log('조회된 대본 개수:', scripts.length);
    console.log('대본 목록:', scripts.map(s => ({ id: s.id, title: s.title })));

    return NextResponse.json({
      scripts,
      total: scripts.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching scripts:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error?.message || '대본 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE - 대본 삭제
export async function DELETE(request: NextRequest) {
  try {
    console.log('=== 대본 삭제 요청 시작 ===');

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');
    console.log('scriptId:', scriptId);

    if (!scriptId) {
      console.log('❌ scriptId 없음');
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 대본 소유자 확인
    const script = await findScriptById(scriptId);
    console.log('찾은 대본:', script);

    if (!script) {
      console.log('❌ 대본을 찾을 수 없음');
      return NextResponse.json(
        { error: '대본을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log('대본 소유자:', script.userId, '현재 사용자:', user.userId);
    if (script.userId !== user.userId) {
      console.log('❌ 권한 없음');
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 대본 삭제
    console.log('대본 삭제 시도...');
    const success = await deleteScript(scriptId);
    console.log('삭제 결과:', success);

    if (success) {
      console.log('✅ 대본 삭제 성공');
      return NextResponse.json({
        success: true,
        message: '대본이 삭제되었습니다.'
      });
    } else {
      console.log('❌ 대본 삭제 실패');
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
