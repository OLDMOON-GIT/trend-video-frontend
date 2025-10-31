import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_LINKS_FILE = path.join(DATA_DIR, 'coupang-links.json');

async function loadAllLinks() {
  try {
    const data = await fs.readFile(COUPANG_LINKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// GET - 사용자의 링크 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const allLinks = await loadAllLinks();
    const userLinks = allLinks
      .filter((link: any) => link.userId === user.userId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      links: userLinks
    });
  } catch (error: any) {
    console.error('링크 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: '링크 조회 실패'
    }, { status: 500 });
  }
}
