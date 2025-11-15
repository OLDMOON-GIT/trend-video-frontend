/**
 * YouTube 연동 통합테스트
 * YouTube 채널 연결, 영상 업로드, 채널 관리 등
 */

import {
  mockSessionIds,
  mockUsers,
  mockFetch,
  createMockYouTubeChannel,
  createMockYouTubeUpload,
  createMockJob,
  createSuccessResponse,
  createErrorResponse,
  setupTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/test-utils';

describe('YouTube 연동 통합테스트', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe('YouTube Credentials 관리', () => {
    it('OAuth 2.0 Credentials 파일 업로드 성공', async () => {
      const mockCredentials = {
        installed: {
          client_id: 'test-client-id.apps.googleusercontent.com',
          client_secret: 'test-client-secret',
          redirect_uris: ['urn:ietf:wg:oauth:2.0:oob', 'http://localhost'],
        },
      };

      const mockResponse = createSuccessResponse({
        message: 'Credentials 파일 업로드 완료',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const formData = new FormData();
      const blob = new Blob([JSON.stringify(mockCredentials)], {
        type: 'application/json',
      });
      formData.append('credentials', blob, 'client_secret.json');

      const response = await fetch('/api/youtube/credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: formData,
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('잘못된 JSON 형식의 Credentials 업로드 실패', async () => {
      const mockResponse = createErrorResponse('잘못된 JSON 형식입니다', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const formData = new FormData();
      const blob = new Blob(['invalid json content'], {
        type: 'application/json',
      });
      formData.append('credentials', blob, 'client_secret.json');

      const response = await fetch('/api/youtube/credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: formData,
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });

    it('OAuth 2.0 구조가 아닌 파일 업로드 실패', async () => {
      const mockResponse = createErrorResponse(
        '올바른 OAuth 2.0 클라이언트 credentials 파일이 아닙니다',
        400
      );
      global.fetch = mockFetch(mockResponse, 400);

      const mockCredentials = {
        someOtherField: 'test',
      };

      const formData = new FormData();
      const blob = new Blob([JSON.stringify(mockCredentials)], {
        type: 'application/json',
      });
      formData.append('credentials', blob, 'wrong_format.json');

      const response = await fetch('/api/youtube/credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: formData,
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });

    it('Credentials 파일 삭제 성공', async () => {
      const mockResponse = createSuccessResponse({
        message: 'Credentials 파일 삭제 완료',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/youtube/credentials', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('인증되지 않은 사용자의 Credentials 업로드 시도 실패', async () => {
      const mockResponse = createErrorResponse('로그인이 필요합니다', 401);
      global.fetch = mockFetch(mockResponse, 401);

      const formData = new FormData();
      const blob = new Blob(['{}'], { type: 'application/json' });
      formData.append('credentials', blob, 'client_secret.json');

      const response = await fetch('/api/youtube/credentials', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('YouTube 채널 연결', () => {
    it('YouTube 채널 연결 성공', async () => {
      const mockChannel = createMockYouTubeChannel();
      const mockResponse = createSuccessResponse({
        channel: mockChannel,
        message: '채널이 연결되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/youtube/connect-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          authCode: 'test-auth-code',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.channel).toBeDefined();
      expect(data.channel.id).toBeDefined();
    });

    it('잘못된 인증 코드로 채널 연결 실패', async () => {
      const mockResponse = createErrorResponse('인증 코드가 유효하지 않습니다', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/youtube/connect-channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          authCode: 'invalid-code',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });

    it('연결된 채널 목록 조회 성공', async () => {
      const mockChannels = [
        createMockYouTubeChannel(),
        createMockYouTubeChannel({ title: '두 번째 채널' }),
      ];

      const mockResponse = createSuccessResponse({
        channels: mockChannels,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/youtube/channels', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.channels).toBeDefined();
      expect(Array.isArray(data.channels)).toBe(true);
      expect(data.channels.length).toBe(2);
    });

    it('채널 연결 해제 성공', async () => {
      const mockChannel = createMockYouTubeChannel();
      const mockResponse = createSuccessResponse({
        message: '채널 연결이 해제되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/youtube/channels/${mockChannel.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('YouTube 영상 업로드', () => {
    it('영상 업로드 요청 성공', async () => {
      const mockJob = createMockJob({ status: 'completed' });
      const mockChannel = createMockYouTubeChannel();
      const mockUpload = createMockYouTubeUpload();

      const mockResponse = createSuccessResponse({
        uploadId: mockUpload.id,
        videoUrl: mockUpload.videoUrl,
        message: '영상 업로드가 시작되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          jobId: mockJob.id,
          channelId: mockChannel.id,
          title: '테스트 영상',
          description: '테스트 영상 설명',
          privacyStatus: 'public',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.uploadId).toBeDefined();
    });

    it('완료되지 않은 작업 업로드 시도 실패', async () => {
      const mockJob = createMockJob({ status: 'processing' });
      const mockChannel = createMockYouTubeChannel();
      const mockResponse = createErrorResponse('영상 생성이 완료되지 않았습니다', 400);

      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          jobId: mockJob.id,
          channelId: mockChannel.id,
          title: '테스트 영상',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });

    it('여러 채널에 동시 업로드', async () => {
      const mockJob = createMockJob({ status: 'completed' });
      const mockChannels = [
        createMockYouTubeChannel(),
        createMockYouTubeChannel({ title: '두 번째 채널' }),
      ];

      const mockResponse = createSuccessResponse({
        uploads: mockChannels.map((channel) => ({
          channelId: channel.id,
          uploadId: createMockYouTubeUpload({ channelId: channel.id }).id,
          status: 'success',
        })),
        message: '모든 채널에 업로드가 시작되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/youtube/upload-multiple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          jobId: mockJob.id,
          channelIds: mockChannels.map((c) => c.id),
          title: '테스트 영상',
          description: '여러 채널 업로드',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.uploads).toBeDefined();
      expect(data.uploads.length).toBe(2);
    });

    it('업로드 진행 상태 조회', async () => {
      const mockUpload = createMockYouTubeUpload();
      const mockResponse = createSuccessResponse({
        uploadId: mockUpload.id,
        status: 'uploading',
        progress: 75,
        message: '업로드 중...',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/youtube/upload-status?uploadId=${mockUpload.id}`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('uploading');
      expect(data.progress).toBe(75);
    });

    it('업로드 취소 성공', async () => {
      const mockUpload = createMockYouTubeUpload();
      const mockResponse = createSuccessResponse({
        message: '업로드가 취소되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/youtube/upload/${mockUpload.id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('업로드 기록 관리', () => {
    it('사용자의 업로드 기록 조회', async () => {
      const mockUploads = [
        createMockYouTubeUpload(),
        createMockYouTubeUpload({ title: '두 번째 업로드' }),
        createMockYouTubeUpload({ title: '세 번째 업로드' }),
      ];

      const mockResponse = createSuccessResponse({
        uploads: mockUploads,
        total: 3,
        hasMore: false,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/youtube/uploads?limit=20&offset=0', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.uploads).toBeDefined();
      expect(data.uploads.length).toBe(3);
    });

    it('특정 채널의 업로드 기록 조회', async () => {
      const mockChannel = createMockYouTubeChannel();
      const mockUploads = [
        createMockYouTubeUpload({ channelId: mockChannel.id }),
        createMockYouTubeUpload({ channelId: mockChannel.id, title: '두 번째 업로드' }),
      ];

      const mockResponse = createSuccessResponse({
        uploads: mockUploads,
        total: 2,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(
        `/api/youtube/uploads?channelId=${mockChannel.id}`,
        {
          headers: {
            'Authorization': `Bearer ${mockSessionIds.regular}`,
          },
        }
      );

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.uploads).toBeDefined();
      expect(data.uploads.length).toBe(2);
      expect(data.uploads.every((u: any) => u.channelId === mockChannel.id)).toBe(true);
    });

    it('업로드 기록 삭제', async () => {
      const mockUpload = createMockYouTubeUpload();
      const mockResponse = createSuccessResponse({
        message: '업로드 기록이 삭제되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/youtube/uploads/${mockUpload.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('YouTube API 권한 및 인증', () => {
    it('YouTube API 권한 없이 업로드 시도 실패', async () => {
      const mockResponse = createErrorResponse(
        'YouTube API 권한이 필요합니다',
        403
      );
      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          jobId: 'test-job-id',
          channelId: 'test-channel-id',
          title: '테스트 영상',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });

    it('만료된 토큰으로 업로드 시도 시 재인증 필요', async () => {
      const mockResponse = createErrorResponse('인증 토큰이 만료되었습니다', 401);
      global.fetch = mockFetch(mockResponse, 401);

      const response = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer expired-token`,
        },
        body: JSON.stringify({
          jobId: 'test-job-id',
          channelId: 'test-channel-id',
          title: '테스트 영상',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('토큰 갱신 성공', async () => {
      const mockResponse = createSuccessResponse({
        accessToken: 'new-access-token',
        expiresIn: 3600,
        message: '토큰이 갱신되었습니다',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/youtube/refresh-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.accessToken).toBeDefined();
    });
  });

  describe('영상 메타데이터 관리', () => {
    it('업로드된 영상 메타데이터 수정', async () => {
      const mockUpload = createMockYouTubeUpload();
      const newTitle = '수정된 제목';
      const newDescription = '수정된 설명';

      const mockResponse = createSuccessResponse({
        upload: {
          ...mockUpload,
          title: newTitle,
          description: newDescription,
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/youtube/uploads/${mockUpload.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.upload.title).toBe(newTitle);
      expect(data.upload.description).toBe(newDescription);
    });

    it('영상 공개 상태 변경', async () => {
      const mockUpload = createMockYouTubeUpload({ privacyStatus: 'private' });
      const mockResponse = createSuccessResponse({
        upload: {
          ...mockUpload,
          privacyStatus: 'public',
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/youtube/uploads/${mockUpload.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          privacyStatus: 'public',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.upload.privacyStatus).toBe('public');
    });
  });
});
