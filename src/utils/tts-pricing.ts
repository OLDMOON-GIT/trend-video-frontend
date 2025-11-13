/**
 * TTS 가격 계산 유틸리티
 * 프롬프트 타입과 TTS 제공자에 따라 예상 비용을 계산합니다.
 */

// 프롬프트별 예상 글자 수 (프롬프트 파일과 동기화 필요)
export const PROMPT_WORD_COUNTS: Record<string, number> = {
  shortform: 200,   // 4씬 x 50자
  sora2: 500,       // 50 + 150 + 150 + 150
  longform: 12650,  // 400 + (1750 x 7)
  product: 0,       // 쿠팡 상품은 TTS 없음
};

// TTS 가격 (100만 글자당 달러)
export const TTS_PRICING: Record<string, number> = {
  'google-neural2': 16,     // Google Neural2 - $16/1M chars
  'google-wavenet': 16,     // Google Wavenet - $16/1M chars
  'aws-polly': 16,          // AWS Polly Neural - $16/1M chars
  'azure-edge': 0,          // Azure Edge TTS - 무료
};

/**
 * TTS 음성 ID에서 제공자 타입 추출
 */
export function getTTSProvider(voiceId: string): string {
  if (voiceId.startsWith('google-ko-KR-Neural2')) return 'google-neural2';
  if (voiceId.startsWith('google-ko-KR-Wavenet')) return 'google-wavenet';
  if (voiceId.startsWith('aws-')) return 'aws-polly';
  return 'azure-edge';
}

/**
 * TTS 가격 계산
 * @param voiceId - TTS 음성 ID
 * @param promptFormat - 프롬프트 타입 (shortform, sora2, longform, product)
 * @returns 가격 문자열 (예: "약 $0.003", "무료")
 */
export function calculateTTSPrice(voiceId: string, promptFormat: string): string {
  const provider = getTTSProvider(voiceId);
  const pricePerMillion = TTS_PRICING[provider] || 0;

  // 무료 제공자 (Azure Edge TTS)
  if (pricePerMillion === 0) return '무료';

  const wordCount = PROMPT_WORD_COUNTS[promptFormat] || 0;

  // 유료 제공자인데 글자 수가 0이면 (product 타입 등)
  if (wordCount === 0) return '유료';

  // 가격 계산: (글자 수 * 100만당 가격) / 1,000,000
  const price = (wordCount * pricePerMillion) / 1000000;

  // 소수점 3자리까지 표시
  if (price < 0.001) {
    return '약 $0.001 미만';
  }

  return `약 $${price.toFixed(3)}`;
}

/**
 * 프롬프트별 가격 정보 생성
 * @param voiceId - TTS 음성 ID
 * @returns 프롬프트별 가격 정보 객체
 */
export function getTTSPricingByPrompt(voiceId: string): Record<string, string> {
  return {
    shortform: calculateTTSPrice(voiceId, 'shortform'),
    sora2: calculateTTSPrice(voiceId, 'sora2'),
    longform: calculateTTSPrice(voiceId, 'longform'),
  };
}
