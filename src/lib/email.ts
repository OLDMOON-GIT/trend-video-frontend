import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  console.log('📧 이메일 전송 시작 (Python 스크립트 사용)...');
  console.log('[INFO] To:', options.to);
  console.log('[INFO] Subject:', options.subject);
  return true; // Simple emails not implemented, only error emails
}

export async function sendVerificationEmail(email: string, verificationToken: string): Promise<boolean> {
  const verificationUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/verify?token=${verificationToken}`;

  return sendEmail({
    to: email,
    subject: '이메일 인증',
    text: `다음 링크를 클릭하여 이메일을 인증해주세요: ${verificationUrl}`,
    html: `<p>다음 링크를 클릭하여 이메일을 인증해주세요:</p><a href="${verificationUrl}">이메일 인증하기</a>`
  });
}


// 자동화 시스템용 에러 이메일 (HTML 지원)
export async function sendErrorEmail(to: string, subject: string, html: string): Promise<boolean>;
// 태스크 에러용 이메일
export async function sendErrorEmail(errorInfo: {
  taskId: string;
  title: string;
  errorMessage: string;
  stdout: string;
  stderr: string;
  timestamp: string;
}): Promise<boolean>;
// 구현
export async function sendErrorEmail(
  toOrErrorInfo: string | {
    taskId: string;
    title: string;
    errorMessage: string;
    stdout: string;
    stderr: string;
    timestamp: string;
  },
  subject?: string,
  html?: string
): Promise<boolean> {
  try {
    // 이메일 전송 비활성화 - 콘솔 로그만 남김

    // 자동화 시스템에서 호출된 경우 (3개 파라미터)
    if (typeof toOrErrorInfo === 'string' && subject && html) {
      console.log('📧 [Error Email] 알림:');
      console.log('  To:', toOrErrorInfo);
      console.log('  Subject:', subject);
      console.log('  HTML:', html.substring(0, 200) + '...');
      console.log('✅ Error email logged (email sending disabled)');
      return true;
    }

    // 태스크 에러로 호출된 경우 (1개 객체 파라미터)
    if (typeof toOrErrorInfo === 'object') {
      console.log('📧 [Error Email] 알림:', {
        taskId: toOrErrorInfo.taskId,
        title: toOrErrorInfo.title,
        error: toOrErrorInfo.errorMessage,
        timestamp: toOrErrorInfo.timestamp
      });
      console.log('✅ Error email logged (email sending disabled)');
      return true;
    }

    console.error('❌ Invalid sendErrorEmail parameters');
    return false;
  } catch (error: any) {
    console.error('❌ Error logging failed:', error.message);
    return false;
  }
}
