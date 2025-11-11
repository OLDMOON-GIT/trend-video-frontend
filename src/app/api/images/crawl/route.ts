import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

// 크롤링 작업 저장소 (메모리)
const crawlingTasks = new Map<string, {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  logs: string[];
  error?: string;
  createdAt: string;
}>();

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { scenes, contentId } = body;

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json({ error: '씬 데이터가 필요합니다.' }, { status: 400 });
    }

    // 작업 ID 생성
    const taskId = crypto.randomUUID();

    // 작업 저장
    crawlingTasks.set(taskId, {
      taskId,
      status: 'pending',
      logs: [],
      createdAt: new Date().toISOString()
    });

    console.log(`✅ 이미지 크롤링 작업 생성: ${taskId} (${scenes.length}개 씬)`);

    // 임시 JSON 파일 생성
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const tempDir = path.join(backendPath, 'temp');

    // temp 디렉토리가 없으면 생성
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (err) {
      console.log('temp 디렉토리 이미 존재');
    }

    const scenesFilePath = path.join(tempDir, `scenes_${taskId}.json`);
    await fs.writeFile(scenesFilePath, JSON.stringify(scenes, null, 2), 'utf-8');

    // Python 스크립트 실행
    const pythonScript = path.join(backendPath, 'src', 'image_crawler', 'image_crawler.py');

    console.log('Python 스크립트 실행:', pythonScript);
    console.log('씬 파일:', scenesFilePath);

    const task = crawlingTasks.get(taskId);
    if (task) {
      task.status = 'processing';
      task.logs.push(`🚀 Python 자동화 시작 (${scenes.length}개 씬)`);
    }

    // 백그라운드로 Python 실행 (시스템 Python 사용)
    const pythonProcess = spawn('python', [pythonScript, scenesFilePath], {
      cwd: backendPath,
      detached: false,
      shell: true
    });

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Python] ${output}`);

      const task = crawlingTasks.get(taskId);
      if (task) {
        task.logs.push(output.trim());
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error(`[Python Error] ${error}`);

      const task = crawlingTasks.get(taskId);
      if (task) {
        task.logs.push(`❌ ${error.trim()}`);
      }
    });

    pythonProcess.on('close', async (code) => {
      console.log(`Python 프로세스 종료: ${code}`);

      const task = crawlingTasks.get(taskId);
      if (task) {
        if (code === 0) {
          task.status = 'completed';
          task.logs.push('✅ 모든 이미지 생성 완료!');
        } else {
          task.status = 'failed';
          task.error = `Python 스크립트가 오류로 종료되었습니다. (코드: ${code})`;
          task.logs.push(task.error);
        }
      }

      // 임시 파일 삭제
      try {
        await fs.unlink(scenesFilePath);
      } catch (err) {
        console.error('임시 파일 삭제 실패:', err);
      }
    });

    return NextResponse.json({
      success: true,
      taskId,
      message: 'Whisk 자동화가 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 이미지 크롤링 API 오류:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId가 필요합니다.' }, { status: 400 });
    }

    const task = crawlingTasks.get(taskId);
    if (!task) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      status: task.status,
      logs: task.logs,
      error: task.error
    });

  } catch (error: any) {
    console.error('❌ 작업 상태 조회 오류:', error);
    return NextResponse.json(
      { error: error.message || '서버 오류' },
      { status: 500 }
    );
  }
}
