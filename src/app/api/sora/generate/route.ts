import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const { script, title } = await request.json();

    if (!script || !title) {
      return NextResponse.json(
        { error: 'Script and title are required' },
        { status: 400 }
      );
    }

    // script가 JSON 형식이면 파싱
    let actualScript = script;
    try {
      const parsed = JSON.parse(script);
      // JSON 객체면 다시 문자열로
      actualScript = typeof parsed === 'object' ? JSON.stringify(parsed) : script;
    } catch {
      // JSON이 아니면 그대로 사용
      actualScript = script;
    }

    // Task ID 생성
    const taskId = uuidv4();

    // SoraExtend 경로
    const soraExtendPath = path.join(process.cwd(), '..', 'SoraExtend');

    // Python 스크립트 실행 (백그라운드)
    const pythonProcess = spawn('python', [
      'run.py',
      actualScript,
      '--duration', '8',
      '--num-segments', '3',
      '--size', '1280x720'
    ], {
      cwd: soraExtendPath,
      detached: true,
      stdio: 'ignore'
    });

    // 프로세스를 백그라운드로 분리
    pythonProcess.unref();

    return NextResponse.json({
      success: true,
      taskId: taskId,
      message: 'SORA2 비디오 생성 시작됨'
    });

  } catch (error) {
    console.error('SORA2 generation error:', error);
    return NextResponse.json(
      { error: 'SORA2 비디오 생성 실패: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
