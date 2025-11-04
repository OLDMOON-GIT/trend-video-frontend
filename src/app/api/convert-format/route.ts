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

주어진 롱폼 대본을 60초 숏폼 형식으로 축약하고 재구성하세요.

**중요: 시간 계산 (TTS 기준 1초당 15자)**
1. 총 길이: 정확히 60초
2. 씬0 (훅): 3초 → 나레이션 정확히 45자 (3초 × 15자 = 45자)
3. 씬1-5: 각 11.4초 → 나레이션 각 정확히 170자 (11.4초 × 15자 = 170자)
4. 나레이션은 반드시 지정된 글자 수를 정확히 맞출 것
5. 감정 묘사, 상황 설명, 구체적인 디테일을 포함하여 글자 수를 채울 것
6. **계산 검증:** 45 + (170 × 5) = 45 + 850 = 895자 = 59.67초 ≈ 60초

**변환 규칙:**
- 씬 개수: 정확히 6개 (훅 포함)
- 핵심 메시지와 감정선 유지
- 빠른 전개, 강렬한 훅, 명확한 결론
- 각 씬의 전환이 자연스럽게

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

      'longform-to-sora2': `당신은 롱폼 비디오 대본을 SORA2 시네마틱 숏폼(30초)으로 변환하는 전문가입니다.

주어진 롱폼 대본을 30초 SORA2 형식으로 변환하세요.

**중요: 시간 계산 (TTS 기준 1초당 15자)**
1. 총 길이: 정확히 30초
2. 씬0 (훅): 3초 → 나레이션 정확히 45자 (3초 × 15자 = 45자)
3. 씬1-3: 각 9초 → 나레이션 각 정확히 135자 (9초 × 15자 = 135자)
4. 나레이션은 반드시 지정된 글자 수를 정확히 맞출 것
5. 감정 묘사, 상황 설명, 구체적인 디테일을 포함하여 글자 수를 채울 것
6. **계산 검증:** 45 + (135 × 3) = 45 + 405 = 450자 = 30초

**변환 규칙:**
- 씬 개수: 정확히 4개
- 시네마틱 비주얼에 집중
- 핵심 감정과 반전만 남김
- 각 씬의 전환이 드라마틱하게

**narration 작성 규칙:**
- 씬0: **정확히 45자** (강렬한 훅, 임팩트 있게)
- 씬1-3: **각 정확히 135자** (상세한 상황과 감정 표현)
- 시네마틱한 분위기를 살리는 문장
- 구체적인 행동과 감정을 생생하게 묘사
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

주어진 숏폼 대본(60초)을 30초 SORA2 형식으로 압축하세요.

**중요: 시간 계산 (TTS 기준 1초당 15자)**
1. 총 길이: 정확히 30초
2. 씬0 (훅): 3초 → 나레이션 정확히 45자 (3초 × 15자 = 45자)
3. 씬1-3: 각 9초 → 나레이션 각 정확히 135자 (9초 × 15자 = 135자)
4. 나레이션은 반드시 지정된 글자 수를 정확히 맞출 것
5. **계산 검증:** 45 + (135 × 3) = 45 + 405 = 450자 = 30초

**변환 규칙:**
- 6개 씬 → 4개 씬으로 축약
- 가장 중요한 씬들만 선택
- 각 씬을 시네마틱하게 재구성
- 핵심 스토리와 감정선 유지

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
