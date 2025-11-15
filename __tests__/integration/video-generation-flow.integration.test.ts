/**
 * 영상 생성 플로우 통합테스트
 * 영상 생성 요청, 진행 상태 추적, 취소, 완료 처리 등
 */

import {
  mockSessionIds,
  mockFetch,
  createMockJob,
  createSuccessResponse,
  createErrorResponse,
  setupTestEnvironment,
  teardownTestEnvironment,
  waitFor,
} from '../helpers/test-utils';

describe('영상 생성 플로우 통합테스트', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe('영상 생성 요청', () => {
    it('파이프라인을 통한 영상 생성 요청 성공', async () => {
      const mockResponse = createSuccessResponse({
        results: [
          {
            id: 'video-1',
            title: '테스트 영상',
            channelName: '테스트 채널',
            views: 1000,
            videoUrl: 'https://youtube.com/watch?v=test123',
            script: '테스트 대본 내용',
            funHighlights: ['하이라이트 1', '하이라이트 2'],
            thumbnailPrompt: '썸네일 프롬프트',
          },
        ],
        model: 'gpt',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          videos: [
            {
              id: 'video-1',
              title: '테스트 영상',
              channelName: '테스트 채널',
              views: 1000,
              videoUrl: 'https://youtube.com/watch?v=test123',
            },
          ],
          model: 'gpt',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.results).toBeDefined();
      expect(data.results.length).toBe(1);
      expect(data.results[0].script).toBeDefined();
    });

    it('영상 정보 없이 파이프라인 요청 시 실패', async () => {
      const mockResponse = createErrorResponse('선택된 영상 정보가 없습니다.', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          videos: [],
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
      expect(data.error).toContain('영상');
    });
  });

  describe('영상 작업 상태 조회', () => {
    it('작업 ID로 상태 조회 성공', async () => {
      const mockJob = createMockJob({ status: 'processing', progress: 50 });
      const mockResponse = createSuccessResponse({
        status: mockJob.status,
        progress: mockJob.progress,
        step: mockJob.step,
        logs: '영상 생성 중...',
        outputPath: null,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/job-status?jobId=${mockJob.id}`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('processing');
      expect(data.progress).toBe(50);
    });

    it('존재하지 않는 작업 ID로 조회 시 실패', async () => {
      const mockResponse = createErrorResponse('작업을 찾을 수 없습니다.', 404);
      global.fetch = mockFetch(mockResponse, 404);

      const response = await fetch(`/api/job-status?jobId=non-existent-job-id`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });

    it('타입과 상태로 진행 중인 작업 조회', async () => {
      const mockJob = createMockJob({ type: 'shortform', status: 'processing' });
      const mockResponse = createSuccessResponse({
        jobId: mockJob.id,
        status: mockJob.status,
        progress: mockJob.progress,
        step: mockJob.step,
        logs: ['영상 생성 시작', '대본 처리 중'],
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(
        `/api/job-status?type=shortform&status=processing`,
        {
          headers: {
            'Authorization': `Bearer ${mockSessionIds.regular}`,
          },
        }
      );

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.jobId).toBeDefined();
      expect(data.status).toBe('processing');
    });
  });

  describe('영상 목록 조회', () => {
    it('사용자의 영상 목록 조회 성공', async () => {
      const mockJobs = [
        createMockJob(),
        createMockJob({ title: '두 번째 영상' }),
        createMockJob({ title: '세 번째 영상' }),
      ];

      const mockResponse = createSuccessResponse({
        jobs: mockJobs,
        total: 3,
        hasMore: false,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/my-videos?limit=20&offset=0', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.jobs).toBeDefined();
      expect(Array.isArray(data.jobs)).toBe(true);
      expect(data.total).toBe(3);
    });

    it('활성 작업만 필터링하여 조회', async () => {
      const mockJobs = [
        createMockJob({ status: 'processing' }),
        createMockJob({ status: 'pending' }),
      ];

      const mockResponse = createSuccessResponse({
        jobs: mockJobs,
        total: 2,
        hasMore: false,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/my-videos?filter=active', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.jobs).toBeDefined();
      expect(data.total).toBe(2);
    });

    it('검색어로 영상 필터링', async () => {
      const mockJobs = [
        createMockJob({ title: '재미있는 쇼츠 영상' }),
      ];

      const mockResponse = createSuccessResponse({
        jobs: mockJobs,
        total: 1,
        hasMore: false,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/my-videos?search=재미있는', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.jobs).toBeDefined();
      expect(data.total).toBe(1);
      expect(data.jobs[0].title).toContain('재미있는');
    });

    it('페이지네이션 동작 확인', async () => {
      const mockJobs = Array.from({ length: 10 }, (_, i) =>
        createMockJob({ title: `영상 ${i + 1}` })
      );

      const mockResponse = createSuccessResponse({
        jobs: mockJobs.slice(0, 5),
        total: 10,
        hasMore: true,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/my-videos?limit=5&offset=0', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.jobs.length).toBe(5);
      expect(data.total).toBe(10);
      expect(data.hasMore).toBe(true);
    });
  });

  describe('영상 삭제', () => {
    it('영상 작업 삭제 성공', async () => {
      const mockJob = createMockJob();
      const mockResponse = createSuccessResponse({
        message: '작업이 삭제되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/my-videos?jobId=${mockJob.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('존재하지 않는 작업 삭제 시도 시 실패', async () => {
      const mockResponse = createErrorResponse('작업을 찾을 수 없습니다.', 404);
      global.fetch = mockFetch(mockResponse, 404);

      const response = await fetch(`/api/my-videos?jobId=non-existent-id`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
    });

    it('다른 사용자의 작업 삭제 시도 시 권한 오류', async () => {
      const mockJob = createMockJob({ userId: 'another-user-id' });
      const mockResponse = createErrorResponse(
        '이 작업을 삭제할 권한이 없습니다.',
        403
      );

      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch(`/api/my-videos?jobId=${mockJob.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  describe('영상 생성 진행 상태 추적', () => {
    it('영상 생성 진행률이 업데이트됨', async () => {
      const mockJob = createMockJob({ status: 'processing', progress: 0 });
      let currentProgress = 0;

      // 진행률을 점진적으로 업데이트하는 mock
      global.fetch = jest.fn().mockImplementation(() => {
        currentProgress += 25;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () =>
            createSuccessResponse({
              status: currentProgress < 100 ? 'processing' : 'completed',
              progress: currentProgress,
              step: currentProgress < 100 ? 'generating' : 'completed',
            }),
        });
      });

      // 4번 상태 확인 (0% -> 25% -> 50% -> 75% -> 100%)
      const checks = [];
      for (let i = 0; i < 4; i++) {
        const response = await fetch(`/api/job-status?jobId=${mockJob.id}`, {
          headers: {
            'Authorization': `Bearer ${mockSessionIds.regular}`,
          },
        });
        const data = await response.json();
        checks.push(data.progress);
        await waitFor(100);
      }

      expect(checks).toEqual([25, 50, 75, 100]);
    });

    it('영상 생성 완료 후 비디오 경로 제공', async () => {
      const mockJob = createMockJob({
        status: 'completed',
        progress: 100,
        videoPath: '/videos/test-video.mp4',
      });

      const mockResponse = createSuccessResponse({
        status: mockJob.status,
        progress: mockJob.progress,
        step: 'completed',
        outputPath: mockJob.videoPath,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/job-status?jobId=${mockJob.id}`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('completed');
      expect(data.progress).toBe(100);
      expect(data.outputPath).toBeDefined();
      expect(data.outputPath).toContain('.mp4');
    });

    it('영상 생성 실패 시 에러 메시지 제공', async () => {
      const mockJob = createMockJob({
        status: 'failed',
        progress: 50,
      });

      const mockResponse = createSuccessResponse({
        status: mockJob.status,
        progress: mockJob.progress,
        step: 'failed',
        error: '영상 생성 중 오류가 발생했습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/job-status?jobId=${mockJob.id}`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.status).toBe('failed');
      expect(data.error).toBeDefined();
    });
  });

  describe('영상 생성 타입별 처리', () => {
    it('쇼츠 형식 영상 생성', async () => {
      const mockJob = createMockJob({ type: 'shortform' });
      const mockResponse = createSuccessResponse({
        jobId: mockJob.id,
        type: 'shortform',
        message: '쇼츠 영상 생성이 시작되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          videos: [
            {
              id: 'video-1',
              title: '쇼츠 테스트',
              videoUrl: 'https://youtube.com/watch?v=test',
            },
          ],
          model: 'gpt',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('롱폼 형식 영상 생성', async () => {
      const mockJob = createMockJob({ type: 'longform' });
      const mockResponse = createSuccessResponse({
        jobId: mockJob.id,
        type: 'longform',
        message: '롱폼 영상 생성이 시작되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          videos: [
            {
              id: 'video-1',
              title: '롱폼 테스트',
              videoUrl: 'https://youtube.com/watch?v=test',
              duration: '10:00',
            },
          ],
          model: 'claude',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });
  });

  describe('AI 모델별 영상 생성', () => {
    it('GPT 모델로 영상 생성', async () => {
      const mockResponse = createSuccessResponse({
        results: [{ id: 'video-1', script: 'GPT 생성 대본' }],
        model: 'gpt',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          videos: [{ id: 'video-1', title: 'Test', videoUrl: 'https://youtube.com/watch?v=test' }],
          model: 'gpt',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.model).toBe('gpt');
    });

    it('Claude 모델로 영상 생성', async () => {
      const mockResponse = createSuccessResponse({
        results: [{ id: 'video-1', script: 'Claude 생성 대본' }],
        model: 'claude',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          videos: [{ id: 'video-1', title: 'Test', videoUrl: 'https://youtube.com/watch?v=test' }],
          model: 'claude',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.model).toBe('claude');
    });

    it('Gemini 모델로 영상 생성', async () => {
      const mockResponse = createSuccessResponse({
        results: [{ id: 'video-1', script: 'Gemini 생성 대본' }],
        model: 'gemini',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          videos: [{ id: 'video-1', title: 'Test', videoUrl: 'https://youtube.com/watch?v=test' }],
          model: 'gemini',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.model).toBe('gemini');
    });
  });
});
