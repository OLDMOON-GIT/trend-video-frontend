import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7일
const PERMANENT_SESSION_DURATION = 365 * 24 * 60 * 60 * 1000; // 1년
const SESSIONS_FILE = path.join(process.cwd(), 'data', 'sessions.json');

interface SessionData {
  userId: string;
  email: string;
  isAdmin: boolean;
  expiresAt: number;
}

// 세션 파일 읽기
async function readSessions(): Promise<Map<string, SessionData>> {
  try {
    const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
    const obj = JSON.parse(data);
    return new Map(Object.entries(obj));
  } catch (error) {
    return new Map();
  }
}

// 세션 파일 쓰기
async function writeSessions(sessions: Map<string, SessionData>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(SESSIONS_FILE), { recursive: true });
    const obj = Object.fromEntries(sessions);
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(obj, null, 2));
  } catch (error) {
    console.error('세션 저장 실패:', error);
  }
}

// 세션 생성
export async function createSession(userId: string, email: string, isAdmin: boolean, rememberMe: boolean = false): Promise<string> {
  const sessionId = crypto.randomUUID();
  const duration = rememberMe ? PERMANENT_SESSION_DURATION : SESSION_DURATION;
  const expiresAt = Date.now() + duration;

  const sessions = await readSessions();
  sessions.set(sessionId, { userId, email, isAdmin, expiresAt });
  await writeSessions(sessions);

  console.log('💾 세션 저장됨:', sessionId, rememberMe ? '(영구 로그인)' : '(7일)');

  return sessionId;
}

// 세션 검증
export async function getSession(sessionId: string): Promise<{ userId: string; email: string; isAdmin: boolean } | null> {
  console.log('🔍 세션 조회 요청:', sessionId);

  const sessions = await readSessions();
  console.log('📋 현재 저장된 세션 목록:', Array.from(sessions.keys()));

  const session = sessions.get(sessionId);

  if (!session) {
    console.log('❌ 세션을 찾을 수 없음');
    return null;
  }

  if (Date.now() > session.expiresAt) {
    console.log('⏰ 세션 만료됨');
    sessions.delete(sessionId);
    await writeSessions(sessions);
    return null;
  }

  console.log('✅ 세션 유효:', session.email);
  return { userId: session.userId, email: session.email, isAdmin: session.isAdmin || false };
}

// 세션 삭제
export async function deleteSession(sessionId: string): Promise<void> {
  const sessions = await readSessions();
  sessions.delete(sessionId);
  await writeSessions(sessions);
}

// 요청에서 세션 ID 가져오기 (쿠키 또는 Authorization 헤더)
export function getSessionIdFromRequest(request: NextRequest): string | null {
  // 먼저 Authorization 헤더 확인
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 쿠키도 확인 (호환성)
  return request.cookies.get('sessionId')?.value || null;
}

// 요청에서 현재 사용자 가져오기
export async function getCurrentUser(request: NextRequest): Promise<{ userId: string; email: string; isAdmin: boolean } | null> {
  const sessionId = getSessionIdFromRequest(request);
  console.log('🔑 요청에서 추출한 세션 ID:', sessionId);
  if (!sessionId) {
    console.log('❌ 세션 ID 없음');
    return null;
  }
  return await getSession(sessionId);
}

// 응답에 세션 쿠키 설정 (개발 환경용 - httpOnly 제거)
export function setSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set('sessionId', sessionId, {
    httpOnly: false, // 개발 환경에서는 false로 설정
    secure: false,
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000,
    path: '/'
  });
}

// 응답에서 세션 쿠키 삭제
export function deleteSessionCookie(response: NextResponse): void {
  response.cookies.delete('sessionId');
}
