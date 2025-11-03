import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findScriptById, createScript, addScriptLog } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// 변환 프롬프트
const CONVERSION_PROMPTS = {
  'longform-to-shortform': `당신은 롱폼 비디오 대본을 숏폼(60초)으로 변환하는 전문가입니다.

주어진 롱폼 대본을 60초 숏폼 형식으로 축약하고 재구성하세요.

**변환 규칙:**
1. 총 길이: 60초 (씬0: 3초 훅 + 씬1-5: 각 10-12초)
2. 씬 개수: 6개 (훅 포함)
3. 핵심 메시지만 남기고 나머지 제거
4. 빠른 전개, 강렬한 훅, 명확한 결론
5. 나레이션: 씬0 50자, 씬1-5 각 150자 이내

**image_prompt 작성 규칙:**
- 반드시 "Vertical 9:16 format, portrait orientation"으로 시작
- 구체적인 피사체와 상황 묘사
- 모바일 최적화: "mobile-optimized framing"

**출력 형식:**
- 순수 JSON만 출력 (코드펜스 없음)
- 첫 글자: {, 마지막 글자: }
- scenes 배열에 6개 씬
- 각 씬에 scene_number, narration, image_prompt 포함
- metadata에 type: "shortform" 설정

롱폼 대본:
{content}

숏폼으로 변환된 JSON을 출력하세요:`,

  'longform-to-sora2': `당신은 롱폼 비디오 대본을 SORA2 시네마틱 숏폼(30초)으로 변환하는 전문가입니다.

주어진 롱폼 대본을 30초 SORA2 형식으로 변환하세요.

**변환 규칙:**
1. 총 길이: 30초 (씬0: 3초 훅 + 씬1-3: 각 9초)
2. 씬 개수: 4개
3. 시네마틱 비주얼에 집중 (슬로우 모션, 극적 조명)
4. 핵심 감정과 반전만 남김

**sora_prompt 필수 구조 (모든 씬에 동일하게 적용):**
1. "Vertical 9:16 format, portrait orientation" (필수 시작)
2. "cinematic film"
3. [구체적인 피사체와 상황]
4. "full vertical composition with subject centered"
5. [슬로우 모션 묘사]
6. [조명] (golden hour, soft light, dramatic lighting 등)
7. [카메라 움직임] (slowly tracking, slowly pushing in, slowly orbiting 등)
8. [분위기] (dreamy, nostalgic, shocking, addictive 등)
9. "shot on 35mm film, shallow depth of field, soft bokeh"
10. "mobile-optimized framing"

**image_prompt도 같은 스타일로 작성 (SORA2 시네마틱 요소 포함)**

**출력 형식:**
- 순수 JSON만 출력 (코드펜스 없음)
- 첫 글자: {, 마지막 글자: }
- version: "sora2-2.0-shortform-aligned"
- scenes 배열에 4개 씬
- 각 씬에 scene_id, sora_prompt, image_prompt, narration, technical_specs 포함
- metadata에 aspect_ratio: "9:16", target_duration_seconds: 30

롱폼 대본:
{content}

SORA2로 변환된 JSON을 출력하세요:`,

  'shortform-to-sora2': `당신은 숏폼 비디오 대본을 SORA2 시네마틱 포맷(30초)으로 변환하는 전문가입니다.

주어진 숏폼 대본(60초)을 30초 SORA2 형식으로 압축하세요.

**변환 규칙:**
1. 6개 씬 → 4개 씬으로 축약
2. 가장 중요한 씬들만 선택
3. 각 씬을 시네마틱하게 재구성

**sora_prompt 필수 구조 (모든 씬에 동일하게 적용):**
1. "Vertical 9:16 format, portrait orientation" (필수 시작)
2. "cinematic film"
3. [구체적인 피사체와 상황]
4. "full vertical composition with subject centered"
5. [슬로우 모션 묘사]
6. [조명] (golden hour, soft light, dramatic lighting 등)
7. [카메라 움직임] (slowly tracking, slowly pushing in, slowly orbiting 등)
8. [분위기] (dreamy, nostalgic, shocking, addictive 등)
9. "shot on 35mm film, shallow depth of field, soft bokeh"
10. "mobile-optimized framing"

**image_prompt도 같은 스타일로 작성 (SORA2 시네마틱 요소 포함)**

**출력 형식:**
- 순수 JSON만 출력
- version: "sora2-2.0-shortform-aligned"
- scenes 배열에 4개 씬
- 각 씬에 scene_id, sora_prompt, image_prompt, narration, technical_specs 포함

숏폼 대본:
{content}

SORA2로 변환된 JSON을 출력하세요:`
};

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { scriptId, targetFormat } = await request.json();

    if (!scriptId || !targetFormat) {
      return NextResponse.json(
        { error: 'scriptId와 targetFormat이 필요합니다.' },
        { status: 400 }
      );
    }

    // 원본 대본 가져오기
    const originalScript = await findScriptById(scriptId);

    if (!originalScript) {
      return NextResponse.json(
        { error: '대본을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 본인 대본인지 확인
    if (originalScript.userId !== user.userId) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    console.log(`📝 대본 변환 시작: ${scriptId} → ${targetFormat}`);

    // 변환 타입 확인
    const sourceType = originalScript.type || 'longform';
    const conversionKey = `${sourceType}-to-${targetFormat}` as keyof typeof CONVERSION_PROMPTS;

    if (!CONVERSION_PROMPTS[conversionKey]) {
      return NextResponse.json(
        { error: `지원하지 않는 변환: ${sourceType} → ${targetFormat}` },
        { status: 400 }
      );
    }

    // 새 대본 ID 생성
    const newTitle = `${originalScript.title} (${targetFormat === 'shortform' ? '숏폼' : 'SORA2'} 변환)`;

    // DB에 새 대본 생성
    const newScript = await createScript(
      user.userId,
      newTitle,
      '', // 내용은 나중에 업데이트
    );
    const newScriptId = newScript.id;


    console.log(`✅ 새 대본 생성: ${newScriptId}`);

    // 비동기로 변환 실행
    convertScript(
      newScriptId,
      originalScript.content,
      conversionKey,
      targetFormat
    );

    return NextResponse.json({
      success: true,
      scriptId: newScriptId,
      message: '대본 변환이 시작되었습니다.'
    });

  } catch (error: any) {
    console.error('Error converting script:', error);
    return NextResponse.json(
      { error: error?.message || '대본 변환 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

async function convertScript(
  newScriptId: string,
  originalContent: string,
  conversionKey: keyof typeof CONVERSION_PROMPTS,
  targetFormat: string
) {
  try {
    await addScriptLog(newScriptId, '🔄 대본 변환 시작...');
    await addScriptLog(newScriptId, `📋 변환 타입: ${conversionKey}`);

    // 프롬프트 준비
    const promptTemplate = CONVERSION_PROMPTS[conversionKey];
    const prompt = promptTemplate.replace('{content}', originalContent);

    await addScriptLog(newScriptId, '🤖 Claude API 호출 중...');

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

    await addScriptLog(newScriptId, '✅ Claude 응답 받음');
    await addScriptLog(newScriptId, `📏 응답 길이: ${responseText.length}자`);

    // JSON 파싱
    await addScriptLog(newScriptId, '🔍 JSON 파싱 중...');

    // 코드 블록 및 설명문 제거
    let cleaned = responseText
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    // { 이전 텍스트 제거
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart > 0) {
      cleaned = cleaned.substring(jsonStart);
    }

    // } 이후 텍스트 제거
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonEnd > 0 && jsonEnd < cleaned.length - 1) {
      cleaned = cleaned.substring(0, jsonEnd + 1);
    }

    // JSON 파싱 시도
    const scriptData = JSON.parse(cleaned);

    await addScriptLog(newScriptId, '✅ JSON 파싱 성공');
    await addScriptLog(newScriptId, `📊 씬 개수: ${scriptData.scenes?.length || 0}`);

    // metadata에 type 설정 (없으면 추가)
    if (!scriptData.metadata) {
      scriptData.metadata = {};
    }
    scriptData.metadata.converted_from = conversionKey;
    scriptData.metadata.converted_at = new Date().toISOString();

    // DB 업데이트
    const { updateScript } = await import('@/lib/db');
    await updateScript(newScriptId, {
      content: JSON.stringify(scriptData, null, 2),
      status: 'completed',
      progress: 100
    });

    await addScriptLog(newScriptId, '🎉 대본 변환 완료!');

    console.log(`✅ 대본 변환 성공: ${newScriptId}`);

  } catch (error: any) {
    console.error(`❌ 대본 변환 실패: ${newScriptId}`, error);

    const { updateScript } = await import('@/lib/db');
    await updateScript(newScriptId, {
      status: 'failed',
      error: error?.message || '알 수 없는 오류'
    });

    await addScriptLog(newScriptId, `❌ 변환 실패: ${error?.message || '알 수 없는 오류'}`);
  }
}
