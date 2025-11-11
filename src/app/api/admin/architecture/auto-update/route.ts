import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DATA_DIR = path.join(process.cwd(), 'data');
const ARCHITECTURE_UPDATE_FILE = path.join(DATA_DIR, 'architecture-last-update.json');

interface ArchitectureUpdateInfo {
  lastUpdate: string;
  lastCommitHash: string;
  lastCommitDate: string;
  updateCount: number;
}

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function getLastUpdateInfo(): Promise<ArchitectureUpdateInfo | null> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(ARCHITECTURE_UPDATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveUpdateInfo(info: ArchitectureUpdateInfo): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(ARCHITECTURE_UPDATE_FILE, JSON.stringify(info, null, 2));
}

async function getGitInfo(): Promise<{ hash: string; date: string; daysSinceCommit: number }> {
  try {
    // 최근 커밋 정보 가져오기
    const { stdout: hash } = await execAsync('git log -1 --format=%H');
    const { stdout: date } = await execAsync('git log -1 --format=%ci');
    const { stdout: timestamp } = await execAsync('git log -1 --format=%ct');

    const commitTime = parseInt(timestamp.trim()) * 1000;
    const now = Date.now();
    const daysSinceCommit = Math.floor((now - commitTime) / (1000 * 60 * 60 * 24));

    return {
      hash: hash.trim(),
      date: date.trim(),
      daysSinceCommit
    };
  } catch (error) {
    console.error('Git 정보 가져오기 실패:', error);
    return { hash: 'unknown', date: 'unknown', daysSinceCommit: 0 };
  }
}

async function analyzeCodebase(): Promise<string> {
  // 주요 파일들의 구조 읽기
  const projectRoot = process.cwd();

  const filesToAnalyze = [
    'package.json',
    'src/app/page.tsx',
    'src/app/api/scripts/generate/route.ts',
    'src/app/api/generate-video-upload/route.ts',
    'src/lib/db.ts',
    'src/lib/sqlite.ts',
  ];

  let codebaseInfo = '# 프로젝트 구조 분석\n\n';

  for (const file of filesToAnalyze) {
    const filePath = path.join(projectRoot, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // 파일 크기가 너무 크면 처음 500줄만
      const lines = content.split('\n');
      const preview = lines.slice(0, Math.min(500, lines.length)).join('\n');
      codebaseInfo += `\n## ${file}\n\`\`\`\n${preview}\n\`\`\`\n`;
    } catch (error) {
      codebaseInfo += `\n## ${file}\n(읽기 실패)\n`;
    }
  }

  // 디렉토리 구조
  try {
    const { stdout: tree } = await execAsync('dir /s /b /a-d src\\app\\api | findstr /i route.ts', {
      cwd: projectRoot
    });
    codebaseInfo += `\n## API Routes 목록\n\`\`\`\n${tree}\n\`\`\`\n`;
  } catch (error) {
    // Windows dir 명령 실패 시 무시
  }

  return codebaseInfo;
}

/**
 * GET /api/admin/architecture/auto-update - 마지막 업데이트 정보 조회
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    const updateInfo = await getLastUpdateInfo();
    const gitInfo = await getGitInfo();

    return NextResponse.json({
      lastUpdate: updateInfo?.lastUpdate || null,
      lastCommitHash: updateInfo?.lastCommitHash || null,
      lastCommitDate: updateInfo?.lastCommitDate || null,
      updateCount: updateInfo?.updateCount || 0,
      currentCommitHash: gitInfo.hash,
      currentCommitDate: gitInfo.date,
      daysSinceLastCommit: gitInfo.daysSinceCommit,
      needsUpdate: gitInfo.daysSinceCommit >= 2 // 2일 이상 커밋 없으면 업데이트 권장
    });

  } catch (error: any) {
    console.error('업데이트 정보 조회 실패:', error);
    return NextResponse.json({ error: '업데이트 정보 조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/admin/architecture/auto-update - AI를 사용한 아키텍처 자동 업데이트
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 });
    }

    console.log('🤖 AI 아키텍처 자동 업데이트 시작...');

    // 1. Claude API 설정
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    // 2. 코드베이스 분석
    console.log('📂 코드베이스 분석 중...');
    const codebaseInfo = await analyzeCodebase();

    // 3. Claude에게 분석 요청
    const prompt = `당신은 시스템 아키텍처 전문가입니다. 다음 프로젝트의 코드를 분석하여 업데이트된 아키텍처 문서를 생성해주세요.

${codebaseInfo}

다음 두 가지를 Mermaid 문법으로 생성해주세요:

1. **시스템 아키텍처 다이어그램** (graph TB):
   - 브라우저, Next.js API Routes, Python Backend, 저장소 계층 구조
   - 주요 API 엔드포인트와 백엔드 서비스 간의 연결
   - 데이터 흐름과 통신 방식

2. **데이터베이스 ERD** (erDiagram):
   - 모든 테이블과 컬럼 (id, created_at 등 기본 필드 포함)
   - 테이블 간의 관계 (1:1, 1:N, N:M)
   - 주요 인덱스와 제약조건

응답 형식:
\`\`\`json
{
  "architecture": "graph TB\\n    subgraph Browser...\\n    ...",
  "erd": "erDiagram\\n    users ||--o{ scripts : creates\\n    ..."
}
\`\`\`

반드시 유효한 Mermaid 문법을 사용하고, JSON 형식으로만 응답해주세요.`;

    console.log('🤖 Claude API 호출 중...');
    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [{
          type: 'text',
          text: prompt,
          cache_control: { type: 'ephemeral' }
        }]
      }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('✅ Claude 응답 받음');

    // JSON 추출 (코드 블록에서)
    let jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      jsonMatch = responseText.match(/```\s*([\s\S]*?)\s*```/);
    }

    let result;
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[1]);
    } else {
      // JSON 블록이 없으면 전체를 파싱 시도
      result = JSON.parse(responseText);
    }

    // 4. Git 정보 및 업데이트 정보 저장
    const gitInfo = await getGitInfo();
    const previousInfo = await getLastUpdateInfo();

    const updateInfo: ArchitectureUpdateInfo = {
      lastUpdate: new Date().toISOString(),
      lastCommitHash: gitInfo.hash,
      lastCommitDate: gitInfo.date,
      updateCount: (previousInfo?.updateCount || 0) + 1
    };

    await saveUpdateInfo(updateInfo);

    console.log('💾 업데이트 완료:', updateInfo);

    return NextResponse.json({
      success: true,
      architecture: result.architecture,
      erd: result.erd,
      updateInfo,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens
      }
    });

  } catch (error: any) {
    console.error('AI 아키텍처 업데이트 실패:', error);
    return NextResponse.json({
      error: 'AI 아키텍처 업데이트 실패: ' + error.message
    }, { status: 500 });
  }
}
