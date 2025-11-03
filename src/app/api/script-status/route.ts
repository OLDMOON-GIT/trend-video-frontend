import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findScriptById } from '@/lib/db';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

export async function GET(request: NextRequest) {
  // 사용자 인증
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');

    if (!scriptId) {
      return NextResponse.json(
        { error: 'scriptId가 필요합니다.' },
        { status: 400 }
      );
    }

    // 1. scripts 테이블에서 찾기
    const script = await findScriptById(scriptId);

    if (script) {
      // 본인의 대본인지 확인
      if (script.userId !== user.userId) {
        return NextResponse.json(
          { error: '권한이 없습니다.' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        status: script.status || 'completed',
        title: script.title,
        content: script.content,
        progress: script.progress || 100,
        logs: script.logs || [],
        error: script.error
      });
    }

    // 2. scripts_temp 테이블에서 찾기 (로컬 Claude 생성)
    const db = new Database(dbPath);
    try {
      const tempScript = db.prepare('SELECT * FROM scripts_temp WHERE id = ?').get(scriptId) as any;

      if (!tempScript) {
        db.close();
        return NextResponse.json(
          { error: '대본을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // scripts_temp에서 실제 content 가져오기
      let content = '';
      if (tempScript.scriptId) {
        const actualScript = db.prepare('SELECT content FROM scripts WHERE id = ?').get(tempScript.scriptId) as any;
        if (actualScript && actualScript.content) {
          content = actualScript.content;
        }
      }

      // 로그 파싱 및 진행률 계산
      let logs: string[] = [];
      let calculatedProgress = 50;
      if (tempScript.logs) {
        try {
          logs = JSON.parse(tempScript.logs);

          // 로그 기반으로 진행률 추정
          const logText = logs.join(' ');
          if (logText.includes('Python 스크립트 실행 완료') || logText.includes('데이터베이스 저장 중')) {
            calculatedProgress = 90;
          } else if (logText.includes('Claude 응답 파일 검색') || logText.includes('프롬프트 파일 저장')) {
            calculatedProgress = 70;
          } else if (logText.includes('작업 시작됨') || logText.includes('프로세스 PID')) {
            calculatedProgress = 30;
          } else if (logs.length > 0) {
            calculatedProgress = 40;
          }
        } catch (e) {
          logs = [];
        }
      }

      // status 변환
      const status = tempScript.status === 'DONE' ? 'completed' :
                     tempScript.status === 'ERROR' ? 'failed' :
                     tempScript.status === 'PENDING' ? 'pending' : 'processing';

      db.close();

      return NextResponse.json({
        status: status,
        title: tempScript.title,
        content: content,
        progress: status === 'completed' ? 100 : status === 'failed' ? 0 : calculatedProgress,
        logs: logs,
        error: tempScript.message?.includes('오류') || tempScript.message?.includes('ERROR') ? tempScript.message : undefined
      });

    } catch (dbError) {
      db.close();
      throw dbError;
    }

  } catch (error: any) {
    console.error('❌ 대본 상태 조회 오류:', error);
    return NextResponse.json(
      { error: '대본 상태 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
