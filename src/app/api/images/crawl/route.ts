import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';

// 작업 상태 관리
const taskStatus = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  logs: string[];
  error?: string;
  processId?: number;
}>();

function addLog(taskId: string, message: string) {
  const currentTask = taskStatus.get(taskId);
  if (currentTask) {
    currentTask.logs.push(message);
    console.log(`[${taskId}] ${message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scenes, contentId } = await request.json();

    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json({ error: '씬 데이터가 필요합니다.' }, { status: 400 });
    }

    // 작업 ID 생성
    const taskId = `crawl_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 작업 상태 초기화
    taskStatus.set(taskId, {
      status: 'pending',
      progress: 0,
      logs: []
    });

    console.log(`🎬 이미지 크롤링 시작 - taskId: ${taskId}, 씬 개수: ${scenes.length}`);
    addLog(taskId, `🚀 이미지 크롤링 시작 - 총 ${scenes.length}개 씬`);

    // 백그라운드에서 작업 실행
    (async () => {
      try {
        // 임시 JSON 파일 생성
        const tempDir = path.join(process.cwd(), 'temp');
        await fs.mkdir(tempDir, { recursive: true });

        const scenesFile = path.join(tempDir, `scenes_${taskId}.json`);
        await fs.writeFile(scenesFile, JSON.stringify(scenes, null, 2), 'utf-8');

        addLog(taskId, `📄 씬 데이터 저장: ${scenesFile}`);

        // Python 스크립트 경로
        const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
        const scriptPath = path.join(backendPath, 'src', 'image_crawler', 'image_crawler.py');

        addLog(taskId, '🐍 Python 스크립트 실행 중...');

        const currentTask = taskStatus.get(taskId);
        if (currentTask) currentTask.status = 'processing';

        // Python 스크립트 실행
        const pythonProcess = spawn('python', ['-m', 'src.image_crawler.image_crawler', scenesFile], {
          cwd: backendPath,
          shell: true
        });

        if (currentTask) currentTask.processId = pythonProcess.pid;

        addLog(taskId, `🔢 프로세스 PID: ${pythonProcess.pid}`);

        // stdout 처리
        pythonProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log(`[Python stdout] ${output}`);
          addLog(taskId, output.trim());

          // 진행률 계산 (간단히 로그 개수 기준)
          const progressTask = taskStatus.get(taskId);
          if (progressTask) {
            const completed = (progressTask.logs.filter(log => log.includes('✅')).length);
            progressTask.progress = Math.min(Math.floor((completed / scenes.length) * 100), 90);
          }
        });

        // stderr 처리
        pythonProcess.stderr.on('data', (data) => {
          const output = data.toString();
          console.error(`[Python stderr] ${output}`);
          addLog(taskId, `⚠️ ${output.trim()}`);
        });

        // 프로세스 종료 처리
        pythonProcess.on('close', async (code) => {
          console.log(`Python 프로세스 종료: ${code}`);

          // 임시 파일 삭제
          try {
            await fs.unlink(scenesFile);
          } catch (err) {
            console.error('임시 파일 삭제 실패:', err);
          }

          const finalTask = taskStatus.get(taskId);
          if (finalTask) {
            if (code === 0) {
              finalTask.status = 'completed';
              finalTask.progress = 100;
              addLog(taskId, '✅ 모든 씬 처리 완료!');
            } else {
              finalTask.status = 'failed';
              finalTask.error = `Python 스크립트가 코드 ${code}로 종료되었습니다.`;
              addLog(taskId, `❌ 오류: 프로세스가 코드 ${code}로 종료됨`);
            }
          }
        });

      } catch (error: any) {
        console.error(`❌ [${taskId}] 이미지 크롤링 오류:`, error);
        addLog(taskId, `❌ 오류 발생: ${error.message}`);
        const errorTask = taskStatus.get(taskId);
        if (errorTask) {
          errorTask.status = 'failed';
          errorTask.error = error.message;
        }
      }
    })();

    // 즉시 taskId 반환
    return NextResponse.json({
      taskId,
      status: 'pending',
      message: '이미지 크롤링이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 이미지 크롤링 API 오류:', error);
    return NextResponse.json(
      { error: error?.message || '이미지 크롤링 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 작업 상태 조회 API
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId가 필요합니다.' }, { status: 400 });
    }

    const currentTask = taskStatus.get(taskId);
    if (!currentTask) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(currentTask);
  } catch (error: any) {
    console.error('❌ 작업 상태 조회 오류:', error);
    return NextResponse.json(
      { error: error?.message || '작업 상태 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
