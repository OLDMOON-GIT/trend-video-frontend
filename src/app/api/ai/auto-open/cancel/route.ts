import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    console.log('🛑 AI 대본 생성 중지 요청');

    // Windows에서 Python 및 Chrome 프로세스 강제 종료
    try {
      // Python ai_aggregator 프로세스 종료
      await execAsync('taskkill /F /IM python.exe /FI "WINDOWTITLE eq *ai_aggregator*" 2>nul');
      console.log('✅ Python 프로세스 종료 시도');
    } catch (error) {
      console.log('⚠️ Python 프로세스 종료 시도 (이미 종료되었을 수 있음)');
    }

    try {
      // Chrome 프로세스 중 자동화 프로필 사용 중인 것 종료
      await execAsync('taskkill /F /IM chrome.exe /FI "COMMANDLINE eq *.chrome-automation-profile*" 2>nul');
      console.log('✅ Chrome 프로세스 종료 시도');
    } catch (error) {
      console.log('⚠️ Chrome 프로세스 종료 시도 (이미 종료되었을 수 있음)');
    }

    try {
      // 모든 Chrome 자동화 관련 프로세스 정리
      await execAsync('wmic process where "commandline like \'%chrome-automation-profile%\'" delete 2>nul');
      console.log('✅ Chrome 자동화 프로세스 정리 완료');
    } catch (error) {
      console.log('⚠️ Chrome 자동화 프로세스 정리 시도');
    }

    return NextResponse.json({
      success: true,
      message: 'AI 대본 생성이 중지되었습니다. Chrome 창이 닫혔습니다.'
    });

  } catch (error: any) {
    console.error('❌ AI 대본 생성 중지 중 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'AI 대본 생성 중지 중 오류가 발생했습니다.'
      },
      { status: 500 }
    );
  }
}
