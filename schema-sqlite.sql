-- Trend Video SQLite Database Schema
-- Generated: 2025-11-01

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  nickname TEXT,
  is_admin INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 0,
  is_email_verified INTEGER DEFAULT 0,
  verification_token TEXT,
  memo TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Jobs table (video generation jobs)
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  step TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  title TEXT,
  video_url TEXT,
  error TEXT,
  thumbnail_path TEXT,
  type TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- Job logs table
CREATE TABLE IF NOT EXISTS job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);

-- Scripts table (AI generated scripts)
CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'completed',
  progress INTEGER DEFAULT 100,
  error TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  original_topic TEXT,
  type TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scripts_user_id ON scripts(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status);
CREATE INDEX IF NOT EXISTS idx_scripts_created_at ON scripts(created_at);

-- Script logs table
CREATE TABLE IF NOT EXISTS script_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_logs_script_id ON script_logs(script_id);

-- Credit history table
CREATE TABLE IF NOT EXISTS credit_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  balance_after INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_credit_history_user_id ON credit_history(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_history_created_at ON credit_history(created_at);

-- Charge requests table
CREATE TABLE IF NOT EXISTS charge_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_charge_requests_user_id ON charge_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_charge_requests_status ON charge_requests(status);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ai_script_cost INTEGER DEFAULT 25,
  video_generation_cost INTEGER DEFAULT 50,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- User activity logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);

-- Tasks table (admin task management)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'ing', 'done')),
  priority INTEGER DEFAULT 0,
  logs TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- Task logs table
CREATE TABLE IF NOT EXISTS task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);

-- Temporary scripts table (script generation tracking)
CREATE TABLE IF NOT EXISTS scripts_temp (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  message TEXT,
  createdAt TEXT NOT NULL,
  scriptId TEXT,
  logs TEXT DEFAULT '[]',
  type TEXT,
  pid INTEGER
);

-- Folders table (user-defined folders for organizing content)
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#8B5CF6',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);

-- YouTube uploads table (published videos)
CREATE TABLE IF NOT EXISTS youtube_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_id TEXT,
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  channel_id TEXT NOT NULL,
  channel_title TEXT,
  privacy_status TEXT,
  published_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_youtube_uploads_user_id ON youtube_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_uploads_video_id ON youtube_uploads(video_id);
CREATE INDEX IF NOT EXISTS idx_youtube_uploads_published_at ON youtube_uploads(published_at);

-- Chinese converter jobs table
CREATE TABLE IF NOT EXISTS chinese_converter_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  video_path TEXT,
  output_path TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chinese_converter_jobs_user_id ON chinese_converter_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_chinese_converter_jobs_status ON chinese_converter_jobs(status);
CREATE INDEX IF NOT EXISTS idx_chinese_converter_jobs_created_at ON chinese_converter_jobs(created_at);

-- Chinese converter job logs table
CREATE TABLE IF NOT EXISTS chinese_converter_job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  log_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES chinese_converter_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chinese_converter_job_logs_job_id ON chinese_converter_job_logs(job_id);

-- Crawl link history table (링크 모음 크롤링 최근 기록)
CREATE TABLE IF NOT EXISTS crawl_link_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  hostname TEXT,
  last_result_count INTEGER DEFAULT 0,
  last_duplicate_count INTEGER DEFAULT 0,
  last_error_count INTEGER DEFAULT 0,
  last_total_links INTEGER DEFAULT 0,
  last_status TEXT DEFAULT 'pending',
  last_message TEXT,
  last_job_id TEXT,
  last_crawled_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_link_history_user_source ON crawl_link_history(user_id, source_url);
CREATE INDEX IF NOT EXISTS idx_crawl_link_history_last_crawled ON crawl_link_history(last_crawled_at);

-- Shop versions table (Google Sites 배포 스냅샷 기록)
CREATE TABLE IF NOT EXISTS shop_versions (
  id TEXT PRIMARY KEY,
  version_number INTEGER,
  name TEXT,
  description TEXT,
  data TEXT NOT NULL,
  total_products INTEGER DEFAULT 0,
  is_published INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_shop_versions_created_at ON shop_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_shop_versions_published ON shop_versions(is_published, published_at);

-- Insert default settings if not exists
INSERT OR IGNORE INTO settings (id, ai_script_cost, video_generation_cost)
VALUES (1, 25, 50);
