import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    // 관리자 인증 확인
    const user = await getCurrentUser(request);

    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.', errorCode: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // ERD 문서 읽기
    const docPath = path.join(process.cwd(), 'docs', 'DATABASE_ERD.md');

    try {
      const content = await fs.readFile(docPath, 'utf-8');

      return NextResponse.json({
        success: true,
        content,
        filePath: 'docs/DATABASE_ERD.md'
      });
    } catch (fileError: any) {
      console.error('ERD 문서 읽기 실패:', fileError);

      return NextResponse.json(
        {
          error: 'ERD 문서를 찾을 수 없습니다.',
          errorCode: 'FILE_NOT_FOUND',
          details: fileError.message
        },
        { status: 404 }
      );
    }

  } catch (error: any) {
    console.error('❌ 아키텍처 API 에러:', error);
    return NextResponse.json(
      {
        error: error?.message || '서버 에러가 발생했습니다.',
        errorCode: 'INTERNAL_SERVER_ERROR'
      },
      { status: 500 }
    );
  }
}
