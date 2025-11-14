/**
 * 영상 생성 작업 상태 관리 (메모리 기반)
 * 프로덕션에서는 Redis 등 사용 권장
 */

export type VideoJobStatus = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  step: string;
  videoPath?: string;
  thumbnailPath?: string;
  videoId?: string;
  error?: string;
};

export const videoJobs = new Map<string, VideoJobStatus>();
