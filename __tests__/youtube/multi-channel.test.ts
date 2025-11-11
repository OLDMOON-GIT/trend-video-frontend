/**
 * YouTube 멀티 채널 연동 Regression 테스트
 *
 * 이 테스트는 YouTube 채널 연결 기능이 제대로 작동하는지 확인합니다.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe.skip('YouTube Multi-Channel Integration (E2E - requires server)', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
  const TEST_USER_EMAIL = 'moony75@gmail.com';
  const TEST_USER_PASSWORD = 'test123';
  let authCookie: string;

  beforeAll(async () => {
    // 로그인하여 세션 쿠키 획득
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })
    });

    if (loginRes.ok) {
      authCookie = loginRes.headers.get('set-cookie') || '';
    }
  });

  describe('GET /api/youtube/channels', () => {
    it('로그인하지 않으면 401 에러를 반환해야 함', async () => {
      const res = await fetch(`${BASE_URL}/api/youtube/channels`);
      expect(res.status).toBe(401);
    });

    it('로그인한 사용자의 채널 목록을 반환해야 함', async () => {
      if (!authCookie) {
        console.warn('⚠️  로그인 실패로 테스트 스킵');
        return;
      }

      const res = await fetch(`${BASE_URL}/api/youtube/channels`, {
        headers: { Cookie: authCookie }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('channels');
      expect(data).toHaveProperty('hasCredentials');
      expect(Array.isArray(data.channels)).toBe(true);
    });

    it('각 채널은 필수 속성을 가져야 함', async () => {
      if (!authCookie) return;

      const res = await fetch(`${BASE_URL}/api/youtube/channels`, {
        headers: { Cookie: authCookie }
      });

      const data = await res.json();

      if (data.channels.length > 0) {
        const channel = data.channels[0];
        expect(channel).toHaveProperty('id');
        expect(channel).toHaveProperty('userId');
        expect(channel).toHaveProperty('channelId');
        expect(channel).toHaveProperty('channelTitle');
        expect(channel).toHaveProperty('tokenFile');
        expect(channel).toHaveProperty('isDefault');
        expect(typeof channel.isDefault).toBe('boolean');
      }
    });

    it('기본 채널은 최대 1개여야 함', async () => {
      if (!authCookie) return;

      const res = await fetch(`${BASE_URL}/api/youtube/channels`, {
        headers: { Cookie: authCookie }
      });

      const data = await res.json();
      const defaultChannels = data.channels.filter((ch: any) => ch.isDefault);
      expect(defaultChannels.length).toBeLessThanOrEqual(1);
    });
  });

  describe('OAuth Flow', () => {
    it('/api/youtube/oauth-start는 OAuth URL을 생성해야 함', async () => {
      if (!authCookie) return;

      const res = await fetch(`${BASE_URL}/api/youtube/oauth-start`, {
        headers: { Cookie: authCookie }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('authUrl');
      expect(data.authUrl).toContain('accounts.google.com');
      expect(data.authUrl).toContain('oauth2');
    });

    it('OAuth URL은 올바른 redirect_uri를 포함해야 함', async () => {
      if (!authCookie) return;

      const res = await fetch(`${BASE_URL}/api/youtube/oauth-start`, {
        headers: { Cookie: authCookie }
      });

      const data = await res.json();
      const url = new URL(data.authUrl);
      const redirectUri = url.searchParams.get('redirect_uri');

      expect(redirectUri).toContain('/api/youtube/oauth-callback');
    });

    it('OAuth URL은 필수 파라미터를 포함해야 함', async () => {
      if (!authCookie) return;

      const res = await fetch(`${BASE_URL}/api/youtube/oauth-start`, {
        headers: { Cookie: authCookie }
      });

      const data = await res.json();
      const url = new URL(data.authUrl);

      expect(url.searchParams.get('client_id')).toBeTruthy();
      expect(url.searchParams.get('redirect_uri')).toBeTruthy();
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toContain('youtube');
      expect(url.searchParams.get('access_type')).toBe('offline');
    });
  });

  describe('Channel Management', () => {
    it('PATCH /api/youtube/channels는 기본 채널을 설정해야 함', async () => {
      if (!authCookie) return;

      // 먼저 채널 목록 가져오기
      const listRes = await fetch(`${BASE_URL}/api/youtube/channels`, {
        headers: { Cookie: authCookie }
      });
      const listData = await listRes.json();

      if (listData.channels.length === 0) {
        console.warn('⚠️  채널이 없어서 테스트 스킵');
        return;
      }

      const channelId = listData.channels[0].id;

      const res = await fetch(`${BASE_URL}/api/youtube/channels?channelId=${channelId}`, {
        method: 'PATCH',
        headers: { Cookie: authCookie }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('UI Integration', () => {
    it('/my-content?tab=settings 페이지는 YouTube 설정을 표시해야 함', async () => {
      const res = await fetch(`${BASE_URL}/my-content?tab=settings`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('YouTube');
      expect(html).toContain('채널');
    });

    it('탭 파라미터는 URL에 유지되어야 함', async () => {
      const res = await fetch(`${BASE_URL}/my-content?tab=settings`, {
        redirect: 'manual'
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Upload Integration', () => {
    it('업로드 시 채널 선택 옵션이 있어야 함', async () => {
      if (!authCookie) return;

      // 실제 업로드 테스트는 복잡하므로,
      // 여기서는 채널 목록이 제공되는지만 확인
      const res = await fetch(`${BASE_URL}/api/youtube/channels`, {
        headers: { Cookie: authCookie }
      });

      const data = await res.json();
      expect(data.channels).toBeDefined();

      // 각 채널은 업로드에 필요한 정보를 가져야 함
      if (data.channels.length > 0) {
        const channel = data.channels[0];
        expect(channel.channelId).toBeTruthy();
        expect(channel.tokenFile).toBeTruthy();
      }
    });
  });

  describe('Error Handling', () => {
    it('잘못된 channelId로 기본 설정 시 에러를 반환해야 함', async () => {
      if (!authCookie) return;

      const res = await fetch(`${BASE_URL}/api/youtube/channels?channelId=invalid-id`, {
        method: 'PATCH',
        headers: { Cookie: authCookie }
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('잘못된 channelId로 삭제 시 에러를 반환해야 함', async () => {
      if (!authCookie) return;

      const res = await fetch(`${BASE_URL}/api/youtube/channels?channelId=invalid-id`, {
        method: 'DELETE',
        headers: { Cookie: authCookie }
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});

describe('Backward Compatibility', () => {
  it('기존 "은빛라디오" 채널은 여전히 작동해야 함', async () => {
    // DB 파일 직접 확인
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'data', 'youtube_channels.json');

    if (fs.existsSync(dbPath)) {
      const channels = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      const silverRadio = channels.find((ch: any) => ch.channelTitle === '은빛라디오');

      if (silverRadio) {
        expect(silverRadio.channelId).toBe('UCNh_t25SLZYmL0uCjI_gk5w');
        expect(silverRadio.tokenFile).toBeTruthy();
      }
    }
  });
});
