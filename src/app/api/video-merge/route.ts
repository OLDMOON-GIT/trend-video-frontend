import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getCurrentUser } from '@/lib/session';
import { createJob, updateJob, addJobLog, flushJobLogs, findJobById, getSettings, deductCredits, addCreditHistory } from '@/lib/db';

// Next.js App Router에서 큰 파일 업로드를 위한 설정
export const runtime = 'nodejs';
export const maxDuration = 600; // 10분 타임아웃 (대용량 비디오 처리를 위해 증가)

// 실행 중인 프로세스 관리
const runningProcesses = new Map<string, ChildProcess>();

export async function POST(request: NextRequest) {
  console.log('\n=== 비디오 병합 API 호출 시작 ===');
  console.log('⏰ 시작 시간:', new Date().toISOString());

  try {
    // 사용자 인증 확인
    console.log('🔐 사용자 인증 확인 중...');
    const user = await getCurrentUser(request);

    if (!user) {
      console.log('❌ 인증 실패: 로그인 필요');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }
    console.log('✅ 인증 성공:', user.userId);

    // FormData 읽기 (큰 파일의 경우 시간이 걸릴 수 있음)
    console.log('📦 FormData 읽기 시작...');
    const formDataStartTime = Date.now();

    let formData;
    try {
      formData = await request.formData();
      const formDataTime = Date.now() - formDataStartTime;
      console.log(`✅ FormData 읽기 완료 (${formDataTime}ms)`);
    } catch (formError: any) {
      console.error('❌ FormData 읽기 실패:', formError);
      return NextResponse.json(
        {
          error: 'FormData 읽기 실패: ' + formError.message,
          errorCode: 'FORMDATA_PARSE_ERROR',
          details: {
            message: formError.message,
            code: formError.code,
            stack: formError.stack?.split('\n').slice(0, 5)
          }
        },
        { status: 400 }
      );
    }

    // 비디오 파일들 수집
    console.log('📹 비디오 파일 수집 중...');
    const videoFiles: File[] = [];
    let totalSize = 0;
    for (let i = 0; i < 20; i++) { // 최대 20개까지 확인
      const video = formData.get(`video_${i}`) as File;
      if (video) {
        videoFiles.push(video);
        totalSize += video.size;
        console.log(`  📹 video_${i}: ${video.name} (${(video.size / 1024 / 1024).toFixed(2)}MB)`);
      }
    }
    console.log(`✅ 비디오 파일 수집 완료: ${videoFiles.length}개, 총 ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

    if (videoFiles.length === 0) {
      return NextResponse.json(
        { error: '최소 1개 이상의 비디오가 필요합니다.' },
        { status: 400 }
      );
    }

    // 총 파일 크기 체크 (2GB 제한)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB (대용량 비디오 지원)
    if (totalSize > maxSize) {
      return NextResponse.json(
        {
          error: `총 파일 크기가 너무 큽니다. (${(totalSize / 1024 / 1024).toFixed(1)}MB / 최대 2GB)`,
          errorCode: 'FILE_TOO_LARGE',
          currentSize: totalSize,
          maxSize: maxSize
        },
        { status: 413 } // 413 Payload Too Large
      );
    }

    // 비디오 파일 정렬: 파일명에서 시퀀스 번호 추출 또는 시간순
    videoFiles.sort((a, b) => {
      // 파일명에서 숫자 패턴 추출 (예: "1.mp4", "video_01.mp4", "scene-02.mp4")
      const extractNumber = (filename: string): number | null => {
        // 파일명에서 숫자만 추출
        const match = filename.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      };

      const numA = extractNumber(a.name);
      const numB = extractNumber(b.name);

      // 둘 다 숫자가 있으면 숫자로 정렬
      if (numA !== null && numB !== null) {
        return numA - numB;
      }

      // 숫자가 없으면 lastModified 시간으로 정렬 (시간순)
      return a.lastModified - b.lastModified;
    });

    // 자막 옵션 확인
    const addSubtitles = formData.get('addSubtitles') === 'true';

    // 워터마크 제거 옵션 확인
    const removeWatermark = formData.get('removeWatermark') === 'true';

    // TTS 음성 선택 확인
    const ttsVoice = formData.get('ttsVoice') as string || 'ko-KR-SoonBokNeural';
    console.log('🎤 TTS 음성:', ttsVoice);

    // 사용자가 입력한 제목 우선 사용
    let userTitle = formData.get('title') as string | null;
    if (userTitle) {
      userTitle = userTitle.trim();
    }

    // JSON 파일에서 나레이션 텍스트 및 제목 추출 (선택사항)
    let narrationText = '';
    let videoTitle = '';
    const jsonFile = formData.get('json') as File;

    let jsonText = '';
    let jsonData: any = null;
    if (jsonFile) {
      try {
        jsonText = await jsonFile.text();

        // 마크다운 코드 블록 제거 (```json ... ``` 형식)
        const cleanedJsonText = jsonText
          .replace(/^```json\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();

        jsonData = JSON.parse(cleanedJsonText);

        // JSON에서 제목 추출
        if (jsonData.title) {
          videoTitle = jsonData.title;
        } else if (jsonData.metadata?.title) {
          videoTitle = jsonData.metadata.title;
        }

        // 다양한 JSON 형식 지원
        // 1. scenes 배열에서 text/narration 추출 (우선순위)
        if (jsonData.scenes && Array.isArray(jsonData.scenes)) {
          narrationText = jsonData.scenes
            .map((s: any) => s.narration || s.text || s.prompt || s.sora_prompt || '')
            .filter((t: string) => t.trim())
            .join(' ');
        }
        // 2. 단일 text/narration 필드
        else if (jsonData.text || jsonData.narration) {
          narrationText = jsonData.text || jsonData.narration;
        }
        // 3. content 필드
        else if (jsonData.content) {
          narrationText = jsonData.content;
        }
        // 4. description 필드
        else if (jsonData.description) {
          narrationText = jsonData.description;
        }
        // 5. 그 외 - 모든 문자열 값을 추출
        else {
          const extractStrings = (obj: any): string[] => {
            const strings: string[] = [];
            for (const key in obj) {
              const value = obj[key];
              if (typeof value === 'string' && value.trim()) {
                strings.push(value.trim());
              } else if (typeof value === 'object' && value !== null) {
                strings.push(...extractStrings(value));
              }
            }
            return strings;
          };
          narrationText = extractStrings(jsonData).join(' ');
        }
      } catch (error: any) {
        console.error('JSON 파싱 오류:', error);
        // JSON 파싱 실패 시 TXT로 간주하고 원본 텍스트 그대로 사용
        if (jsonText && jsonText.trim()) {
          narrationText = jsonText.trim();
        }
      }
    }

    // 나레이션 텍스트 정규화: 연속된 콤마 정리 + 제어 명령 제거
    const normalizeNarration = (text: string): string => {
      // 1. 연속된 콤마를 하나로 (,,,,, → ,)
      let cleaned = text.replace(/,{2,}/g, ',');

      // 2. 제어 명령 제거 ([침묵], [무음], [pause] 등)
      // TTS와 자막에 나타나지 않도록 미리 제거
      cleaned = cleaned.replace(/[\[\［](무음|침묵|pause)\s*(\d+(?:\.\d+)?)?초?[\]\］]/g, '');

      // 3. 남은 공백 정리
      cleaned = cleaned.replace(/\s+/g, ' ').trim();

      return cleaned;
    };

    if (narrationText) {
      narrationText = normalizeNarration(narrationText);
      console.log('✅ 나레이션 텍스트 정규화 완료 (콤마 정리 + 제어 명령 제거)');
    }

    // 크레딧 설정 가져오기
    const settings = await getSettings();
    const cost = settings.videoGenerationCost;

    // 크레딧 차감 시도
    const deductResult = await deductCredits(user.userId, cost);

    if (!deductResult.success) {
      return NextResponse.json(
        {
          error: `크레딧이 부족합니다. (필요: ${cost}, 보유: ${deductResult.balance})`,
          requiredCredits: cost,
          currentCredits: deductResult.balance
        },
        { status: 402 } // 402 Payment Required
      );
    }

    // Job 생성 (사용자 입력 제목 > JSON 제목 > 기본 제목 순서)
    const jobTitle = userTitle || videoTitle || `비디오 병합 (${videoFiles.length}개)`;
    const jobId = `merge_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    createJob(user.userId, jobId, jobTitle, undefined, undefined, ttsVoice);

    // 크레딧 히스토리 추가
    await addCreditHistory(
      user.userId,
      'use',
      cost,
      `비디오 병합 생성 (${videoFiles.length}개 비디오)`
    );

    await addJobLog(jobId, `\n🎞️ 비디오 병합 시작\n📊 입력: ${videoFiles.length}개 비디오\n${narrationText ? '🎙️ TTS 나레이션: 있음\n' : ''}${addSubtitles && narrationText ? '📝 자막: 추가됨\n' : ''}${removeWatermark ? '🧹 워터마크 제거: 활성화\n' : ''}`);

    // trend-video-backend 경로
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const videoMergeScript = path.join(backendPath, 'video_merge.py');

    // 출력 디렉토리 생성
    const timestamp = Date.now();
    const outputDir = path.join(backendPath, 'output', `merge_${timestamp}`);
    await fs.mkdir(outputDir, { recursive: true });

    // 비디오 파일들을 임시 폴더에 저장
    const videoDir = path.join(outputDir, 'videos');
    await fs.mkdir(videoDir, { recursive: true });

    const savedVideoPaths: string[] = [];
    for (let i = 0; i < videoFiles.length; i++) {
      const video = videoFiles[i];
      // 0-패딩된 인덱스 사용 (00, 01, 02, ...)
      const paddedIndex = String(i).padStart(3, '0');
      const videoPath = path.join(videoDir, `${paddedIndex}_${video.name}`);
      const videoBuffer = Buffer.from(await video.arrayBuffer());
      await fs.writeFile(videoPath, videoBuffer);
      savedVideoPaths.push(videoPath);
      await addJobLog(jobId, `📹 비디오 ${i + 1} 저장: ${paddedIndex}_${video.name}`);
    }

    // 저장된 경로를 다시 정렬 (파일명 기준)
    savedVideoPaths.sort();

    // scenes 배열 추출 (비디오 배치용) - 이미 파싱한 jsonData 사용
    let scenes = null;
    if (jsonData && jsonData.scenes && Array.isArray(jsonData.scenes)) {
      scenes = jsonData.scenes.map((s: any) => ({
        narration: normalizeNarration(s.narration || s.text || ''), // 콤마 정규화 + 제어 명령 제거
        duration: s.duration || s.duration_seconds || 0
      }));
      console.log(`✅ ${scenes.length}개 씬의 나레이션 콤마 정규화 완료`);
    }

    // 설정 파일 생성
    const config = {
      video_files: savedVideoPaths,
      narration_text: narrationText,
      add_subtitles: addSubtitles,
      remove_watermark: removeWatermark,
      tts_voice: ttsVoice,  // TTS 음성 선택
      title: jobTitle,  // 사용자 입력 제목 우선
      scenes: scenes,  // scenes 배열 (비디오 배치용)
      output_dir: outputDir
    };

    const configPath = path.join(outputDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // 원본 JSON 파일도 함께 저장 (재시도 및 참조용)
    if (jsonText) {
      const originalJsonPath = path.join(outputDir, 'original_story.json');
      await fs.writeFile(originalJsonPath, jsonText);
      await addJobLog(jobId, `📄 원본 JSON 저장: original_story.json`);
    }

    await addJobLog(jobId, `\n⚙️ 설정 파일 생성 완료`);
    await addJobLog(jobId, `\n🚀 Python 스크립트 실행 중...\n`);

    // Python 프로세스 시작
    const pythonProcess = spawn('python', [videoMergeScript, configPath], {
      cwd: backendPath,
      shell: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      }
    });

    runningProcesses.set(jobId, pythonProcess);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let lastLogFlush = Date.now();

    pythonProcess.stdout?.on('data', async (data) => {
      const text = data.toString('utf-8');
      stdoutBuffer += text;
      await addJobLog(jobId, text);

      // 5초마다 로그 플러시
      const now = Date.now();
      if (now - lastLogFlush > 5000) {
        await flushJobLogs();
        lastLogFlush = now;
      }
    });

    pythonProcess.stderr?.on('data', async (data) => {
      const text = data.toString('utf-8');
      stderrBuffer += text;
      await addJobLog(jobId, `⚠️ ${text}`);
    });

    pythonProcess.on('close', async (code) => {
      runningProcesses.delete(jobId);
      await flushJobLogs();

      if (code === 0) {
        try {
          // Python stdout에서 JSON 결과 추출 (마지막 JSON만 매칭)
          const jsonMatches = stdoutBuffer.match(/\{[^{}]*"success"\s*:\s*true[^{}]*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            // 마지막 JSON 선택 (가장 최근 결과)
            const lastJson = jsonMatches[jsonMatches.length - 1];
            const result = JSON.parse(lastJson);
            const videoPath = result.output_video;

            console.log(`✅ 비디오 경로 저장: ${videoPath}`);
            await addJobLog(jobId, `\n✅ 비디오 병합 완료!\n📁 출력: ${path.basename(videoPath)}\n📍 전체 경로: ${videoPath}`);

            // Job 업데이트
            await updateJob(jobId, {
              status: 'completed',
              progress: 100,
              videoPath: videoPath,
              title: videoTitle || 'Video Merge'  // 제목도 함께 저장
            });
          } else {
            console.error('❌ JSON 파싱 실패 - 전체 출력:', stdoutBuffer);
            throw new Error('Python 스크립트 결과를 파싱할 수 없습니다.');
          }
        } catch (error: any) {
          console.error('❌ 비디오 병합 처리 실패:', error);
          await addJobLog(jobId, `\n❌ 오류: ${error.message}`);
          await updateJob(jobId, {
            status: 'failed',
            error: error.message
          });
        }
      } else {
        const errorMsg = stderrBuffer || '알 수 없는 오류';
        await addJobLog(jobId, `\n❌ 비디오 병합 실패\n${errorMsg}`);
        await updateJob(jobId, {
          status: 'failed',
          error: errorMsg
        });
      }
    });

    pythonProcess.on('error', async (error) => {
      runningProcesses.delete(jobId);
      await addJobLog(jobId, `\n❌ 프로세스 오류: ${error.message}`);
      await updateJob(jobId, {
        status: 'failed',
        error: error.message
      });
    });

    // Job 시작으로 업데이트
    await updateJob(jobId, {
      status: 'processing',
      progress: 10
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: '비디오 병합이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('비디오 병합 API 오류:', error);

    // ECONNRESET 에러 처리 (연결 중단)
    if (error.code === 'ECONNRESET' || error.message?.includes('aborted')) {
      return NextResponse.json(
        {
          error: '파일 업로드 중 연결이 끊어졌습니다.',
          errorCode: 'CONNECTION_ABORTED',
          suggestion: '다음 사항을 확인해주세요:\n1. 파일 크기가 2GB 이하인지 확인\n2. 네트워크 연결 상태 확인\n3. 파일 업로드를 완료할 때까지 페이지를 닫지 마세요',
          details: {
            errorType: error.code || 'UNKNOWN',
            message: error.message || 'Connection reset',
            timestamp: new Date().toISOString()
          }
        },
        { status: 500 }
      );
    }

    // 타임아웃 에러 처리
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return NextResponse.json(
        {
          error: '비디오 처리 시간이 초과되었습니다.',
          errorCode: 'TIMEOUT',
          suggestion: '비디오가 너무 길거나 복잡할 수 있습니다. 더 짧은 비디오로 나누어 시도해보세요.',
          details: {
            maxDuration: '10분',
            timestamp: new Date().toISOString()
          }
        },
        { status: 408 }
      );
    }

    // 일반 에러
    return NextResponse.json(
      {
        error: error.message || '알 수 없는 오류가 발생했습니다.',
        errorCode: 'INTERNAL_SERVER_ERROR',
        details: {
          type: error.constructor?.name || 'Error',
          timestamp: new Date().toISOString()
        }
      },
      { status: 500 }
    );
  }
}
