-- scripts_temp → contents 마이그레이션

-- scripts_temp 데이터를 contents로 이동
INSERT INTO contents (
  id, user_id, type, format, title, original_title, content,
  status, progress, pid, use_claude_local, created_at, updated_at
)
SELECT
  -- scriptId가 있으면 그걸 사용, 없으면 task id 사용
  COALESCE(st.scriptId, st.id) as id,

  -- user_id: scripts_temp에는 없으므로 scripts에서 가져오기
  COALESCE(s.user_id, '') as user_id,

  'script' as type,

  -- format: type 컬럼 사용
  st.type as format,

  st.title,
  st.originalTitle as original_title,

  -- content: scripts 테이블에서 가져오기
  s.content,

  -- status 매핑
  CASE
    WHEN st.status = 'DONE' THEN 'completed'
    WHEN st.status = 'ERROR' THEN 'failed'
    WHEN st.status = 'PENDING' THEN 'pending'
    ELSE 'processing'
  END as status,

  -- progress: DONE이면 100, 아니면 0
  CASE
    WHEN st.status = 'DONE' THEN 100
    ELSE 0
  END as progress,

  st.pid,
  st.useClaudeLocal as use_claude_local,
  st.createdAt as created_at,
  st.createdAt as updated_at
FROM scripts_temp st
LEFT JOIN scripts s ON st.scriptId = s.id
WHERE NOT EXISTS (
  -- 중복 방지: 이미 contents에 있으면 제외
  SELECT 1 FROM contents c
  WHERE c.id = COALESCE(st.scriptId, st.id)
);

-- 로그 마이그레이션 (scripts_temp의 logs 컬럼)
-- JSON 배열 파싱은 복잡하므로 일단 생략 (필요시 Python으로 처리)
