import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categories, count = 20, youtubeTitles = [] } = body;

    if (!categories || categories.length === 0) {
      return NextResponse.json(
        { error: '카테고리를 선택해주세요' },
        { status: 400 }
      );
    }

    // YouTube 제목들이 제공되면 그걸 사용, 아니면 기본 예시 사용
    let examplesText = '';

    if (youtubeTitles && youtubeTitles.length > 0) {
      // 실제 YouTube에서 가져온 제목들 사용
      examplesText = `실제 조회수 높은 유튜브 영상 제목들:\n${youtubeTitles.slice(0, 20).join('\n')}`;
    } else {
      // 기본 카테고리별 제목 패턴 예시
      const categoryExamples: Record<string, string[]> = {
        '시니어사연': [
          '시어머니의 후회, 며느리에게 무릎 꿇다',
          '고부갈등 끝판왕, 결국 외면당한 시어머니',
          '며느리 내쫓았던 시어머니, 결국 양로원행',
          '시댁 텃세의 끝은 이렇습니다',
        ],
        '복수극': [
          '무시당했던 그녀, 10년 후 CEO가 되어 나타났다',
          '배신자들의 최후, 통쾌한 복수극',
          '무능력자 취급받던 남자의 화려한 귀환',
          '무시했던 신입사원, 알고보니 전설의 그 사람',
        ],
        '북한탈북자사연': [
          '탈북자가 겪은 충격적인 남한 문화',
          '북한에서는 상상도 못한 자유의 맛',
          '탈북 후 10년, 이제는 당당한 대한민국 국민',
          '북한 출신 변호사의 눈물겨운 성공 스토리',
        ],
        '막장드라마': [
          '출생의 비밀, 알고보니 재벌가 장남',
          '배다른 동생의 배신, 그리고 복수',
          '사랑과 욕망이 뒤엉킨 재벌가의 추악한 진실',
          '친자확인서 한 장에 무너진 가족',
        ],
      };

      examplesText = categories
        .map((cat: string) => {
          const examples = categoryExamples[cat] || [];
          return `[${cat}]\n${examples.join('\n')}`;
        })
        .join('\n\n');
    }

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 실제 조회수 높은 영상 제목들의 패턴을 학습하여, 비슷하지만 새로운 제목 ${count}개를 생성해주세요.

선택된 카테고리: ${categories.join(', ')}

${examplesText}

요구사항:
1. 위 제목들의 패턴, 구조, 톤앤매너를 철저히 분석
2. 같은 패턴이지만 다른 스토리/상황으로 변형
3. 클릭을 유도하는 자극적이면서도 호기심을 자극하는 제목
4. 20~40자 정도의 적절한 길이
5. 반전, 갈등, 감동 등의 요소 포함
6. 위 예시 제목과 너무 비슷하지 않게 (창의적으로 변형)
7. 중복 없이 ${count}개 생성

출력 형식:
제목만 한 줄에 하나씩 출력해주세요. 번호나 기호 없이.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 2048,
      temperature: 1.0,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // AI 응답을 제목 배열로 파싱
    const titles = content.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^[\d.]+\s/)) // 번호 제거
      .slice(0, count);

    return NextResponse.json({
      titles,
      categories,
      count: titles.length,
    });
  } catch (error: any) {
    console.error('Title suggestion generation error:', error);
    return NextResponse.json(
      { error: '제목 생성 중 오류가 발생했습니다: ' + error.message },
      { status: 500 }
    );
  }
}
