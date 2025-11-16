/**
 * 자동화 시스템 카테고리별 YouTube 검색 키워드 매핑
 * 각 카테고리에 맞는 효과적인 검색 쿼리를 제공
 */

export interface CategoryKeywordSet {
  category: string;
  displayName: string;
  keywords: string[];
  description: string;
}

export const CATEGORY_KEYWORDS: CategoryKeywordSet[] = [
  {
    category: '시니어사연',
    displayName: '시니어 실화·사연',
    keywords: [
      '시어머니 며느리',
      '고부갈등',
      '시어머니 사연',
      '며느리 실화',
      '시댁 사연',
      '노후 사연',
      '할머니 사연'
    ],
    description: '시니어 세대의 실화와 가족 사연'
  },
  {
    category: '북한탈북자사연',
    displayName: '북한·탈북자 사연',
    keywords: [
      '탈북자 사연',
      '북한 실화',
      '탈북 이야기',
      '북한 생활',
      '새터민 이야기',
      '북한 탈출',
      '탈북민 증언'
    ],
    description: '북한 및 탈북자의 실제 경험담'
  },
  {
    category: '막장드라마',
    displayName: '막장 드라마',
    keywords: [
      '막장 드라마',
      '막장 사연',
      '가족 갈등',
      '시댁 시어머니',
      '며느리 시어머니',
      '가족 복수',
      '막장 가족'
    ],
    description: '극단적인 가족 갈등과 복수 이야기'
  },
  {
    category: '감동실화',
    displayName: '감동 실화',
    keywords: [
      '감동 실화',
      '눈물 실화',
      '감동 이야기',
      '실화 감동',
      '진짜 감동',
      '인생 감동',
      '눈물 주의 실화'
    ],
    description: '가슴 따뜻한 감동적인 실화'
  },
  {
    category: '복수극',
    displayName: '복수극',
    keywords: [
      '복수 실화',
      '복수극',
      '통쾌한 복수',
      '복수 성공',
      '복수 이야기',
      '반전 복수',
      '통쾌한 반전'
    ],
    description: '통쾌한 복수와 반전 이야기'
  },
  {
    category: '로맨스',
    displayName: '로맨스',
    keywords: [
      '로맨스 실화',
      '사랑 이야기',
      '연애 실화',
      '결혼 사연',
      '커플 이야기',
      '운명 같은 사랑',
      '감동 로맨스'
    ],
    description: '로맨틱한 사랑 이야기'
  },
  {
    category: '스릴러',
    displayName: '스릴러',
    keywords: [
      '스릴러 실화',
      '충격 실화',
      '미스터리 실화',
      '반전 이야기',
      '충격 반전',
      '경고 실화',
      '소름 실화'
    ],
    description: '긴장감 넘치는 스릴러'
  },
  {
    category: '코미디',
    displayName: '코미디',
    keywords: [
      '웃긴 실화',
      '코미디 사연',
      '웃긴 이야기',
      '유쾌한 사연',
      '황당 실화',
      '웃긴 가족 사연',
      '유머 실화'
    ],
    description: '웃음이 터지는 유쾌한 이야기'
  },
  {
    category: '상품',
    displayName: '상품 광고',
    keywords: [
      '상품 리뷰',
      '제품 소개',
      '쿠팡 추천',
      '가성비 상품',
      '인기 상품',
      '베스트 상품',
      '필수템'
    ],
    description: '상품 소개 및 광고'
  },
  {
    category: '일반',
    displayName: '일반',
    keywords: [
      'korea trending',
      '한국 인기',
      '실화 이야기',
      '사연 모음',
      '인기 콘텐츠',
      '바이럴 영상',
      '쇼츠 인기'
    ],
    description: '일반 인기 콘텐츠'
  }
];

/**
 * 카테고리 이름으로 키워드 세트 찾기
 * 매핑에 없는 카테고리는 카테고리 이름 자체를 키워드로 사용
 */
export function getCategoryKeywords(category: string): CategoryKeywordSet | undefined {
  const found = CATEGORY_KEYWORDS.find(
    c => c.category === category ||
         c.displayName === category ||
         c.category.toLowerCase() === category.toLowerCase()
  );

  // 매핑에 없는 카테고리는 카테고리 이름을 키워드로 사용
  if (!found && category && category !== '일반') {
    return {
      category: category,
      displayName: category,
      keywords: [category],
      description: `사용자 정의 카테고리: ${category}`
    };
  }

  return found;
}

/**
 * 모든 카테고리 이름 가져오기
 */
export function getAllCategories(): string[] {
  return CATEGORY_KEYWORDS.map(c => c.category);
}

/**
 * 카테고리별 표시 이름 가져오기
 */
export function getCategoryDisplayNames(): Array<{category: string; displayName: string}> {
  return CATEGORY_KEYWORDS.map(c => ({
    category: c.category,
    displayName: c.displayName
  }));
}

/**
 * 카테고리에 맞는 랜덤 키워드 선택
 */
export function getRandomKeyword(category: string): string {
  const keywordSet = getCategoryKeywords(category);
  if (!keywordSet || keywordSet.keywords.length === 0) {
    return 'korea trending';
  }

  const randomIndex = Math.floor(Math.random() * keywordSet.keywords.length);
  return keywordSet.keywords[randomIndex];
}

/**
 * 여러 카테고리에서 키워드 조합
 */
export function getCombinedKeywords(categories: string[]): string[] {
  const allKeywords: string[] = [];

  categories.forEach(category => {
    const keywordSet = getCategoryKeywords(category);
    if (keywordSet) {
      allKeywords.push(...keywordSet.keywords);
    }
  });

  return allKeywords;
}
