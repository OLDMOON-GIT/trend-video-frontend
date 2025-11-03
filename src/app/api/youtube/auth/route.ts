import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_CLI = path.join(BACKEND_PATH, 'youtube_upload_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');

function getUserTokenPath(userId: string): string {
  return path.join(CREDENTIALS_DIR, `youtube_token_${userId}.json`);
}

/**
 * GET /api/youtube/auth - YouTube 인증 상태 확인
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const hasCredentials = fs.existsSync(COMMON_CREDENTIALS_PATH);
    console.log("[YouTube Auth API] Credentials check:", { path: COMMON_CREDENTIALS_PATH, exists: hasCredentials });
    const tokenPath = getUserTokenPath(user.userId);
    const hasToken = fs.existsSync(tokenPath);

    console.log('[YouTube Auth GET] 상태 체크:', {
      userId: user.userId,
      credentialsPath: COMMON_CREDENTIALS_PATH,
      hasCredentials,
      tokenPath,
      hasToken
    });

    if (!hasToken) {
      return NextResponse.json({ authenticated: false, hasCredentials });
    }

    return new Promise((resolve) => {
      const python = spawn('python', [
        YOUTUBE_CLI,
        '--action', 'channel-info',
        '--credentials', COMMON_CREDENTIALS_PATH,
        '--token', tokenPath
      ]);

      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.on('close', () => {
        try {
          const result = JSON.parse(output.trim());
          if (result.success && result.channel) {
            resolve(NextResponse.json({
              authenticated: true,
              channel: result.channel,
              hasCredentials
            }));
          } else {
            resolve(NextResponse.json({ authenticated: false, hasCredentials }));
          }
        } catch {
          resolve(NextResponse.json({ authenticated: false, hasCredentials }));
        }
      });
    });

  } catch (error: any) {
    return NextResponse.json({ error: '인증 상태 확인 실패' }, { status: 500 });
  }
}

/**
 * POST /api/youtube/auth - YouTube 인증 시작
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    if (!fs.existsSync(COMMON_CREDENTIALS_PATH)) {
      return NextResponse.json({
        error: 'YouTube API credentials가 설정되지 않았습니다',
        details: '관리자에게 문의하여 공통 Credentials를 설정해야 합니다.',
        setupGuide: '관리자 페이지 → YouTube Credentials 메뉴'
      }, { status: 500 });
    }

    const tokenPath = getUserTokenPath(user.userId);

    return new Promise((resolve) => {
      const python = spawn('python', [
        YOUTUBE_CLI,
        '--action', 'auth',
        '--credentials', COMMON_CREDENTIALS_PATH,
        '--token', tokenPath
      ]);

      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.on('close', () => {
        try {
          const result = JSON.parse(output.trim());
          if (result.success) {
            resolve(NextResponse.json({ success: true, message: 'YouTube 채널 연결 성공' }));
          } else {
            resolve(NextResponse.json({ error: result.error || '인증 실패' }, { status: 500 }));
          }
        } catch {
          resolve(NextResponse.json({ error: '인증 프로세스 오류' }, { status: 500 }));
        }
      });
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'YouTube 인증 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/youtube/auth - YouTube 연결 해제
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const tokenPath = getUserTokenPath(user.userId);
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }

    return NextResponse.json({ success: true, message: 'YouTube 연결 해제 완료' });

  } catch (error: any) {
    return NextResponse.json({ error: 'YouTube 연결 해제 실패' }, { status: 500 });
  }
}
