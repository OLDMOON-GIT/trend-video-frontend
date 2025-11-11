/**
 * 씬 데이터 타입 정의
 *
 * Backend의 씬 처리 로직과 연동
 * - seq: 명시적 순서 (우선순위 1)
 * - created_at: 생성 시간 (우선순위 2)
 * - 둘 다 없으면 원래 순서 유지 (우선순위 3)
 */

export interface Scene {
  /** 씬 번호 */
  scene_number?: number;

  /** 제목 */
  title?: string;

  /** 나레이션 텍스트 */
  narration?: string;

  /** 이미지 프롬프트 */
  image_prompt?: string;

  /** Sora 프롬프트 */
  sora_prompt?: string;

  /** 지속 시간 (초) */
  duration?: number;
  duration_seconds?: number;

  /** 명시적 순서 번호 (우선순위 1) */
  seq?: number | null;

  /** 생성 시간 ISO 8601 (우선순위 2) */
  created_at?: string | null;

  /** 기타 필드 허용 */
  [key: string]: any;
}

/**
 * 비디오/이미지 미디어 데이터
 */
export interface SceneMedia {
  /** 씬 데이터 */
  scene: Scene;

  /** 미디어 타입 */
  media_type: 'image' | 'video';

  /** 미디어 파일 경로 */
  media_path: string;

  /** 이미지 파일 경로 (media_type='image'일 때) */
  image_path?: string | null;

  /** 비디오 파일 경로 (media_type='video'일 때) */
  video_path?: string | null;

  /** 씬 디렉토리 */
  scene_dir: string;

  /** 씬 번호 */
  scene_num: number;
}
