import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import db from './sqlite';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CREDIT_HISTORY_FILE = path.join(DATA_DIR, 'credit_history.json');
const CHARGE_REQUESTS_FILE = path.join(DATA_DIR, 'charge_requests.json');
const USER_ACTIVITY_LOGS_FILE = path.join(DATA_DIR, 'user_activity_logs.json');
const USER_SESSIONS_FILE = path.join(DATA_DIR, 'user_sessions.json');
const SCRIPTS_FILE = path.join(DATA_DIR, 'scripts.json');
const YOUTUBE_CHANNELS_FILE = path.join(DATA_DIR, 'youtube_channels.json');

// Write queue to prevent concurrent writes
let writeQueue: Promise<void> = Promise.resolve();
let logBuffer: Map<string, string[]> = new Map();
let flushTimeout: NodeJS.Timeout | null = null;

// 데이터 디렉토리 초기화
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// 파일이 없으면 생성
async function ensureFile(filePath: string, defaultContent: string = '[]') {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, 'utf-8');
  }
}

// 사용자 타입
export interface User {
  id: string;
  email: string;
  password: string; // 해시된 비밀번호
  name: string; // 이름 (필수)
  phone: string; // 핸드폰번호 (필수)
  address: string; // 주소 (필수)
  kakaoId?: string; // 카카오톡 ID (선택)
  emailVerified: boolean; // 이메일 인증 여부
  emailVerificationToken?: string; // 이메일 인증 토큰
  credits: number; // 크레딧 잔액
  isAdmin: boolean; // 관리자 여부
  adminMemo?: string; // 관리자 메모
  createdAt: string;
}

// 작업 타입
export interface Job {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step: string;
  videoPath?: string;
  thumbnailPath?: string;
  error?: string;
  logs?: string[];
  createdAt: string;
  updatedAt: string;
  title?: string;
  type?: 'longform' | 'shortform' | 'sora2';
}

// 대본 타입
export interface Script {
  id: string;
  userId: string;
  title: string;
  originalTitle?: string; // 사용자가 입력한 원본 제목
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  logs?: string[]; // 진행 로그
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
  createdAt: string;
  updatedAt: string;
  type?: 'longform' | 'shortform' | 'sora2'; // 대본 타입
  useClaudeLocal?: boolean; // 로컬 Claude 사용 여부 (true: 로컬, false/undefined: API)
}

// 비밀번호 해시
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 사용자 데이터 읽기
export async function getUsers(): Promise<User[]> {
  await ensureDataDir();
  await ensureFile(USERS_FILE);
  const data = await fs.readFile(USERS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 사용자 저장
export async function saveUsers(users: User[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// 이메일로 사용자 찾기
export async function findUserByEmail(email: string): Promise<User | null> {
  const users = await getUsers();
  return users.find(u => u.email === email) || null;
}

// 사용자 생성
export async function createUser(
  email: string,
  password: string,
  name: string,
  phone: string,
  address: string,
  kakaoId?: string
): Promise<User> {
  const users = await getUsers();

  if (users.find(u => u.email === email)) {
    throw new Error('이미 존재하는 이메일입니다.');
  }

  // 관리자 기본 계정에는 초기 200000000 크레딧을 부여
  const isAdmin = email === 'moony75@gmail.com';
  const initialCredits = isAdmin ? 200000000 : 0;

  const emailVerificationToken = isAdmin ? undefined : crypto.randomBytes(32).toString('hex');
  const emailVerified = isAdmin;

  const user: User = {
    id: crypto.randomUUID(),
    email,
    password: hashPassword(password),
    name,
    phone,
    address,
    kakaoId,
    emailVerified,
    emailVerificationToken,
    credits: initialCredits,
    isAdmin: isAdmin,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  await saveUsers(users);

  return user;
}

// 이메일 인증
export async function verifyEmail(token: string): Promise<{ success: boolean; email?: string }> {
  const users = await getUsers();
  const user = users.find(u => u.emailVerificationToken === token);

  if (!user) {
    return { success: false };
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  await saveUsers(users);

  return { success: true, email: user.email };
}

// 사용자 업데이트
export async function updateUser(userId: string, updates: Partial<User>): Promise<void> {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  users[userIndex] = { ...users[userIndex], ...updates };
  await saveUsers(users);
}

export async function deleteUserById(userId: string): Promise<void> {
  const users = await getUsers();
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) {
    return;
  }

  users.splice(index, 1);
  await saveUsers(users);
}


// ==================== SQLite Job 함수들 ====================

// 작업 생성
export function createJob(userId: string, jobId: string, title?: string, type?: 'longform' | 'shortform' | 'sora2'): Job {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO jobs (id, user_id, status, progress, created_at, updated_at, title)
    VALUES (?, ?, 'pending', 0, ?, ?, ?)
  `);

  stmt.run(jobId, userId, now, now, title || null);

  return {
    id: jobId,
    userId,
    status: 'pending',
    progress: 0,
    step: '준비 중...',
    createdAt: now,
    updatedAt: now,
    title
  };
}

// 작업 조회
export function findJobById(jobId: string): Job | null {
  const stmt = db.prepare(`
    SELECT
      j.*,
      GROUP_CONCAT(jl.log_message, '
') as logs
    FROM jobs j
    LEFT JOIN job_logs jl ON j.id = jl.job_id
    WHERE j.id = ?
    GROUP BY j.id
  `);

  const row = stmt.get(jobId) as any;

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    step: row.step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    videoPath: row.video_path || row.video_url,
    thumbnailPath: row.thumbnail_path,
    error: row.error,
    logs: row.logs ? row.logs.split('\n') : []
  };
}

// 작업 업데이트
export function updateJob(jobId: string, updates: Partial<Job>): Job | null {
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    values.push(updates.progress);
  }
  if (updates.step !== undefined) {
    fields.push('step = ?');
    values.push(updates.step);
  }
  if (updates.videoPath !== undefined) {
    fields.push('video_path = ?');
    values.push(updates.videoPath);
  }
  if (updates.thumbnailPath !== undefined) {
    fields.push('thumbnail_path = ?');
    values.push(updates.thumbnailPath);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }

  fields.push('updated_at = ?');
  values.push(now);

  values.push(jobId);

  const stmt = db.prepare(`
    UPDATE jobs
    SET ${fields.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...values);

  return findJobById(jobId);
}

// 로그 추가
export function addJobLog(jobId: string, logMessage: string): void {
  const stmt = db.prepare(`
    INSERT INTO job_logs (job_id, log_message)
    VALUES (?, ?)
  `);

  stmt.run(jobId, logMessage);
}

// 로그 일괄 추가
export function addJobLogs(jobId: string, logs: string[]): void {
  const stmt = db.prepare(`
    INSERT INTO job_logs (job_id, log_message)
    VALUES (?, ?)
  `);

  const insertMany = db.transaction((logs: string[]) => {
    for (const log of logs) {
      stmt.run(jobId, log);
    }
  });

  insertMany(logs);
}

// 사용자별 작업 목록 조회
export function getJobsByUserId(userId: string, limit: number = 10, offset: number = 0): Job[] {
  const stmt = db.prepare(`
    SELECT
      j.*,
      (SELECT GROUP_CONCAT(jl.log_message, '
')
       FROM job_logs jl
       WHERE jl.job_id = j.id) as logs
    FROM jobs j
    WHERE j.user_id = ?
    ORDER BY j.created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(userId, limit, offset) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    step: row.step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    videoPath: row.video_path || row.video_url,
    thumbnailPath: row.thumbnail_path,
    error: row.error,
    logs: row.logs ? row.logs.split('\n') : []
  }));
}

// 진행 중인 작업 목록
export function getActiveJobsByUserId(userId: string): Job[] {
  const stmt = db.prepare(`
    SELECT
      j.*,
      (SELECT GROUP_CONCAT(jl.log_message, '
')
       FROM job_logs jl
       WHERE jl.job_id = j.id) as logs
    FROM jobs j
    WHERE j.user_id = ? AND (j.status = 'pending' OR j.status = 'processing')
    ORDER BY j.created_at DESC
  `);

  const rows = stmt.all(userId) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    step: row.step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    videoPath: row.video_path || row.video_url,
    thumbnailPath: row.thumbnail_path,
    error: row.error,
    logs: row.logs ? row.logs.split('\n') : []
  }));
}

// 작업 삭제
export function deleteJob(jobId: string): boolean {
  const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
  const result = stmt.run(jobId);
  return result.changes > 0;
}

// 즉시 로그 플러시 (호환성을 위해 빈 함수로 유지)
export async function flushJobLogs(): Promise<void> {
  // SQLite는 즉시 쓰기이므로 플러시 불필요
}

// ==================== 크레딧 시스템 ====================

// 크레딧 설정 타입
export interface CreditSettings {
  aiScriptCost: number; // AI 대본 생성 비용
  videoGenerationCost: number; // 영상 생성 비용
  scriptGenerationCost?: number; // 대본 재생성 비용 (선택적)
}

// 크레딧 히스토리 타입
export interface CreditHistory {
  id: string;
  userId: string;
  type: 'charge' | 'use' | 'refund'; // 충전, 사용, 환불
  amount: number; // 양수: 증가, 음수: 감소
  balance: number; // 거래 후 잔액
  description: string; // 설명 (예: "영상 생성", "크레딧 충전")
  createdAt: string;
}

// 기본 크레딧 설정
const DEFAULT_SETTINGS: CreditSettings = {
  aiScriptCost: 50,
  videoGenerationCost: 40
};

// 설정 읽기
export async function getSettings(): Promise<CreditSettings> {
  await ensureDataDir();
  await ensureFile(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 설정 저장
export async function saveSettings(settings: CreditSettings): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// 사용자 크레딧 추가
export async function addCredits(userId: string, amount: number): Promise<User | null> {
  const users = await getUsers();
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) return null;

  users[index].credits = (users[index].credits || 0) + amount;
  await saveUsers(users);

  return users[index];
}

// 사용자 크레딧 차감
export async function deductCredits(userId: string, amount: number): Promise<{ success: boolean; balance: number; error?: string }> {
  const users = await getUsers();
  const index = users.findIndex(u => u.id === userId);

  if (index === -1) {
    return { success: false, balance: 0, error: '사용자를 찾을 수 없습니다.' };
  }

  const currentBalance = users[index].credits || 0;

  if (currentBalance < amount) {
    return { success: false, balance: currentBalance, error: '크레딧이 부족합니다.' };
  }

  users[index].credits = currentBalance - amount;
  await saveUsers(users);

  return { success: true, balance: users[index].credits };
}

// 사용자 크레딧 조회
export async function getUserCredits(userId: string): Promise<number> {
  const users = await getUsers();
  const user = users.find(u => u.id === userId);
  return user?.credits || 0;
}

// 이메일로 크레딧 추가
export async function addCreditsByEmail(email: string, amount: number): Promise<User | null> {
  const users = await getUsers();
  const index = users.findIndex(u => u.email === email);

  if (index === -1) return null;

  users[index].credits = (users[index].credits || 0) + amount;
  await saveUsers(users);

  return users[index];
}

// ==================== 크레딧 히스토리 ====================

// 히스토리 읽기
export async function getCreditHistory(): Promise<CreditHistory[]> {
  await ensureDataDir();
  await ensureFile(CREDIT_HISTORY_FILE);
  const data = await fs.readFile(CREDIT_HISTORY_FILE, 'utf-8');
  return JSON.parse(data);
}

// 히스토리 저장
export async function saveCreditHistory(history: CreditHistory[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CREDIT_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

// 히스토리 추가
export async function addCreditHistory(
  userId: string,
  type: 'charge' | 'use' | 'refund',
  amount: number,
  description: string
): Promise<CreditHistory> {
  const history = await getCreditHistory();
  const currentBalance = await getUserCredits(userId);

  const record: CreditHistory = {
    id: crypto.randomUUID(),
    userId,
    type,
    amount,
    balance: currentBalance,
    description,
    createdAt: new Date().toISOString()
  };

  history.push(record);
  await saveCreditHistory(history);

  return record;
}

// 사용자별 히스토리 조회
export async function getCreditHistoryByUserId(userId: string): Promise<CreditHistory[]> {
  const history = await getCreditHistory();
  return history
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ==================== 크레딧 충전 요청 ====================

// 충전 요청 타입
export interface ChargeRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: number; // 요청 크레딧 금액
  status: 'pending' | 'approved' | 'rejected'; // 대기중, 승인됨, 거부됨
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string; // 승인한 관리자 이메일
  rejectedAt?: string;
  rejectedBy?: string; // 거부한 관리자 이메일
  memo?: string; // 관리자 메모
}

// 충전 요청 읽기
export async function getChargeRequests(): Promise<ChargeRequest[]> {
  await ensureDataDir();
  await ensureFile(CHARGE_REQUESTS_FILE);
  const data = await fs.readFile(CHARGE_REQUESTS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 충전 요청 저장
export async function saveChargeRequests(requests: ChargeRequest[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CHARGE_REQUESTS_FILE, JSON.stringify(requests, null, 2), 'utf-8');
}

// 충전 요청 생성
export async function createChargeRequest(userId: string, amount: number): Promise<ChargeRequest> {
  const users = await getUsers();
  const user = users.find(u => u.id === userId);

  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }

  const requests = await getChargeRequests();

  const request: ChargeRequest = {
    id: crypto.randomUUID(),
    userId,
    userName: user.name,
    userEmail: user.email,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  requests.push(request);
  await saveChargeRequests(requests);

  return request;
}

// 충전 요청 승인
export async function approveChargeRequest(requestId: string, adminEmail: string): Promise<ChargeRequest | null> {
  const requests = await getChargeRequests();
  const index = requests.findIndex(r => r.id === requestId);

  if (index === -1) return null;

  const request = requests[index];

  if (request.status !== 'pending') {
    throw new Error('이미 처리된 요청입니다.');
  }

  // 크레딧 부여
  await addCredits(request.userId, request.amount);

  // 히스토리 추가
  await addCreditHistory(
    request.userId,
    'charge',
    request.amount,
    `충전 요청 승인 (관리자: ${adminEmail})`
  );

  // 요청 상태 업데이트
  requests[index].status = 'approved';
  requests[index].approvedAt = new Date().toISOString();
  requests[index].approvedBy = adminEmail;

  await saveChargeRequests(requests);

  return requests[index];
}

// 충전 요청 거부
export async function rejectChargeRequest(requestId: string, adminEmail: string, memo?: string): Promise<ChargeRequest | null> {
  const requests = await getChargeRequests();
  const index = requests.findIndex(r => r.id === requestId);

  if (index === -1) return null;

  const request = requests[index];

  if (request.status !== 'pending') {
    throw new Error('이미 처리된 요청입니다.');
  }

  // 요청 상태 업데이트
  requests[index].status = 'rejected';
  requests[index].rejectedAt = new Date().toISOString();
  requests[index].rejectedBy = adminEmail;
  if (memo) requests[index].memo = memo;

  await saveChargeRequests(requests);

  return requests[index];
}

// 사용자별 충전 요청 조회
export async function getChargeRequestsByUserId(userId: string): Promise<ChargeRequest[]> {
  const requests = await getChargeRequests();
  return requests
    .filter(r => r.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ==================== 사용자 활동 로그 ====================

// 활동 로그 타입
export interface UserActivityLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string; // 액션 타입 (예: 'login', 'logout', 'generate_video', 'search_youtube', etc.)
  details?: string; // 상세 정보
  ipAddress?: string; // IP 주소
  userAgent?: string; // User Agent
  createdAt: string;
}

// 사용자 세션 타입
export interface UserSession {
  id: string;
  userId: string;
  userEmail: string;
  loginAt: string;
  lastActivityAt: string;
  logoutAt?: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean; // 현재 활성 세션 여부
}

// 활동 로그 읽기
export async function getUserActivityLogs(): Promise<UserActivityLog[]> {
  await ensureDataDir();
  await ensureFile(USER_ACTIVITY_LOGS_FILE);
  const data = await fs.readFile(USER_ACTIVITY_LOGS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 활동 로그 저장
export async function saveUserActivityLogs(logs: UserActivityLog[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USER_ACTIVITY_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
}

// 활동 로그 추가
export async function addUserActivityLog(
  userId: string,
  userEmail: string,
  action: string,
  details?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<UserActivityLog> {
  const logs = await getUserActivityLogs();

  const log: UserActivityLog = {
    id: crypto.randomUUID(),
    userId,
    userEmail,
    action,
    details,
    ipAddress,
    userAgent,
    createdAt: new Date().toISOString()
  };

  logs.push(log);
  await saveUserActivityLogs(logs);

  return log;
}

// 사용자별 활동 로그 조회
export async function getUserActivityLogsByUserId(userId: string, limit?: number): Promise<UserActivityLog[]> {
  const logs = await getUserActivityLogs();
  const filtered = logs
    .filter(l => l.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return limit ? filtered.slice(0, limit) : filtered;
}

// 모든 활동 로그 조회 (관리자용, 최신순)
export async function getAllUserActivityLogs(limit?: number): Promise<UserActivityLog[]> {
  const logs = await getUserActivityLogs();
  const sorted = logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return limit ? sorted.slice(0, limit) : sorted;
}

// ==================== 사용자 세션 ====================

// 세션 읽기
export async function getUserSessions(): Promise<UserSession[]> {
  await ensureDataDir();
  await ensureFile(USER_SESSIONS_FILE);
  const data = await fs.readFile(USER_SESSIONS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 세션 저장
export async function saveUserSessions(sessions: UserSession[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(USER_SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

// 세션 생성 (로그인 시)
export async function createUserSession(
  userId: string,
  userEmail: string,
  ipAddress?: string,
  userAgent?: string
): Promise<UserSession> {
  const sessions = await getUserSessions();

  const session: UserSession = {
    id: crypto.randomUUID(),
    userId,
    userEmail,
    loginAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ipAddress,
    userAgent,
    isActive: true
  };

  sessions.push(session);
  await saveUserSessions(sessions);

  return session;
}

// 세션 업데이트 (활동 시간 갱신)
export async function updateUserSessionActivity(sessionId: string): Promise<UserSession | null> {
  const sessions = await getUserSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index === -1) return null;

  sessions[index].lastActivityAt = new Date().toISOString();
  await saveUserSessions(sessions);

  return sessions[index];
}

// 세션 종료 (로그아웃 시)
export async function endUserSession(sessionId: string): Promise<UserSession | null> {
  const sessions = await getUserSessions();
  const index = sessions.findIndex(s => s.id === sessionId);

  if (index === -1) return null;

  sessions[index].logoutAt = new Date().toISOString();
  sessions[index].isActive = false;
  await saveUserSessions(sessions);

  return sessions[index];
}

// 사용자의 활성 세션 조회
export async function getActiveSessionsByUserId(userId: string): Promise<UserSession[]> {
  const sessions = await getUserSessions();
  return sessions
    .filter(s => s.userId === userId && s.isActive)
    .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime());
}

// 사용자의 모든 세션 조회
export async function getSessionsByUserId(userId: string): Promise<UserSession[]> {
  const sessions = await getUserSessions();
  return sessions
    .filter(s => s.userId === userId)
    .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime());
}

// 모든 활성 세션 조회 (관리자용)
export async function getAllActiveSessions(): Promise<UserSession[]> {
  const sessions = await getUserSessions();
  return sessions
    .filter(s => s.isActive)
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
}

// 세션 통계 (사용자별 총 활동 시간 계산)
export async function getUserSessionStats(userId: string): Promise<{
  totalSessions: number;
  totalActiveTime: number; // 밀리초
  averageSessionTime: number; // 밀리초
  lastLoginAt?: string;
}> {
  const sessions = await getSessionsByUserId(userId);

  let totalActiveTime = 0;

  for (const session of sessions) {
    const start = new Date(session.loginAt).getTime();
    const end = session.logoutAt
      ? new Date(session.logoutAt).getTime()
      : new Date(session.lastActivityAt).getTime();

    totalActiveTime += (end - start);
  }

  return {
    totalSessions: sessions.length,
    totalActiveTime,
    averageSessionTime: sessions.length > 0 ? totalActiveTime / sessions.length : 0,
    lastLoginAt: sessions.length > 0 ? sessions[0].loginAt : undefined
  };
}

// ==================== 대본 관리 (SQLite) ====================

// 대본 생성 (초기 pending 상태)
export async function createScript(
  userId: string,
  title: string,
  content: string = '', // 초기에는 빈 문자열
  tokenUsage?: { input_tokens: number; output_tokens: number },
  originalTitle?: string // 사용자가 입력한 원본 제목
): Promise<Script> {
  const now = new Date().toISOString();
  const scriptId = crypto.randomUUID();

  const stmt = db.prepare(`
    INSERT INTO scripts (
      id, user_id, title, original_topic, content, status, progress,
      input_tokens, output_tokens, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    scriptId,
    userId,
    title,
    originalTitle || null,
    content,
    content ? 'completed' : 'pending',
    content ? 100 : 0,
    tokenUsage?.input_tokens || null,
    tokenUsage?.output_tokens || null,
    now,
    now
  );

  const script: Script = {
    id: scriptId,
    userId,
    title,
    originalTitle,
    content,
    status: content ? 'completed' : 'pending',
    progress: content ? 100 : 0,
    tokenUsage,
    createdAt: now,
    updatedAt: now
  };

  return script;
}

// 대본 업데이트
export async function updateScript(
  scriptId: string,
  updates: Partial<Pick<Script, 'status' | 'progress' | 'content' | 'error' | 'tokenUsage' | 'logs'>>
): Promise<Script | null> {
  const now = new Date().toISOString();

  // logs는 별도 테이블에 저장
  if (updates.logs) {
    const deleteStmt = db.prepare('DELETE FROM script_logs WHERE script_id = ?');
    deleteStmt.run(scriptId);

    const insertStmt = db.prepare('INSERT INTO script_logs (script_id, log_message) VALUES (?, ?)');
    for (const log of updates.logs) {
      insertStmt.run(scriptId, log);
    }
  }

  // scripts 테이블 업데이트
  const fieldsToUpdate: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) {
    fieldsToUpdate.push('status = ?');
    values.push(updates.status);
  }
  if (updates.progress !== undefined) {
    fieldsToUpdate.push('progress = ?');
    values.push(updates.progress);
  }
  if (updates.content !== undefined) {
    fieldsToUpdate.push('content = ?');
    values.push(updates.content);
  }
  if (updates.error !== undefined) {
    fieldsToUpdate.push('error = ?');
    values.push(updates.error);
  }
  if (updates.tokenUsage) {
    if (updates.tokenUsage.input_tokens !== undefined) {
      fieldsToUpdate.push('input_tokens = ?');
      values.push(updates.tokenUsage.input_tokens);
    }
    if (updates.tokenUsage.output_tokens !== undefined) {
      fieldsToUpdate.push('output_tokens = ?');
      values.push(updates.tokenUsage.output_tokens);
    }
  }

  fieldsToUpdate.push('updated_at = ?');
  values.push(now);

  values.push(scriptId);

  if (fieldsToUpdate.length > 0) {
    const stmt = db.prepare(`UPDATE scripts SET ${fieldsToUpdate.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  return findScriptById(scriptId);
}

// 사용자별 대본 목록 조회
export async function getScriptsByUserId(userId: string): Promise<Script[]> {
  const stmt = db.prepare(`
    SELECT
      id, user_id as userId, title, original_topic as originalTitle,
      content, status, progress, error,
      input_tokens, output_tokens, type,
      created_at as createdAt, updated_at as updatedAt
    FROM scripts
    WHERE user_id = ?
    ORDER BY created_at DESC
  `);

  const rows = stmt.all(userId) as any[];

  return rows.map(row => {
    // logs 가져오기
    const logsStmt = db.prepare('SELECT log_message FROM script_logs WHERE script_id = ? ORDER BY created_at');
    const logRows = logsStmt.all(row.id) as any[];
    const logs = logRows.map(l => l.log_message);

    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      originalTitle: row.originalTitle,
      content: row.content || '',
      status: row.status || 'completed',
      progress: row.progress ?? 100,
      error: row.error,
      type: row.type,
      logs: logs.length > 0 ? logs : undefined,
      tokenUsage: row.input_tokens || row.output_tokens ? {
        input_tokens: row.input_tokens || 0,
        output_tokens: row.output_tokens || 0
      } : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || row.createdAt
    };
  });
}

// 대본 ID로 찾기
export async function findScriptById(scriptId: string): Promise<Script | null> {
  const stmt = db.prepare(`
    SELECT
      id, user_id as userId, title, original_topic as originalTitle,
      content, status, progress, error,
      input_tokens, output_tokens,
      created_at as createdAt, updated_at as updatedAt
    FROM scripts
    WHERE id = ?
  `);

  const row = stmt.get(scriptId) as any;
  if (!row) return null;

  // logs 가져오기
  const logsStmt = db.prepare('SELECT log_message FROM script_logs WHERE script_id = ? ORDER BY created_at');
  const logRows = logsStmt.all(scriptId) as any[];
  const logs = logRows.map(l => l.log_message);

  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    originalTitle: row.originalTitle,
    content: row.content || '',
    status: row.status || 'completed',
    progress: row.progress ?? 100,
    error: row.error,
    logs: logs.length > 0 ? logs : undefined,
    tokenUsage: row.input_tokens || row.output_tokens ? {
      input_tokens: row.input_tokens || 0,
      output_tokens: row.output_tokens || 0
    } : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt || row.createdAt
  };
}

// scripts_temp에서 대본 찾기 (재시도용)
export async function findScriptTempById(scriptId: string): Promise<any | null> {
  const stmt = db.prepare(`
    SELECT
      id, title, originalTitle,
      useClaudeLocal, type,
      createdAt, scriptId
    FROM scripts_temp
    WHERE id = ? OR scriptId = ?
  `);

  const row = stmt.get(scriptId, scriptId) as any;
  if (!row) return null;

  return {
    id: row.id,
    userId: '', // scripts_temp에는 userId 없음
    title: row.title,
    originalTitle: row.originalTitle || row.title,
    useClaudeLocal: row.useClaudeLocal === 1,
    type: row.type,
    createdAt: row.createdAt
  };
}

// 대본 삭제
export async function deleteScript(scriptId: string): Promise<boolean> {
  const stmt = db.prepare('DELETE FROM scripts WHERE id = ?');
  const result = stmt.run(scriptId);

  return result.changes > 0;
}

// ==================== 작업 관리 (Tasks) ====================

// Task 타입
export interface Task {
  id: string;
  content: string;
  status: 'todo' | 'ing' | 'done';
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  logs?: string[];
}

// Task 생성
export function createTask(content: string, priority: number = 0): Task {
  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO tasks (id, content, status, priority, created_at, updated_at)
    VALUES (?, ?, 'todo', ?, ?, ?)
  `);

  stmt.run(taskId, content, priority, now, now);

  return {
    id: taskId,
    content,
    status: 'todo',
    priority,
    createdAt: now,
    updatedAt: now
  };
}

// 모든 Task 조회 (status별 정렬)
export function getAllTasks(): Task[] {
  const stmt = db.prepare(`
    SELECT
      id, content, status, priority,
      created_at as createdAt,
      updated_at as updatedAt,
      completed_at as completedAt
    FROM tasks
    ORDER BY
      CASE status
        WHEN 'ing' THEN 1
        WHEN 'todo' THEN 2
        WHEN 'done' THEN 3
      END,
      priority DESC,
      created_at DESC
  `);

  const rows = stmt.all() as any[];

  return rows.map(row => {
    // logs 가져오기
    const logsStmt = db.prepare('SELECT log_message FROM task_logs WHERE task_id = ? ORDER BY created_at');
    const logRows = logsStmt.all(row.id) as any[];
    const logs = logRows.map(l => l.log_message);

    return {
      id: row.id,
      content: row.content,
      status: row.status,
      priority: row.priority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
      logs: logs.length > 0 ? logs : undefined
    };
  });
}

// Task ID로 찾기
export function findTaskById(taskId: string): Task | null {
  const stmt = db.prepare(`
    SELECT
      id, content, status, priority,
      created_at as createdAt,
      updated_at as updatedAt,
      completed_at as completedAt
    FROM tasks
    WHERE id = ?
  `);

  const row = stmt.get(taskId) as any;
  if (!row) return null;

  // logs 가져오기
  const logsStmt = db.prepare('SELECT log_message FROM task_logs WHERE task_id = ? ORDER BY created_at');
  const logRows = logsStmt.all(taskId) as any[];
  const logs = logRows.map(l => l.log_message);

  return {
    id: row.id,
    content: row.content,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    logs: logs.length > 0 ? logs : undefined
  };
}

// Task 업데이트
export function updateTask(taskId: string, updates: Partial<Pick<Task, 'content' | 'status' | 'priority'>>): Task | null {
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);

    // done으로 변경되면 완료 시간 기록
    if (updates.status === 'done') {
      fields.push('completed_at = ?');
      values.push(now);
    }
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }

  fields.push('updated_at = ?');
  values.push(now);

  values.push(taskId);

  const stmt = db.prepare(`
    UPDATE tasks
    SET ${fields.join(', ')}
    WHERE id = ?
  `);

  stmt.run(...values);

  return findTaskById(taskId);
}

// Task 로그 추가
export function addTaskLog(taskId: string, logMessage: string): void {
  const stmt = db.prepare(`
    INSERT INTO task_logs (task_id, log_message)
    VALUES (?, ?)
  `);

  stmt.run(taskId, logMessage);
}

export function addScriptLog(scriptId: string, logMessage: string): void {
  const script = SCRIPTS.find(s => s.id === scriptId);
  if (script) {
    if (!script.logs) {
      script.logs = [];
    }
    const timestamp = new Date().toISOString();
    script.logs.push(`[${timestamp}] ${logMessage}`);
  }
}

// Task 삭제
export function deleteTask(taskId: string): boolean {
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
  const result = stmt.run(taskId);
  return result.changes > 0;
}

// ============================================
// YouTube 채널 관리
// ============================================

// YouTube 채널 목록 읽기
export async function getYouTubeChannels(): Promise<YouTubeChannel[]> {
  await ensureDataDir();
  await ensureFile(YOUTUBE_CHANNELS_FILE, '[]');
  const data = await fs.readFile(YOUTUBE_CHANNELS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 사용자의 YouTube 채널 목록 가져오기
export async function getUserYouTubeChannels(userId: string): Promise<YouTubeChannel[]> {
  const channels = await getYouTubeChannels();
  return channels.filter(ch => ch.userId === userId);
}

// YouTube 채널 추가
export async function addYouTubeChannel(channel: Omit<YouTubeChannel, 'id' | 'createdAt' | 'updatedAt'>): Promise<YouTubeChannel> {
  const channels = await getYouTubeChannels();

  // 같은 사용자의 같은 채널이 이미 있는지 확인
  const existing = channels.find(ch => ch.userId === channel.userId && ch.channelId === channel.channelId);
  if (existing) {
    throw new Error('이미 연결된 채널입니다.');
  }

  const newChannel: YouTubeChannel = {
    ...channel,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 첫 번째 채널이면 자동으로 기본 채널로 설정
  if (channels.filter(ch => ch.userId === channel.userId).length === 0) {
    newChannel.isDefault = true;
  }

  channels.push(newChannel);
  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  return newChannel;
}

// YouTube 채널 업데이트
export async function updateYouTubeChannel(channelId: string, updates: Partial<YouTubeChannel>): Promise<YouTubeChannel | null> {
  const channels = await getYouTubeChannels();
  const index = channels.findIndex(ch => ch.id === channelId);

  if (index === -1) return null;

  channels[index] = {
    ...channels[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  return channels[index];
}

// YouTube 채널 삭제
export async function deleteYouTubeChannel(channelId: string): Promise<boolean> {
  const channels = await getYouTubeChannels();
  const index = channels.findIndex(ch => ch.id === channelId);

  if (index === -1) return false;

  const deletedChannel = channels[index];
  channels.splice(index, 1);

  // 삭제된 채널이 기본 채널이었다면, 같은 사용자의 첫 번째 채널을 기본으로 설정
  if (deletedChannel.isDefault) {
    const userChannels = channels.filter(ch => ch.userId === deletedChannel.userId);
    if (userChannels.length > 0) {
      const firstChannel = channels.find(ch => ch.id === userChannels[0].id);
      if (firstChannel) {
        firstChannel.isDefault = true;
      }
    }
  }

  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  return true;
}

// 기본 채널 설정
export async function setDefaultYouTubeChannel(userId: string, channelId: string): Promise<boolean> {
  const channels = await getYouTubeChannels();

  // 해당 사용자의 모든 채널의 isDefault를 false로
  channels.forEach(ch => {
    if (ch.userId === userId) {
      ch.isDefault = false;
    }
  });

  // 선택한 채널만 isDefault = true
  const targetChannel = channels.find(ch => ch.id === channelId && ch.userId === userId);
  if (!targetChannel) return false;

  targetChannel.isDefault = true;
  targetChannel.updatedAt = new Date().toISOString();

  await writeQueue.then(async () => {
    await fs.writeFile(YOUTUBE_CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
  });

  return true;
}

// 사용자의 기본 YouTube 채널 가져오기
export async function getDefaultYouTubeChannel(userId: string): Promise<YouTubeChannel | null> {
  const channels = await getUserYouTubeChannels(userId);
  return channels.find(ch => ch.isDefault) || channels[0] || null;
}

// ID로 YouTube 채널 찾기
export async function getYouTubeChannelById(channelId: string): Promise<YouTubeChannel | null> {
  const channels = await getYouTubeChannels();
  return channels.find(ch => ch.id === channelId) || null;
}
