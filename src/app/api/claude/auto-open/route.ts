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
    const tempFile = 'C:\\Users\\oldmoon\\workspace\\multi-ai-aggregator\\temp_prompt.txt';
    fs.writeFileSync(tempFile, prompt, 'utf-8');

    // Python 스크립트 경로
    const pythonScript = 'C:\\Users\\oldmoon\\workspace\\multi-ai-aggregator\\open_claude_auto.py';

    // 임시 파일을 읽어서 실행
    const command = `start "Claude Auto Open" cmd /k "python "${pythonScript}" "@${tempFile}""`;

    console.log('[INFO] 명령어 실행');

    exec(command, (error: any, stdout: any, stderr: any) => {
      if (error) {
        console.error('[ERROR] 실행 실패:', error);
      }
      if (stdout) console.log('[stdout]:', stdout);
      if (stderr) console.log('[stderr]:', stderr);
    });

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
