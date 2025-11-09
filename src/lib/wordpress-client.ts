/**
 * 워드프레스 REST API 클라이언트
 *
 * 워드프레스 사이트에 포스트를 자동으로 생성하고 관리합니다.
 * Application Password 인증 방식 사용
 *
 * 설정 방법:
 * 1. 워드프레스 관리자 → 사용자 → 프로필
 * 2. "Application Passwords" 섹션에서 새 비밀번호 생성
 * 3. 생성된 비밀번호를 복사하여 저장
 */

interface WordPressConfig {
  siteUrl: string; // 워드프레스 사이트 URL (예: https://example.com)
  username: string; // 워드프레스 사용자명
  appPassword: string; // Application Password
}

interface WordPressPost {
  title: string;
  content: string;
  excerpt?: string;
  status?: 'publish' | 'draft' | 'pending' | 'private';
  categories?: number[]; // 카테고리 ID 배열
  tags?: number[]; // 태그 ID 배열
  featured_media?: number; // 썸네일 미디어 ID
}

interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
}

interface MediaUploadResponse {
  id: number;
  source_url: string;
}

export class WordPressClient {
  private config: WordPressConfig;
  private apiUrl: string;

  constructor(config: WordPressConfig) {
    this.config = config;
    // /wp-json/wp/v2/ 엔드포인트 사용
    this.apiUrl = `${config.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`;
  }

  /**
   * Basic Authentication 헤더 생성
   */
  private getAuthHeaders(): Record<string, string> {
    const credentials = Buffer.from(
      `${this.config.username}:${this.config.appPassword}`
    ).toString('base64');

    return {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * API 요청 실행
   */
  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.apiUrl}${endpoint}`;
    const headers = this.getAuthHeaders();

    const options: RequestInit = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: 'API 요청 실패'
      }));
      throw new Error(
        errorData.message || `워드프레스 API 오류: ${response.status}`
      );
    }

    return response.json();
  }

  /**
   * 포스트 생성
   *
   * @param post 포스트 데이터
   * @returns 생성된 포스트 정보
   */
  async createPost(post: WordPressPost): Promise<any> {
    return this.request('/posts', 'POST', {
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || '',
      status: post.status || 'draft',
      categories: post.categories || [],
      tags: post.tags || [],
      featured_media: post.featured_media || 0
    });
  }

  /**
   * 카테고리 목록 조회
   */
  async getCategories(): Promise<WordPressCategory[]> {
    return this.request<WordPressCategory[]>('/categories?per_page=100');
  }

  /**
   * 카테고리 생성
   *
   * @param name 카테고리 이름
   * @param parent 부모 카테고리 ID (선택)
   * @returns 생성된 카테고리 정보
   */
  async createCategory(name: string, parent?: number): Promise<WordPressCategory> {
    return this.request<WordPressCategory>('/categories', 'POST', {
      name,
      parent: parent || 0
    });
  }

  /**
   * 이미지 URL을 워드프레스 미디어 라이브러리에 업로드
   *
   * @param imageUrl 이미지 URL
   * @param title 이미지 제목
   * @returns 업로드된 미디어 ID
   */
  async uploadImageFromUrl(imageUrl: string, title: string): Promise<number> {
    // 이미지 다운로드
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('이미지 다운로드 실패');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const blob = new Blob([imageBuffer]);

    // 워드프레스 미디어 업로드
    const url = `${this.apiUrl}/media`;
    const credentials = Buffer.from(
      `${this.config.username}:${this.config.appPassword}`
    ).toString('base64');

    const formData = new FormData();
    formData.append('file', blob, 'image.jpg');
    formData.append('title', title);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('이미지 업로드 실패');
    }

    const result = await response.json() as MediaUploadResponse;
    return result.id;
  }

  /**
   * 연결 테스트
   *
   * @returns 연결 성공 여부
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/posts?per_page=1');
      return true;
    } catch (error) {
      console.error('워드프레스 API 연결 테스트 실패:', error);
      return false;
    }
  }

  /**
   * 카테고리 이름으로 ID 찾기 (없으면 생성)
   *
   * @param categoryName 카테고리 이름
   * @returns 카테고리 ID
   */
  async findOrCreateCategory(categoryName: string): Promise<number> {
    const categories = await this.getCategories();
    const existing = categories.find(
      c => c.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (existing) {
      return existing.id;
    }

    const newCategory = await this.createCategory(categoryName);
    return newCategory.id;
  }
}

/**
 * 워드프레스 클라이언트 인스턴스 생성 헬퍼
 */
export function createWordPressClient(config: WordPressConfig): WordPressClient {
  return new WordPressClient(config);
}
