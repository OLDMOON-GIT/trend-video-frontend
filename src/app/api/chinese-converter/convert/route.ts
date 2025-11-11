import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  createChineseConverterJob,
  updateChineseConverterJob,
  addChineseConverterJobLog,
  findChineseConverterJobById
} from '@/lib/db-chinese-converter';

// 로그 추가 헬퍼 함수
function addLog(jobId: string, message: string) {
  addChineseConverterJobLog(jobId, message);
  console.log(`[중국영상변환 ${jobId}] ${message}`);
}

/**
 * POST /api/chinese-converter/convert
 * 중국어 영상을 한국어로 변환
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // FormData 파싱
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const title = formData.get('title') as string | null;

    if (!videoFile) {
      return NextResponse.json({ error: '비디오 파일이 필요합니다' }, { status: 400 });
    }

    // 파일 저장 경로 생성
    const jobId = uuidv4();
    const uploadDir = path.join(process.cwd(), '..', 'trend-video-backend', 'uploads', 'chinese-converter', jobId);

    // 디렉토리 생성
    await mkdir(uploadDir, { recursive: true });

    // 파일 저장
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    const originalFileName = videoFile.name;
    const fileExtension = path.extname(originalFileName);
    const savedFileName = `original${fileExtension}`;
    const filePath = path.join(uploadDir, savedFileName);

    await writeFile(filePath, buffer);

    // 데이터베이스에 작업 생성
    const job = createChineseConverterJob(user.userId, jobId, filePath, title || undefined);

    console.log('✅ 중국영상변환 작업 생성:', {
      jobId,
      userId: user.userId,
      title: title || '(제목 없음)',
      fileName: originalFileName,
      size: videoFile.size,
      path: filePath
    });

    // 로그 기록
    addLog(jobId, '📁 비디오 파일 업로드 완료');
    if (title) {
      addLog(jobId, `🏷️ 상품 제목: ${title}`);
    }
    addLog(jobId, `📹 파일명: ${originalFileName}`);
    addLog(jobId, `💾 파일 크기: ${(videoFile.size / 1024 / 1024).toFixed(2)} MB`);
    addLog(jobId, '⏳ 변환 작업 대기 중...');

    // 백그라운드에서 변환 작업 시작 (Python 스크립트 호출)
    setTimeout(() => {
      runConversion(jobId, title || undefined);
    }, 1000);

    return NextResponse.json({
      success: true,
      jobId,
      message: '변환 작업이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 중국영상변환 오류:', error);
    return NextResponse.json(
      { error: error.message || '변환 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

/**
 * Python 스크립트를 사용하여 실제 변환 작업 수행
 */
async function runConversion(jobId: string, title?: string) {
  const job = findChineseConverterJobById(jobId);
  if (!job) return;

  try {
    updateChineseConverterJob(jobId, { status: 'processing', progress: 5 });
    addLog(jobId, '🚀 변환 작업 시작...');

    const inputPath = job.videoPath;
    const outputDir = path.dirname(inputPath || '');
    const pythonScript = path.join(process.cwd(), '..', 'trend-video-backend', 'chinese_video_converter.py');

    // Python 스크립트 실행
    const { spawn } = await import('child_process');

    const args = [
      pythonScript,
      '--input', inputPath || '',
      '--output-dir', outputDir
    ];

    // 제목이 있으면 추가
    if (title) {
      args.push('--title', title);
    }

    const pythonProcess = spawn('python', args);

    let lastProgressLine = '';
    const progressPattern = /^\s*\d+%\|[█▌\s]+\|/; // 진행률 바 패턴

    // stdout 처리
    pythonProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString('utf-8');
      const lines = output.split(/\r?\n/);

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        console.log(`[중국영상변환 ${jobId}] ${trimmedLine}`);

        // 진행률 바인지 확인
        const isProgressBar = progressPattern.test(trimmedLine);

        if (isProgressBar) {
          // 진행률 바는 하나의 로그로 유지 (마지막 로그 업데이트)
          if (lastProgressLine !== trimmedLine) {
            // DB에서 마지막 로그를 삭제하고 새로운 진행률로 교체는 복잡하므로
            // 일단 로그에 추가는 하되 UI에서는 마지막 진행률만 보이도록 처리
            // 또는 특정 주기마다만 로그 추가 (예: 10% 단위)
            const percentMatch = trimmedLine.match(/(\d+)%/);
            if (percentMatch) {
              const percent = parseInt(percentMatch[1]);
              // 10% 단위로만 로그 추가
              if (percent % 10 === 0 && lastProgressLine !== trimmedLine) {
                addLog(jobId, `⏳ 다운로드 중: ${percent}%`);
                lastProgressLine = trimmedLine;
              }
            }
          }
        } else {
          // 일반 로그
          addLog(jobId, trimmedLine);
          lastProgressLine = '';
        }

        // 진행률 업데이트
        if (trimmedLine.includes('1️⃣') || trimmedLine.includes('워터마크 제거')) {
          updateChineseConverterJob(jobId, { progress: 10 });
        } else if (trimmedLine.includes('2️⃣') || trimmedLine.includes('오디오 추출')) {
          updateChineseConverterJob(jobId, { progress: 20 });
        } else if (trimmedLine.includes('3️⃣') || trimmedLine.includes('음성 인식')) {
          updateChineseConverterJob(jobId, { progress: 35 });
        } else if (trimmedLine.includes('4️⃣') || trimmedLine.includes('번역')) {
          updateChineseConverterJob(jobId, { progress: 50 });
        } else if (trimmedLine.includes('5️⃣') || trimmedLine.includes('TTS') || trimmedLine.includes('음성 생성')) {
          updateChineseConverterJob(jobId, { progress: 65 });
        } else if (trimmedLine.includes('6️⃣') || trimmedLine.includes('자막 생성')) {
          updateChineseConverterJob(jobId, { progress: 80 });
        } else if (trimmedLine.includes('7️⃣') || trimmedLine.includes('영상 합성')) {
          updateChineseConverterJob(jobId, { progress: 90 });
        }
      }
    });

    // stderr 처리
    pythonProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString('utf-8');
      console.error(`[중국영상변환 ${jobId}] ERROR: ${error}`);
      if (!error.includes('Warning') && !error.includes('warning')) {
        addLog(jobId, `⚠️ ${error}`);
      }
    });

    // 프로세스 종료 처리
    pythonProcess.on('close', async (code: number) => {
      // STOP 파일 확인 (중지 요청 여부)
      const stopFilePath = path.join(outputDir, 'STOP');
      let wasStopped = false;
      try {
        const fs = await import('fs/promises');
        await fs.access(stopFilePath);
        wasStopped = true;
        // STOP 파일 삭제
        await fs.unlink(stopFilePath).catch(() => {});
      } catch {
        // STOP 파일 없음
      }

      if (wasStopped) {
        // 중지됨
        updateChineseConverterJob(jobId, {
          status: 'failed',
          error: '사용자가 작업을 중지했습니다'
        });
        addLog(jobId, '🛑 작업이 중지되었습니다');
      } else if (code === 0) {
        // 성공
        const outputPath = path.join(outputDir, `converted_original.mp4`);
        updateChineseConverterJob(jobId, {
          status: 'completed',
          progress: 100,
          outputPath
        });
        addLog(jobId, '✅ 변환 작업 완료!');
        addLog(jobId, '📦 내 콘텐츠에서 다운로드 가능합니다');
      } else {
        // 실패
        updateChineseConverterJob(jobId, {
          status: 'failed',
          error: `프로세스 종료 코드: ${code}`
        });
        addLog(jobId, `❌ 변환 실패 (종료 코드: ${code})`);
      }
    });

    pythonProcess.on('error', (error: Error) => {
      console.error(`[중국영상변환 ${jobId}] 프로세스 오류:`, error);
      updateChineseConverterJob(jobId, {
        status: 'failed',
        error: error.message
      });
      addLog(jobId, `❌ 프로세스 오류: ${error.message}`);
    });

  } catch (error: any) {
    console.error(`[중국영상변환 ${jobId}] 오류:`, error);
    updateChineseConverterJob(jobId, { status: 'failed', error: error.message });
    addLog(jobId, `❌ 변환 실패: ${error.message}`);
  }
}
