import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';
import { promises as fs } from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const { id: jobId } = params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    // jobs 테이블에서 작업 정보 조회
    const db = new Database(dbPath);
    const job: any = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(jobId, user.userId);
    db.close();

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // videoPath에서 폴더 경로 추출
    if (!job.video_path) {
      return NextResponse.json(
        { error: '비디오 경로를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // output 폴더인지 확인 (video-merge로 생성된 경우)
    const normalizedPath = job.video_path.replace(/\\/g, '/');
    const outputMatch = normalizedPath.match(/output\/([^/]+)/);

    if (!outputMatch) {
      return NextResponse.json(
        { error: '영상 병합으로 생성된 콘텐츠가 아닙니다.' },
        { status: 400 }
      );
    }

    const folderName = outputMatch[1];
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const outputFolder = path.join(backendPath, 'output', folderName);

    // original_story.json 파일 읽기
    const originalJsonPath = path.join(outputFolder, 'original_story.json');

    try {
      const scriptContent = await fs.readFile(originalJsonPath, 'utf-8');

      return NextResponse.json({
        success: true,
        script: scriptContent,
        title: job.title || '제목 없음'
      });
    } catch (error: any) {
      // original_story.json이 없으면 config.json에서 시도
      const configPath = path.join(outputFolder, 'config.json');

      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        // config에서 narration_text나 scenes 추출
        let scriptData: any = {};

        if (config.narration_text) {
          scriptData.narration = config.narration_text;
        }

        if (config.scenes && Array.isArray(config.scenes)) {
          scriptData.scenes = config.scenes;
        }

        if (config.title) {
          scriptData.title = config.title;
        }

        return NextResponse.json({
          success: true,
          script: JSON.stringify(scriptData, null, 2),
          title: job.title || config.title || '제목 없음',
          isFromConfig: true
        });
      } catch (configError) {
        return NextResponse.json(
          { error: '대본 파일을 찾을 수 없습니다. (original_story.json 또는 config.json)' },
          { status: 404 }
        );
      }
    }

  } catch (error: any) {
    console.error('Error fetching job script:', error);
    return NextResponse.json(
      { error: error?.message || '대본 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
