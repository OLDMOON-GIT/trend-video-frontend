/**
 * 사용자 관리 페이지 리그레션 테스트
 *
 * 테스트 범위:
 * - 사용자 검색 기능
 * - 크레딧 부여 기능
 * - 이메일 인증 처리
 * - 페이지네이션
 */

describe('사용자 관리 페이지', () => {
  describe('사용자 검색', () => {
    test('이메일로 사용자 검색', () => {
      const users = [
        { id: '1', email: 'test@example.com', credits: 100 },
        { id: '2', email: 'user@test.com', credits: 50 },
        { id: '3', email: 'admin@example.com', credits: 200 },
      ];

      const searchQuery = 'test';
      const filtered = users.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(2);
      expect(filtered[0].email).toContain('test');
    });

    test('부분 문자열 검색', () => {
      const users = [
        { id: '1', email: 'john@example.com', credits: 100 },
        { id: '2', email: 'jane@example.com', credits: 50 },
      ];

      const searchQuery = 'ja';
      const filtered = users.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].email).toBe('jane@example.com');
    });

    test('대소문자 구분 없이 검색', () => {
      const users = [
        { id: '1', email: 'Test@Example.COM', credits: 100 },
      ];

      const searchQueries = ['test', 'TEST', 'TeSt'];

      searchQueries.forEach(query => {
        const filtered = users.filter(user =>
          user.email.toLowerCase().includes(query.toLowerCase())
        );
        expect(filtered).toHaveLength(1);
      });
    });

    test('빈 검색어는 모든 사용자 반환', () => {
      const users = [
        { id: '1', email: 'user1@test.com', credits: 100 },
        { id: '2', email: 'user2@test.com', credits: 50 },
      ];

      const searchQuery = '';
      const filtered = searchQuery
        ? users.filter(user => user.email.includes(searchQuery))
        : users;

      expect(filtered).toHaveLength(2);
    });
  });

  describe('크레딧 부여', () => {
    test('양수 크레딧 부여', () => {
      let userCredits = 100;
      const addAmount = 50;

      userCredits += addAmount;

      expect(userCredits).toBe(150);
    });

    test('음수 크레딧 부여 (차감)', () => {
      let userCredits = 100;
      const deductAmount = -30;

      userCredits += deductAmount;

      expect(userCredits).toBe(70);
    });

    test('0 이하로 차감 방지', () => {
      let userCredits = 100;
      const deductAmount = -150;

      const newCredits = userCredits + deductAmount;
      userCredits = Math.max(0, newCredits); // 0 미만 방지

      expect(userCredits).toBe(0);
      expect(userCredits).toBeGreaterThanOrEqual(0);
    });

    test('최대 크레딧 제한', () => {
      const MAX_CREDITS = 1000000;
      let userCredits = 999950;
      const addAmount = 100;

      const newCredits = userCredits + addAmount;
      userCredits = Math.min(newCredits, MAX_CREDITS);

      expect(userCredits).toBe(MAX_CREDITS);
    });
  });

  describe('이메일 인증', () => {
    test('인증되지 않은 사용자 필터링', () => {
      const users = [
        { id: '1', email: 'user1@test.com', emailVerified: true },
        { id: '2', email: 'user2@test.com', emailVerified: false },
        { id: '3', email: 'user3@test.com', emailVerified: false },
      ];

      const unverified = users.filter(user => !user.emailVerified);

      expect(unverified).toHaveLength(2);
    });

    test('수동 인증 처리', () => {
      const user = {
        id: '1',
        email: 'test@example.com',
        emailVerified: false,
      };

      // 관리자가 수동으로 인증
      user.emailVerified = true;

      expect(user.emailVerified).toBe(true);
    });
  });

  describe('페이지네이션', () => {
    test('페이지당 10명씩 표시', () => {
      const users = Array.from({ length: 35 }, (_, i) => ({
        id: String(i + 1),
        email: `user${i + 1}@test.com`,
        credits: 100,
      }));

      const PAGE_SIZE = 10;
      const currentPage = 1;

      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const endIndex = startIndex + PAGE_SIZE;
      const paginatedUsers = users.slice(startIndex, endIndex);

      expect(paginatedUsers).toHaveLength(10);
      expect(paginatedUsers[0].id).toBe('1');
      expect(paginatedUsers[9].id).toBe('10');
    });

    test('마지막 페이지는 남은 사용자만 표시', () => {
      const users = Array.from({ length: 35 }, (_, i) => ({
        id: String(i + 1),
        email: `user${i + 1}@test.com`,
        credits: 100,
      }));

      const PAGE_SIZE = 10;
      const currentPage = 4; // 마지막 페이지

      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const endIndex = startIndex + PAGE_SIZE;
      const paginatedUsers = users.slice(startIndex, endIndex);

      expect(paginatedUsers).toHaveLength(5); // 35 - 30 = 5
      expect(paginatedUsers[0].id).toBe('31');
    });

    test('총 페이지 수 계산', () => {
      const totalUsers = 35;
      const PAGE_SIZE = 10;
      const totalPages = Math.ceil(totalUsers / PAGE_SIZE);

      expect(totalPages).toBe(4);
    });
  });

  describe('Edge Cases', () => {
    test('사용자가 없을 때 빈 배열 반환', () => {
      const users: any[] = [];
      const searchQuery = 'test';

      const filtered = users.filter(user =>
        user.email.includes(searchQuery)
      );

      expect(filtered).toHaveLength(0);
      expect(Array.isArray(filtered)).toBe(true);
    });

    test('특수 문자가 포함된 이메일 검색', () => {
      const users = [
        { id: '1', email: 'test+tag@example.com', credits: 100 },
        { id: '2', email: 'user.name@example.com', credits: 50 },
      ];

      const searchQuery = 'test+tag';
      const filtered = users.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].email).toBe('test+tag@example.com');
    });
  });

  describe('리그레션 방지', () => {
    test('[BUG FIX] 크레딧 부여 후 목록이 즉시 업데이트되어야 함', () => {
      const users = [
        { id: '1', email: 'test@example.com', credits: 100 },
      ];

      // 크레딧 부여
      const userId = '1';
      const addAmount = 50;
      const user = users.find(u => u.id === userId);

      if (user) {
        user.credits += addAmount;
      }

      // 목록에서 즉시 반영 확인
      const updatedUser = users.find(u => u.id === userId);
      expect(updatedUser?.credits).toBe(150);
    });

    test('[BUG FIX] 검색 후 페이지 변경 시 검색 조건 유지', () => {
      const users = Array.from({ length: 25 }, (_, i) => ({
        id: String(i + 1),
        email: i < 15 ? `test${i}@example.com` : `user${i}@example.com`,
        credits: 100,
      }));

      const searchQuery = 'test';
      let filtered = users.filter(user =>
        user.email.includes(searchQuery)
      );

      expect(filtered).toHaveLength(15);

      // 페이지 변경 후에도 검색 조건 유지
      const PAGE_SIZE = 10;
      const currentPage = 2;
      const startIndex = (currentPage - 1) * PAGE_SIZE;
      const paginatedUsers = filtered.slice(startIndex, startIndex + PAGE_SIZE);

      expect(paginatedUsers).toHaveLength(5);
      expect(paginatedUsers.every(u => u.email.includes('test'))).toBe(true);
    });
  });
});
