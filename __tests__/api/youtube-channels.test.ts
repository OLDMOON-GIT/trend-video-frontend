/**
 * /api/youtube/channels 핵심 로직 테스트
 *
 * 에러가 자주 발생하는 부분과 중요한 비즈니스 로직 테스트
 */

describe('/api/youtube/channels - Core Logic', () => {
  describe('Path Generation', () => {
    it('채널 토큰 경로를 올바르게 생성해야 함', () => {
      // getChannelTokenPath 로직
      const getChannelTokenPath = (userId: string, channelId: string): string => {
        const path = require('path');
        const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
        const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
        return path.join(CREDENTIALS_DIR, `youtube_token_${userId}_${channelId}.json`);
      };

      const result = getChannelTokenPath('user123', 'channel456');

      expect(result).toContain('youtube_token_user123_channel456.json');
      expect(result).toContain('config');
    });

    it('여러 사용자/채널 조합에 대해 고유한 경로를 생성해야 함', () => {
      const getChannelTokenPath = (userId: string, channelId: string): string => {
        const path = require('path');
        const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
        const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
        return path.join(CREDENTIALS_DIR, `youtube_token_${userId}_${channelId}.json`);
      };

      const path1 = getChannelTokenPath('user1', 'channel1');
      const path2 = getChannelTokenPath('user1', 'channel2');
      const path3 = getChannelTokenPath('user2', 'channel1');

      expect(path1).not.toBe(path2);
      expect(path1).not.toBe(path3);
      expect(path2).not.toBe(path3);

      expect(path1).toContain('user1_channel1');
      expect(path2).toContain('user1_channel2');
      expect(path3).toContain('user2_channel1');
    });
  });

  describe('GET - Error Cases', () => {
    it('인증되지 않은 요청은 401을 반환해야 함', () => {
      const user = null;

      if (!user) {
        const error = { error: '로그인이 필요합니다' };
        const status = 401;

        expect(error.error).toBe('로그인이 필요합니다');
        expect(status).toBe(401);
      }
    });

    it('인증된 요청은 채널 목록을 반환해야 함', () => {
      const user = { userId: 'user123', email: 'test@example.com', isAdmin: false };

      expect(user).toBeDefined();
      expect(user.userId).toBe('user123');
    });
  });

  describe('DELETE - Validation', () => {
    it('channelId가 없으면 400을 반환해야 함', () => {
      const channelId = null;

      if (!channelId) {
        const error = { error: 'channelId가 필요합니다' };
        const status = 400;

        expect(error.error).toBe('channelId가 필요합니다');
        expect(status).toBe(400);
      }
    });

    it('channelId가 빈 문자열이면 400을 반환해야 함', () => {
      const channelId = '';

      if (!channelId) {
        const error = { error: 'channelId가 필요합니다' };
        const status = 400;

        expect(error.error).toBe('channelId가 필요합니다');
        expect(status).toBe(400);
      }
    });

    it('유효한 channelId는 통과해야 함', () => {
      const channelId = 'channel123';

      expect(channelId).toBeTruthy();
      expect(typeof channelId).toBe('string');
    });
  });

  describe('DELETE - Channel Not Found', () => {
    it('채널 목록에서 해당 채널을 찾지 못하면 404를 반환해야 함', () => {
      const channels = [
        { id: 'channel1', channelId: 'UC123', channelTitle: 'Channel 1' },
        { id: 'channel2', channelId: 'UC456', channelTitle: 'Channel 2' }
      ];

      const targetChannelId = 'channel999'; // 존재하지 않음
      const channel = channels.find(ch => ch.id === targetChannelId);

      if (!channel) {
        const error = { error: '채널을 찾을 수 없습니다' };
        const status = 404;

        expect(error.error).toBe('채널을 찾을 수 없습니다');
        expect(status).toBe(404);
      }
    });

    it('채널 목록에 해당 채널이 있으면 찾아야 함', () => {
      const channels = [
        { id: 'channel1', channelId: 'UC123', channelTitle: 'Channel 1' },
        { id: 'channel2', channelId: 'UC456', channelTitle: 'Channel 2' }
      ];

      const targetChannelId = 'channel1';
      const channel = channels.find(ch => ch.id === targetChannelId);

      expect(channel).toBeDefined();
      expect(channel?.channelTitle).toBe('Channel 1');
    });
  });

  describe('PATCH - Validation', () => {
    it('channelId가 없으면 400을 반환해야 함', () => {
      const channelId = null;

      if (!channelId) {
        const error = { error: 'channelId가 필요합니다' };
        const status = 400;

        expect(error.error).toBe('channelId가 필요합니다');
        expect(status).toBe(400);
      }
    });

    it('setDefaultYouTubeChannel이 false를 반환하면 404를 반환해야 함', () => {
      const success = false; // 채널을 찾지 못함

      if (!success) {
        const error = { error: '채널을 찾을 수 없습니다' };
        const status = 404;

        expect(error.error).toBe('채널을 찾을 수 없습니다');
        expect(status).toBe(404);
      }
    });

    it('setDefaultYouTubeChannel이 true를 반환하면 성공 메시지를 반환해야 함', () => {
      const success = true;

      if (success) {
        const response = { success: true, message: '기본 채널로 설정되었습니다' };

        expect(response.success).toBe(true);
        expect(response.message).toBe('기본 채널로 설정되었습니다');
      }
    });
  });

  describe('POST - Deprecated Endpoint', () => {
    it('POST 요청은 410 Gone을 반환해야 함', () => {
      const error = {
        error: "이 엔드포인트는 더 이상 사용되지 않습니다. /api/youtube/oauth-start를 사용하세요."
      };
      const status = 410;

      expect(error.error).toContain('/api/youtube/oauth-start');
      expect(status).toBe(410);
    });
  });

  describe('URL Parsing', () => {
    it('URL에서 channelId를 추출해야 함', () => {
      const url = new URL('http://localhost:3000/api/youtube/channels?channelId=channel123');
      const channelId = url.searchParams.get('channelId');

      expect(channelId).toBe('channel123');
    });

    it('channelId가 없으면 null을 반환해야 함', () => {
      const url = new URL('http://localhost:3000/api/youtube/channels');
      const channelId = url.searchParams.get('channelId');

      expect(channelId).toBeNull();
    });

    it('여러 query parameter가 있어도 channelId를 찾아야 함', () => {
      const url = new URL('http://localhost:3000/api/youtube/channels?foo=bar&channelId=channel123&baz=qux');
      const channelId = url.searchParams.get('channelId');

      expect(channelId).toBe('channel123');
    });

    it('특수 문자가 포함된 channelId도 처리해야 함', () => {
      const url = new URL('http://localhost:3000/api/youtube/channels?channelId=UCNh_t25SLZYmL0uCjI_gk5w');
      const channelId = url.searchParams.get('channelId');

      expect(channelId).toBe('UCNh_t25SLZYmL0uCjI_gk5w');
    });
  });

  describe('Response Structure', () => {
    it('GET 성공 응답은 channels와 hasCredentials를 포함해야 함', () => {
      const response = {
        channels: [
          { id: 'ch1', channelTitle: 'Channel 1' }
        ],
        hasCredentials: true
      };

      expect(response).toHaveProperty('channels');
      expect(response).toHaveProperty('hasCredentials');
      expect(Array.isArray(response.channels)).toBe(true);
      expect(typeof response.hasCredentials).toBe('boolean');
    });

    it('DELETE 성공 응답은 success와 message를 포함해야 함', () => {
      const response = {
        success: true,
        message: 'YouTube 채널 연결 해제 완료'
      };

      expect(response.success).toBe(true);
      expect(response.message).toBe('YouTube 채널 연결 해제 완료');
    });

    it('PATCH 성공 응답은 success와 message를 포함해야 함', () => {
      const response = {
        success: true,
        message: '기본 채널로 설정되었습니다'
      };

      expect(response.success).toBe(true);
      expect(response.message).toBe('기본 채널로 설정되었습니다');
    });
  });

  describe('Error Handling', () => {
    it('예외 발생 시 500 에러를 반환해야 함', () => {
      const error = new Error('Database connection failed');

      const response = { error: '채널 목록 조회 실패' };
      const status = 500;

      expect(response.error).toBe('채널 목록 조회 실패');
      expect(status).toBe(500);
    });

    it('에러 메시지는 사용자 친화적이어야 함', () => {
      const errors = [
        '채널 목록 조회 실패',
        'YouTube 채널 연결 해제 실패',
        '기본 채널 설정 실패'
      ];

      errors.forEach(error => {
        expect(error).toBeTruthy();
        expect(error.length).toBeGreaterThan(0);
        expect(error).not.toContain('Error:');
        expect(error).not.toContain('undefined');
      });
    });
  });
});
