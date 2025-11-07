import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getCurrentUser } from '@/lib/session';

// 캐시 저장소
let promptCache: {
  content: string;
  filename: string;
  lastModified: number;
} | null = null;

export async function GET(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    // prompts 디렉토리에서 product_prompt로 시작하는 .txt 파일 찾기
    const projectRoot = process.cwd();
    const promptsDir = path.join(projectRoot, 'prompts');
    const files = await fs.readdir(promptsDir);

    const promptFile = files.find(file =>
      file.startsWith('prompt_product') && file.endsWith('.txt')
    );

    if (!promptFile) {
      return NextResponse.json(
        { error: 'prompts/prompt_product로 시작하는 .txt 파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const filePath = path.join(promptsDir, promptFile);
    const stats = await fs.stat(filePath);
    const lastModified = stats.mtimeMs;

    // 파일이 변경되었거나 캐시가 없으면 새로 읽기
    let content: string;
    let cached = false;

    if (promptCache &&
        promptCache.filename === promptFile &&
        promptCache.lastModified === lastModified) {
      console.log('📋 Product 프롬프트 캐시 사용:', promptFile);
      content = promptCache.content;
      cached = true;
    } else {
      console.log('📄 Product 프롬프트 파일 읽기:', promptFile);
      content = await fs.readFile(filePath, 'utf-8');

      // 캐시 업데이트
      promptCache = {
        content,
        filename: promptFile,
        lastModified
      };
    }

    // API 호출 시 JSON 반환
    return NextResponse.json({
      filename: promptFile,
      content: content,
      cached: cached
    });
  } catch (error) {
    console.error('Error reading product prompt file:', error);
    return NextResponse.json(
      { error: '파일 읽기 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
