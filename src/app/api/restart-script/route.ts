import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findScriptById, findScriptTempById, deductCredits, addCreditHistory, getSettings } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { scriptId } = await request.json();

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    // Script 확인
    const script = await findScriptById(scriptId);

    if (!script) {
      return NextResponse.json(
        { error: '대본을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 본인 대본인지 확인
    if (script.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    console.log(`🔄 대본 재시작 요청: ${scriptId} (${script.status}) by ${user.email}`);

    // 크레딧 설정 가져오기
    const settings = await getSettings();
    const cost = settings.scriptGenerationCost || 10; // 대본 생성 비용

    // 크레딧 차감 시도
    const deductResult = await deductCredits(user.userId, cost);

    if (!deductResult.success) {
      console.log(`❌ 크레딧 부족: ${user.email}, 필요: ${cost}, 보유: ${deductResult.balance}`);
      return NextResponse.json(
        {
          error: `크레딧이 부족합니다. (필요: ${cost}, 보유: ${deductResult.balance})`,
          requiredCredits: cost,
          currentCredits: deductResult.balance
        },
        { status: 402 } // 402 Payment Required
      );
    }

    console.log(`✅ 크레딧 차감 성공: ${user.email}, ${cost} 크레딧 차감, 잔액: ${deductResult.balance}`);

    // 크레딧 히스토리 기록
    await addCreditHistory(user.userId, 'use', -cost, '대본 재생성');

    // scripts_temp에서 원본 요청 정보 가져오기
    const tempScript = await findScriptTempById(scriptId);

    if (!tempScript) {
      console.log(`❌ scripts_temp에서 대본을 찾을 수 없습니다: ${scriptId}`);
      return NextResponse.json(
        { error: '원본 요청 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`✅ 대본 정보 확인:`, {
      title: tempScript.title,
      originalTitle: tempScript.originalTitle,
      type: tempScript.type,
      useClaudeLocal: tempScript.useClaudeLocal
    });

    // 새로운 대본 생성 API 호출
    const generateResponse = await fetch(`${request.nextUrl.origin}/api/scripts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(request.headers.entries())
      },
      body: JSON.stringify({
        title: `${tempScript.originalTitle || tempScript.title} (재생성)`,
        format: tempScript.type || 'longform',
        useClaudeLocal: tempScript.useClaudeLocal === 1 || tempScript.useClaudeLocal === true
      })
    });

    const generateData = await generateResponse.json();

    if (!generateResponse.ok) {
      return NextResponse.json(
        { error: generateData.error || '대본 재생성 실패' },
        { status: generateResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      scriptId: generateData.taskId || generateData.scriptId,
      message: '대본이 재생성되었습니다.'
    });

  } catch (error: any) {
    console.error('Error restarting script:', error);
    return NextResponse.json(
      { error: error?.message || '대본 재시작 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
