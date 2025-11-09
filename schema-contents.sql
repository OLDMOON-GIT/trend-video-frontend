-- 통합 Contents 테이블 (scripts + jobs 통합)
-- 대본과 영상을 하나의 테이블로 관리

CREATE TABLE IF NOT EXISTS contents (
  -- 기본 정보
  id TEXT PRIMARY KEY,                    -- UUID (시간 정렬 가능)
  user_id TEXT NOT NULL,                  -- 사용자 ID

  -- 타입 구분
  type TEXT NOT NULL CHECK(type IN ('script', 'video')),  -- 컨텐츠 타입
  format TEXT CHECK(format IN ('longform', 'shortform', 'sora2', 'product')),  -- 포맷

  -- 내용
  title TEXT NOT NULL,                    -- 제목
  original_title TEXT,                    -- 원본 제목 (사용자 입력)
  content TEXT,                           -- 대본 내용 (type='script'일 때)

  -- 상태
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,             -- 진행률 (0-100)
  error TEXT,                             -- 에러 메시지

  -- 프로세스 관리
  pid INTEGER,                            -- 프로세스 ID (취소용)

  -- 영상 관련 (type='video'일 때)
  video_path TEXT,                        -- 영상 파일 경로
  thumbnail_path TEXT,                    -- 썸네일 경로
  published INTEGER DEFAULT 0,            -- 유튜브 업로드 여부 (0/1)
  published_at TEXT,                      -- 업로드 시간

  -- AI 사용량
  input_tokens INTEGER,                   -- 입력 토큰
  output_tokens INTEGER,                  -- 출력 토큰
  use_claude_local INTEGER DEFAULT 0,     -- 로컬 Claude 사용 여부 (0/1)\r\n  model TEXT,                                 -- 사용한 AI 모델

  -- 시간
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_contents_user_id ON contents(user_id);
CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(type);
CREATE INDEX IF NOT EXISTS idx_contents_format ON contents(format);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_created_at ON contents(created_at);
CREATE INDEX IF NOT EXISTS idx_contents_published ON contents(published);

-- 로그 테이블 (기존 job_logs, script_logs 통합)
CREATE TABLE IF NOT EXISTS content_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_logs_content_id ON content_logs(content_id);

