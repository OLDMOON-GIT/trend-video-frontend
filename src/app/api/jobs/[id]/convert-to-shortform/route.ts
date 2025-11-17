import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function POST(
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

    // 요청 body에서 AI 설정 가져오기
    const body = await request.json().catch(() => ({}));
    const agentName = body.agentName || 'chatgpt';
    const modelName = body.modelName || '';

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 원본 작업 조회 (jobs 또는 contents 테이블)
    const db = new Database(dbPath);
    console.log('🔍 작업 조회:', { jobId, userId: user.userId });

    // jobs 테이블에서 조회
    let originalJob: any = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(jobId, user.userId);

    // jobs에 없으면 contents 테이블에서 조회 (upload_ 프리픽스)
    if (!originalJob) {
      console.log('⚠️ jobs 테이블에 없음, contents 테이블 확인...');
      originalJob = db.prepare('SELECT * FROM contents WHERE id = ? AND user_id = ?').get(jobId, user.userId) as any;

      if (originalJob) {
        console.log('✅ contents 테이블에서 찾음:', originalJob.id);
        // contents 테이블의 컬럼명을 jobs 형식으로 변환
        originalJob.video_path = originalJob.video_path || originalJob.output_path;
      }
    } else {
      console.log('✅ jobs 테이블에서 찾음:', originalJob.id);
    }

    if (!originalJob) {
      console.log('❌ 작업을 찾을 수 없음:', jobId);
      db.close();
      return NextResponse.json(
        { error: '원본 작업을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // videoPath에서 폴더 추출
    console.log('📁 비디오 경로 확인:', originalJob.video_path);

    if (!originalJob.video_path) {
      console.log('❌ 비디오 경로 없음. 전체 데이터:', JSON.stringify(originalJob, null, 2));
      db.close();
      return NextResponse.json(
        { error: '비디오 경로를 찾을 수 없습니다. 이 작업은 아직 완료되지 않았을 수 있습니다.' },
        { status: 400 }
      );
    }

    const normalizedPath = originalJob.video_path.replace(/\\/g, '/');
    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    // 대본 찾기
    let scriptContent = '';
    let folderPath = '';

    // output 폴더인지 확인
    const outputMatch = normalizedPath.match(/output\/([^/]+)/);
    if (outputMatch) {
      const folderName = outputMatch[1];
      folderPath = path.join(backendPath, 'output', folderName);

      // original_story.json 시도
      try {
        const originalJsonPath = path.join(folderPath, 'original_story.json');
        scriptContent = await fs.readFile(originalJsonPath, 'utf-8');
      } catch (error) {
        // config.json 시도
        try {
          const configPath = path.join(folderPath, 'config.json');
          const configContent = await fs.readFile(configPath, 'utf-8');
          const config = JSON.parse(configContent);

          let scriptData: any = {};
          if (config.narration_text) scriptData.narration = config.narration_text;
          if (config.scenes) scriptData.scenes = config.scenes;
          if (config.title) scriptData.title = config.title;

          scriptContent = JSON.stringify(scriptData, null, 2);
        } catch (configError) {
          db.close();
          return NextResponse.json(
            { error: '대본 파일을 찾을 수 없습니다.' },
            { status: 404 }
          );
        }
      }
    } else {
      // input 폴더 확인
      const inputMatch = normalizedPath.match(/input\/([^/]+)/);
      if (inputMatch) {
        const folderName = inputMatch[1];
        folderPath = path.join(backendPath, 'input', folderName);

        try {
          const storyPath = path.join(folderPath, 'story.json');
          scriptContent = await fs.readFile(storyPath, 'utf-8');
        } catch (error) {
          db.close();
          return NextResponse.json(
            { error: '대본 파일을 찾을 수 없습니다.' },
            { status: 404 }
          );
        }
      } else {
        // uploads 폴더 확인 (upload_ ID)
        const uploadsMatch = normalizedPath.match(/uploads\/([^/]+)/);
        if (uploadsMatch) {
          const folderName = uploadsMatch[1];
          folderPath = path.join(backendPath, 'uploads', folderName);
          console.log('📂 uploads 폴더 확인:', folderPath);

          // story.json 시도
          try {
            const storyPath = path.join(folderPath, 'story.json');
            scriptContent = await fs.readFile(storyPath, 'utf-8');
            console.log('✅ story.json 찾음');

            // 내용 요약 출력
            try {
              const storyData = JSON.parse(scriptContent);
              console.log('📄 story.json 내용:');
              console.log(`   - 제목: ${storyData.title || '(제목 없음)'}`);
              console.log(`   - 타입: ${storyData.type || '(타입 없음)'}`);
              console.log(`   - 씬 개수: ${storyData.scenes?.length || 0}개`);
              if (storyData.metadata) {
                console.log(`   - 메타데이터:`, JSON.stringify(storyData.metadata, null, 2));
              }
              console.log('');
            } catch (parseErr) {
              console.log('   (JSON 파싱 실패, 원본 텍스트 사용)\n');
            }
          } catch (error) {
            // script.json 시도
            try {
              const scriptPath = path.join(folderPath, 'script.json');
              scriptContent = await fs.readFile(scriptPath, 'utf-8');
              console.log('✅ script.json 찾음');

              // 내용 요약 출력
              try {
                const scriptData = JSON.parse(scriptContent);
                console.log('📄 script.json 내용:');
                console.log(`   - 제목: ${scriptData.title || '(제목 없음)'}`);
                console.log(`   - 타입: ${scriptData.type || '(타입 없음)'}`);
                console.log(`   - 씬 개수: ${scriptData.scenes?.length || 0}개\n`);
              } catch (parseErr) {
                console.log('   (JSON 파싱 실패, 원본 텍스트 사용)\n');
              }
            } catch (scriptError) {
              console.log('❌ 대본 파일 없음:', { storyError: error, scriptError });
              db.close();
              return NextResponse.json(
                { error: '대본 파일을 찾을 수 없습니다. (story.json 또는 script.json)' },
                { status: 404 }
              );
            }
          }
        } else {
          console.log('❌ 지원하지 않는 폴더:', normalizedPath);
          db.close();
          return NextResponse.json(
            { error: '지원하지 않는 폴더 구조입니다.' },
            { status: 400 }
          );
        }
      }
    }

    console.log('\n🎬 ========== 숏폼 변환 시작 (3분 분량으로 요약) ==========');
    console.log('📋 원본 대본 내용:\n');

    // 원본 대본 출력 (처음 1000자)
    try {
      const originalData = JSON.parse(scriptContent);
      console.log(`   제목: ${originalData.title || '(없음)'}`);
      console.log(`   씬 개수: ${originalData.scenes?.length || 0}개`);
      if (originalData.scenes && originalData.scenes.length > 0) {
        console.log('\n   첫 번째 씬:');
        console.log(`   ${originalData.scenes[0].narration?.substring(0, 200) || '내용 없음'}...`);
      }
    } catch (e) {
      console.log(`   (대본 미리보기 실패)\n`);
    }

    // 원본 씬 개수 확인
    const originalData = JSON.parse(scriptContent);
    const numScenes = originalData.scenes?.length || 0;

    // 3분 숏폼에 맞는 총 단어 수 계산
    // TTS 속도: 약 150-180 words/min
    // 3분 = 450-540 words
    // 안전하게 500 words로 설정
    const targetTotalWords = 500;
    const wordsPerScene = Math.floor(targetTotalWords / numScenes);

    console.log(`\n📊 대본 변환 계산:`);
    console.log(`   원본 씬 개수: ${numScenes}개`);
    console.log(`   목표 총 분량: ${targetTotalWords} words (약 3분)`);
    console.log(`   씬당 분량: ${wordsPerScene} words\n`);

    console.log(`\n🤖 AI (${agentName}) 호출 중...\n`);

    // 원본 대본 파싱 (전체 내용 포함 - 드라마틱한 요약을 위해)
    const summaryScript = JSON.parse(scriptContent);

    // AI Aggregator로 숏폼 대본 생성
    const prompt = `3분 숏폼 요약 (드라마틱하게): ${numScenes}씬 × ${wordsPerScene}words = ${targetTotalWords}words

규칙: 씬${numScenes}개 유지, scene_id 동일, image_prompt 금지

⚠️ **중요: 반드시 순수 JSON만 출력**
- 첫 글자는 반드시 {
- 마지막 글자는 반드시 }
- \`\`\`json 같은 코드펜스 절대 금지
- "JSON:" 같은 접두사 절대 금지
- 설명 없이 JSON만 출력

JSON 형식:
{"title":"제목","scenes":[{"scene_id":"scene_00_bomb","narration":"나레이션 텍스트"}]}

원본 대본:
${scriptContent}

위 대본에서 가장 드라마틱한 핵심만 뽑아 각 씬 ${wordsPerScene}words로 요약.
반드시 순수 JSON만 출력 (첫글자 {, 마지막글자 })`;

    // 프롬프트 파일 저장
    const promptFileName = `shortform_summary_${Date.now()}.txt`;
    const promptFilePath = path.join(backendPath, 'prompts_temp', promptFileName);
    await fs.mkdir(path.dirname(promptFilePath), { recursive: true });
    await fs.writeFile(promptFilePath, prompt, 'utf-8');
    console.log(`📄 프롬프트 파일 저장: ${promptFilePath}`);

    // AI Aggregator 실행
    const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', `prompts_temp/${promptFileName}`, '-a', agentName, '--auto-close'];
    console.log(`🐍 Python 명령어: python ${pythonArgs.join(' ')}`);

    const aiProcess = spawn('python', pythonArgs, {
      cwd: backendPath,
      shell: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }
    });

    let pythonOutput = '';
    let pythonError = '';

    aiProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      pythonOutput += text;
      console.log(`[AI Aggregator] ${text}`);
    });

    aiProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      pythonError += text;
      console.error(`[AI Aggregator ERROR] ${text}`);
    });

    // Python 프로세스 완료 대기
    await new Promise<void>((resolve, reject) => {
      aiProcess.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Python 프로세스 실패 (코드: ${code})`));
        }
      });

      aiProcess.on('error', (err: Error) => {
        reject(err);
      });
    });

    console.log('✅ AI 응답 완료');
    console.log(`📦 AI 출력 길이: ${pythonOutput.length}자`);

    // AI Aggregator는 응답을 src/scripts/ai_responses_[timestamp].txt 파일로 저장
    // 파일에서 읽어오기 (최신 파일 찾기)
    const scriptsDir = path.join(backendPath, 'src', 'scripts');
    let responseText = '';

    try {
      // scripts 폴더의 ai_responses_*.txt 파일 찾기 (최신 파일)
      const files = await fs.readdir(scriptsDir);
      const aiResponseFiles = files.filter(f => f.startsWith('ai_responses_') && f.endsWith('.txt'));

      if (aiResponseFiles.length === 0) {
        throw new Error('AI 응답 파일을 찾을 수 없습니다.');
      }

      // 파일명에서 타임스탬프 추출하여 최신 파일 찾기
      aiResponseFiles.sort((a, b) => {
        const timeA = a.match(/ai_responses_(\d+_\d+)\.txt/)?.[1] || '';
        const timeB = b.match(/ai_responses_(\d+_\d+)\.txt/)?.[1] || '';
        return timeB.localeCompare(timeA); // 내림차순 (최신 파일 먼저)
      });

      const latestFile = aiResponseFiles[0];
      const responsePath = path.join(scriptsDir, latestFile);
      console.log(`📄 AI 응답 파일 읽기: ${latestFile}`);

      responseText = await fs.readFile(responsePath, 'utf-8');
      console.log(`✅ 파일 읽기 성공 (${responseText.length}자)`);

      // 파일 삭제 (다음 요청과 충돌 방지)
      await fs.unlink(responsePath);
      console.log(`🗑️ 임시 파일 삭제: ${latestFile}`);

    } catch (err: any) {
      console.error('❌ AI 응답 파일 읽기 실패:', err.message);
      db.close();
      return NextResponse.json(
        { error: `AI 응답 파일을 읽을 수 없습니다: ${err.message}` },
        { status: 500 }
      );
    }

    // JSON 파싱 - 코드펜스와 "JSON" 접두사 제거
    let cleaned = responseText
      .replace(/^```json?\s*/i, '')  // 시작 코드펜스 제거
      .replace(/```\s*$/i, '')       // 끝 코드펜스 제거
      .replace(/^JSON\s*/i, '')       // "JSON" 접두사 제거
      .trim();

    // JSON 부분만 추출 (첫 { 부터 마지막 } 까지)
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('❌ JSON을 찾을 수 없습니다. 출력:', cleaned.substring(0, 500));
      db.close();
      return NextResponse.json(
        { error: 'AI 응답에서 JSON을 찾을 수 없습니다.' },
        { status: 500 }
      );
    }

    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

    console.log('📝 파싱할 JSON:', cleaned.substring(0, 200) + '...');

    const shortsScript = JSON.parse(cleaned);

    // 임시 파일 정리
    try {
      await fs.unlink(promptFilePath);
    } catch (err) {
      console.log('⚠️ 임시 파일 정리 실패 (무시)');
    }

    // 생성된 숏폼 대본 출력
    console.log(`\n✅ ${agentName.toUpperCase()} AI 응답 완료!\n`);
    console.log(`📋 생성된 숏폼 대본 (목표: ${wordsPerScene} words/씬):\n`);
    console.log(`   씬 개수: ${shortsScript.scenes?.length || 0}개`);

    let totalWords = 0;
    if (shortsScript.scenes && shortsScript.scenes.length > 0) {
      shortsScript.scenes.forEach((scene: any, idx: number) => {
        const words = scene.narration?.split(/\s+/).length || 0;
        totalWords += words;
        console.log(`\n   씬 ${idx + 1} (${words} words): ${scene.narration?.substring(0, 100) || '내용 없음'}...`);
      });
    }
    console.log(`\n   📊 총 단어 수: ${totalWords} words (목표: ${targetTotalWords} words)`);
    console.log(`   ⏱️ 예상 재생시간: ${(totalWords / 165).toFixed(1)}분 (TTS 속도 165 words/min 기준)\n`);

    // 새 작업 ID 먼저 생성
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const newJobId = `job_${timestamp}_${randomStr}`;

    // 작업 타이틀 (원본 제목 그대로 사용, "(쇼츠)" 추가하지 않음)
    const originalTitle = originalJob.title?.replace(/\s*\(쇼츠\)\s*$/, '') || '제목 없음';
    const title = originalTitle;

    // title 추가 (최상위)
    shortsScript.title = title;

    // metadata 추가
    if (!shortsScript.metadata) {
      shortsScript.metadata = {};
    }
    shortsScript.metadata.type = 'shortform';
    shortsScript.metadata.converted_from = originalJob.id;
    shortsScript.metadata.converted_at = new Date().toISOString();
    shortsScript.metadata.job_id = newJobId;  // job_id 추가

    // 크레딧 확인 (숏폼 변환, AI 요약 비용 포함)
    const creditCost = 200;
    const userCredits: any = db.prepare('SELECT credits FROM users WHERE id = ?').get(user.userId);

    if (!userCredits || userCredits.credits < creditCost) {
      db.close();
      return NextResponse.json(
        { error: `크레딧이 부족합니다. 필요: ${creditCost}, 보유: ${userCredits?.credits || 0}` },
        { status: 400 }
      );
    }

    // 크레딧 차감
    db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(creditCost, user.userId);

    // 새 작업 생성
    const now = new Date().toISOString();

    // converted_from_job_id 컬럼 추가 시도 (이미 있으면 무시)
    try {
      db.exec(`ALTER TABLE jobs ADD COLUMN converted_from_job_id TEXT`);
    } catch (e: any) {
      if (!e.message?.includes('duplicate column')) {
        console.log('converted_from_job_id 컬럼 추가 시도:', e.message);
      }
    }

    // 새 프로젝트 생성 (항상 input 폴더에)
    const newProjectName = `shorts_${timestamp}`;
    const newProjectPath = path.join(backendPath, 'input', newProjectName);
    console.log('📂 새 프로젝트 경로:', newProjectPath);

    // videoPath 설정 (폴더 열기용)
    const relativeVideoPath = `input/${newProjectName}/output_video.mp4`;

    db.prepare(`
      INSERT INTO jobs (id, user_id, title, type, status, progress, step, video_path, converted_from_job_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newJobId, user.userId, title, 'shortform', 'processing', 0, '대본 준비 중...', relativeVideoPath, jobId, now, now);

    db.close();

    await fs.mkdir(newProjectPath, { recursive: true });
    console.log('📁 프로젝트 폴더 생성:', newProjectPath);

    // 롱폼 이미지를 쇼츠 형태로 변환 (16:9 → 9:16)
    console.log('\n🎨 ========== 롱폼 → 쇼츠 이미지 변환 시작 ==========');
    console.log('📂 원본 폴더 경로:', folderPath);

    try {
      const convertScript = path.join(backendPath, 'convert_images_to_shorts.py');
      console.log('🚀 이미지 변환 스크립트 실행:', convertScript);

      await new Promise<void>((resolve, reject) => {
        const convertProcess = spawn('python', [
          convertScript,
          '--folder', folderPath
        ], {
          cwd: backendPath,
          shell: true
        });

        convertProcess.stdout.on('data', (data: Buffer) => {
          console.log(`[이미지 변환] ${data.toString('utf-8')}`);
        });

        convertProcess.stderr.on('data', (data: Buffer) => {
          console.error(`[이미지 변환 ERROR] ${data.toString('utf-8')}`);
        });

        convertProcess.on('close', (code: number) => {
          if (code === 0) {
            console.log('✅ 이미지 변환 완료 (shorts_images 폴더에 저장됨)');
            resolve();
          } else {
            console.log(`⚠️ 이미지 변환 실패 (코드: ${code}), 기존 이미지 사용`);
            resolve(); // 실패해도 계속 진행
          }
        });

        convertProcess.on('error', (err: Error) => {
          console.error('❌ 이미지 변환 프로세스 실행 실패:', err);
          resolve(); // 실패해도 계속 진행
        });
      });
    } catch (err: any) {
      console.error('⚠️ 이미지 변환 중 오류 (무시하고 계속):', err.message);
    }

    console.log('🎨 ========== 롱폼 → 쇼츠 이미지 변환 종료 ==========\n');

    // 원본 폴더에서 9:16 비율의 이미지 찾아서 복사
    console.log('\n🖼️ ========== 9:16 이미지 복사 시작 ==========');
    console.log('📂 원본 폴더 경로:', folderPath);
    console.log('📂 새 프로젝트 경로:', newProjectPath);

    try {
      const sizeOf = (await import('image-size')).default;

      // 1. 메인 폴더에서 이미지 찾기
      let files: string[] = [];
      try {
        files = await fs.readdir(folderPath);
        console.log(`📁 메인 폴더 내 전체 파일 (${files.length}개):`, files.slice(0, 10));
      } catch (err: any) {
        console.error('❌ 메인 폴더 읽기 실패:', err.message);
        throw err;
      }

      // 2. shorts_images 서브폴더 확인 (롱폼→쇼츠 변환된 이미지)
      const shortsImagesFolder = path.join(folderPath, 'shorts_images');
      let hasShortsFolder = false;
      console.log(`🔍 shorts_images 폴더 확인 중: ${shortsImagesFolder}`);
      try {
        await fs.access(shortsImagesFolder);
        hasShortsFolder = true;
        console.log('✅ shorts_images 폴더 발견! (롱폼 이미지가 9:16으로 변환됨)');
        const shortsFiles = await fs.readdir(shortsImagesFolder);
        console.log(`📁 shorts_images 폴더 내 파일 (${shortsFiles.length}개):`, shortsFiles);

        // shorts_images 폴더의 파일만 사용 (이미 9:16이므로 비율 체크 필요 없음)
        console.log(`📋 변환된 이미지를 새 프로젝트로 복사합니다...`);

        let copiedCount = 0;
        for (const file of shortsFiles) {
          if (/\.(jpg|jpeg|png)$/i.test(file) && !file.includes('thumbnail')) {
            copiedCount++;
            const sourcePath = path.join(shortsImagesFolder, file);
            const targetFileName = `scene_${copiedCount.toString().padStart(2, '0')}_image${path.extname(file)}`;
            const targetPath = path.join(newProjectPath, targetFileName);

            await fs.copyFile(sourcePath, targetPath);
            console.log(`   📋 복사: ${file} → ${targetFileName}`);
          }
        }

        console.log(`\n✅ 변환된 이미지 복사 완료: ${copiedCount}개`);
        console.log('💡 원본 이미지를 재사용하므로 DALL-E 생성이 필요 없습니다.');

        // 이미지가 복사되었으므로 추가 처리 건너뛰기
        console.log('🖼️ ========== 9:16 이미지 복사 종료 ==========\n');

      } catch (err: any) {
        console.log(`ℹ️ shorts_images 폴더 없음 (${err.message}). 메인 폴더의 9:16 이미지를 사용합니다.`);
        hasShortsFolder = false;
      }

      // shorts_images가 없는 경우에만 메인 폴더에서 9:16 이미지 찾기
      if (!hasShortsFolder) {

      const imageFiles = files.filter(f => {
        const basename = path.basename(f);
        return /\.(jpg|jpeg|png)$/i.test(basename) && !basename.includes('thumbnail');
      });
      console.log(`🔍 원본 폴더에서 이미지 탐색 중... (총 ${imageFiles.length}개 이미지)`);
      console.log(`   이미지 파일 목록:`, imageFiles);

      // 9:16 이미지만 필터링
      const verticalImages: Array<{ file: string; path: string; dimensions: any; seq: number | null; mtime: number }> = [];
      const targetRatio = 9 / 16; // 세로 비율
      const tolerance = 0.05; // 5% 오차 허용

      for (const file of imageFiles) {
        try {
          const imagePath = path.join(folderPath, file);
          const basename = path.basename(file);

          console.log(`   📷 분석 중: ${basename}`);
          console.log(`      전체 경로: ${imagePath}`);

          // 파일을 Buffer로 읽어서 크기 확인 (ESM 호환성)
          let dimensions;
          try {
            const buffer = await fs.readFile(imagePath);
            console.log(`      ✅ 파일 읽기 성공 (${(buffer.length / 1024).toFixed(1)} KB)`);
            dimensions = sizeOf(buffer);
            console.log(`      🔍 sizeOf 결과:`, dimensions);
          } catch (sizeErr: any) {
            console.error(`      ❌ 이미지 처리 실패: ${basename} - ${sizeErr.message}`);
            console.error(`      스택:`, sizeErr.stack);
            continue;
          }

          if (dimensions && dimensions.width && dimensions.height) {
            const ratio = dimensions.width / dimensions.height;
            const isVertical = Math.abs(ratio - targetRatio) < tolerance;

            console.log(`      ${dimensions.width}x${dimensions.height} (비율: ${ratio.toFixed(3)}) - ${isVertical ? '✅ 9:16 OK' : '❌ SKIP'}`);

            if (isVertical) {
              // 시퀀스 번호 추출 (엄격한 패턴만 인식)
              const baseName = path.basename(file, path.extname(file));
              let seq: number | null = null;

              // 명확한 시퀀스 패턴만 인식:
              // - scene_01, image_01, img_1 형식
              // - 파일명 끝에 _01 또는 _1 형식
              // - 파일명 시작에 01_ 또는 1_ 형식
              // - 해시값 내부의 숫자는 무시
              const seqPatterns = [
                /(?:scene|image|img)_(\d{1,3})$/i,  // scene_01, image_1 등
                /_(\d{1,3})$/,                       // 끝에 _01, _1 등
                /^(\d{1,3})_/,                       // 시작에 01_, 1_ 등
              ];

              for (const pattern of seqPatterns) {
                const match = baseName.match(pattern);
                if (match) {
                  seq = parseInt(match[1]);
                  console.log(`      🔢 시퀀스 추출: ${match[0]} → ${seq}`);
                  break;
                }
              }

              if (seq === null) {
                console.log(`      ℹ️ 시퀀스 없음 (오래된 순으로 정렬됨)`);
              }

              // 파일 수정 시간
              const stat = await fs.stat(imagePath);
              const mtime = stat.mtimeMs;

              verticalImages.push({ file: basename, path: imagePath, dimensions, seq, mtime });
            }
          }
        } catch (err: any) {
          console.error(`   ⚠️ 이미지 처리 실패: ${file} - ${err.message}`);
          console.error(`      스택: ${err.stack}`);
        }
      }

      // 정렬: 시퀀스 번호 우선, 없으면 수정 시간 순
      verticalImages.sort((a, b) => {
        if (a.seq !== null && b.seq !== null) {
          return a.seq - b.seq; // 시퀀스 번호로 정렬
        } else if (a.seq !== null) {
          return -1; // a가 시퀀스 있으면 앞으로
        } else if (b.seq !== null) {
          return 1; // b가 시퀀스 있으면 뒤로
        } else {
          return a.mtime - b.mtime; // 둘 다 없으면 수정 시간 순
        }
      });

      console.log(`\n📋 9:16 이미지 정렬 완료 (${verticalImages.length}개):`);
      verticalImages.forEach((img, idx) => {
        console.log(`   ${idx + 1}. ${img.file} (seq: ${img.seq !== null ? img.seq : 'none'}, mtime: ${new Date(img.mtime).toLocaleString()})`);
      });

      // scene_XX_image 형식으로 복사
      let copiedCount = 0;
      for (const img of verticalImages) {
        copiedCount++;
        const targetFileName = `scene_${copiedCount.toString().padStart(2, '0')}_image${path.extname(img.file)}`;
        const targetPath = path.join(newProjectPath, targetFileName);

        await fs.copyFile(img.path, targetPath);
        console.log(`   📋 복사: ${img.file} → ${targetFileName}`);
      }

      console.log(`\n✅ 9:16 이미지 복사 완료: ${copiedCount}개`);

      if (copiedCount > 0) {
        console.log('💡 복사된 이미지는 재사용되고, 부족한 씬만 DALL-E로 생성됩니다.');
      } else {
        console.log('ℹ️ 9:16 이미지가 없어서 모든 씬을 DALL-E로 생성합니다.');
      }

      } // if (!hasShortsFolder) 닫기

    } catch (err: any) {
      console.error('\n❌ 이미지 복사 중 오류 발생 (무시하고 계속):');
      console.error('   에러 메시지:', err.message);
      console.error('   에러 스택:', err.stack);
      console.error('   → 원본 이미지를 사용합니다.');
    }

    console.log('🖼️ ========== 9:16 이미지 복사 종료 ==========\n');

    // story.json 저장
    const storyPath = path.join(newProjectPath, 'story.json');
    await fs.writeFile(storyPath, JSON.stringify(shortsScript, null, 2));
    console.log('📝 story.json 저장 완료:', storyPath);
    console.log('📄 story.json 내용:', JSON.stringify(shortsScript, null, 2).substring(0, 500) + '...');

    // Python 스크립트 실행
    const createVideoScript = path.join(backendPath, 'create_video_from_folder.py');
    console.log('🚀 Python 스크립트 실행:', {
      script: createVideoScript,
      storyPath: storyPath,
      cwd: backendPath,
      jobId: newJobId
    });

    const videoProcess = spawn('python', [
      createVideoScript,
      '--folder', newProjectPath,  // 폴더 경로 전달
      '--aspect-ratio', '9:16',     // 세로 비율
      '--add-subtitles'             // 자막 추가
      // --image-source 옵션 없음 → 폴더의 이미지 자동 사용
    ], {
      cwd: backendPath,
      shell: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      windowsHide: true
    });

    console.log('✅ Python 프로세스 생성됨, PID:', videoProcess.pid);

    // PID 저장 (선택적 - 테이블에 pid 컬럼이 있는 경우에만)
    try {
      const db2 = new Database(dbPath);
      db2.prepare('UPDATE jobs SET pid = ? WHERE id = ?').run(videoProcess.pid, newJobId);
      db2.close();
    } catch (e) {
      // pid 컬럼이 없으면 무시
      console.log('PID 저장 생략 (컬럼 없음)');
    }

    // 로그 처리 (비동기)
    videoProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      console.log(`[숏폼 변환 ${newJobId}] ${text}`);

      try {
        const db3 = new Database(dbPath);
        db3.prepare('INSERT INTO job_logs (job_id, log_message) VALUES (?, ?)').run(newJobId, text);
        db3.close();
      } catch (err) {
        console.error('로그 저장 실패:', err);
      }
    });

    videoProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      console.error(`[숏폼 변환 ERROR ${newJobId}] ${text}`);

      // 에러도 로그로 저장
      try {
        const db3 = new Database(dbPath);
        db3.prepare('INSERT INTO job_logs (job_id, log_message) VALUES (?, ?)').run(newJobId, `❌ ERROR: ${text}`);
        db3.close();
      } catch (err) {
        console.error('에러 로그 저장 실패:', err);
      }
    });

    videoProcess.on('error', (error: Error) => {
      console.error(`[숏폼 변환 프로세스 실행 실패 ${newJobId}]`, error);

      try {
        const db3 = new Database(dbPath);
        db3.prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?').run('failed', error.message, newJobId);
        db3.close();
      } catch (err) {
        console.error('상태 업데이트 실패:', err);
      }
    });

    videoProcess.on('close', async (code: number) => {
      console.log(`[쇼츠 변환 ${newJobId}] 프로세스 종료, 코드: ${code}`);

      try {
        const db3 = new Database(dbPath);

        if (code === 0) {
          // 성공: 생성된 비디오 경로 찾기 (루트 폴더에서 먼저 확인)
          let videoPath: string | null = null;

          // 1. 루트 폴더에서 .mp4 파일 찾기 (쇼츠 변환은 여기에 생성됨)
          try {
            const rootFiles = await fs.readdir(newProjectPath);
            const videoFile = rootFiles.find(f => f.endsWith('.mp4') && !f.includes('scene_'));
            if (videoFile) {
              videoPath = path.join(newProjectPath, videoFile);
              console.log(`✅ 비디오 파일 발견 (루트): ${videoPath}`);
            }
          } catch (err) {
            console.log('루트 폴더 확인 실패 (무시하고 계속)');
          }

          // 2. generated_videos 폴더 확인 (없으면 넘어감)
          if (!videoPath) {
            try {
              const generatedVideosPath = path.join(newProjectPath, 'generated_videos');
              const files = await fs.readdir(generatedVideosPath);
              const videoFile = files.find(f => f.endsWith('.mp4') && !f.includes('scene_'));
              if (videoFile) {
                videoPath = path.join(generatedVideosPath, videoFile);
                console.log(`✅ 비디오 파일 발견 (generated_videos): ${videoPath}`);
              }
            } catch (err) {
              console.log('generated_videos 폴더 확인 실패 (무시하고 계속)');
            }
          }

          if (videoPath) {
            const thumbnailPath = path.join(newProjectPath, 'thumbnail.jpg');

            // 썸네일 생성
            let thumbnailGenerated = false;
            try {
              const thumbnailScript = path.join(backendPath, 'create_thumbnail.py');
              await new Promise<void>((resolve, reject) => {
                const thumbProcess = spawn('python', [
                  thumbnailScript,
                  '--folder', newProjectPath,
                  '--output', thumbnailPath
                ], {
                  cwd: backendPath,
                  shell: true
                });
                thumbProcess.on('close', (thumbCode) => {
                  if (thumbCode === 0) {
                    thumbnailGenerated = true;
                    resolve();
                  } else {
                    reject(new Error('Thumbnail creation failed'));
                  }
                });
              });
            } catch (err) {
              console.error('썸네일 생성 실패 (무시하고 계속):', err);
              thumbnailGenerated = false;
            }

            // 데이터베이스 업데이트: completed (썸네일 없어도 완료)
            db3.prepare('UPDATE jobs SET status = ?, progress = ?, video_path = ?, thumbnail_path = ? WHERE id = ?')
              .run('completed', 100, videoPath, thumbnailGenerated ? thumbnailPath : null, newJobId);

            console.log(`✅ 쇼츠 변환 완료: ${videoPath}${thumbnailGenerated ? ` (썸네일: ${thumbnailPath})` : ' (썸네일 없음)'}`);
          } else {
            console.error(`❌ 비디오 파일을 찾을 수 없습니다. 프로젝트 경로: ${newProjectPath}`);
            db3.prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?')
              .run('failed', `생성된 비디오 파일을 찾을 수 없습니다. (경로: ${newProjectPath})`, newJobId);
          }
        } else if (code !== null) {
          // 실패
          db3.prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?')
            .run('failed', `Python 프로세스가 코드 ${code}로 종료되었습니다.`, newJobId);
        }

        db3.close();
      } catch (err) {
        console.error('프로세스 종료 처리 실패:', err);
      }
    });

    return NextResponse.json({
      success: true,
      jobId: newJobId,
      message: '쇼츠 변환이 시작되었습니다.',
      creditsUsed: creditCost
    });

  } catch (error: any) {
    console.error('쇼츠 변환 실패:', error);
    return NextResponse.json(
      { error: error?.message || '쇼츠 변환 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
