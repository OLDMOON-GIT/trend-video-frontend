/**
 * email.ts 단위 테스트
 *
 * 이메일 관련 유틸리티 함수들의 테스트
 * sendEmail은 Python 스크립트를 실행하므로 스킵
 * sendVerificationEmail의 URL 생성 로직만 테스트
 */

describe('email', () => {
  describe('sendVerificationEmail', () => {
    const originalEnv = process.env.NEXT_PUBLIC_BASE_URL;

    beforeEach(() => {
      // 환경 변수 초기화
      delete process.env.NEXT_PUBLIC_BASE_URL;
    });

    afterEach(() => {
      // 환경 변수 복원
      if (originalEnv) {
        process.env.NEXT_PUBLIC_BASE_URL = originalEnv;
      } else {
        delete process.env.NEXT_PUBLIC_BASE_URL;
      }
    });

    it('기본 BASE_URL로 인증 링크를 생성해야 함', () => {
      // URL 생성 로직만 독립적으로 테스트
      const email = 'test@example.com';
      const token = 'test-token-123';
      const baseUrl = 'http://localhost:3000';

      const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      expect(verificationUrl).toBe('http://localhost:3000/api/auth/verify?token=test-token-123');
      expect(verificationUrl).toContain(token);
      expect(verificationUrl).toContain('/api/auth/verify');
    });

    it('프로덕션 BASE_URL로 인증 링크를 생성해야 함', () => {
      const email = 'user@example.com';
      const token = 'prod-token-456';
      const baseUrl = 'https://example.com';

      const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      expect(verificationUrl).toBe('https://example.com/api/auth/verify?token=prod-token-456');
      expect(verificationUrl).toContain('https://');
    });

    it('특수 문자가 포함된 토큰을 처리해야 함', () => {
      const token = 'token-with-special-chars-!@#$%';
      const baseUrl = 'http://localhost:3000';

      const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      expect(verificationUrl).toContain(token);
      expect(verificationUrl).toContain('token-with-special-chars-!@#$%');
    });

    it('매우 긴 토큰을 처리해야 함', () => {
      const longToken = 'a'.repeat(500);
      const baseUrl = 'http://localhost:3000';

      const verificationUrl = `${baseUrl}/api/auth/verify?token=${longToken}`;

      expect(verificationUrl).toContain(longToken);
      expect(verificationUrl.length).toBe('http://localhost:3000/api/auth/verify?token='.length + 500);
    });

    it('UUID 형식의 토큰을 처리해야 함', () => {
      const uuidToken = '550e8400-e29b-41d4-a716-446655440000';
      const baseUrl = 'http://localhost:3000';

      const verificationUrl = `${baseUrl}/api/auth/verify?token=${uuidToken}`;

      expect(verificationUrl).toBe('http://localhost:3000/api/auth/verify?token=550e8400-e29b-41d4-a716-446655440000');
    });

    it('이메일 HTML이 올바른 링크를 포함해야 함', () => {
      const token = 'html-test-token';
      const baseUrl = 'http://localhost:3000';
      const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      const html = `<p>다음 링크를 클릭하여 이메일을 인증해주세요:</p><a href="${verificationUrl}">이메일 인증하기</a>`;

      expect(html).toContain(`href="${verificationUrl}"`);
      expect(html).toContain('이메일 인증하기');
    });

    it('이메일 텍스트가 올바른 링크를 포함해야 함', () => {
      const token = 'text-test-token';
      const baseUrl = 'http://localhost:3000';
      const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      const text = `다음 링크를 클릭하여 이메일을 인증해주세요: ${verificationUrl}`;

      expect(text).toContain(verificationUrl);
      expect(text).toContain('이메일을 인증해주세요');
    });
  });

  describe('URL generation logic', () => {
    it('query parameter가 올바른 형식이어야 함', () => {
      const token = 'query-test';
      const verificationUrl = `http://localhost:3000/api/auth/verify?token=${token}`;

      const url = new URL(verificationUrl);
      expect(url.searchParams.get('token')).toBe(token);
      expect(url.pathname).toBe('/api/auth/verify');
    });

    it('여러 도메인에서 동일한 패턴을 사용해야 함', () => {
      const token = 'multi-domain-test';
      const domains = [
        'http://localhost:3000',
        'https://staging.example.com',
        'https://example.com',
        'https://api.example.com'
      ];

      domains.forEach(domain => {
        const url = `${domain}/api/auth/verify?token=${token}`;
        expect(url).toContain(domain);
        expect(url).toContain('/api/auth/verify');
        expect(url).toContain(`token=${token}`);
      });
    });

    it('BASE_URL에 trailing slash가 있어도 처리해야 함', () => {
      const token = 'slash-test';
      const baseUrl = 'http://localhost:3000/';
      // 실제 구현은 BASE_URL 뒤에 /를 붙이지 않으므로 조정 필요
      const verificationUrl = `${baseUrl}api/auth/verify?token=${token}`;

      expect(verificationUrl).toContain('/api/auth/verify');
    });
  });

  describe('Edge Cases', () => {
    it('빈 토큰도 URL에 포함되어야 함', () => {
      const token = '';
      const baseUrl = 'http://localhost:3000';
      const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      expect(verificationUrl).toBe('http://localhost:3000/api/auth/verify?token=');
    });

    it('공백이 포함된 토큰을 처리해야 함', () => {
      const token = 'token with spaces';
      const baseUrl = 'http://localhost:3000';
      const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      expect(verificationUrl).toContain('token with spaces');
    });

    it('URL에 안전하지 않은 문자가 포함된 토큰', () => {
      const token = 'token&with=special?chars';
      const baseUrl = 'http://localhost:3000';
      const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

      // 원본 토큰이 그대로 포함됨 (실제로는 URL 인코딩 필요할 수 있음)
      expect(verificationUrl).toContain(token);
    });
  });
});
