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

// 카테고리별 예시 제목 (80점 이상 고품질 제목)
const categoryExamples: Record<string, string[]> = {
  '시니어사연': [
    '며느리 내쫓았던 시어머니, 3년 후 양로원에서 무릎 꿇고 빈 이유',
    '고부갈등 20년, 시댁 텃세로 괴롭혔던 시어머니가 결국 혼자 남은 진실',
    '무시당했던 며느리, 10년 후 성공한 사업가가 되어 나타난 통쾌한 반전',
    '시어머니의 후회, 내쫓은 며느리가 알고보니 재벌가 딸이었던 충격적 사연',
  ],
  '복수극': [
    '무시당했던 청소부, 5년 후 CEO가 되어 배신자들 앞에 나타난 이유',
    '무능력자 취급받던 신입사원, 알고보니 전설의 해커였던 통쾌한 복수극',
    '배신당한 그녀의 귀환, 10년 만에 회사를 장악하고 복수를 완성한 방법',
    '왕따 당했던 학생, 20년 후 판사가 되어 가해자들 앞에 선 충격의 순간',
  ],
  '탈북자사연': [
    '탈북 후 10년, 무시당했던 그녀가 당당한 대한민국 변호사로 성공한 이유',
    '북한 출신이라 차별받던 청년, 5년 만에 대기업 임원이 된 눈물겨운 스토리',
    '탈북 여성이 겪은 남한의 충격, 자유를 찾기까지 7년간의 처절한 투쟁',
    '북한에서 온 그녀, 한국말도 서툴렀지만 3년 만에 유튜버로 성공한 비결',
  ],
  '막장드라마': [
    '출생의 비밀, 평생 무시당했던 남자가 알고보니 재벌가 장남이었던 반전',
    '배다른 동생의 배신, 15년 만에 밝혀진 친자확인서의 충격적인 진실',
    '재벌가의 추악한 비밀, 사랑과 욕망이 뒤엉킨 30년 만의 복수극',
    '친자가 아니었던 아들, 평생 재산을 빼앗긴 후 찾아낸 놀라운 진실',
  ],
};

// Claude로 제목 생성
export async function generateTitlesWithClaude(category: string, count: number = 3): Promise<string[]> {
  try {
    const examples = categoryExamples[category] || [];
    const examplesText = examples.length > 0
      ? `[${category}]\n${examples.join('\n')}`
      : `카테고리: ${category}`;

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 고품질 예시 제목들을 분석하여, 같은 수준의 제목 ${count}개를 생성해주세요.

${examplesText}

핵심 패턴 (반드시 포함):
1. 명확한 주어 (누가): "무시당했던 그녀", "탈북 후 10년", "배신당한 청소부"
2. 구체적 숫자/시간: "3년 후", "10년 만에", "20년 후", "5년간"
3. 과거→현재 대비 구조: "무시당했던 → CEO가 되어", "차별받던 → 성공한"
4. 강한 훅(호기심): "이유", "진실", "비밀", "반전", "방법", "비결"
5. 감정 키워드: "통쾌한", "눈물겨운", "충격적", "처절한", "놀라운"

제목 구조 (80점 이상 필수):
- [과거 상황], [시간 경과] [현재 상황] [훅]
- 예: "탈북 후 10년, 무시당했던 그녀가 당당한 대한민국 변호사로 성공한 이유"

요구사항:
1. 40~60자 길이 (너무 짧으면 안됨)
2. 주어가 명확하고 스토리가 구체적으로 드러나야 함
3. 숫자나 시간으로 구체성 부여
4. 과거-현재 대비로 극적 효과
5. 끝에 "이유/진실/비밀/방법" 등으로 호기심 극대화
6. 위 예시와 비슷한 수준의 품질 유지
7. 중복 없이 ${count}개 생성

출력 형식:
제목만 한 줄에 하나씩 출력해주세요. 번호나 기호 없이.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
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

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 고품질 예시 제목들을 분석하여, 같은 수준의 제목 ${count}개를 생성해주세요.

${examplesText}

핵심 패턴 (반드시 포함):
1. 명확한 주어 (누가): "무시당했던 그녀", "탈북 후 10년", "배신당한 청소부"
2. 구체적 숫자/시간: "3년 후", "10년 만에", "20년 후", "5년간"
3. 과거→현재 대비 구조: "무시당했던 → CEO가 되어", "차별받던 → 성공한"
4. 강한 훅(호기심): "이유", "진실", "비밀", "반전", "방법", "비결"
5. 감정 키워드: "통쾌한", "눈물겨운", "충격적", "처절한", "놀라운"

제목 구조 (80점 이상 필수):
- [과거 상황], [시간 경과] [현재 상황] [훅]
- 예: "탈북 후 10년, 무시당했던 그녀가 당당한 대한민국 변호사로 성공한 이유"

요구사항:
1. 40~60자 길이 (너무 짧으면 안됨)
2. 주어가 명확하고 스토리가 구체적으로 드러나야 함
3. 숫자나 시간으로 구체성 부여
4. 과거-현재 대비로 극적 효과
5. 끝에 "이유/진실/비밀/방법" 등으로 호기심 극대화
6. 위 예시와 비슷한 수준의 품질 유지
7. 중복 없이 ${count}개 생성

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

    const prompt = `당신은 유튜브 콘텐츠 제목 전문가입니다. 아래 고품질 예시 제목들을 분석하여, 같은 수준의 제목 ${count}개를 생성해주세요.

${examplesText}

핵심 패턴 (반드시 포함):
1. 명확한 주어 (누가): "무시당했던 그녀", "탈북 후 10년", "배신당한 청소부"
2. 구체적 숫자/시간: "3년 후", "10년 만에", "20년 후", "5년간"
3. 과거→현재 대비 구조: "무시당했던 → CEO가 되어", "차별받던 → 성공한"
4. 강한 훅(호기심): "이유", "진실", "비밀", "반전", "방법", "비결"
5. 감정 키워드: "통쾌한", "눈물겨운", "충격적", "처절한", "놀라운"

제목 구조 (80점 이상 필수):
- [과거 상황], [시간 경과] [현재 상황] [훅]
- 예: "탈북 후 10년, 무시당했던 그녀가 당당한 대한민국 변호사로 성공한 이유"

요구사항:
1. 40~60자 길이 (너무 짧으면 안됨)
2. 주어가 명확하고 스토리가 구체적으로 드러나야 함
3. 숫자나 시간으로 구체성 부여
4. 과거-현재 대비로 극적 효과
5. 끝에 "이유/진실/비밀/방법" 등으로 호기심 극대화
6. 위 예시와 비슷한 수준의 품질 유지
7. 중복 없이 ${count}개 생성

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
      model: 'claude-3-5-haiku-20241022',
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
