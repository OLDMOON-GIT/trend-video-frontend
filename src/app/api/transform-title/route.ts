import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  try {
    const { title } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: '제목이 필요합니다.' },
        { status: 400 }
      );
    }

    // API 키 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `다음 유튜브 영상 제목을 시니어(50대 이상) 타겟의 감동적인 실화/사연 스토리 영상 제목으로 변형해주세요.

원본 제목: "${title}"

변형 규칙:
1. **원본 제목의 모든 내용을 유지할 것 (길이 유지)**
2. **절대 줄이지 말 것 - 원본 단어 수와 비슷하게**
3. 핵심 인물, 장소, 사건, 숫자 등 모든 정보 그대로 유지
4. 단어 순서만 약간 조정하거나, 조사/어미만 변경
5. 원본과 90% 이상 동일하게, 10%만 미세 조정
6. 감정적 임팩트를 위해 단어 배치만 최적화

예시:
- 원본: "70세 할머니가 처음으로 스마트폰을 배우게 된 이야기"
- 변형: "처음 스마트폰을 배우게 된 70세 할머니 이야기"
  (모든 단어 유지, 순서만 변경)

**3가지 다른 변형 버전**을 만들어주세요. 각 제목은 한 줄씩, 번호 없이 출력하세요.`
        }
      ]
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text.trim()
      : '';

    // 응답을 줄 단위로 분리하고 빈 줄 제거
    const options = responseText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.match(/^[\d-]+[.\)]/)) // 번호 제거
      .slice(0, 3); // 최대 3개만

    // 최소 1개는 있어야 함
    if (options.length === 0) {
      options.push(responseText);
    }

    return NextResponse.json({
      original: title,
      options: options,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens
      }
    });

  } catch (error: any) {
    console.error('Error transforming title:', error);

    if (error?.status === 401) {
      return NextResponse.json(
        { error: 'API 키가 유효하지 않습니다.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error?.message || '제목 변형 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
