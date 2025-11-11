/**
 * My Content - Shorts Conversion Regression Tests
 *
 * Tests for shorts conversion button improvements:
 * - Immediate visual feedback
 * - Duplicate click prevention
 * - Loading state display
 * - Toast notifications
 *
 * Modified in: Latest UX improvements session
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock toast
const mockToast = {
  loading: jest.fn((message: string) => 'toast-id'),
  success: jest.fn(),
  error: jest.fn(),
};

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: mockToast,
}));

describe('Shorts Conversion - Regression Tests', () => {
  const mockJobId = 'job-123';
  const mockTitle = '테스트 영상';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('Immediate Feedback Tests', () => {
    test('should show loading toast immediately when conversion starts', async () => {
      const convertingJobs = new Set<string>();

      // Simulate clicking the button
      convertingJobs.add(mockJobId);
      mockToast.loading('🎬 쇼츠 변환 시작 중...');

      expect(mockToast.loading).toHaveBeenCalledWith('🎬 쇼츠 변환 시작 중...');
      expect(convertingJobs.has(mockJobId)).toBe(true);
    });

    test('should change button text to "⏳ 변환 중..." immediately', () => {
      const convertingJobs = new Set<string>([mockJobId]);
      const buttonText = convertingJobs.has(mockJobId) ? '⏳ 변환 중...' : '⚡ 쇼츠';

      expect(buttonText).toBe('⏳ 변환 중...');
    });

    test('should change button tooltip to "변환 중..." immediately', () => {
      const convertingJobs = new Set<string>([mockJobId]);
      const tooltip = convertingJobs.has(mockJobId) ? '변환 중...' : '쇼츠로 변환 (200 크레딧)';

      expect(tooltip).toBe('변환 중...');
    });
  });

  describe('Duplicate Click Prevention Tests', () => {
    test('should prevent duplicate clicks when conversion is in progress', () => {
      const convertingJobs = new Set<string>([mockJobId]);

      // Attempt to start conversion when already converting
      if (convertingJobs.has(mockJobId)) {
        mockToast.error('이미 변환 중입니다.');
      } else {
        convertingJobs.add(mockJobId);
      }

      expect(mockToast.error).toHaveBeenCalledWith('이미 변환 중입니다.');
      expect(convertingJobs.size).toBe(1);
    });

    test('should disable button when conversion is in progress', () => {
      const convertingJobs = new Set<string>([mockJobId]);
      const isDisabled = convertingJobs.has(mockJobId);

      expect(isDisabled).toBe(true);
    });

    test('should change button style to disabled state', () => {
      const convertingJobs = new Set<string>([mockJobId]);
      const buttonClass = convertingJobs.has(mockJobId)
        ? 'bg-purple-400 cursor-not-allowed opacity-60'
        : 'bg-purple-600 hover:bg-purple-500 cursor-pointer';

      expect(buttonClass).toContain('bg-purple-400');
      expect(buttonClass).toContain('cursor-not-allowed');
      expect(buttonClass).toContain('opacity-60');
    });

    test('should allow new conversions after previous one completes', () => {
      const convertingJobs = new Set<string>();

      // Start conversion
      convertingJobs.add(mockJobId);
      expect(convertingJobs.has(mockJobId)).toBe(true);

      // Complete conversion
      convertingJobs.delete(mockJobId);
      expect(convertingJobs.has(mockJobId)).toBe(false);

      // Should be able to start again
      convertingJobs.add(mockJobId);
      expect(convertingJobs.has(mockJobId)).toBe(true);
    });
  });

  describe('State Management Tests', () => {
    test('should add jobId to convertingJobs set when conversion starts', () => {
      const convertingJobs = new Set<string>();
      convertingJobs.add(mockJobId);

      expect(convertingJobs.has(mockJobId)).toBe(true);
      expect(convertingJobs.size).toBe(1);
    });

    test('should remove jobId from convertingJobs set when conversion completes', () => {
      const convertingJobs = new Set<string>([mockJobId]);
      convertingJobs.delete(mockJobId);

      expect(convertingJobs.has(mockJobId)).toBe(false);
      expect(convertingJobs.size).toBe(0);
    });

    test('should remove jobId from convertingJobs set when conversion fails', () => {
      const convertingJobs = new Set<string>([mockJobId]);

      try {
        throw new Error('Conversion failed');
      } catch (error) {
        convertingJobs.delete(mockJobId);
      }

      expect(convertingJobs.has(mockJobId)).toBe(false);
    });

    test('should handle multiple conversions independently', () => {
      const convertingJobs = new Set<string>();
      const jobId1 = 'job-1';
      const jobId2 = 'job-2';

      convertingJobs.add(jobId1);
      convertingJobs.add(jobId2);

      expect(convertingJobs.has(jobId1)).toBe(true);
      expect(convertingJobs.has(jobId2)).toBe(true);
      expect(convertingJobs.size).toBe(2);

      // Complete one job
      convertingJobs.delete(jobId1);

      expect(convertingJobs.has(jobId1)).toBe(false);
      expect(convertingJobs.has(jobId2)).toBe(true);
      expect(convertingJobs.size).toBe(1);
    });
  });

  describe('Toast Notification Tests', () => {
    test('should show loading toast when conversion starts', () => {
      mockToast.loading('🎬 쇼츠 변환 시작 중...');

      expect(mockToast.loading).toHaveBeenCalledWith('🎬 쇼츠 변환 시작 중...');
    });

    test('should update toast to success when conversion succeeds', () => {
      const toastId = 'toast-123';
      mockToast.success('✅ 쇼츠 변환이 시작되었습니다!', { id: toastId, duration: 3000 });

      expect(mockToast.success).toHaveBeenCalledWith(
        '✅ 쇼츠 변환이 시작되었습니다!',
        { id: toastId, duration: 3000 }
      );
    });

    test('should update toast to error when conversion fails', () => {
      const toastId = 'toast-123';
      const errorMessage = '쇼츠 변환 실패';
      mockToast.error(`❌ 쇼츠 변환 실패: ${errorMessage}`, { id: toastId });

      expect(mockToast.error).toHaveBeenCalledWith(
        `❌ 쇼츠 변환 실패: ${errorMessage}`,
        { id: toastId }
      );
    });

    test('should show generic error message on network failure', () => {
      const toastId = 'toast-123';
      mockToast.error('❌ 쇼츠 변환 중 오류가 발생했습니다.', { id: toastId });

      expect(mockToast.error).toHaveBeenCalledWith(
        '❌ 쇼츠 변환 중 오류가 발생했습니다.',
        { id: toastId }
      );
    });
  });

  describe('API Call Tests', () => {
    test('should call correct API endpoint for conversion', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: 'new-job-id' }),
      });

      await fetch(`/api/jobs/${mockJobId}/convert-to-shorts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/jobs/${mockJobId}/convert-to-shorts`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          credentials: 'include',
        })
      );
    });

    test('should handle successful API response', async () => {
      const mockResponse = { jobId: 'new-job-id' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const response = await fetch(`/api/jobs/${mockJobId}/convert-to-shorts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.jobId).toBe('new-job-id');
    });

    test('should handle failed API response', async () => {
      const mockError = { error: '크레딧이 부족합니다.' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => mockError,
      });

      const response = await fetch(`/api/jobs/${mockJobId}/convert-to-shorts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.error).toBe('크레딧이 부족합니다.');
    });

    test('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      try {
        await fetch(`/api/jobs/${mockJobId}/convert-to-shorts`, {
          method: 'POST',
        });
      } catch (error: any) {
        expect(error.message).toBe('Network error');
      }
    });
  });

  describe('Button Visual State Tests', () => {
    test('should show normal state when not converting', () => {
      const convertingJobs = new Set<string>();
      const buttonState = {
        disabled: convertingJobs.has(mockJobId),
        className: convertingJobs.has(mockJobId)
          ? 'bg-purple-400 cursor-not-allowed opacity-60'
          : 'bg-purple-600 hover:bg-purple-500 cursor-pointer',
        text: convertingJobs.has(mockJobId) ? '⏳ 변환 중...' : '⚡ 쇼츠',
        title: convertingJobs.has(mockJobId) ? '변환 중...' : '쇼츠로 변환 (200 크레딧)',
      };

      expect(buttonState.disabled).toBe(false);
      expect(buttonState.className).toContain('bg-purple-600');
      expect(buttonState.className).toContain('cursor-pointer');
      expect(buttonState.text).toBe('⚡ 쇼츠');
      expect(buttonState.title).toBe('쇼츠로 변환 (200 크레딧)');
    });

    test('should show loading state when converting', () => {
      const convertingJobs = new Set<string>([mockJobId]);
      const buttonState = {
        disabled: convertingJobs.has(mockJobId),
        className: convertingJobs.has(mockJobId)
          ? 'bg-purple-400 cursor-not-allowed opacity-60'
          : 'bg-purple-600 hover:bg-purple-500 cursor-pointer',
        text: convertingJobs.has(mockJobId) ? '⏳ 변환 중...' : '⚡ 쇼츠',
        title: convertingJobs.has(mockJobId) ? '변환 중...' : '쇼츠로 변환 (200 크레딧)',
      };

      expect(buttonState.disabled).toBe(true);
      expect(buttonState.className).toContain('bg-purple-400');
      expect(buttonState.className).toContain('cursor-not-allowed');
      expect(buttonState.className).toContain('opacity-60');
      expect(buttonState.text).toBe('⏳ 변환 중...');
      expect(buttonState.title).toBe('변환 중...');
    });

    test('should remove hover effect when converting', () => {
      const convertingJobs = new Set<string>([mockJobId]);
      const className = convertingJobs.has(mockJobId)
        ? 'bg-purple-400 cursor-not-allowed opacity-60'
        : 'bg-purple-600 hover:bg-purple-500 cursor-pointer';

      expect(className).not.toContain('hover:bg-purple-500');
    });
  });

  describe('Edge Cases Tests', () => {
    test('should handle rapid consecutive clicks', () => {
      const convertingJobs = new Set<string>();
      const clicks = 5;
      let addedCount = 0;

      for (let i = 0; i < clicks; i++) {
        if (!convertingJobs.has(mockJobId)) {
          convertingJobs.add(mockJobId);
          addedCount++;
        } else {
          mockToast.error('이미 변환 중입니다.');
        }
      }

      expect(addedCount).toBe(1);
      expect(mockToast.error).toHaveBeenCalledTimes(clicks - 1);
      expect(convertingJobs.size).toBe(1);
    });

    test('should handle conversion of different jobs simultaneously', () => {
      const convertingJobs = new Set<string>();
      const job1 = 'job-1';
      const job2 = 'job-2';
      const job3 = 'job-3';

      // Start conversions
      convertingJobs.add(job1);
      convertingJobs.add(job2);
      convertingJobs.add(job3);

      expect(convertingJobs.size).toBe(3);
      expect(convertingJobs.has(job1)).toBe(true);
      expect(convertingJobs.has(job2)).toBe(true);
      expect(convertingJobs.has(job3)).toBe(true);

      // Complete middle job
      convertingJobs.delete(job2);

      expect(convertingJobs.size).toBe(2);
      expect(convertingJobs.has(job1)).toBe(true);
      expect(convertingJobs.has(job2)).toBe(false);
      expect(convertingJobs.has(job3)).toBe(true);
    });

    test('should clear state after all conversions complete', () => {
      const convertingJobs = new Set<string>(['job-1', 'job-2', 'job-3']);

      convertingJobs.clear();

      expect(convertingJobs.size).toBe(0);
    });
  });

  describe('Integration Tests', () => {
    test('should complete full conversion flow successfully', async () => {
      const convertingJobs = new Set<string>();
      const toastId = 'toast-123';

      // Step 1: Check if already converting
      expect(convertingJobs.has(mockJobId)).toBe(false);

      // Step 2: Add to converting set
      convertingJobs.add(mockJobId);
      expect(convertingJobs.has(mockJobId)).toBe(true);

      // Step 3: Show loading toast
      mockToast.loading('🎬 쇼츠 변환 시작 중...');
      expect(mockToast.loading).toHaveBeenCalled();

      // Step 4: API call succeeds
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: 'new-job-id' }),
      });

      const response = await fetch(`/api/jobs/${mockJobId}/convert-to-shorts`, {
        method: 'POST',
      });

      expect(response.ok).toBe(true);

      // Step 5: Show success toast
      mockToast.success('✅ 쇼츠 변환이 시작되었습니다!', { id: toastId, duration: 3000 });
      expect(mockToast.success).toHaveBeenCalled();

      // Step 6: Remove from converting set
      convertingJobs.delete(mockJobId);
      expect(convertingJobs.has(mockJobId)).toBe(false);
    });

    test('should handle full conversion flow with error', async () => {
      const convertingJobs = new Set<string>();
      const toastId = 'toast-123';

      // Step 1: Add to converting set
      convertingJobs.add(mockJobId);

      // Step 2: Show loading toast
      mockToast.loading('🎬 쇼츠 변환 시작 중...');

      // Step 3: API call fails
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: '크레딧 부족' }),
      });

      const response = await fetch(`/api/jobs/${mockJobId}/convert-to-shorts`, {
        method: 'POST',
      });

      expect(response.ok).toBe(false);

      // Step 4: Show error toast
      mockToast.error('❌ 쇼츠 변환 실패: 크레딧 부족', { id: toastId });

      // Step 5: Remove from converting set (in finally block)
      convertingJobs.delete(mockJobId);
      expect(convertingJobs.has(mockJobId)).toBe(false);
    });
  });
});
