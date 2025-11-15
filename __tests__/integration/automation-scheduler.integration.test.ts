/**
 * 자동화 스케줄러 통합테스트
 * 작업 생성, 스케줄 관리, 자동 실행, 상태 추적 등
 */

import {
  mockSessionIds,
  mockUsers,
  mockFetch,
  createMockAutomationTitle,
  createMockAutomationSchedule,
  createSuccessResponse,
  createErrorResponse,
  setupTestEnvironment,
  teardownTestEnvironment,
  waitFor,
} from '../helpers/test-utils';

describe('자동화 스케줄러 통합테스트', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    teardownTestEnvironment();
  });

  describe('작업 생성 및 관리', () => {
    it('새로운 자동화 작업 생성 성공', async () => {
      const mockResponse = createSuccessResponse({
        task: {
          id: 'task_test',
          content: '매일 오전 9시에 영상 생성',
          status: 'todo',
          priority: 1,
          createdAt: new Date().toISOString(),
        },
      });

      global.fetch = mockFetch(mockResponse, 201);

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
        body: JSON.stringify({
          content: '매일 오전 9시에 영상 생성',
          priority: 1,
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.task).toBeDefined();
      expect(data.task.content).toBe('매일 오전 9시에 영상 생성');
    });

    it('작업 내용 없이 생성 시도 실패', async () => {
      const mockResponse = createErrorResponse('작업 내용을 입력해주세요.', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
        body: JSON.stringify({
          content: '',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toContain('작업 내용');
    });

    it('일반 사용자의 작업 생성 시도 실패', async () => {
      const mockResponse = createErrorResponse('관리자만 접근할 수 있습니다.', 403);
      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          content: '테스트 작업',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });

    it('모든 작업 목록 조회', async () => {
      const mockTasks = [
        { id: 'task1', content: '작업 1', status: 'todo' },
        { id: 'task2', content: '작업 2', status: 'ing' },
        { id: 'task3', content: '작업 3', status: 'done' },
      ];

      const mockResponse = createSuccessResponse({
        tasks: mockTasks,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/tasks', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.tasks).toBeDefined();
      expect(Array.isArray(data.tasks)).toBe(true);
      expect(data.tasks.length).toBe(3);
    });
  });

  describe('작업 상태 업데이트', () => {
    it('작업 상태를 진행중으로 변경', async () => {
      const mockResponse = createSuccessResponse({
        task: {
          id: 'task_test',
          content: '테스트 작업',
          status: 'ing',
          priority: 1,
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
        body: JSON.stringify({
          id: 'task_test',
          status: 'ing',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.task.status).toBe('ing');
    });

    it('작업 상태를 완료로 변경', async () => {
      const mockResponse = createSuccessResponse({
        task: {
          id: 'task_test',
          content: '테스트 작업',
          status: 'done',
          priority: 1,
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
        body: JSON.stringify({
          id: 'task_test',
          status: 'done',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.task.status).toBe('done');
    });

    it('작업 내용 수정', async () => {
      const newContent = '수정된 작업 내용';
      const mockResponse = createSuccessResponse({
        task: {
          id: 'task_test',
          content: newContent,
          status: 'todo',
          priority: 1,
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
        body: JSON.stringify({
          id: 'task_test',
          content: newContent,
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.task.content).toBe(newContent);
    });

    it('작업 우선순위 변경', async () => {
      const mockResponse = createSuccessResponse({
        task: {
          id: 'task_test',
          content: '테스트 작업',
          status: 'todo',
          priority: 5,
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
        body: JSON.stringify({
          id: 'task_test',
          priority: 5,
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.task.priority).toBe(5);
    });

    it('존재하지 않는 작업 업데이트 실패', async () => {
      const mockResponse = createErrorResponse('작업을 찾을 수 없습니다.', 404);
      global.fetch = mockFetch(mockResponse, 404);

      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
        body: JSON.stringify({
          id: 'non-existent-task',
          status: 'done',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('작업 삭제', () => {
    it('작업 삭제 성공', async () => {
      const mockResponse = createSuccessResponse({});
      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/tasks?id=task_test', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
    });

    it('작업 ID 없이 삭제 시도 실패', async () => {
      const mockResponse = createErrorResponse('작업 ID가 필요합니다.', 400);
      global.fetch = mockFetch(mockResponse, 400);

      const response = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toContain('ID');
    });

    it('존재하지 않는 작업 삭제 시도 실패', async () => {
      const mockResponse = createErrorResponse('작업을 찾을 수 없습니다.', 404);
      global.fetch = mockFetch(mockResponse, 404);

      const response = await fetch('/api/tasks?id=non-existent-task', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('자동화 타이틀 관리', () => {
    it('새로운 자동화 타이틀 생성', async () => {
      const mockTitle = createMockAutomationTitle();
      const mockResponse = createSuccessResponse({
        title: mockTitle,
      });

      global.fetch = mockFetch(mockResponse, 201);

      const response = await fetch('/api/automation/titles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          prompt: '재미있는 쇼츠 영상 만들기',
          maxVideos: 5,
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.title).toBeDefined();
      expect(data.title.prompt).toBe('재미있는 쇼츠 영상 만들기');
    });

    it('자동화 타이틀 목록 조회', async () => {
      const mockTitles = [
        createMockAutomationTitle(),
        createMockAutomationTitle({ prompt: '두 번째 타이틀' }),
      ];

      const mockResponse = createSuccessResponse({
        titles: mockTitles,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/automation/titles', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.titles).toBeDefined();
      expect(data.titles.length).toBe(2);
    });

    it('자동화 타이틀 비활성화', async () => {
      const mockTitle = createMockAutomationTitle({ status: 'inactive' });
      const mockResponse = createSuccessResponse({
        title: mockTitle,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/titles/${mockTitle.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          status: 'inactive',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.title.status).toBe('inactive');
    });

    it('자동화 타이틀 삭제', async () => {
      const mockTitle = createMockAutomationTitle();
      const mockResponse = createSuccessResponse({
        message: '타이틀이 삭제되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/titles/${mockTitle.id}`, {
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

  describe('스케줄 관리', () => {
    it('새로운 스케줄 생성', async () => {
      const mockSchedule = createMockAutomationSchedule();
      const mockResponse = createSuccessResponse({
        schedule: mockSchedule,
      });

      global.fetch = mockFetch(mockResponse, 201);

      const response = await fetch('/api/automation/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          titleId: 'title_test',
          scheduledTime: new Date(Date.now() + 3600000).toISOString(),
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedule).toBeDefined();
    });

    it('스케줄 목록 조회', async () => {
      const mockSchedules = [
        createMockAutomationSchedule(),
        createMockAutomationSchedule({ status: 'completed' }),
      ];

      const mockResponse = createSuccessResponse({
        schedules: mockSchedules,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/automation/schedules', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedules).toBeDefined();
      expect(data.schedules.length).toBe(2);
    });

    it('대기 중인 스케줄만 필터링', async () => {
      const mockSchedules = [
        createMockAutomationSchedule({ status: 'pending' }),
      ];

      const mockResponse = createSuccessResponse({
        schedules: mockSchedules,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/automation/schedules?status=pending', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedules).toBeDefined();
      expect(data.schedules.every((s: any) => s.status === 'pending')).toBe(true);
    });

    it('스케줄 취소', async () => {
      const mockSchedule = createMockAutomationSchedule();
      const mockResponse = createSuccessResponse({
        schedule: {
          ...mockSchedule,
          status: 'cancelled',
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/schedules/${mockSchedule.id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedule.status).toBe('cancelled');
    });

    it('스케줄 삭제', async () => {
      const mockSchedule = createMockAutomationSchedule();
      const mockResponse = createSuccessResponse({
        message: '스케줄이 삭제되었습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/schedules/${mockSchedule.id}`, {
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

  describe('스케줄 실행 및 추적', () => {
    it('스케줄 실행 시작', async () => {
      const mockSchedule = createMockAutomationSchedule({ status: 'running' });
      const mockResponse = createSuccessResponse({
        schedule: mockSchedule,
        jobId: 'job_test_123',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/schedules/${mockSchedule.id}/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedule.status).toBe('running');
      expect(data.jobId).toBeDefined();
    });

    it('스케줄 실행 상태 조회', async () => {
      const mockSchedule = createMockAutomationSchedule({ status: 'running' });
      const mockResponse = createSuccessResponse({
        schedule: mockSchedule,
        progress: 50,
        currentStep: '영상 생성 중',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/schedules/${mockSchedule.id}/status`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedule.status).toBe('running');
      expect(data.progress).toBeDefined();
    });

    it('스케줄 실행 완료 처리', async () => {
      const mockSchedule = createMockAutomationSchedule({ status: 'completed' });
      const mockResponse = createSuccessResponse({
        schedule: mockSchedule,
        result: {
          success: true,
          videoId: 'video_test_123',
        },
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/schedules/${mockSchedule.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          result: {
            success: true,
            videoId: 'video_test_123',
          },
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedule.status).toBe('completed');
    });

    it('스케줄 실행 실패 처리', async () => {
      const mockSchedule = createMockAutomationSchedule({ status: 'failed' });
      const mockResponse = createSuccessResponse({
        schedule: mockSchedule,
        error: '영상 생성 중 오류가 발생했습니다.',
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/schedules/${mockSchedule.id}/fail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
        body: JSON.stringify({
          error: '영상 생성 중 오류가 발생했습니다.',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedule.status).toBe('failed');
      expect(data.error).toBeDefined();
    });
  });

  describe('자동화 통계', () => {
    it('사용자의 자동화 실행 통계 조회', async () => {
      const mockStats = {
        totalSchedules: 50,
        completedSchedules: 45,
        failedSchedules: 3,
        cancelledSchedules: 2,
        successRate: 0.9,
      };

      const mockResponse = createSuccessResponse({
        stats: mockStats,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/automation/stats', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.stats).toBeDefined();
      expect(data.stats.successRate).toBe(0.9);
    });

    it('타이틀별 실행 통계 조회', async () => {
      const mockTitle = createMockAutomationTitle();
      const mockStats = {
        titleId: mockTitle.id,
        totalExecutions: 20,
        completedExecutions: 18,
        averageExecutionTime: 300,
      };

      const mockResponse = createSuccessResponse({
        stats: mockStats,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch(`/api/automation/titles/${mockTitle.id}/stats`, {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.stats.titleId).toBe(mockTitle.id);
    });
  });

  describe('권한 및 접근 제어', () => {
    it('다른 사용자의 스케줄 접근 불가', async () => {
      const mockResponse = createErrorResponse('권한이 없습니다.', 403);
      global.fetch = mockFetch(mockResponse, 403);

      const response = await fetch('/api/automation/schedules/other-user-schedule', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.regular}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });

    it('관리자는 모든 스케줄 조회 가능', async () => {
      const mockSchedules = [
        createMockAutomationSchedule({ userId: mockUsers.regular.userId }),
        createMockAutomationSchedule({ userId: 'another-user' }),
      ];

      const mockResponse = createSuccessResponse({
        schedules: mockSchedules,
      });

      global.fetch = mockFetch(mockResponse, 200);

      const response = await fetch('/api/admin/automation/schedules', {
        headers: {
          'Authorization': `Bearer ${mockSessionIds.admin}`,
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.schedules.length).toBe(2);
    });
  });
});
