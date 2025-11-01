import { NextRequest, NextResponse } from 'next/server';
import { sendErrorEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  try {
    console.log('📧 테스트 이메일 발송 시작...');
    console.log('환경변수 확인:', {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASSWORD: process.env.SMTP_PASSWORD ? '***설정됨***' : '❌ 없음',
    });

    const result = await sendErrorEmail({
      taskId: 'test_' + Date.now(),
      title: '테스트 대본 제목 - 이메일 발송 테스트',
      errorMessage: '이것은 테스트 에러입니다. 실제 에러가 아닙니다.',
      stdout: `[Python] Claude.ai 웹사이트 접속 시도...
[Python] 브라우저 자동화 시작
[Python] 프롬프트 입력 중...
[Python] 응답 대기 중...`,
      stderr: `⚠️ 테스트 경고 메시지
❌ 테스트 에러: Login session expired
Stack trace:
  at main.py:123
  at playwright.run()`,
      timestamp: new Date().toISOString(),
    });

    if (result) {
      return NextResponse.json({
        success: true,
        message: '✅ 테스트 이메일이 moony75@gmail.com으로 발송되었습니다!'
      });
    } else {
      return NextResponse.json({
        success: false,
        message: '❌ 이메일 발송 실패. 서버 콘솔에서 에러 로그를 확인하세요.',
        hint: 'Next.js 개발 서버 터미널에서 상세한 에러 메시지를 확인할 수 있습니다.'
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('테스트 이메일 발송 오류:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '알 수 없는 오류',
      stack: error.stack,
      details: {
        code: error.code,
        command: error.command,
      }
    }, { status: 500 });
  }
}
