import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  checkDatabaseHealth
} from '@/lib/backup';

// GET - 백업 목록 조회 또는 상태 체크
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'health') {
      const health = checkDatabaseHealth();
      return NextResponse.json({ health });
    }

    // 백업 목록 조회
    const backups = await listBackups();

    return NextResponse.json({
      backups: backups.map(b => ({
        name: b.name,
        size: b.size,
        sizeFormatted: formatBytes(b.size),
        createdAt: b.createdAt.toISOString(),
        reason: b.reason
      })),
      total: backups.length
    });

  } catch (error: any) {
    console.error('Error listing backups:', error);
    return NextResponse.json(
      { error: error.message || '백업 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST - 백업 생성, 복원, 삭제
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, backupName, reason } = body;

    if (action === 'create') {
      // 백업 생성
      const backupPath = await createBackup(reason || 'manual');
      return NextResponse.json({
        success: true,
        message: '백업이 생성되었습니다.',
        backupPath
      });
    }

    if (action === 'restore') {
      // 백업 복원
      if (!backupName) {
        return NextResponse.json(
          { error: 'backupName이 필요합니다.' },
          { status: 400 }
        );
      }

      await restoreBackup(backupName);
      return NextResponse.json({
        success: true,
        message: '백업이 복원되었습니다.'
      });
    }

    if (action === 'delete') {
      // 백업 삭제
      if (!backupName) {
        return NextResponse.json(
          { error: 'backupName이 필요합니다.' },
          { status: 400 }
        );
      }

      await deleteBackup(backupName);
      return NextResponse.json({
        success: true,
        message: '백업이 삭제되었습니다.'
      });
    }

    return NextResponse.json(
      { error: '유효하지 않은 action입니다.' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Error handling backup:', error);
    return NextResponse.json(
      { error: error.message || '백업 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 파일 크기 포맷 헬퍼
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
