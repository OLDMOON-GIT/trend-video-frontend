import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import path from 'path';
import fs from 'fs/promises';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');
const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');

/**
 * GET /api/admin/youtube-credentials - Credentials 존재 여부 확인
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    try {
      await fs.access(COMMON_CREDENTIALS_PATH);
      return NextResponse.json({ hasCredentials: true });
    } catch {
      return NextResponse.json({ hasCredentials: false });
    }
  } catch (error: any) {
    console.error('[GET /api/admin/youtube-credentials] Error:', error);
    return NextResponse.json({ error: 'Credentials 확인 실패' }, { status: 500 });
  }
}

/**
 * POST /api/admin/youtube-credentials - 공통 Credentials 업로드
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

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

    // 공통 credentials 파일 저장
    await fs.writeFile(COMMON_CREDENTIALS_PATH, fileContent, 'utf-8');

    console.log(`✅ [관리자] 공통 YouTube credentials 업로드 성공: ${user.email}`);

    return NextResponse.json({
      success: true,
      message: '공통 Credentials 파일 업로드 완료'
    });

  } catch (error: any) {
    console.error('[POST /api/admin/youtube-credentials] Error:', error);
    return NextResponse.json({ error: 'Credentials 업로드 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/youtube-credentials - 공통 Credentials 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    try {
      await fs.unlink(COMMON_CREDENTIALS_PATH);
      console.log(`✅ [관리자] 공통 YouTube credentials 삭제 성공: ${user.email}`);
    } catch (error) {
      // 파일이 없어도 성공으로 처리
      console.log(`⚠️ Credentials 파일이 없음`);
    }

    return NextResponse.json({
      success: true,
      message: '공통 Credentials 파일 삭제 완료'
    });

  } catch (error: any) {
    console.error('[DELETE /api/admin/youtube-credentials] Error:', error);
    return NextResponse.json({ error: 'Credentials 삭제 실패' }, { status: 500 });
  }
}
