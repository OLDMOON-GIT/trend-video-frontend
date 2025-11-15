import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

/**
 * GET /api/automation/get-story?scriptId=xxx
 * 자동화 폴더의 story.json 파일을 읽어서 반환
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json({ error: 'scriptId is required' }, { status: 400 });
    }

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const storyPath = path.join(backendPath, 'input', `project_${scriptId}`, 'story.json');

    try {
      const storyContent = await fs.readFile(storyPath, 'utf-8');
      const storyJson = JSON.parse(storyContent);

      return NextResponse.json({
        success: true,
        storyJson
      });
    } catch (error: any) {
      console.error('Failed to read story.json:', error);
      return NextResponse.json({
        error: 'story.json 파일을 읽을 수 없습니다',
        details: error.message
      }, { status: 404 });
    }
  } catch (error: any) {
    console.error('GET /api/automation/get-story error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
