import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');

export async function GET(request: NextRequest): Promise<NextResponse> {
  const credentialsContent = fs.readFileSync(COMMON_CREDENTIALS_PATH, 'utf-8');
  const credentials = JSON.parse(credentialsContent);
  const { client_id } = credentials.installed || credentials.web;

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'http';
  const redirectUri = `${protocol}://${host}/api/youtube/oauth-callback`;

  return NextResponse.json({
    host,
    protocol,
    redirectUri,
    clientId: client_id,
    message: '이 redirect_uri를 Google Cloud Console에 추가하세요'
  });
}
