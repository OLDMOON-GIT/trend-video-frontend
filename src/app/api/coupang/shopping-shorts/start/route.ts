import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const TASKS_DIR = path.join(DATA_DIR, 'shopping-shorts-tasks');
const BACKEND_DIR = path.join(process.cwd(), '..', 'trend-video-backend');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

// 작업 상태 저장 인터페이스
interface TaskStatus {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  progress: string;
  startTime: string;
  endTime?: string;
  results?: any[];
  error?: string;
  logs: string[];
}

// 실행 중인 프로세스 저장
const runningProcesses = new Map<string, any>();

async function loadUserSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

async function ensureTasksDir() {
  try {
    await fs.mkdir(TASKS_DIR, { recursive: true });
  } catch {
    // 디렉토리가 이미 존재
  }
}

async function saveTaskStatus(taskId: string, status: TaskStatus) {
  await ensureTasksDir();
  const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
  await fs.writeFile(taskFile, JSON.stringify(status, null, 2), 'utf-8');
}

async function loadTaskStatus(taskId: string): Promise<TaskStatus | null> {
  try {
    const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
    const data = await fs.readFile(taskFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// POST - 쇼핑 쇼츠 파이프라인 시작
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { productLimit = 5, category = 'electronics', videosPerProduct = 3, openaiApiKey } = body;

    // 작업 ID 생성
    const taskId = crypto.randomBytes(16).toString('hex');

    // 초기 작업 상태 저장
    const initialStatus: TaskStatus = {
      taskId,
      status: 'running',
      progress: '파이프라인 시작 중...',
      startTime: new Date().toISOString(),
      logs: [`[${new Date().toISOString()}] 쿠팡 → Douyin 쇼츠 자동화 파이프라인 시작`]
    };
    await saveTaskStatus(taskId, initialStatus);

    // Python 스크립트 경로 (새 파이프라인)
    const scriptPath = path.join(BACKEND_DIR, 'src', 'pipelines', 'coupang_to_douyin_pipeline.py');

    // Python 프로세스 실행
    const pythonProcess = spawn('python', [
      scriptPath
    ], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        COUPANG_CATEGORY: category,
        PRODUCT_LIMIT: String(productLimit),
        VIDEOS_PER_PRODUCT: String(videosPerProduct),
        OPENAI_API_KEY: openaiApiKey || '',
        FRONTEND_URL: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}`,
        PYTHONIOENCODING: 'utf-8'
      }
    });

    // 프로세스 저장
    runningProcesses.set(taskId, pythonProcess);

    // 실시간 로그 캡처
    let currentStatus = initialStatus;

    pythonProcess.stdout?.on('data', async (data) => {
      const log = data.toString();
      currentStatus.logs.push(`[${new Date().toISOString()}] ${log}`);

      // 진행 상황 파싱 (새 파이프라인)
      if (log.includes('Step 1:') || log.includes('쿠팡 베스트셀러')) {
        currentStatus.progress = '쿠팡 베스트셀러 가져오는 중...';
      } else if (log.includes('Step 2:') || log.includes('상품명 번역')) {
        currentStatus.progress = '상품명 중국어로 번역 중...';
      } else if (log.includes('Step 3:') || log.includes('Douyin 영상 검색')) {
        currentStatus.progress = 'Douyin 영상 검색 중...';
      } else if (log.includes('Step 4:') || log.includes('영상 다운로드')) {
        currentStatus.progress = '영상 다운로드 중...';
      } else if (log.includes('Step 5:') || log.includes('TTS')) {
        currentStatus.progress = 'TTS 음성 생성 중...';
      } else if (log.includes('Step 6:') || log.includes('업로드')) {
        currentStatus.progress = '멀티 플랫폼 업로드 중...';
      }

      await saveTaskStatus(taskId, currentStatus);
    });

    pythonProcess.stderr?.on('data', async (data) => {
      const log = data.toString();
      currentStatus.logs.push(`[${new Date().toISOString()}] ERROR: ${log}`);
      await saveTaskStatus(taskId, currentStatus);
    });

    pythonProcess.on('close', async (code) => {
      if (code === 0) {
        // 성공 - 결과 파일 읽기 (새 파이프라인 출력 디렉토리)
        try {
          const outputDir = path.join(BACKEND_DIR, 'coupang_shorts_output', 'data');
          const files = await fs.readdir(outputDir);
          const results = [];

          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = path.join(outputDir, file);
              const content = await fs.readFile(filePath, 'utf-8');
              results.push(JSON.parse(content));
            }
          }

          currentStatus.status = 'completed';
          currentStatus.progress = '파이프라인 완료!';
          currentStatus.endTime = new Date().toISOString();
          currentStatus.results = results;
          currentStatus.logs.push(`[${new Date().toISOString()}] 파이프라인 완료 - ${results.length}개 상품 처리됨`);
        } catch (error: any) {
          currentStatus.status = 'failed';
          currentStatus.progress = '결과 파일 읽기 실패';
          currentStatus.error = error.message;
          currentStatus.endTime = new Date().toISOString();
        }
      } else {
        currentStatus.status = 'failed';
        currentStatus.progress = '파이프라인 실패';
        currentStatus.error = `프로세스가 코드 ${code}로 종료됨`;
        currentStatus.endTime = new Date().toISOString();
      }

      await saveTaskStatus(taskId, currentStatus);
      runningProcesses.delete(taskId);
    });

    return NextResponse.json({
      success: true,
      taskId,
      message: '쇼핑 쇼츠 파이프라인이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('파이프라인 시작 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '파이프라인 시작 중 오류 발생'
    }, { status: 500 });
  }
}

// GET - 작업 상태 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId가 필요합니다.' }, { status: 400 });
    }

    const status = await loadTaskStatus(taskId);

    if (!status) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      status
    });

  } catch (error: any) {
    console.error('작업 상태 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '작업 상태 조회 중 오류 발생'
    }, { status: 500 });
  }
}

// DELETE - 작업 중지
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId가 필요합니다.' }, { status: 400 });
    }

    const process = runningProcesses.get(taskId);
    if (process) {
      process.kill();
      runningProcesses.delete(taskId);

      // 작업 상태 업데이트
      const status = await loadTaskStatus(taskId);
      if (status) {
        status.status = 'failed';
        status.progress = '사용자에 의해 중지됨';
        status.endTime = new Date().toISOString();
        status.logs.push(`[${new Date().toISOString()}] 작업이 중지되었습니다.`);
        await saveTaskStatus(taskId, status);
      }

      return NextResponse.json({
        success: true,
        message: '작업이 중지되었습니다.'
      });
    } else {
      return NextResponse.json({
        success: false,
        error: '실행 중인 작업을 찾을 수 없습니다.'
      }, { status: 404 });
    }

  } catch (error: any) {
    console.error('작업 중지 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '작업 중지 중 오류 발생'
    }, { status: 500 });
  }
}
