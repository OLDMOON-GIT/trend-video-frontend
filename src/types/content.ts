/**
 * Content 관련 타입 정의
 *
 * ⚠️ 중요: DB 스키마 변경 시 여기를 먼저 업데이트하세요!
 * 타입 에러가 발생하면 관련된 모든 코드가 표시됩니다.
 */

// ==================== 기본 타입 ====================

export type ContentType = 'script' | 'video';

export type ContentFormat =
  | 'longform'
  | 'shortform'
  | 'sora2'
  | 'product'       // 상품 대본 (쿠팡 링크 포함)
  | 'product-info'; // 상품 기입 정보 (YouTube/릴스용)

export type ContentStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ==================== 상품 정보 ====================

/**
 * 상품 정보 (쿠팡 파트너스)
 *
 * DB 저장: contents.product_info (JSON 문자열)
 * API 반환: Content.productInfo (객체)
 */
export interface ProductInfo {
  title?: string;        // 상품명
  thumbnail?: string;    // 썸네일 URL
  product_link?: string; // 쿠팡 파트너스 링크
  description?: string;  // 상품 설명
}

// ==================== AI 토큰 사용량 ====================

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

// ==================== Content 인터페이스 ====================

/**
 * 통합 Content 타입 (scripts + jobs 통합)
 *
 * DB 테이블: contents
 * - type='script': 대본
 * - type='video': 영상
 */
export interface Content {
  // 기본 정보
  id: string;
  userId: string;
  type: ContentType;
  format?: ContentFormat;

  // 내용
  title: string;
  originalTitle?: string;  // 사용자 입력 원본 제목
  content?: string;        // 대본 내용 (type='script'일 때)

  // 변환/재생성 정보
  sourceContentId?: string;  // 원본 컨텐츠 ID
  conversionType?: string;   // 변환 타입 (예: 'longform-to-shortform')
  isRegenerated?: boolean;   // 재생성 여부

  // 상태
  status: ContentStatus;
  progress: number;  // 0-100
  error?: string;

  // 프로세스 관리
  pid?: number;  // 프로세스 ID (취소용)

  // 영상 관련 (type='video'일 때)
  videoPath?: string;
  thumbnailPath?: string;
  published?: boolean;    // 유튜브 업로드 여부
  publishedAt?: string;

  // AI 사용량
  tokenUsage?: TokenUsage;
  useClaudeLocal?: boolean;  // 로컬 Claude 사용 여부
  model?: string;

  // ⭐ 상품 정보 (format='product' 또는 'product-info'일 때)
  productInfo?: ProductInfo;

  // 로그
  logs?: string[];

  // 폴더
  folderId?: string;

  // 시간
  createdAt: string;
  updatedAt: string;
}

// ==================== API 응답 타입 ====================

/**
 * GET /api/scripts/[id] 응답
 */
export interface GetScriptResponse {
  script: Content;
}

/**
 * GET /api/scripts/[id] 에러 응답
 */
export interface GetScriptErrorResponse {
  error: string;
}

/**
 * GET /api/contents 응답 (내콘텐츠 목록)
 */
export interface GetContentsResponse {
  contents: Content[];
  total: number;
}

// ==================== 생성 옵션 ====================

export interface CreateContentOptions {
  format?: ContentFormat;
  originalTitle?: string;
  content?: string;
  tokenUsage?: TokenUsage;
  useClaudeLocal?: boolean;
  model?: string;
  sourceContentId?: string;
  conversionType?: string;
  isRegenerated?: boolean;
  productInfo?: ProductInfo;  // ⭐ 상품 정보
  folderId?: string;
}

// ==================== 업데이트 타입 ====================

export type ContentUpdateFields = Partial<Pick<Content,
  | 'status'
  | 'progress'
  | 'error'
  | 'content'
  | 'videoPath'
  | 'thumbnailPath'
  | 'pid'
  | 'published'
  | 'publishedAt'
  | 'tokenUsage'
  | 'model'
>>;

// ==================== 타입 가드 ====================

/**
 * Content가 script 타입인지 확인
 */
export function isScript(content: Content): content is Content & { type: 'script' } {
  return content.type === 'script';
}

/**
 * Content가 video 타입인지 확인
 */
export function isVideo(content: Content): content is Content & { type: 'video' } {
  return content.type === 'video';
}

/**
 * Content가 상품 정보를 가지고 있는지 확인
 */
export function hasProductInfo(content: Content): content is Content & { productInfo: ProductInfo } {
  return content.productInfo !== undefined && content.productInfo !== null;
}

/**
 * ProductInfo가 유효한지 확인 (필수 필드 존재)
 */
export function isValidProductInfo(productInfo: ProductInfo | undefined | null): productInfo is ProductInfo {
  if (!productInfo) return false;
  return !!(productInfo.product_link || productInfo.thumbnail || productInfo.description);
}
