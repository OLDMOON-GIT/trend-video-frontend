import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: '프롬프트가 비어있습니다.'
      }, { status: 400 });
    }

    console.log('🚀 Claude.ai 자동 열기 시작...');

    const fs = require('fs');
    const { exec } = require('child_process');

    // 프롬프트를 임시 파일로 저장
    const tempFile = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\temp_prompt.txt';
    fs.writeFileSync(tempFile, prompt, 'utf-8');

    // Python 스크립트 경로
    const pythonScript = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\src\\ai_aggregator\\open_claude_auto.py';

    console.log('[INFO] Python 스크립트 실행 (콘솔 창 표시)');

    // python.exe 사용 (콘솔 창 표시)
    const { spawn } = require('child_process');

    // 환경 변수 설정 (프로세스가 독립적으로 실행되도록)
    const env = { ...process.env, PYTHONUNBUFFERED: '1' };

    const pythonProcess = spawn('python', [pythonScript, `@${tempFile}`], {
      detached: true,
      stdio: 'inherit',  // 콘솔 출력 표시
      env: env,
      cwd: 'C:\\Users\\oldmoon\\workspace\\trend-video-backend',
      shell: true  // cmd 창에서 실행
    });

    // 완전히 분리
    pythonProcess.unref();

    console.log('[INFO] 프로세스 분리 완료 (PID:', pythonProcess.pid, ')');

    // 프로세스가 시작될 시간을 주기
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('✅ Claude.ai 자동 열기 프로세스 시작됨');

    return NextResponse.json({
      success: true,
      message: 'Claude.ai가 자동으로 열리고 프롬프트가 전송됩니다.'
    });

  } catch (error: any) {
    console.error('❌ Claude 자동 열기 오류:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '알 수 없는 오류'
    }, { status: 500 });
  }
}
