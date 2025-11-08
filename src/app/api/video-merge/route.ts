import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getCurrentUser } from '@/lib/session';
import { createJob, updateJob, addJobLog, flushJobLogs, findJobById, getSettings, deductCredits, addCreditHistory } from '@/lib/db';

// 실행 중인 프로세스 관리
const runningProcesses = new Map<string, ChildProcess>();

export async function POST(request: NextRequest) {
  try {
    // 사용자 인증 확인
    console.log('=== 비디오 병합 요청 시작 ===');
    console.log('쿠키:', request.cookies.getAll());

    const user = await getCurrentUser(request);
    console.log('인증된 사용자:', user);

    if (!user) {
      console.log('❌ 인증 실패: 로그인이 필요합니다');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log('✅ 인증 성공:', user.email);

    const formData = await request.formData();

    // 비디오 파일들 수집
    const videoFiles: File[] = [];
    for (let i = 0; i < 20; i++) { // 최대 20개까지 확인
      const video = formData.get(`video_${i}`) as File;
      if (video) videoFiles.push(video);
    }

    if (videoFiles.length === 0) {
      return NextResponse.json(
        { error: '최소 1개 이상의 비디오가 필요합니다.' },
        { status: 400 }
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

    console.log('📹 정렬된 비디오 순서:');
    videoFiles.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.name} (lastModified: ${new Date(f.lastModified).toISOString()})`);
    });

    // 자막 옵션 확인
    const addSubtitles = formData.get('addSubtitles') === 'true';
    console.log('📝 자막 추가 옵션:', addSubtitles);

    // 워터마크 제거 옵션 확인
    const removeWatermark = formData.get('removeWatermark') === 'true';
    console.log('🧹 워터마크 제거 옵션:', removeWatermark);

    // JSON 파일에서 나레이션 텍스트 및 제목 추출 (선택사항)
    let narrationText = '';
    let videoTitle = '';
    const jsonFile = formData.get('json') as File;

    console.log('📄 JSON 파일 확인:', jsonFile ? `있음 (${jsonFile.name})` : '없음');

    // FormData 전체 키 확인 (디버깅용)
    console.log('📦 FormData 키 목록:', Array.from(formData.keys()));

    if (jsonFile) {
      try {
        let jsonText = await jsonFile.text();
        console.log('📄 JSON 원본 텍스트 길이:', jsonText.length);
        console.log('📄 JSON 원본 미리보기:', jsonText.substring(0, 200));

        // 마크다운 코드 블록 제거 (```json ... ``` 형식)
        jsonText = jsonText
          .replace(/^```json\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();

        const jsonData = JSON.parse(jsonText);
        console.log('📄 JSON 파싱 완료:', Object.keys(jsonData));

        // JSON에서 제목 추출
        if (jsonData.title) {
          videoTitle = jsonData.title;
          console.log(`✅ JSON에서 제목 추출: "${videoTitle}"`);
        }

        // 다양한 JSON 형식 지원
        // 1. scenes 배열에서 text/narration 추출 (우선순위)
        if (jsonData.scenes && Array.isArray(jsonData.scenes)) {
          narrationText = jsonData.scenes
            .map((s: any) => s.text || s.narration || s.prompt || s.sora_prompt || '')
            .filter((t: string) => t.trim())
            .join(' ');

          console.log(`✅ JSON에서 ${jsonData.scenes.length}개 씬의 텍스트 추출 완료`);
        }
        // 2. 단일 text/narration 필드
        else if (jsonData.text || jsonData.narration) {
          narrationText = jsonData.text || jsonData.narration;
          console.log(`✅ JSON에서 단일 텍스트 추출 완료`);
        }
        // 3. content 필드
        else if (jsonData.content) {
          narrationText = jsonData.content;
          console.log(`✅ JSON에서 content 텍스트 추출 완료`);
        }
        // 4. description 필드
        else if (jsonData.description) {
          narrationText = jsonData.description;
          console.log(`✅ JSON에서 description 텍스트 추출 완료`);
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
          console.log(`✅ JSON에서 자동 추출된 텍스트 수집 완료`);
        }

        console.log(`📝 나레이션 텍스트 길이: ${narrationText.length}자`);
        console.log(`📝 나레이션 미리보기: ${narrationText.substring(0, 100)}...`);
      } catch (error: any) {
        console.error('⚠️ JSON 파싱 오류:', error);
        // JSON 파싱 실패 시 TXT로 간주하고 그대로 사용
        try {
          narrationText = await jsonFile.text();
          console.log('📝 JSON 파싱 실패, 순수 텍스트로 사용:', narrationText.substring(0, 100));
        } catch (txtError) {
          console.error('❌ 텍스트 읽기도 실패:', txtError);
          // 파일을 읽을 수 없는 경우에만 에러 반환
          return NextResponse.json(
            { error: '파일을 읽을 수 없습니다.' },
            { status: 400 }
          );
        }
      }
    }

    // 크레딧 설정 가져오기
    const settings = await getSettings();
    const cost = settings.videoGenerationCost;

    // 크레딧 차감 시도
    const deductResult = await deductCredits(user.userId, cost);

    if (!deductResult.success) {
      console.log(`❌ 크레딧 부족: ${user.email}, 필요: ${cost}, 보유: ${deductResult.balance}`);
      return NextResponse.json(
        {
          error: `크레딧이 부족합니다. (필요: ${cost}, 보유: ${deductResult.balance})`,
          requiredCredits: cost,
          currentCredits: deductResult.balance
        },
        { status: 402 } // 402 Payment Required
      );
    }

    console.log(`✅ 크레딧 차감 성공: ${user.email}, 차감: ${cost}, 잔액: ${deductResult.balance}`);

    // Job 생성 (JSON에서 추출한 제목 또는 기본 제목 사용)
    const jobTitle = videoTitle || `비디오 병합 (${videoFiles.length}개)`;
    const jobId = `merge_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(`📝 Job 제목: "${jobTitle}"`);

    createJob(user.userId, jobId, jobTitle);

    console.log(`✅ Job 생성 완료: ${jobId}`);

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

    // scenes 배열 추출 (비디오 배치용)
    let scenes = null;
    if (jsonFile) {
      try {
        let jsonText = await jsonFile.text();
        jsonText = jsonText
          .replace(/^```json\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
        const jsonData = JSON.parse(jsonText);

        if (jsonData.scenes && Array.isArray(jsonData.scenes)) {
          scenes = jsonData.scenes.map((s: any) => ({
            narration: s.text || s.narration || '',
            duration: s.duration_seconds || 0
          }));
          console.log(`✅ scenes 배열 추출: ${scenes.length}개 씬`);
        }
      } catch (e) {
        console.log('⚠️ scenes 배열 추출 실패, 무시');
      }
    }

    // 설정 파일 생성
    const config = {
      video_files: savedVideoPaths,
      narration_text: narrationText,
      add_subtitles: addSubtitles,
      remove_watermark: removeWatermark,
      title: videoTitle,  // 대본의 title
      scenes: scenes,  // scenes 배열 (비디오 배치용)
      output_dir: outputDir
    };

    const configPath = path.join(outputDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

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

      console.log(`Python 프로세스 종료 (코드: ${code})`);
      console.log('stdout:', stdoutBuffer);
      console.log('stderr:', stderrBuffer);

      if (code === 0) {
        try {
          // Python stdout에서 JSON 결과 추출
          const jsonMatch = stdoutBuffer.match(/\{[\s\S]*"success":\s*true[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            const videoPath = result.output_video;

            await addJobLog(jobId, `\n✅ 비디오 병합 완료!\n📁 출력: ${path.basename(videoPath)}`);

            // Job 업데이트
            await updateJob(jobId, {
              status: 'completed',
              progress: 100,
              videoPath: videoPath
            });
          } else {
            throw new Error('Python 스크립트 결과를 파싱할 수 없습니다.');
          }
        } catch (error: any) {
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
    console.error('❌ 비디오 병합 API 오류:', error);
    return NextResponse.json(
      { error: error.message || '알 수 없는 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
