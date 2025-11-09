-- 마이그레이션: scripts + jobs → contents

-- 1. 새 테이블 생성
-- (schema-contents.sql 먼저 실행)

-- 2. 기존 scripts 데이터 마이그레이션
INSERT INTO contents (
  id, user_id, type, format, title, original_title, content,
  status, progress, error, input_tokens, output_tokens,
  created_at, updated_at
)
SELECT
  id,
  user_id,
  'script' as type,
  type as format,  -- 'longform' | 'shortform' | 'sora2'
  title,
  original_topic as original_title,
  content,
  status,
  progress,
  error,
  input_tokens,
  output_tokens,
  created_at,
  updated_at
FROM scripts;

-- 3. 기존 jobs 데이터 마이그레이션
INSERT INTO contents (
  id, user_id, type, format, title, video_path, thumbnail_path,
  status, progress, error, created_at, updated_at
)
SELECT
  id,
  user_id,
  'video' as type,
  type as format,
  COALESCE(title, '제목 없음') as title,
  video_url as video_path,
  thumbnail_path,
  CASE
    WHEN status = 'cancelled' THEN 'failed'
    ELSE status
  END as status,
  progress,
  error,
  created_at,
  updated_at
FROM jobs;

-- 4. 로그 마이그레이션 (script_logs)
INSERT INTO content_logs (content_id, log_message, created_at)
SELECT script_id, log_message, created_at
FROM script_logs;

-- 5. 로그 마이그레이션 (job_logs)
INSERT INTO content_logs (content_id, log_message, created_at)
SELECT job_id, log_message, created_at
FROM job_logs;

-- 6. 기존 테이블 제거 (백업 후 실행)
-- DROP TABLE scripts;
-- DROP TABLE scripts_temp;
-- DROP TABLE script_logs;
-- DROP TABLE jobs;
-- DROP TABLE job_logs;
