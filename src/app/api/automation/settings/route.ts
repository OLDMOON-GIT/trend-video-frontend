import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { updateAutomationSetting } from '@/lib/automation';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // 각 설정 키에 대해 업데이트
    for (const [key, value] of Object.entries(body)) {
      updateAutomationSetting(key, String(value));
      console.log(`✅ Updated automation setting: ${key} = ${value}`);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Failed to update automation settings:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
