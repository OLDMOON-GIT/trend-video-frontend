import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_CLI = path.join(BACKEND_PATH, 'youtube_upload_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');

/**
 * GET /api/youtube/auth - YouTube 인증 상태 확인
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // 토큰 파일 확인
    const tokenPath = path.join(CREDENTIALS_DIR, `youtube_token_${user.userId}.json`);
    const hasToken = fs.existsSync(tokenPath);

    if (!hasToken) {
      return NextResponse.json({ authenticated: false });
    }

    // 채널 정보 조회 (토큰 유효성 검증)
    return new Promise((resolve) => {
      const python = spawn('python', [
        YOUTUBE_CLI,
        '--action', 'channel-info',
        '--credentials', CREDENTIALS_FILE,
        '--token', tokenPath
      ]);

      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        console.error('[YouTube Auth] stderr:', data.toString());
      });

      python.on('close', (code) => {
        try {
          const result = JSON.parse(output.trim());
          if (result.success && result.channel) {
            resolve(NextResponse.json({
              authenticated: true,
              channel: result.channel
            }));
          } else {
            resolve(NextResponse.json({ authenticated: false }));
          }
        } catch (e) {
          resolve(NextResponse.json({ authenticated: false }));
        }
      });
    });

  } catch (error: any) {
    console.error('[YouTube Auth] Error:', error);
    return NextResponse.json(
      { error: '인증 상태 확인 실패' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/youtube/auth - YouTube 인증 시작
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // credentials 파일 확인
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return NextResponse.json({
        error: 'YouTube API credentials 파일이 없습니다. 관리자에게 문의하세요.'
      }, { status: 500 });
    }

    // 토큰 저장 경로
    const tokenPath = path.join(CREDENTIALS_DIR, `youtube_token_${user.userId}.json`);

    // 인증 실행
    return new Promise((resolve) => {
      const python = spawn('python', [
        YOUTUBE_CLI,
        '--action', 'auth',
        '--credentials', CREDENTIALS_FILE,
        '--token', tokenPath
      ]);

      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        console.error('[YouTube Auth] stderr:', data.toString());
      });

      python.on('close', (code) => {
        try {
          const result = JSON.parse(output.trim());
          if (result.success) {
            resolve(NextResponse.json({
              success: true,
              message: 'YouTube 채널 연결 성공'
            }));
          } else {
            resolve(NextResponse.json({
              error: result.error || '인증 실패'
            }, { status: 500 }));
          }
        } catch (e) {
          resolve(NextResponse.json({
            error: '인증 프로세스 오류'
          }, { status: 500 }));
        }
      });
    });

  } catch (error: any) {
    console.error('[YouTube Auth] Error:', error);
    return NextResponse.json(
      { error: 'YouTube 인증 실패' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/youtube/auth - YouTube 연결 해제
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // 토큰 파일 삭제
    const tokenPath = path.join(CREDENTIALS_DIR, `youtube_token_${user.userId}.json`);
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }

    return NextResponse.json({
      success: true,
      message: 'YouTube 연결 해제 완료'
    });

  } catch (error: any) {
    console.error('[YouTube Disconnect] Error:', error);
    return NextResponse.json(
      { error: 'YouTube 연결 해제 실패' },
      { status: 500 }
    );
  }
}
