import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

// GET - 설정 조회 (모든 사용자)
export async function GET(request: NextRequest) {
  try {
    const settings = await getSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: '설정 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST - 설정 업데이트 (관리자만)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 관리자 확인 필요 - 추후 구현
    // if (!user.isAdmin) {
    //   return NextResponse.json(
    //     { error: '관리자 권한이 필요합니다.' },
    //     { status: 403 }
    //   );
    // }

    const body = await request.json();
    const { aiScriptCost, videoGenerationCost } = body;

    if (typeof aiScriptCost !== 'number' || typeof videoGenerationCost !== 'number') {
      return NextResponse.json(
        { error: '유효하지 않은 설정 값입니다.' },
        { status: 400 }
      );
    }

    await saveSettings({ aiScriptCost, videoGenerationCost });

    return NextResponse.json({
      success: true,
      settings: { aiScriptCost, videoGenerationCost }
    });

  } catch (error: any) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: '설정 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
