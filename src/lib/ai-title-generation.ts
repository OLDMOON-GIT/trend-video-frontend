import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 카테고리별 예시 제목
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
  '탈북자사연': [
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

// Claude로 제목 생성
export async function generateTitlesWithClaude(category: string, count: number = 3): Promise<string[]> {
  try {
    const examples = categoryExamples[category] || [];
    const examplesText = examples.length > 0
      ? `[${category}]\n${examples.join('\n')}`
      : `카테고리: ${category}`;

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 카테고리에 맞는 제목 ${count}개를 생성해주세요.

${examplesText}

요구사항:
1. 위 제목들의 패턴, 구조, 톤앤매너를 철저히 분석
2. 같은 패턴이지만 다른 스토리/상황으로 변형
3. 클릭을 유도하는 자극적이면서도 호기심을 자극하는 제목
4. 20~40자 정도의 적절한 길이
5. 반전, 갈등, 감동 등의 요소 포함
6. 중복 없이 ${count}개 생성

출력 형식:
제목만 한 줄에 하나씩 출력해주세요. 번호나 기호 없이.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      temperature: 1.0,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const titles = content.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^[\d.]+\s/))
      .slice(0, count);

    return titles;
  } catch (error: any) {
    console.error('Claude 제목 생성 실패:', error);
    return [];
  }
}

// ChatGPT로 제목 생성
export async function generateTitlesWithChatGPT(category: string, count: number = 3): Promise<string[]> {
  try {
    const examples = categoryExamples[category] || [];
    const examplesText = examples.length > 0
      ? `[${category}]\n${examples.join('\n')}`
      : `카테고리: ${category}`;

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 카테고리에 맞는 제목 ${count}개를 생성해주세요.

${examplesText}

요구사항:
1. 위 제목들의 패턴, 구조, 톤앤매너를 철저히 분석
2. 같은 패턴이지만 다른 스토리/상황으로 변형
3. 클릭을 유도하는 자극적이면서도 호기심을 자극하는 제목
4. 20~40자 정도의 적절한 길이
5. 반전, 갈등, 감동 등의 요소 포함
6. 중복 없이 ${count}개 생성

출력 형식:
제목만 한 줄에 하나씩 출력해주세요. 번호나 기호 없이.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 1.0,
      max_tokens: 1024,
    });

    const text = completion.choices[0]?.message?.content || '';
    const titles = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^[\d.]+\s/))
      .slice(0, count);

    return titles;
  } catch (error: any) {
    console.error('ChatGPT 제목 생성 실패:', error);
    return [];
  }
}

// Gemini로 제목 생성
export async function generateTitlesWithGemini(category: string, count: number = 3): Promise<string[]> {
  try {
    const examples = categoryExamples[category] || [];
    const examplesText = examples.length > 0
      ? `[${category}]\n${examples.join('\n')}`
      : `카테고리: ${category}`;

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 카테고리에 맞는 제목 ${count}개를 생성해주세요.

${examplesText}

요구사항:
1. 위 제목들의 패턴, 구조, 톤앤매너를 철저히 분석
2. 같은 패턴이지만 다른 스토리/상황으로 변형
3. 클릭을 유도하는 자극적이면서도 호기심을 자극하는 제목
4. 20~40자 정도의 적절한 길이
5. 반전, 갈등, 감동 등의 요소 포함
6. 중복 없이 ${count}개 생성

출력 형식:
제목만 한 줄에 하나씩 출력해주세요. 번호나 기호 없이.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const titles = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^[\d.]+\s/))
      .slice(0, count);

    return titles;
  } catch (error: any) {
    console.error('Gemini 제목 생성 실패:', error);
    return [];
  }
}

// 제목 점수 평가 (Claude 사용)
export async function evaluateTitleScore(title: string, category: string): Promise<number> {
  try {
    const prompt = `유튜브 제목 평가 전문가로서, 다음 제목을 0-100점으로 평가해주세요.

카테고리: ${category}
제목: "${title}"

평가 기준:
1. 클릭 유도성 (호기심 자극)
2. 카테고리 적합성
3. 제목 길이 적절성 (20-40자)
4. 감정적 임팩트
5. 스토리텔링 요소

점수만 숫자로만 답변해주세요. (예: 85)`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 100,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return 50; // 기본값
    }

    const scoreMatch = content.text.match(/\d+/);
    const score = scoreMatch ? parseInt(scoreMatch[0]) : 50;

    return Math.min(100, Math.max(0, score)); // 0-100 범위로 제한

  } catch (error: any) {
    console.error('제목 점수 평가 실패:', error);
    return 50; // 에러 시 중간 점수
  }
}
