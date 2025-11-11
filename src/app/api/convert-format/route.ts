import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { createContent, updateContent, addContentLog } from '@/lib/content';
import db from '@/lib/sqlite';

// POST 메서드 (대본 변환)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { scriptId, targetFormat } = await request.json();

    console.log('📥 변환 요청 받음:', { scriptId, targetFormat });

    if (!scriptId || !targetFormat) {
      return NextResponse.json(
        {
          error: 'scriptId와 targetFormat이 필요합니다.',
          errorCode: 'INVALID_PARAMETERS'
        },
        { status: 400 }
      );
    }

    // contents 테이블에서 원본 대본 가져오기
    console.log('🔍 대본 조회 중:', scriptId);
    console.log('🔍 쿼리: SELECT * FROM contents WHERE id = ? AND user_id = ?');
    console.log('🔍 파라미터:', { id: scriptId, user_id: user.userId });

    const originalScript = db.prepare(`
      SELECT * FROM contents
      WHERE id = ? AND user_id = ?
    `).get(scriptId, user.userId) as any;

    console.log('📊 조회 결과:', originalScript ? {
      id: originalScript.id,
      user_id: originalScript.user_id,
      title: originalScript.title,
      type: originalScript.type,
      format: originalScript.format,
      contentLength: originalScript.content?.length || 0,
      status: originalScript.status
    } : 'null');

    let content = '';
    let scriptType: string | undefined = undefined;
    let scriptTitle = '';

    if (originalScript) {
      console.log('✅ contents 테이블에서 찾음');
      content = originalScript.content || '';
      scriptType = originalScript.format; // format 컬럼 사용
      scriptTitle = originalScript.title;
    } else {
      console.log('❌ contents 테이블에서 찾을 수 없음');
    }

    console.log('최종 상태:', {
      originalScriptFound: !!originalScript,
      contentLength: content?.length || 0,
      scriptType,
      scriptTitle
    });

    if (!originalScript || !content) {
      console.log('❌ 대본을 찾을 수 없거나 내용이 비어있음 (scriptId:', scriptId, ')');
      return NextResponse.json(
        {
          error: '대본을 찾을 수 없습니다. 대본 생성이 완료되지 않았을 수 있습니다.',
          errorCode: 'SCRIPT_NOT_FOUND',
          scriptId: scriptId,
          debug: {
            originalScriptFound: !!originalScript,
            contentAvailable: !!content,
            contentLength: content?.length || 0
          }
        },
        { status: 400 }
      );
    }

    // 본인 대본인지 확인
    if (originalScript.user_id !== user.userId) {
      console.log('❌ 권한 없음:', { scriptUserId: originalScript.user_id, currentUserId: user.userId });
      return NextResponse.json(
        {
          error: '이 대본에 접근할 권한이 없습니다.',
          errorCode: 'FORBIDDEN'
        },
        { status: 403 }
      );
    }

    console.log(`📝 대본 변환 시작: ${scriptId} → ${targetFormat}`);

    // 변환 타입 확인
    const sourceType = scriptType || 'longform';
    const conversionKey = `${sourceType}-to-${targetFormat}`;

    const validConversions = [
      'longform-to-shortform',
      'longform-to-sora2',
      'shortform-to-sora2'
    ];

    if (!validConversions.includes(conversionKey)) {
      return NextResponse.json(
        {
          error: `지원하지 않는 변환: ${sourceType} → ${targetFormat}`,
          errorCode: 'UNSUPPORTED_CONVERSION',
          sourceType,
          targetFormat
        },
        { status: 400 }
      );
    }

    // 새 대본 생성 - 제목은 원본 제목 그대로 사용
    const newScript = createContent(
      user.userId,
      'script',
      scriptTitle,  // 제목에 접미사 붙이지 않음
      {
        format: targetFormat as 'longform' | 'shortform' | 'sora2',
        originalTitle: scriptTitle,
        sourceContentId: scriptId,  // 원본 대본 ID 저장
        conversionType: conversionKey  // 변환 타입 저장 (예: 'longform-to-sora2')
      }
    );
    const newScriptId = newScript.id;

    console.log(`✅ 새 대본 생성 (contents 테이블): ${newScriptId}`);

    // 비동기로 변환 실행
    convertScriptAsync(
      newScriptId,
      content,
      conversionKey,
      targetFormat
    );

    return NextResponse.json({
      success: true,
      scriptId: newScriptId,
      message: '대본 변환이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 대본 변환 API 에러:', error);
    return NextResponse.json(
      {
        error: error?.message || '대본 변환 중 오류가 발생했습니다.',
        errorCode: 'INTERNAL_SERVER_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// 비동기 변환 함수
async function convertScriptAsync(
  newScriptId: string,
  originalContent: string,
  conversionKey: string,
  targetFormat: string
) {
  try {
    addContentLog(newScriptId, '🔄 대본 변환 시작...');
    addContentLog(newScriptId, `📋 변환 타입: ${conversionKey}`);

    // Anthropic 동적 import
    const Anthropic = (await import('@anthropic-ai/sdk')).default;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    // 프롬프트 템플릿
    const prompts: Record<string, string> = {
      'longform-to-shortform': `당신은 롱폼 비디오 대본을 숏폼(60초)으로 변환하는 전문가입니다.

주어진 롱폼 대본에서 **가장 재미있고 충격적인 장면들만 선택**하여 60초 하이라이트로 재구성하세요.

**핵심 원칙: "축약"이 아니라 "베스트 장면 편집"**
- 평범한 설명이나 배경 정보는 과감히 제외
- 반전, 갈등, 절정, 충격적인 순간을 우선적으로 선택
- 감정의 진폭이 큰 장면들로 구성
- 시청자가 "어? 뭐야?" 하고 멈춰 볼 만한 순간들
- 원본의 가장 드라마틱한 부분들을 연결하여 스토리 완성

**중요: 시간 계산 (TTS 기준 1초당 15자)**
1. 총 길이: 정확히 60초
2. 씬0 (훅): 3초 → 나레이션 정확히 45자 (3초 × 15자 = 45자)
3. 씬1-5: 각 11.4초 → 나레이션 각 정확히 170자 (11.4초 × 15자 = 170자)
4. 나레이션은 반드시 지정된 글자 수를 정확히 맞출 것
5. 감정 묘사, 상황 설명, 구체적인 디테일을 포함하여 글자 수를 채울 것
6. **계산 검증:** 45 + (170 × 5) = 45 + 850 = 895자 = 59.67초 ≈ 60초

**씬 선택 가이드:**
- 씬 개수: 정확히 6개 (훅 포함)
- 씬0 (훅): 가장 충격적이거나 호기심을 자극하는 순간
- 씬1-5: 원본에서 가장 재미있는 5개 장면을 선택
  * 반전이 있는 장면 우선
  * 감정이 폭발하는 순간
  * 예상을 깨는 전개
  * 갈등이 극에 달하는 순간
  * 통쾌한 결말 또는 여운 있는 엔딩
- 평범한 전개나 설명은 생략하고, 임팩트 있는 순간만 연결

**narration 작성 규칙:**
- 씬0: **정확히 45자** (임팩트 있는 훅, 짧고 강렬하게)
- 씬1-5: **각 정확히 170자** (상세한 상황 설명과 감정 묘사)
- 구체적인 대화, 행동, 감정을 포함하여 정확한 글자 수 채우기
- 시청자가 몰입할 수 있도록 생생하게 묘사
- 부족하면 디테일 추가, 초과하면 간결하게 다듬기

**image_prompt 작성 규칙:**
- 반드시 "Vertical 9:16 format, portrait orientation"으로 시작
- 구체적인 피사체와 상황 묘사 (최소 2-3문장)
- 인물의 표정, 자세, 배경, 조명 등 디테일 포함
- 모바일 최적화: "mobile-optimized framing"

**출력 형식:**
- 순수 JSON만 출력 (코드펜스 없음)
- 첫 글자: {, 마지막 글자: }
- scenes 배열에 6개 씬
- 각 씬에 scene_number, narration, image_prompt 포함
- metadata에 type: "shortform" 설정
- **중요:** 원본 대본의 emotional_arc가 있으면 그대로 복사

롱폼 대본:
${originalContent}

숏폼으로 변환된 JSON을 출력하세요:`,

      'longform-to-sora2': `당신은 롱폼 비디오 대본을 SORA2 시네마틱 포맷(180초 = 3분)으로 변환하는 전문가입니다.

주어진 롱폼 대본을 **처음부터 끝까지 꼼꼼히 읽고**, **진짜 하이라이트만 엄선**하여 180초 시네마틱 영상으로 재구성하세요.

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
4. 🎬 **시각적 강렬함**: 영화 같은 장면, 비주얼 임팩트
5. 🎯 **결말/여운**: 통쾌한 결말, 생각하게 만드는 엔딩
6. ❌ **제외 대상**: 평범한 설명, 배경 정보, 지루한 전개

**중요: 시간 계산 (TTS 기준 1초당 15자)**
1. 총 길이: 정확히 180초 (3분)
2. 씬0 (훅): 5초 → 나레이션 정확히 75자 (5초 × 15자 = 75자)
3. 씬1-10: 각 17.5초 → 나레이션 각 정확히 262자 (17.5초 × 15자 = 262자)
4. **계산 검증:** 75 + (262 × 10) = 75 + 2620 = 2695자 ≈ 179.67초 ≈ 180초
5. 나레이션은 반드시 지정된 글자 수를 정확히 맞출 것

**씬 선택 프로세스:**
1️⃣ **1단계: 전체 읽기**
   - 원본 대본을 처음부터 끝까지 완전히 읽기
   - 모든 장면의 위치, 내용, 임팩트 파악

2️⃣ **2단계: 임팩트 평가**
   - 각 장면에 임팩트 점수 매기기 (1-10점)
   - 반전, 감정, 시각, 클라이맥스 기준으로 평가

3️⃣ **3단계: 베스트 10+1 선택**
   - 가장 점수 높은 11개 장면 선택 (씬0 포함)
   - 앞/중간/뒤 골고루가 아니라 점수 순으로

4️⃣ **4단계: 스토리 재구성**
   - 선택한 장면들을 논리적으로 연결
   - 시작-전개-절정-결말 구조 유지

**씬 구성:**
- 씬 개수: 정확히 11개 (훅 + 메인 10개)
- 씬0 (훅): **가장 충격적인 1개 순간** (원본 어디든 상관없음)
- 씬1-10: **임팩트 순위 2-11위 장면**
  * 반전이 있는 장면 우선
  * 감정 폭발 장면
  * 클라이맥스 장면
  * 시각적으로 강렬한 장면
  * 통쾌한 결말 또는 여운 있는 마무리

**narration 작성 규칙:**
- 씬0: **정확히 75자** (초강력 훅, 임팩트 폭발)
- 씬1-10: **각 정확히 262자** (상세한 상황, 감정, 배경 모두 포함)
- 시네마틱한 분위기를 살리는 문장
- 구체적인 대화, 행동, 감정, 배경을 모두 담기
- 반드시 지정된 글자 수를 정확히 맞출 것

**sora_prompt 작성 규칙:**
- 최소 3-4문장의 상세한 영상 묘사
- 카메라 앵글, 조명, 색감, 분위기 포함
- 인물의 표정과 동작을 구체적으로 묘사
- 시네마틱한 요소 강조 (예: "cinematic lighting", "dramatic composition")
- 배경과 환경의 디테일 포함

**image_prompt 작성 규칙:**
- "Vertical 9:16 format"으로 시작
- sora_prompt와 일관성 유지
- 구체적인 시각적 디테일 (최소 2-3문장)
- 인물, 배경, 조명, 색감 모두 포함

**출력 형식:**
- 순수 JSON만 출력 (코드펜스 없음)
- version: "sora2-2.0-shortform-aligned"
- scenes 배열에 4개 씬
- 각 씬에 scene_id, sora_prompt, image_prompt, narration 포함
- metadata에 적절한 정보 설정
- **중요:** 원본 대본의 emotional_arc가 있으면 그대로 복사

롱폼 대본:
${originalContent}

SORA2로 변환된 JSON을 출력하세요:`,

      'shortform-to-sora2': `당신은 숏폼 비디오 대본을 SORA2 시네마틱 포맷(30초)으로 변환하는 전문가입니다.

주어진 숏폼 대본(60초)에서 **가장 시네마틱하고 강렬한 4개 장면만 선택**하여 30초로 재구성하세요.

**핵심 원칙: "압축"이 아니라 "하이라이트 선별"**
- 6개 씬 중 가장 임팩트 있는 4개만 선택
- 평범한 씬은 과감히 제외
- 반전, 감정 폭발, 시각적 강렬함 우선
- 시네마틱 요소가 강한 장면 선택
- 영화 같은 느낌이 나도록 구성

**중요: 시간 계산 (TTS 기준 1초당 15자)**
1. 총 길이: 정확히 30초
2. 씬0 (훅): 3초 → 나레이션 정확히 45자 (3초 × 15자 = 45자)
3. 씬1-3: 각 9초 → 나레이션 각 정확히 135자 (9초 × 15자 = 135자)
4. 나레이션은 반드시 지정된 글자 수를 정확히 맞출 것
5. **계산 검증:** 45 + (135 × 3) = 45 + 405 = 450자 = 30초

**씬 선택 가이드:**
- 6개 씬 → 가장 강렬한 4개 씬 선택
- 씬0 (훅): 가장 충격적인 순간을 훅으로
- 씬1-3: 나머지 중 가장 드라마틱한 3개 선택
  * 반전이 있는 씬
  * 감정이 폭발하는 씬
  * 시각적으로 아름다운 씬
  * 여운 있는 엔딩 씬
- 평범한 전개나 설명 씬은 제외
- 시네마틱 요소 강화

**narration 작성 규칙:**
- 씬0: **정확히 45자** (강렬한 훅)
- 씬1-3: **각 정확히 135자** (상세한 상황과 감정 표현)
- 시네마틱한 분위기를 살리는 문장
- 구체적인 행동과 감정을 생생하게 묘사
- 반드시 지정된 글자 수를 정확히 맞출 것

**sora_prompt 작성 규칙:**
- 최소 3-4문장의 상세한 영상 묘사
- 카메라 앵글, 조명, 색감, 분위기 포함
- 인물의 표정과 동작을 구체적으로 묘사
- 시네마틱한 요소 강조
- 배경과 환경의 디테일 포함

**image_prompt 작성 규칙:**
- "Vertical 9:16 format"으로 시작
- sora_prompt와 일관성 유지
- 구체적인 시각적 디테일 (최소 2-3문장)

**출력 형식:**
- 순수 JSON만 출력 (코드펜스 없음)
- version: "sora2-2.0-shortform-aligned"
- scenes 배열에 4개 씬
- 각 씬에 scene_id, sora_prompt, image_prompt, narration 포함
- **중요:** 원본 대본의 emotional_arc가 있으면 그대로 복사

숏폼 대본:
${originalContent}

SORA2로 변환된 JSON을 출력하세요:`
    };

    const prompt = prompts[conversionKey];

    addContentLog(newScriptId, '🤖 Claude API 호출 중...');

    // Claude API 호출
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

    addContentLog(newScriptId, '✅ Claude 응답 받음');

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

    const scriptData = JSON.parse(cleaned);

    addContentLog(newScriptId, '✅ JSON 파싱 성공');

    // metadata 설정
    if (!scriptData.metadata) {
      scriptData.metadata = {};
    }
    scriptData.metadata.converted_from = conversionKey;
    scriptData.metadata.converted_at = new Date().toISOString();

    // DB 업데이트 (contents 테이블)
    updateContent(newScriptId, {
      content: JSON.stringify(scriptData, null, 2),
      status: 'completed',
      progress: 100
    });

    addContentLog(newScriptId, '🎉 대본 변환 완료!');

    console.log(`✅ 대본 변환 성공: ${newScriptId}`);

  } catch (error: any) {
    console.error(`❌ 대본 변환 실패: ${newScriptId}`, error);

    updateContent(newScriptId, {
      status: 'failed',
      error: error?.message || '알 수 없는 오류'
    });

    addContentLog(newScriptId, `❌ 변환 실패: ${error?.message || '알 수 없는 오류'}`);
  }
}
