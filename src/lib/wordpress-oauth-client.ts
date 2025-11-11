/**
 * WordPress.com OAuth API 클라이언트
 *
 * WordPress.com OAuth 인증을 사용하여 포스트를 관리합니다.
 * 자체 호스팅 워드프레스가 아닌 WordPress.com 또는 Jetpack 연결 사이트에 사용됩니다.
 */

interface WordPressOAuthConfig {
  accessToken: string; // OAuth 액세스 토큰
  blogId: string; // WordPress.com 블로그 ID
}

interface WordPressPost {
  title: string;
  content: string;
  excerpt?: string;
  status?: 'publish' | 'draft' | 'pending' | 'private';
  categories?: string[]; // 카테고리 이름 배열
  tags?: string[]; // 태그 이름 배열
  featured_image?: string; // 이미지 URL (자동 업로드됨)
}

interface WordPressCategory {
  ID: number;
  name: string;
  slug: string;
  parent: number;
}

export class WordPressOAuthClient {
  private config: WordPressOAuthConfig;
  private apiUrl: string;

  constructor(config: WordPressOAuthConfig) {
    this.config = config;
    // WordPress.com REST API 엔드포인트
    this.apiUrl = `https://public-api.wordpress.com/rest/v1.1/sites/${config.blogId}`;
  }

  /**
   * OAuth Bearer 토큰 헤더 생성
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.accessToken}`,
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
        errorData.message || `WordPress.com API 오류: ${response.status}`
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
    const postData: any = {
      title: post.title,
      content: post.content,
      status: post.status || 'draft'
    };

    if (post.excerpt) {
      postData.excerpt = post.excerpt;
    }

    if (post.categories && post.categories.length > 0) {
      postData.categories = post.categories;
    }

    if (post.tags && post.tags.length > 0) {
      postData.tags = post.tags;
    }

    if (post.featured_image) {
      postData.featured_image = post.featured_image;
    }

    return this.request('/posts/new', 'POST', postData);
  }

  /**
   * 카테고리 목록 조회
   */
  async getCategories(): Promise<WordPressCategory[]> {
    const response = await this.request<any>('/categories');
    return response.categories || [];
  }

  /**
   * 카테고리 생성
   *
   * @param name 카테고리 이름
   * @param parent 부모 카테고리 ID (선택)
   * @returns 생성된 카테고리 정보
   */
  async createCategory(name: string, parent?: number): Promise<WordPressCategory> {
    return this.request<WordPressCategory>('/categories/new', 'POST', {
      name,
      parent: parent || 0
    });
  }

  /**
   * 연결 테스트
   *
   * @returns 연결 성공 여부
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/posts?number=1');
      return true;
    } catch (error) {
      console.error('WordPress.com API 연결 테스트 실패:', error);
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
      return existing.ID;
    }

    const newCategory = await this.createCategory(categoryName);
    return newCategory.ID;
  }
}

/**
 * WordPress.com OAuth 클라이언트 인스턴스 생성 헬퍼
 */
export function createWordPressOAuthClient(config: WordPressOAuthConfig): WordPressOAuthClient {
  return new WordPressOAuthClient(config);
}
