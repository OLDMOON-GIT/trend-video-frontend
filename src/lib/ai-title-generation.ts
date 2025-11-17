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
    '며느리를 내쫓았던 시어머니, 3년 후 양로원에서 무릎 꿇고 빌어야 했던 이유',
    '20년간 며느리를 괴롭혔던 시어머니가 결국 혼자 남겨진 충격적 진실',
    '무시당했던 며느리가 10년 후 성공한 사업가로 나타나자 벌어진 일',
    '며느리를 내쫓았던 시어머니, 그녀가 재벌가 딸이란 걸 알고 후회한 순간',
  ],
  '복수극': [
    '청소부를 무시했던 직원들, 5년 후 그녀가 CEO로 나타나자 사색이 된 이유',
    '무능력자 취급했던 팀장들, 그가 전설의 해커였다는 사실을 알고 벌어진 일',
    '배신했던 동료들이 그녀의 귀환 소식을 듣고 회사를 떠난 통쾌한 복수극',
    '왕따시켰던 학생들, 20년 후 판사가 된 그를 법정에서 만난 충격의 순간',
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

⚠️ 필수 - 주어 명확성 규칙:
❌ 잘못된 예: "무시당했던 청소부, CEO로 성공한 비결"
   → 누가 CEO가 됐는지 애매함 (청소부? 무시하던 사람?)

✅ 올바른 예:
   → "청소부를 무시했던 그들, CEO가 된 그녀 앞에서 무릎 꿇은 이유"
   → "무시당했던 그녀가 CEO로 성공하자, 후회하기 시작한 사람들"
   → "가난했던 시절 자신을 무시했던 사람들 앞에 CEO로 나타난 그녀"

핵심 패턴 (반드시 포함):
1. **주어 2개 명시** (가해자 vs 피해자): "~를 무시했던 그들" + "그녀"
2. **구체적 숫자/시간**: "3년 후", "10년 만에", "20년 후"
3. **과거-현재 대비**: [과거 신분/상황] → [현재 신분/상황]
4. **인과관계 명확**: 누가 → 무엇을 했고 → 누가 → 어떻게 됐는지
5. **강한 훅**: "이유", "진실", "순간", "말", "표정"

제목 구조 (90점 이상 필수):
- [가해자 행동], [시간] [피해자 변화] [가해자 결말]
- 예: "청소부였던 그를 무시했던 직원들, 10년 후 CEO가 된 그 앞에서 사색이 된 이유"

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

⚠️ 필수 - 주어 명확성 규칙:
❌ 잘못된 예: "무시당했던 청소부, CEO로 성공한 비결"
   → 누가 CEO가 됐는지 애매함 (청소부? 무시하던 사람?)

✅ 올바른 예:
   → "청소부를 무시했던 그들, CEO가 된 그녀 앞에서 무릎 꿇은 이유"
   → "무시당했던 그녀가 CEO로 성공하자, 후회하기 시작한 사람들"
   → "가난했던 시절 자신을 무시했던 사람들 앞에 CEO로 나타난 그녀"

핵심 패턴 (반드시 포함):
1. **주어 2개 명시** (가해자 vs 피해자): "~를 무시했던 그들" + "그녀"
2. **구체적 숫자/시간**: "3년 후", "10년 만에", "20년 후"
3. **과거-현재 대비**: [과거 신분/상황] → [현재 신분/상황]
4. **인과관계 명확**: 누가 → 무엇을 했고 → 누가 → 어떻게 됐는지
5. **강한 훅**: "이유", "진실", "순간", "말", "표정"

제목 구조 (90점 이상 필수):
- [가해자 행동], [시간] [피해자 변화] [가해자 결말]
- 예: "청소부였던 그를 무시했던 직원들, 10년 후 CEO가 된 그 앞에서 사색이 된 이유"

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

⚠️ 필수 - 주어 명확성 규칙:
❌ 잘못된 예: "무시당했던 청소부, CEO로 성공한 비결"
   → 누가 CEO가 됐는지 애매함 (청소부? 무시하던 사람?)

✅ 올바른 예:
   → "청소부를 무시했던 그들, CEO가 된 그녀 앞에서 무릎 꿇은 이유"
   → "무시당했던 그녀가 CEO로 성공하자, 후회하기 시작한 사람들"
   → "가난했던 시절 자신을 무시했던 사람들 앞에 CEO로 나타난 그녀"

핵심 패턴 (반드시 포함):
1. **주어 2개 명시** (가해자 vs 피해자): "~를 무시했던 그들" + "그녀"
2. **구체적 숫자/시간**: "3년 후", "10년 만에", "20년 후"
3. **과거-현재 대비**: [과거 신분/상황] → [현재 신분/상황]
4. **인과관계 명확**: 누가 → 무엇을 했고 → 누가 → 어떻게 됐는지
5. **강한 훅**: "이유", "진실", "순간", "말", "표정"

제목 구조 (90점 이상 필수):
- [가해자 행동], [시간] [피해자 변화] [가해자 결말]
- 예: "청소부였던 그를 무시했던 직원들, 10년 후 CEO가 된 그 앞에서 사색이 된 이유"

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
