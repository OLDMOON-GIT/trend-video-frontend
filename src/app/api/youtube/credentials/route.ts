import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import path from 'path';
import fs from 'fs/promises';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');

/**
 * POST /api/youtube/credentials - 사용자별 Credentials 파일 업로드
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('credentials') as File;

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 });
    }

    // JSON 파일 검증
    if (!file.name.endsWith('.json')) {
      return NextResponse.json({ error: 'JSON 파일만 업로드 가능합니다' }, { status: 400 });
    }

    // 파일 내용 읽기
    const fileContent = await file.text();

    // JSON 형식 검증
    try {
      const jsonData = JSON.parse(fileContent);

      // OAuth 2.0 클라이언트 credentials 구조 검증
      if (!jsonData.installed && !jsonData.web) {
        return NextResponse.json({
          error: '올바른 OAuth 2.0 클라이언트 credentials 파일이 아닙니다'
        }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json({ error: '잘못된 JSON 형식입니다' }, { status: 400 });
    }

    // config 폴더 확인/생성
    try {
      await fs.access(CREDENTIALS_DIR);
    } catch {
      await fs.mkdir(CREDENTIALS_DIR, { recursive: true });
    }

    // 사용자별 credentials 파일 저장
    const credentialsPath = path.join(CREDENTIALS_DIR, `youtube_client_secret_${user.userId}.json`);
    await fs.writeFile(credentialsPath, fileContent, 'utf-8');

    console.log(`✅ YouTube credentials 업로드 성공: ${user.email} (${credentialsPath})`);

    return NextResponse.json({
      success: true,
      message: 'Credentials 파일 업로드 완료'
    });

  } catch (error: any) {
    console.error('Credentials 업로드 실패:', error);
    return NextResponse.json({ error: 'Credentials 업로드 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/youtube/credentials - 사용자별 Credentials 파일 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const credentialsPath = path.join(CREDENTIALS_DIR, `youtube_client_secret_${user.userId}.json`);

    try {
      await fs.unlink(credentialsPath);
      console.log(`✅ YouTube credentials 삭제 성공: ${user.email}`);
    } catch (error) {
      // 파일이 없어도 성공으로 처리
      console.log(`⚠️ Credentials 파일이 없음: ${user.email}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Credentials 파일 삭제 완료'
    });

  } catch (error: any) {
    console.error('Credentials 삭제 실패:', error);
    return NextResponse.json({ error: 'Credentials 삭제 실패' }, { status: 500 });
  }
}
