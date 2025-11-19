import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { getCurrentUser } from '@/lib/session';
import { promises as fs } from 'fs';
import { createBackup } from '@/lib/backup';
import { sendErrorEmail } from '@/lib/email';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// 실행 중인 프로세스를 추적하는 Map (로컬 참조용)
const runningProcesses = new Map<string, any>();

// 숏폼 프롬프트를 파일에서 읽어오는 함수
async function getShortFormPrompt(): Promise<string> {
  try {
    // frontend/prompts 경로에서 찾기
    const promptsPath = path.join(process.cwd(), 'prompts');
    const files = await fs.readdir(promptsPath);

    // prompt_shortform.txt 또는 prompt.txt 검색
    let promptFile: string | undefined = files.find(file => file === 'prompt_shortform.txt');
    if (!promptFile) {
      promptFile = files.find(file => file === 'prompt.txt');
    }

    if (promptFile) {
      const filePath = path.join(promptsPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('✅ 숏폼 프롬프트 파일 읽기 완료:', promptFile);
      return content;
    }

    // 파일이 없으면 기본 프롬프트 반환
    console.warn('⚠️ 숏폼 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');
    return `당신은 유튜브 쇼츠 영상 대본 작가입니다.

다음 제목에 대해 1분 이내의 짧고 임팩트 있는 영상 대본을 즉시 작성해주세요.

제목: {title}

중요: 질문하지 말고, 바로 대본을 작성해주세요. 추가 정보 요청 없이 제목만으로 완성된 대본을 만들어주세요.

대본 작성 가이드:
1. 첫 3초 안에 시청자의 관심을 끌 수 있는 훅(Hook) 문장으로 시작
2. 핵심 메시지를 명확하고 간결하게 전달
3. 구어체를 사용하여 친근하게 작성
4. 시청자에게 행동을 유도하는 CTA(Call To Action)로 마무리
5. 약 200-300자 정도의 분량으로 작성

지금 바로 대본만 작성해주세요:`;
  } catch (error) {
    console.error('❌ 숏폼 프롬프트 파일 읽기 실패:', error);
    throw error;
  }
}

// 롱폼 프롬프트를 파일에서 읽어오는 함수
async function getLongFormPrompt(): Promise<string> {
  try {
    // frontend/prompts 경로에서 찾기
    const promptsPath = path.join(process.cwd(), 'prompts');
    const files = await fs.readdir(promptsPath);

    // prompt_longform.txt 우선 검색
    let promptFile = files.find(file => file === 'prompt_longform.txt');

    if (promptFile) {
      const filePath = path.join(promptsPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('✅ 롱폼 프롬프트 파일 읽기 완료:', promptFile);
      return content;
    }

    // 파일이 없으면 기본 프롬프트 반환
    console.warn('⚠️ 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');
    return `당신은 유튜브 쇼츠 영상 대본 작가입니다.

다음 제목에 대해 1분 이내의 짧고 임팩트 있는 영상 대본을 즉시 작성해주세요.

제목: {title}

중요: 질문하지 말고, 바로 대본을 작성해주세요. 추가 정보 요청 없이 제목만으로 완성된 대본을 만들어주세요.

대본 작성 가이드:
1. 첫 3초 안에 시청자의 관심을 끌 수 있는 훅(Hook) 문장으로 시작
2. 핵심 메시지를 명확하고 간결하게 전달
3. 구어체를 사용하여 친근하게 작성
4. 시청자에게 행동을 유도하는 CTA(Call To Action)로 마무리
5. 약 200-300자 정도의 분량으로 작성

지금 바로 대본만 작성해주세요:`;
  } catch (error) {
    console.error('❌ 프롬프트 파일 읽기 실패:', error);
    throw error;
  }
}

// SORA2 프롬프트를 파일에서 읽어오는 함수
async function getSora2Prompt(): Promise<string> {
  try {
    // frontend/prompts 경로에서 찾기
    const promptsPath = path.join(process.cwd(), 'prompts');
    const files = await fs.readdir(promptsPath);

    // prompt_sora2.txt 검색
    let promptFile = files.find(file => file === 'prompt_sora2.txt');

    if (promptFile) {
      const filePath = path.join(promptsPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('✅ SORA2 프롬프트 파일 읽기 완료:', promptFile);
      return content;
    }

    // 파일이 없으면 기본 SORA2 프롬프트 반환
    console.warn('⚠️ SORA2 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');
    return `당신은 SORA2 AI 비디오 생성을 위한 프롬프트 작성 전문가입니다.

다음 제목에 대해 SORA2 영상 생성용 프롬프트를 작성해주세요.

제목: {title}

중요: 질문하지 말고, 바로 프롬프트를 작성해주세요. 추가 정보 요청 없이 제목만으로 완성된 프롬프트를 만들어주세요.

SORA2 프롬프트 작성 가이드:
1. 시각적 요소를 구체적으로 묘사 (장면, 색감, 조명, 카메라 움직임)
2. 8초 길이에 적합한 단일 장면 또는 매끄러운 전환
3. 영어로 작성 (SORA2는 영어 프롬프트를 선호)
4. 감정과 분위기를 명확하게 표현
5. 100-200 단어 정도의 상세한 묘사

예시 형식:
"A cinematic shot of [주요 주제], [시각적 디테일], [조명과 색감], [카메라 움직임], [분위기와 감정]"

지금 바로 SORA2 프롬프트만 작성해주세요:`;
  } catch (error) {
    console.error('❌ SORA2 프롬프트 파일 읽기 실패:', error);
    throw error;
  }
}

// 상품정보 프롬프트를 파일에서 읽어오는 함수
async function getProductInfoPrompt(): Promise<string> {
  try {
    // frontend/prompts 경로에서 찾기
    const promptsPath = path.join(process.cwd(), 'prompts');
    const files = await fs.readdir(promptsPath);

    // prompt_product_info.txt 검색
    let promptFile = files.find(file => file === 'prompt_product_info.txt');

    if (promptFile) {
      const filePath = path.join(promptsPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('✅ 상품정보 프롬프트 파일 읽기 완료:', promptFile);
      return content;
    }

    // 파일이 없으면 기본 프롬프트 반환
    console.warn('⚠️ 상품정보 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');
    return `당신은 YouTube 및 소셜미디어 플랫폼용 상품 기입 정보 작성 전문가입니다.

다음 상품 대본 내용을 바탕으로 YouTube/릴스/쇼츠에 업로드할 때 필요한 상세 기입 정보를 작성해주세요.

중요: 질문하지 말고, 바로 작성해주세요. 추가 정보 요청 없이 제공된 대본만으로 완성된 기입 정보를 만들어주세요.

작성해야 할 항목:
1. 제목 (Title): SEO 최적화된 매력적인 제목 (60자 이내)
2. 설명 (Description): 상세한 상품 설명 및 혜택 (5000자 이내)
3. 태그 (Tags): 관련 검색 키워드 10-15개
4. 해시태그: 소셜미디어용 해시태그 10-15개
5. 썸네일 텍스트: 썸네일에 들어갈 임팩트 있는 짧은 문구

지금 바로 기입 정보를 작성해주세요:`;
  } catch (error) {
    console.error('❌ 상품정보 프롬프트 파일 읽기 실패:', error);
    throw error;
  }
}

// 상품 프롬프트를 파일에서 읽어오는 함수
async function getProductPrompt(): Promise<string> {
  try {
    // frontend/prompts 경로에서 찾기
    const promptsPath = path.join(process.cwd(), 'prompts');
    const files = await fs.readdir(promptsPath);

    // prompt_product.txt 검색
    let promptFile = files.find(file => file === 'prompt_product.txt');

    if (promptFile) {
      const filePath = path.join(promptsPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('✅ 상품 프롬프트 파일 읽기 완료:', promptFile);
      return content;
    }

    // 파일이 없으면 기본 상품 프롬프트 반환
    console.warn('⚠️ 상품 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');
    return `당신은 쿠팡 파트너스 상품 소개 영상 대본 작가입니다.

다음 제목에 대해 상품을 효과적으로 소개하는 영상 대본을 작성해주세요.

제목: {title}

중요: 질문하지 말고, 바로 대본을 작성해주세요. 추가 정보 요청 없이 제목만으로 완성된 대본을 만들어주세요.

대본 작성 가이드:
1. 상품의 핵심 기능과 장점을 명확하게 전달
2. 소비자의 고민을 해결해주는 솔루션 제시
3. 구체적인 사용 시나리오 포함
4. 가격 대비 가치 강조
5. 구매 욕구를 자극하는 CTA(Call To Action)로 마무리
6. 약 300-500자 정도의 분량으로 작성

지금 바로 대본만 작성해주세요:`;
  } catch (error) {
    console.error('❌ 상품 프롬프트 파일 읽기 실패:', error);
    throw error;
  }
}

// 로그 추가 헬퍼 함수 (contents 테이블 사용)
async function addLog(taskId: string, message: string) {
  try {
    const { addContentLog } = await import('@/lib/content');
    addContentLog(taskId, message);

    // 디버깅: 로그가 제대로 추가되었는지 확인
    console.log(`[LOG ${taskId}] ${message}`);
  } catch (error) {
    console.error('Failed to add log:', error);
    console.error('TaskId:', taskId);
    console.error('Message:', message);
  }
}

export async function POST(request: NextRequest) {
  try {
    // 내부 요청 확인 (자동화 시스템에서의 호출)
    const isInternalRequest = request.headers.get('X-Internal-Request') === 'automation-system';
    console.log('🔍 [AUTH] isInternalRequest:', isInternalRequest);

    // 사용자 인증 확인 (내부 요청이 아닐 경우만)
    let user: { userId: string; email: string; isAdmin: boolean } | null = null;
    if (!isInternalRequest) {
      user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json(
          { error: '로그인이 필요합니다.' },
          { status: 401 }
        );
      }
    }

    // 대본 생성 전 자동 백업 (매 10번째 요청마다)
    if (Math.random() < 0.1) { // 10% 확률
      try {
        await createBackup('auto_before_script');
        console.log('✅ 자동 백업 완료');
      } catch (error) {
        console.error('⚠️ 자동 백업 실패 (무시하고 진행):', error);
      }
    }

    const body = await request.json();
    const { title, type, videoFormat, useClaudeLocal, scriptModel, model, category, userId: internalUserId } = body;
    let productInfo = body.productInfo; // let으로 선언하여 나중에 재할당 가능

    console.log('🔍 [AUTH] internalUserId from body:', internalUserId);
    console.log('🛍️ [PRODUCT-INFO] productInfo 수신:', productInfo ? 'YES ✅' : 'NO ❌');
    if (productInfo) {
      console.log('  - title:', productInfo.title);
      console.log('  - thumbnail:', productInfo.thumbnail);
      console.log('  - product_link:', productInfo.product_link);
      console.log('  - description:', productInfo.description);
    }

    // 내부 요청일 경우 body에서 userId를 가져와 user 객체 생성
    if (isInternalRequest && internalUserId) {
      user = { userId: internalUserId, email: '', isAdmin: false };
      console.log('✅ [AUTH] Created internal user:', user.userId);
    }

    // user가 여전히 null이면 에러 (내부 요청인데 userId가 없거나, 일반 요청인데 인증 실패)
    if (!user) {
      console.error('❌ [AUTH] No user! isInternal:', isInternalRequest, 'userId:', internalUserId);
      return NextResponse.json(
        { error: '사용자 인증이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log('✅ [AUTH] Final user:', user.userId);

    console.log('🚀 [Scripts Generate] 요청 받음');
    console.log('  📝 제목:', title);
    console.log('  🤖 scriptModel:', scriptModel);
    console.log('  🤖 model:', model);
    console.log('  📌 useClaudeLocal:', useClaudeLocal);

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // scriptModel을 agent 이름으로 매핑
    const MODEL_TO_AGENT: Record<string, string> = {
      'gpt': 'chatgpt',
      'chatgpt': 'chatgpt',  // 프론트엔드에서 'chatgpt'로 전송
      'gemini': 'gemini',
      'claude': 'claude',
      'groq': 'groq'
    };

    const modelInput = scriptModel || model;  // scriptModel 또는 model 둘 다 지원
    const agentName = modelInput && MODEL_TO_AGENT[modelInput]
      ? MODEL_TO_AGENT[modelInput]
      : 'claude';

    console.log('  🔍 modelInput:', modelInput);
    console.log('  ✅ Agent 이름:', agentName);

    // type 또는 videoFormat에서 스크립트 타입 결정
    // 입력: 'longform', 'shortform', 'sora2', 'product', 'product-info' (통일된 형식)
    const inputType = type || videoFormat || 'longform';

    // 내부 처리용 타입 (프롬프트 선택용)
    let scriptType: 'longform' | 'shortform' | 'sora2' | 'product' | 'product-info' = 'longform';
    if (inputType === 'sora2') {
      scriptType = 'sora2';
    } else if (inputType === 'shortform') {
      scriptType = 'shortform';
    } else if (inputType === 'product') {
      scriptType = 'product';
    } else if (inputType === 'product-info') {
      scriptType = 'product-info';
    } else if (inputType === 'longform') {
      scriptType = 'longform';
    }

    console.log(`  📌 대본 타입: ${scriptType} (입력: ${inputType})`);

    // 🔒 중복 체크: 같은 제목으로 이미 생성 중인 대본이 있는지 확인
    const Database = require('better-sqlite3');
    const dbCheck = new Database(dbPath);
    const existingScript = dbCheck.prepare(`
      SELECT id, status FROM contents
      WHERE user_id = ?
        AND title = ?
        AND type = 'script'
        AND format = ?
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.userId, title, scriptType) as { id: string; status: string } | undefined;

    if (existingScript) {
      console.warn(`⚠️ [SCRIPT] 중복 대본 생성 방지: title="${title}"에 이미 ${existingScript.status} 중인 대본(${existingScript.id})이 있습니다.`);
      dbCheck.close();
      return NextResponse.json({
        success: true,
        taskId: existingScript.id,
        message: '이미 생성 중인 대본이 있습니다'
      });
    }
    dbCheck.close();

    // contents 테이블을 사용하여 스크립트 작업 생성
    const { createContent } = await import('@/lib/content');

    const content = createContent(
      user.userId,
      'script',
      title,
      {
        format: scriptType,
        originalTitle: title,
        useClaudeLocal: useClaudeLocal,
        model: agentName,
        productInfo: (scriptType === 'product' || scriptType === 'product-info') && productInfo ? productInfo : undefined,
        category: category || '일반'
      }
    );

    const taskId = content.id;

    // 백그라운드에서 대본 생성 실행
    // 타입에 따라 다른 프롬프트 사용
    let prompt: string;
    if (scriptType === 'shortform') {
      // 숏폼: 파일에서 읽어온 짧은 프롬프트 사용 (빠름)
      const shortFormPromptTemplate = await getShortFormPrompt();
      prompt = shortFormPromptTemplate.replace(/{title}/g, title);
      console.log('✅ 숏폼 프롬프트 사용');
    } else if (scriptType === 'sora2') {
      // SORA2: SORA2 전용 프롬프트 사용
      const sora2PromptTemplate = await getSora2Prompt();
      prompt = sora2PromptTemplate.replace(/{title}/g, title);
      console.log('✅ SORA2 프롬프트 사용');
    } else if (scriptType === 'product') {
      // 상품: 상품 소개 전용 프롬프트 사용
      const productPromptTemplate = await getProductPrompt();
      prompt = productPromptTemplate.replace(/{title}/g, title);

      // productInfo가 없으면 DB에서 찾아오기
      if (!productInfo) {
        console.log('⚠️ productInfo가 전달되지 않음, DB에서 찾는 중...');

        // title이 "[광고] XXX"와 같은 형식이면 그대로 사용
        const searchTitle = title;
        console.log('  검색 제목:', searchTitle);

        // DB에서 제목의 product_data 찾기
        const db = Database(dbPath);
        const videoTitle = db.prepare(`
          SELECT product_data FROM video_titles
          WHERE title = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(searchTitle) as { product_data: string } | undefined;
        db.close();

        if (videoTitle && videoTitle.product_data) {
          try {
            productInfo = JSON.parse(videoTitle.product_data);
            console.log('✅ DB에서 productInfo 로드 성공:', productInfo);
          } catch (e) {
            console.error('❌ product_data JSON 파싱 실패:', e);
          }
        } else {
          console.error('❌ DB에서 제목을 찾을 수 없음:', searchTitle);
        }
      }

      // productInfo가 있으면 플레이스홀더 치환
      if (productInfo) {
        console.log('🛍️ 상품 정보 치환 시작:', productInfo);
        prompt = prompt
          .replace(/{thumbnail}/g, productInfo.thumbnail || '')
          .replace(/{product_link}/g, productInfo.product_link || '')
          .replace(/{product_description}/g, productInfo.description || '');
        console.log('✅ 상품 정보 플레이스홀더 치환 완료');
      } else {
        console.warn('⚠️ productInfo를 찾을 수 없습니다! 플레이스홀더가 그대로 남아있을 수 있습니다.');
      }

      console.log('✅ 상품 프롬프트 사용');
    } else if (scriptType === 'product-info') {
      // ⚠️ DEPRECATED: product-info는 product로 통합됨
      console.log('⚠️ product-info 타입 감지 → product 프롬프트 사용');
      scriptType = 'product'; // product로 변경
      const productPromptTemplate = await getProductPrompt();
      prompt = productPromptTemplate.replace(/{title}/g, title);

      // productInfo가 없으면 DB에서 찾아오기
      if (!productInfo) {
        console.log('⚠️ productInfo가 전달되지 않음, DB에서 찾는 중...');

        // title에서 원본 제목 추출: "[광고] XXX - 상품 기입 정보" → "[광고] XXX"
        const originalTitle = title.replace(/ - 상품 기입 정보$/, '');
        console.log('  원본 제목:', originalTitle);

        // DB에서 원본 제목의 product_data 찾기
        const db = Database(dbPath);
        const videoTitle = db.prepare(`
          SELECT product_data FROM video_titles
          WHERE title = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(originalTitle) as { product_data: string } | undefined;
        db.close();

        if (videoTitle && videoTitle.product_data) {
          try {
            productInfo = JSON.parse(videoTitle.product_data);
            console.log('✅ DB에서 productInfo 로드 성공:', productInfo);
          } catch (e) {
            console.error('❌ product_data JSON 파싱 실패:', e);
          }
        } else {
          console.error('❌ DB에서 원본 제목을 찾을 수 없음:', originalTitle);
        }
      }

      // productInfo가 있으면 플레이스홀더 치환
      if (productInfo) {
        console.log('🛍️🛍️🛍️ 상품 정보 치환 시작:', productInfo);
        console.log('  - title:', productInfo.title);
        console.log('  - thumbnail:', productInfo.thumbnail);
        console.log('  - product_link:', productInfo.product_link);
        console.log('  - description:', productInfo.description);

        // DB에서 사용자 설정 가져오기
        const db = Database(dbPath);
        const userSettings = db.prepare('SELECT google_sites_home_url, nickname FROM users WHERE id = ?').get(user.userId) as { google_sites_home_url?: string; nickname?: string } | undefined;
        db.close();
        const homeUrl = userSettings?.google_sites_home_url || 'https://www.youtube.com/@살림남';
        const nickname = userSettings?.nickname || '살림남';
        console.log('🏠 home_url 설정:', homeUrl);
        console.log('👤 별명 설정:', nickname);

        prompt = prompt
          .replace(/{thumbnail}/g, productInfo.thumbnail || '')
          .replace(/{product_link}/g, productInfo.product_link || '')
          .replace(/{product_description}/g, productInfo.description || '')
          .replace(/{home_url}/g, homeUrl)
          .replace(/{별명}/g, nickname);

        console.log('✅ 상품 정보 플레이스홀더 치환 완료');
      } else {
        console.error('❌ productInfo를 찾을 수 없습니다! 프롬프트에 플레이스홀더가 그대로 남습니다.');
      }

      console.log('✅ 상품정보 프롬프트 사용');
    } else {
      // 롱폼: 파일에서 읽어온 상세 프롬프트 사용
      const longFormPromptTemplate = await getLongFormPrompt();
      prompt = longFormPromptTemplate.replace(/{title}/g, title);  // 전역 치환 (여러 개 있을 수 있음)
      console.log('✅ 롱폼 프롬프트 사용');
    }

    // 카테고리 스타일 지침 추가 (프롬프트에 직접 삽입)
    const finalCategory = category || '일반';

    if (category && category !== '일반') {
      const categoryStyles: Record<string, string> = {
        '북한탈북자사연': '북한 탈북자의 실제 경험담과 사연을 바탕으로, 감동적이고 진솔한 스토리텔링으로 작성하세요. 탈북 과정의 어려움, 새로운 삶에 대한 희망, 가족에 대한 그리움 등을 담아주세요.',
        '막장드라마': '막장 드라마 스타일로 극적이고 자극적인 전개를 사용하세요. 배신, 복수, 충격적인 반전, 과장된 감정 표현을 포함하며, 시청자의 몰입을 극대화하세요.',
        '감동실화': '실화를 바탕으로 한 감동적인 스토리로 작성하세요. 진정성 있는 감정 표현과 희망적인 메시지를 전달하며, 시청자의 공감을 이끌어내세요.',
        '복수극': '복수를 주제로 한 긴장감 넘치는 스토리로 작성하세요. 치밀한 계획, 카타르시스, 정의의 실현 등을 극적으로 표현하세요.',
        '로맨스': '로맨틱하고 감성적인 사랑 이야기로 작성하세요. 설렘, 애틋함, 감동적인 순간들을 세심하게 묘사하세요.',
        '스릴러': '긴장감과 서스펜스가 넘치는 스릴러 스타일로 작성하세요. 예측 불가능한 전개와 반전, 긴박한 상황을 효과적으로 연출하세요.',
        '코미디': '유머러스하고 재미있는 코미디 스타일로 작성하세요. 웃음 포인트를 적절히 배치하고, 밝고 경쾌한 분위기를 유지하세요.'
      };

      const categoryInstruction = categoryStyles[category];
      if (categoryInstruction) {
        prompt = `${prompt}\n\n[카테고리: ${category}]\n${categoryInstruction}`;
        console.log(`🎭 카테고리 스타일 적용: ${category}`);
      }
    }

    // JSON 스키마에서 category와 scriptId를 직접 치환 (지시문 대신 값 삽입)
    prompt = prompt.replace('"category": "일반"', `"category": "${finalCategory}"`);
    prompt = prompt.replace('"scriptId": "자동생성됨"', `"scriptId": "${taskId}"`);
    console.log(`🎯 JSON 스키마 업데이트: category="${finalCategory}", scriptId="${taskId}"`);

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');

    // 프롬프트 내용 확인 로그
    console.log('\n' + '='.repeat(80));
    console.log('📝 생성된 프롬프트 내용:');
    console.log('  타입:',
      scriptType === 'shortform' ? '⚡ 숏폼' :
      scriptType === 'sora2' ? '🎥 SORA2' :
      scriptType === 'product' ? '🛍️ 상품' :
      '📝 롱폼');
    console.log('  제목:', title);
    console.log('  프롬프트 길이:', prompt.length, '자');
    console.log('  프롬프트 미리보기:', prompt.substring(0, 200) + '...');
    console.log('  제목 포함 여부:', prompt.includes(title) ? '✅ 포함됨' : '❌ 미포함');
    console.log('='.repeat(80) + '\n');

    // userId를 클로저에 저장
    const currentUserId = user.userId;

    // 작업 시작 시간 기록 (응답 파일 필터링용)
    const taskStartTime = Date.now();

    // 비동기로 실행
    setTimeout(async () => {
      let stdout = '';
      let stderr = '';
      let promptFileName = '';
      let promptFilePath = '';
      try {
        await addLog(taskId, '작업 시작됨');

        // contents 테이블 업데이트 - processing 상태로 변경
        const { updateContentStatus } = await import('@/lib/content');

        const message = scriptType === 'shortform'
          ? '⚡ Claude가 숏폼 대본을 생성하고 있습니다...'
          : scriptType === 'sora2'
          ? '🎥 Claude가 SORA2 프롬프트를 생성하고 있습니다...'
          : scriptType === 'product'
          ? '🛍️ Claude가 상품 소개 대본을 생성하고 있습니다...'
          : '📝 Claude가 롱폼 대본을 생성하고 있습니다...';

        await addLog(taskId, message);
        updateContentStatus(taskId, 'processing', 10);

        // 프롬프트를 임시 파일로 저장 (명령줄 길이 제한 및 특수문자 문제 회피)
        promptFileName = `prompt_${Date.now()}.txt`;
        promptFilePath = path.join(backendPath, promptFileName);

        const fsSync = require('fs');
        fsSync.writeFileSync(promptFilePath, prompt, 'utf-8');
        addLog(taskId, `프롬프트 파일 생성: ${promptFileName}`);
        const typeEmoji = scriptType === 'shortform' ? '⚡' :
                          scriptType === 'sora2' ? '🎥' :
                          scriptType === 'product' ? '🛍️' : '📝';
        const typeName = scriptType === 'shortform' ? '숏폼' :
                         scriptType === 'sora2' ? 'SORA2' :
                         scriptType === 'product' ? '상품' : '롱폼';
        addLog(taskId, `${typeEmoji} 타입: ${typeName}`);
        addLog(taskId, `📝 제목: "${title}"`);
        addLog(taskId, `📄 프롬프트 길이: ${prompt.length}자`);
        addLog(taskId, `✅ 프롬프트에 제목 포함: ${prompt.includes(title) ? 'Yes' : 'No'}`);

        // 실행할 명령어 구성 (backend의 ai_aggregator 모듈 사용)
        // headless 제거: 로그인 필요 시 브라우저가 표시되어야 함
        const pythonArgs = ['-m', 'src.ai_aggregator.main', '-f', promptFileName, '-a', agentName, '--auto-close'];
        const commandStr = `python ${pythonArgs.join(' ')}`;

        const modelNames: Record<string, string> = {
          'chatgpt': 'ChatGPT',
          'gemini': 'Gemini',
          'claude': 'Claude'
        };
        const modelDisplayName = modelNames[agentName] || agentName;

        addLog(taskId, '📌 Python 스크립트 실행 시작');
        addLog(taskId, `🤖 사용 모델: ${modelDisplayName}`);
        addLog(taskId, `💻 실행 명령어: ${commandStr}`);
        addLog(taskId, `📂 작업 디렉토리: ${backendPath}`);
        addLog(taskId, `🌐 브라우저 자동화로 ${modelDisplayName} 웹사이트 접속 중...`);
        addLog(taskId, '👁️ 브라우저가 표시됩니다 (로그인 필요 시 수동 로그인 가능)');
        addLog(taskId, '💡 이미 로그인되어 있으면 자동으로 진행됩니다');
        addLog(taskId, '⏱️ 1-2분 소요 예상');

        console.log(`\n${'='.repeat(80)}`);
        console.log(`[${taskId}] 실행 명령어:`);
        console.log(`  모델: ${modelDisplayName} (agent: ${agentName})`);
        console.log(`  작업 디렉토리: ${backendPath}`);
        console.log(`  명령어: ${commandStr}`);
        console.log(`  🏷️  Agent 파라미터: ${agentName}`);
        console.log(`${'='.repeat(80)}\n`);

        // -f 옵션으로 파일 경로 전달
        // Headless 모드로 실행 (백그라운드, 브라우저 숨김)
        const pythonProcess = spawn('python', pythonArgs, {
          cwd: backendPath,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1',  // Python 3.7+ UTF-8 모드 강제
            PYTHONUNBUFFERED: '1',  // Python 출력 버퍼링 비활성화 (실시간 로그)
            JOB_ID: taskId  // DB 로깅용 JOB_ID 전달
          }
        });

        // 프로세스 저장
        runningProcesses.set(taskId, pythonProcess);

        // PID를 DB에 저장
        if (pythonProcess.pid) {
          const dbPid = new Database(dbPath);
          dbPid.prepare('UPDATE scripts_temp SET pid = ? WHERE id = ?').run(pythonProcess.pid, taskId);
          dbPid.close();
          addLog(taskId, `🔢 프로세스 PID: ${pythonProcess.pid}`);
          console.log(`✅ PID 저장됨: ${pythonProcess.pid} for task ${taskId}`);
        }

        // stdout 버퍼 (부분적인 줄 처리용)
        let stdoutBuffer = '';

        pythonProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          stdoutBuffer += output;

          // 줄바꿈으로 완성된 줄들만 처리
          const lines = stdoutBuffer.split('\n');
          // 마지막 요소는 불완전할 수 있으므로 버퍼에 보관
          stdoutBuffer = lines.pop() || '';

          // 완성된 줄들만 로그에 추가
          lines.forEach((line: string) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              console.log('[Python]', trimmedLine);
              addLog(taskId, trimmedLine);
            }
          });
        });

        // stderr 버퍼
        let stderrBuffer = '';

        pythonProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          stderr += error;
          stderrBuffer += error;

          // 줄바꿈으로 완성된 줄들만 처리
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() || '';

          lines.forEach((line: string) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              console.error('[Python stderr]', trimmedLine);
              addLog(taskId, `⚠️ ${trimmedLine}`);
            }
          });
        });

        // 프로세스 완료 대기
        await new Promise<void>((resolve, reject) => {
          pythonProcess.on('close', (code) => {
            runningProcesses.delete(taskId);

            // 버퍼에 남은 내용 처리 (마지막 줄이 줄바꿈 없이 끝난 경우)
            if (stdoutBuffer.trim()) {
              console.log('[Python] (final)', stdoutBuffer.trim());
              addLog(taskId, stdoutBuffer.trim());
            }
            if (stderrBuffer.trim()) {
              console.error('[Python stderr] (final)', stderrBuffer.trim());
              addLog(taskId, `⚠️ ${stderrBuffer.trim()}`);
            }

            if (code === 0 || code === null) {
              resolve();
            } else {
              reject(new Error(`Process exited with code ${code}`));
            }
          });

          pythonProcess.on('error', (error) => {
            runningProcesses.delete(taskId);
            reject(error);
          });
        });

        console.log('Python output:', stdout);
        if (stderr) console.error('Python stderr:', stderr);

        addLog(taskId, '✅ Python 스크립트 실행 완료!');

        // 프롬프트 파일 삭제
        try {
          fsSync.unlinkSync(promptFilePath);
          addLog(taskId, '🗑️ 프롬프트 파일 정리 완료');
        } catch (e) {
          console.error('프롬프트 파일 삭제 실패:', e);
        }

        addLog(taskId, '📂 Claude 응답 파일 검색 중...');

        // 최신 ai_responses 파일 찾기 (trend-video-backend/src/scripts에서)
        const fs = require('fs');
        const scriptsPath = path.join(backendPath, 'src', 'scripts');

        addLog(taskId, `📁 검색 경로: ${scriptsPath}`);
        console.log('📁 대본 파일 검색 경로:', scriptsPath);

        // scripts 디렉토리가 없으면 생성
        if (!fs.existsSync(scriptsPath)) {
          fs.mkdirSync(scriptsPath, { recursive: true });
          addLog(taskId, '📁 scripts 디렉토리 생성됨');
        }

        const aiResponseFiles = fs.readdirSync(scriptsPath)
          .filter((f: string) => f.startsWith('ai_responses_') && f.endsWith('.txt'))
          .map((f: string) => ({
            name: f,
            path: path.join(scriptsPath, f),
            time: fs.statSync(path.join(scriptsPath, f)).mtime.getTime()
          }))
          // 작업 시작 시간 이후에 생성된 파일만 선택 (오래된 파일 제외)
          .filter((f: any) => f.time >= taskStartTime)
          .sort((a: any, b: any) => b.time - a.time);

        console.log(`📦 발견된 대본 파일 수: ${aiResponseFiles.length} (작업 시작 후 생성된 파일만)`);

        let scriptContent = '';
        if (aiResponseFiles.length > 0) {
          addLog(taskId, `✓ 응답 파일 발견: ${aiResponseFiles[0].name}`);
          // 가장 최신 파일 읽기
          const fullContent = fs.readFileSync(aiResponseFiles[0].path, 'utf-8');

          // Claude의 응답만 추출
          const claudeMatch = fullContent.match(/--- Claude ---\s+([\s\S]*?)(?=\n-{80}|\n--- |$)/);
          if (claudeMatch && claudeMatch[1]) {
            scriptContent = claudeMatch[1].trim();
            addLog(taskId, `✓ Claude 응답 추출 완료 (${scriptContent.length} 글자)`);
          } else {
            // Claude 섹션을 찾지 못한 경우 전체 내용 사용
            scriptContent = fullContent;
            addLog(taskId, `✓ 대본 내용 읽기 완료 (${scriptContent.length} 글자)`);
          }

          // "JSON" 텍스트 제거 (AI가 응답 앞에 "JSON"을 붙이는 경우가 있음)
          if (scriptContent.trim().startsWith('JSON')) {
            scriptContent = scriptContent.trim().substring(4).trim();
            addLog(taskId, '🔧 "JSON" 텍스트 제거됨');
          }

          // { 이전의 불필요한 텍스트 제거
          const jsonStart = scriptContent.indexOf('{');
          if (jsonStart > 0) {
            scriptContent = scriptContent.substring(jsonStart);
            addLog(taskId, '🔧 JSON 시작 부분 정리됨');
          }
        } else {
          const errorMsg = `응답 파일을 찾을 수 없음 (작업 시작: ${new Date(taskStartTime).toISOString()})`;
          addLog(taskId, `⚠️ 경고: ${errorMsg}`);
          console.error(`❌ ${errorMsg}`);
          console.error('  - scripts 경로:', scriptsPath);
          console.error('  - 전체 파일:', fs.readdirSync(scriptsPath).filter((f: string) => f.startsWith('ai_responses_')));
        }

        // SORA2 형식인 경우 JSON 정리
        if (scriptType === 'sora2' && scriptContent) {
          addLog(taskId, '🔧 SORA2 JSON 정리 중...');
          console.log('🔧 SORA2 JSON 정리 시작 - 원본 길이:', scriptContent.length);

          // 1. 코드펜스 제거 (```json 또는 ```)
          let cleanedContent = scriptContent.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

          // 2. 첫 번째 { 찾기 및 마지막 } 찾기
          const jsonStart = cleanedContent.indexOf('{');
          const jsonEnd = cleanedContent.lastIndexOf('}');

          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            // { 이전과 } 이후의 텍스트 제거
            cleanedContent = cleanedContent.substring(jsonStart, jsonEnd + 1);
            addLog(taskId, `✅ JSON 추출 완료 (${cleanedContent.length}자)`);
            console.log('✅ JSON 추출 완료:', cleanedContent.substring(0, 200) + '...');

            // 2.5. 한글 따옴표 제거 (JSON 파싱 오류 방지)
            const beforeLength = cleanedContent.length;
            cleanedContent = cleanedContent
              .replace(/"/g, '')  // 한글 여는 따옴표 제거
              .replace(/"/g, ''); // 한글 닫는 따옴표 제거

            const removedCount = beforeLength - cleanedContent.length;
            if (removedCount > 0) {
              addLog(taskId, `🔧 한글 따옴표 ${removedCount}개 제거`);
              console.log(`🔧 한글 따옴표 ${removedCount}개 제거`);
            }

            // 3. JSON 유효성 검증 및 포맷팅
            try {
              const parsed = JSON.parse(cleanedContent);
              addLog(taskId, '✅ JSON 파싱 성공');
              console.log('✅ JSON 파싱 성공 - 객체 키:', Object.keys(parsed).join(', '));

              // 4. JSON 포맷팅 (예쁘게 정리)
              scriptContent = JSON.stringify(parsed, null, 2);
              addLog(taskId, '✨ JSON 포맷팅 완료');
              console.log('✨ JSON 포맷팅 완료 - 최종 길이:', scriptContent.length);
            } catch (jsonError: any) {
              addLog(taskId, `⚠️ JSON 파싱 실패: ${jsonError.message}`);
              console.error('❌ JSON 파싱 실패:', jsonError);
              console.log('파싱 시도한 내용 (처음 500자):', cleanedContent.substring(0, 500));
              // 파싱 실패해도 정리된 내용 사용
              scriptContent = cleanedContent;
            }
          } else {
            addLog(taskId, '⚠️ JSON 구조를 찾을 수 없음 (원본 사용)');
            console.warn('⚠️ JSON 구조를 찾을 수 없음');
          }
        }

        // productInfo가 있으면 AI 응답에서 플레이스홀더 치환
        console.log(`🔍 [PLACEHOLDER-CHECK] scriptType: ${scriptType}, productInfo: ${productInfo ? 'YES' : 'NO'}`);
        if (scriptType === 'product') {
          // product 타입이면 무조건 플레이스홀더 치환 시도
          // productInfo가 없으면 빈 문자열로 치환
          const safeProductInfo = productInfo || { thumbnail: '', product_link: '', description: '' };

          console.log('🛍️🛍️🛍️ AI 응답 플레이스홀더 치환 시작:', safeProductInfo);
          console.log('  - 치환 대상 타입:', scriptType);
          console.log('  - productInfo 전달됨:', !!productInfo);
          addLog(taskId, '🛍️ 상품 정보 플레이스홀더 치환 중...');

          // JSON인 경우 파싱 후 치환 (구조 유지)
          try {
            const parsedContent = JSON.parse(scriptContent);
            const jsonString = JSON.stringify(parsedContent);

            // 플레이스홀더 확인
            const hasThumbnail = jsonString.includes('{thumbnail}');
            const hasProductLink = jsonString.includes('{product_link}');
            const hasProductDescription = jsonString.includes('{product_description}');

            console.log('🔍 플레이스홀더 확인:', { hasThumbnail, hasProductLink, hasProductDescription });

            if (hasThumbnail || hasProductLink || hasProductDescription) {
              console.log('⚠️ AI 응답에 플레이스홀더 발견! 치환 시작...');
              console.log('  - {thumbnail} 치환:', safeProductInfo.thumbnail);
              console.log('  - {product_link} 치환:', safeProductInfo.product_link);
              console.log('  - {product_description} 치환:', safeProductInfo.description);

              // JSON 문자열에서 플레이스홀더 치환
              let replacedJson = jsonString
                .replace(/{thumbnail}/g, safeProductInfo.thumbnail || '')
                .replace(/{product_link}/g, safeProductInfo.product_link || '')
                .replace(/{product_description}/g, safeProductInfo.description || '');

              // 다시 JSON으로 파싱하고 포맷팅
              scriptContent = JSON.stringify(JSON.parse(replacedJson), null, 2);
              console.log('✅ AI 응답 플레이스홀더 치환 완료 (JSON)');
              console.log('  - 치환 후 내용 샘플:', scriptContent.substring(0, 300));
            } else {
              console.log('✅ AI 응답에 플레이스홀더 없음 (정상)');
            }
          } catch (e) {
            // JSON이 아니면 문자열 치환
            console.log('⚠️ JSON 파싱 실패, 문자열 치환 시도');
            scriptContent = scriptContent
              .replace(/{thumbnail}/g, safeProductInfo.thumbnail || '')
              .replace(/{product_link}/g, safeProductInfo.product_link || '')
              .replace(/{product_description}/g, safeProductInfo.description || '');
            console.log('✅ AI 응답 플레이스홀더 치환 완료 (문자열)');
          }

          addLog(taskId, '✅ 상품 정보 플레이스홀더 치환 완료');
        } else {
          console.log(`⚠️ [PLACEHOLDER-SKIP] 상품 타입이 아니므로 치환 스킵 (type: ${scriptType})`);
        }

        addLog(taskId, '💾 contents 테이블에 저장 중...');

        // contents 테이블에 대본 내용 업데이트
        const { updateContent } = await import('@/lib/content');

        try {
          const updatedContent = updateContent(taskId, {
            content: scriptContent,
            status: 'completed',
            progress: 100
          });

          if (updatedContent) {
            await addLog(taskId, `✓ 대본 저장 완료! (${scriptContent.length} 글자)`);
          }
        } catch (saveError: any) {
          console.error('❌ 대본 저장 실패:', saveError);
          await addLog(taskId, `❌ 대본 저장 실패: ${saveError.message}`);
        }

        // 성공 시 프롬프트 파일 정리
        try {
          const fsSync = require('fs');
          if (promptFilePath && fsSync.existsSync(promptFilePath)) {
            fsSync.unlinkSync(promptFilePath);
            console.log('프롬프트 파일 정리 완료');
          }
        } catch (e) {
          console.error('프롬프트 파일 삭제 실패:', e);
        }
      } catch (error: any) {
        console.error('❌ 스크립트 생성 중 오류:', error);
        const errorMsg = error.message || error.toString() || '';
        await addLog(taskId, `❌ 오류 발생: ${errorMsg}`);

        // 에러 발생 시 이메일 전송
        try {
          await sendErrorEmail({
            taskId,
            title,
            errorMessage: errorMsg,
            stdout: stdout || '(출력 없음)',
            stderr: stderr || '(출력 없음)',
            timestamp: new Date().toISOString(),
          });
          console.log('✅ 에러 알림 이메일 전송 완료');
        } catch (emailError) {
          console.error('❌ 에러 이메일 전송 실패:', emailError);
        }

        // 에러 발생 시에도 프롬프트 파일 정리
        try {
          const fsSync = require('fs');
          if (promptFilePath && fsSync.existsSync(promptFilePath)) {
            fsSync.unlinkSync(promptFilePath);
            console.log('프롬프트 파일 정리 완료 (에러 후)');
          }
        } catch (e) {
          console.error('프롬프트 파일 삭제 실패:', e);
        }

        // contents 테이블 상태 업데이트 - failed
        const { updateContent: updateContentError } = await import('@/lib/content');
        updateContentError(taskId, {
          status: 'failed',
          error: `오류: ${error.message}`
        });
      }
    }, 100);

    return NextResponse.json({
      success: true,
      taskId,
      message: '대본 생성이 시작되었습니다'
    });
  } catch (error: any) {
    console.error('Error creating script task:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create script task' },
      { status: 500 }
    );
  }
}
