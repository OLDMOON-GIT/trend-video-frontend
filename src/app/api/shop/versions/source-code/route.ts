// C:\Users\oldmoon\workspace\trend-video-frontend\src\app\api\shop\versions\source-code\route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { execSync } from 'child_process';
import path from 'path';

function ensureAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || !user.isAdmin) {
    throw new Error('AUTH_REQUIRED');
  }
}

export async function GET(request: NextRequest) {
  let filePath: string | null = null;
  let commitHash: string | null = null;

  try {
    const user = await getCurrentUser(request);
    ensureAdmin(user);

    const { searchParams } = new URL(request.url);
    commitHash = searchParams.get('commit_hash');
    filePath = searchParams.get('file_path');

    if (!commitHash || !filePath) {
      return NextResponse.json(
        { error: 'commit_hash and file_path are required' },
        { status: 400 }
      );
    }

    // Sanitize inputs to prevent command injection
    const sanitizedCommitHash = commitHash.replace(/[^a-zA-Z0-9]/g, '');
    
    // Basic path validation to prevent directory traversal
    const projectRoot = process.cwd();
    const absoluteFilePath = path.resolve(projectRoot, filePath);

    if (!absoluteFilePath.startsWith(projectRoot)) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }
    // The file path for git should be relative to the git root, which is the project root in this case.
    const relativeFilePath = path.relative(projectRoot, absoluteFilePath);


    // Execute git command
    const command = `git show ${sanitizedCommitHash}:${relativeFilePath}`;
    const sourceCode = execSync(command, { encoding: 'utf8' });

    return new NextResponse(sourceCode, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });

  } catch (error: any) {
    if (error.message.includes('AUTH_REQUIRED')) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', errorCode: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }
    
    if (error.message.includes('exists on disk, but not in')) {
        return NextResponse.json(
            { error: `File '${filePath}' not found in commit '${commitHash}'` },
            { status: 404 }
        );
    }

    if (error.message.includes('bad object')) {
        return NextResponse.json(
            { error: `Commit hash '${commitHash}' not found` },
            { status: 404 }
        );
    }

    console.error('❌ 소스 코드 조회 실패:', error);
    return NextResponse.json(
      { error: error?.message || '소스 코드를 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}
