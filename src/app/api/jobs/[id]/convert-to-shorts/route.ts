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

    console.log('\n🎬 ========== 쇼츠 변환 시작 ==========');
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

    console.log('\n🤖 Claude AI 호출 중...\n');

    // Claude로 3분 쇼츠 대본 생성
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const prompt = `당신은 영상 대본을 3분 쇼츠로 변환하는 전문가입니다.

주어진 영상 대본을 **처음부터 끝까지 꼼꼼히 분석**하여 **진짜 하이라이트만 엄선**해 180초(3분) 쇼츠로 재구성하세요.

**🚨 절대 원칙: "대충 앞부분 가져오기" 금지 🚨**
- 원본 대본을 **전체적으로** 분석한 후 작업 시작
- 앞쪽 장면이라고 무조건 중요한 게 아님
- 중간이나 후반부에 더 강렬한 장면이 있으면 그걸 선택
- **반전, 클라이맥스, 결말**이 있는지 끝까지 확인
- 시간순이 아니라 **임팩트 순**으로 장면 선택

**하이라이트 선별 기준 (중요도 순):**
1. 🔥 **반전/충격**: 예상을 깨는 반전, 충격적인 사실 공개
2. 💥 **클라이맥스**: 갈등이 정점에 달하는 순간, 결정적 장면
3. 😭 **감정 폭발**: 웃음, 분노, 슬픔이 극에 달하는 순간
4. 🎬 **시각적 강렬함**: 임팩트 있는 장면
5. 🎯 **결말/여운**: 통쾌한 결말, 생각하게 만드는 엔딩
6. ❌ **제외 대상**: 평범한 설명, 배경 정보, 지루한 전개

**중요: 시간 계산 (TTS 기준 1초당 15자)**
1. 총 길이: 정확히 60초 (1분)
2. 씬0 (훅): 3초 → 나레이션 정확히 45자
3. 씬1-3: 각 19초 → 나레이션 각 정확히 285자
4. **계산 검증:** 45 + (285 × 3) = 45 + 855 = 900자 = 60초

**씬 선택 프로세스:**
1️⃣ **전체 읽기**: 원본 대본을 처음부터 끝까지 완전히 읽기
2️⃣ **임팩트 평가**: 각 장면에 임팩트 점수 매기기
3️⃣ **베스트 4 선택**: 가장 점수 높은 4개 장면 선택
4️⃣ **스토리 재구성**: 선택한 장면들을 논리적으로 연결

**씬 구성:**
- 씬 개수: 정확히 4개 (훅 + 메인 3개)
- 씬0 (훅): 가장 충격적인 순간
- 씬1-3: 임팩트 순위 2-4위 장면

**narration 작성 규칙:**
- 씬0: **정확히 45자** (초강력 훅)
- 씬1-3: **각 정확히 285자** (상세한 상황, 감정, 배경 포함)

**image_prompt 작성 규칙:**
- **필수: "Photorealistic photography, cinematic lighting" 으로 시작 (실사 사진 스타일)**
- **금지: cartoon, anime, illustration, drawing, sketch, VERTICAL, PORTRAIT, 9:16, landscape 등 방향/비율 관련 단어 절대 사용 금지 (시스템이 자동으로 세로 9:16으로 생성함)**
- **인물이 등장하는 경우 반드시 "Korean person", "Korean man/woman", "Korean elderly", "Korean employee" 등 한국인임을 명시**
- **씬 간 일관성 유지: 같은 인물은 동일한 외모/옷차림으로 묘사 (나이, 머리 스타일, 의상 등)**
- 구체적인 피사체와 상황 묘사 (최소 2-3문장)
- 인물의 표정, 자세, 배경, 조명 등 디테일 포함
- 예시: "Photorealistic photography, cinematic lighting. A Korean elderly man with warm expression, wearing traditional hanbok, standing in a sunlit traditional Korean house courtyard..."

**출력 형식:**
- 순수 JSON만 출력 (코드펜스 없음)
- 첫 글자: {, 마지막 글자: }
- scenes 배열에 4개 씬
- 각 씬에 scene_number, narration, image_prompt 포함
- metadata에 type: "shortform" 설정

원본 대본:
${scriptContent}

1분 쇼츠로 변환된 JSON을 출력하세요:`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    // JSON 파싱
    let cleaned = responseText
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const jsonStart = cleaned.indexOf('{');
    if (jsonStart > 0) {
      cleaned = cleaned.substring(jsonStart);
    }

    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonEnd > 0 && jsonEnd < cleaned.length - 1) {
      cleaned = cleaned.substring(0, jsonEnd + 1);
    }

    const shortsScript = JSON.parse(cleaned);

    // 생성된 쇼츠 대본 출력
    console.log('\n✅ Claude AI 응답 완료!\n');
    console.log('📋 생성된 쇼츠 대본:\n');
    console.log(`   씬 개수: ${shortsScript.scenes?.length || 0}개`);
    if (shortsScript.scenes && shortsScript.scenes.length > 0) {
      shortsScript.scenes.forEach((scene: any, idx: number) => {
        console.log(`\n   씬 ${idx + 1}: ${scene.narration?.substring(0, 100) || '내용 없음'}...`);
      });
    }
    console.log('\n');

    // 새 작업 ID 먼저 생성
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const newJobId = `job_${timestamp}_${randomStr}`;

    // 작업 타이틀 (원본 제목에서 "(쇼츠)" 제거하고 다시 추가)
    const originalTitle = originalJob.title?.replace(/\s*\(쇼츠\)\s*$/, '') || '제목 없음';
    const title = `${originalTitle} (쇼츠)`;

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

    // 크레딧 확인 (1분 쇼츠 = 60초, Claude API 비용 포함)
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

      // 2. shorts_images 서브폴더 확인
      const shortsImagesFolder = path.join(folderPath, 'shorts_images');
      let hasShortsFolder = false;
      console.log(`🔍 shorts_images 폴더 확인 중: ${shortsImagesFolder}`);
      try {
        await fs.access(shortsImagesFolder);
        hasShortsFolder = true;
        console.log('✅ shorts_images 폴더 발견! 우선적으로 사용합니다.');
        const shortsFiles = await fs.readdir(shortsImagesFolder);
        console.log(`📁 shorts_images 폴더 내 파일 (${shortsFiles.length}개):`, shortsFiles);
        // shorts_images 폴더의 파일을 우선 사용
        files = shortsFiles.map(f => path.join('shorts_images', f));
        console.log(`   변환된 상대 경로:`, files);
      } catch (err: any) {
        console.log(`ℹ️ shorts_images 폴더 없음 (${err.message}). 메인 폴더의 이미지를 사용합니다.`);
      }

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
    } catch (err: any) {
      console.error('\n❌ 이미지 복사 중 오류 발생 (무시하고 계속):');
      console.error('   에러 메시지:', err.message);
      console.error('   에러 스택:', err.stack);
      console.error('   → 모든 이미지를 DALL-E로 생성합니다.');
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

    const pythonProcess = spawn('python', [
      createVideoScript,
      '--folder', newProjectPath,  // 폴더 경로 전달
      '--aspect-ratio', '9:16',     // 세로 비율
      '--add-subtitles',            // 자막 추가
      '--image-source', 'dalle'     // DALL-E 이미지 사용
    ], {
      cwd: backendPath,
      shell: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      windowsHide: true
    });

    console.log('✅ Python 프로세스 생성됨, PID:', pythonProcess.pid);

    // PID 저장 (선택적 - 테이블에 pid 컬럼이 있는 경우에만)
    try {
      const db2 = new Database(dbPath);
      db2.prepare('UPDATE jobs SET pid = ? WHERE id = ?').run(pythonProcess.pid, newJobId);
      db2.close();
    } catch (e) {
      // pid 컬럼이 없으면 무시
      console.log('PID 저장 생략 (컬럼 없음)');
    }

    // 로그 처리 (비동기)
    pythonProcess.stdout.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      console.log(`[쇼츠 변환 ${newJobId}] ${text}`);

      try {
        const db3 = new Database(dbPath);
        db3.prepare('INSERT INTO job_logs (job_id, log_message) VALUES (?, ?)').run(newJobId, text);
        db3.close();
      } catch (err) {
        console.error('로그 저장 실패:', err);
      }
    });

    pythonProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      console.error(`[쇼츠 변환 ERROR ${newJobId}] ${text}`);

      // 에러도 로그로 저장
      try {
        const db3 = new Database(dbPath);
        db3.prepare('INSERT INTO job_logs (job_id, log_message) VALUES (?, ?)').run(newJobId, `❌ ERROR: ${text}`);
        db3.close();
      } catch (err) {
        console.error('에러 로그 저장 실패:', err);
      }
    });

    pythonProcess.on('error', (error: Error) => {
      console.error(`[쇼츠 변환 프로세스 실행 실패 ${newJobId}]`, error);

      try {
        const db3 = new Database(dbPath);
        db3.prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?').run('failed', error.message, newJobId);
        db3.close();
      } catch (err) {
        console.error('상태 업데이트 실패:', err);
      }
    });

    pythonProcess.on('close', async (code: number) => {
      console.log(`[쇼츠 변환 ${newJobId}] 프로세스 종료, 코드: ${code}`);

      try {
        const db3 = new Database(dbPath);

        if (code === 0) {
          // 성공: 생성된 비디오 경로 찾기
          const generatedVideosPath = path.join(newProjectPath, 'generated_videos');
          const files = await fs.readdir(generatedVideosPath);

          // 병합된 최종 비디오 찾기 (scene_XX.mp4가 아닌 파일)
          const videoFile = files.find(f => f.endsWith('.mp4') && !f.includes('scene_'));

          if (videoFile) {
            const videoPath = path.join(generatedVideosPath, videoFile);
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
            db3.prepare('UPDATE jobs SET status = ?, error = ? WHERE id = ?')
              .run('failed', '생성된 비디오 파일을 찾을 수 없습니다.', newJobId);
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
