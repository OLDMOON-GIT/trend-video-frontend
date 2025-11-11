import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseJsonSafely } from '@/lib/json-utils';

/**
 * trend-video-backend Python 스크립트를 직접 호출하여 Sora2 비디오 생성
 *
 * Request Body:
 * - script: Story JSON (scenes 배열 포함)
 * - title: 영상 제목
 * - duration_per_segment: 세그먼트당 길이 (기본 8초)
 * - num_segments: 세그먼트 개수 (기본 3개)
 * - size: 영상 크기 (기본 1280x720)
 */
export async function POST(request: NextRequest) {
  try {
    const { script, title, duration_per_segment = 8, num_segments = 3, size = '1280x720' } = await request.json();

    if (!script || !title) {
      return NextResponse.json(
        { error: 'Script and title are required' },
        { status: 400 }
      );
    }

    // Script JSON 파싱 (유도리있는 파서 사용)
    let scriptJson;
    if (typeof script === 'string') {
      const parseResult = parseJsonSafely(script, { logErrors: true });
      if (!parseResult.success) {
        console.error('❌ Script JSON 파싱 실패:', parseResult.error);
        return NextResponse.json(
          { error: 'Invalid script JSON format: ' + parseResult.error },
          { status: 400 }
        );
      }
      scriptJson = parseResult.data;
      if (parseResult.fixed) {
        console.log('🔧 Script JSON 자동 수정 적용됨');
      }
    } else {
      scriptJson = script;
    }

    // scenes 배열 추출
    const scenes = scriptJson.scenes || [];
    if (scenes.length === 0) {
      return NextResponse.json(
        { error: 'Script must contain scenes array' },
        { status: 400 }
      );
    }

    // 각 씬의 image_prompt를 결합하여 base_prompt 생성
    // scene_00_bomb는 제외하고 나머지 씬만 사용
    const prompts = scenes
      .filter((scene: any) => scene.scene_id !== 'scene_00_bomb')
      .map((scene: any) => scene.image_prompt || scene.narration || '')
      .filter((p: string) => p.trim() !== '');

    if (prompts.length === 0) {
      return NextResponse.json(
        { error: 'No valid prompts found in scenes' },
        { status: 400 }
      );
    }

    // 모든 프롬프트를 개행으로 결합
    const combinedPrompt = prompts.join('\n\n');

    // Task ID 생성
    const taskId = uuidv4();

    // trend-video-backend 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    console.log('🎬 Starting Sora2 video generation');
    console.log('📝 Prompts count:', prompts.length);
    console.log('⚙️ Settings:', { duration_per_segment, num_segments, size });
    console.log('📂 trend-video-backend path:', backendPath);

    // Python 스크립트 실행 (백그라운드)
    const pythonProcess = spawn('python', [
      '-m', 'src.main',
      combinedPrompt,
      '--duration', duration_per_segment.toString(),
      '--num-segments', num_segments.toString(),
      '--size', size,
      '--output-name', title.replace(/[^a-zA-Z0-9가-힣]/g, '_')
    ], {
      cwd: backendPath,
      detached: true,
      stdio: 'ignore'
    });

    // 프로세스를 백그라운드로 분리
    pythonProcess.unref();

    console.log('✅ Sora2 process started with task ID:', taskId);

    return NextResponse.json({
      success: true,
      taskId: taskId,
      message: 'SORA2 비디오 생성 시작됨 (백그라운드 실행 중)'
    });

  } catch (error) {
    console.error('❌ SORA2 generation error:', error);
    return NextResponse.json(
      { error: 'SORA2 비디오 생성 실패: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
