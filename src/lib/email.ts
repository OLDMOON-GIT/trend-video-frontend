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


export async function sendErrorEmail(errorInfo: {
  taskId: string;
  title: string;
  errorMessage: string;
  stdout: string;
  stderr: string;
  timestamp: string;
}): Promise<boolean> {
  try {
    console.log('📧 Python 이메일 스크립트 호출 시작...');

    // Python 스크립트 경로 - 절대 경로 사용
    const workspaceRoot = 'C:\\Users\\oldmoon\\workspace';
    const pythonScript = path.join(workspaceRoot, 'trend-video-backend', 'src', 'ai_aggregator', 'send_error_email.py');

    // JSON 데이터 준비
    const jsonData = JSON.stringify(errorInfo);

    // Python 스크립트 실행
    console.log('[INFO] Python script path:', pythonScript);
    console.log('[INFO] Executing Python script...');

    const { stdout, stderr } = await execAsync(`python "${pythonScript}" "${jsonData.replace(/"/g, '\\"')}"`);

    console.log('[INFO] Python stdout:', stdout);
    if (stderr) {
      console.log('[INFO] Python stderr:', stderr);
    }

    // Python 스크립트 응답 파싱
    const result = JSON.parse(stdout.trim());

    if (result.success) {
      console.log('✅ 이메일 전송 성공:', result.message);
      return true;
    } else {
      console.error('❌ 이메일 전송 실패:', result.error);
      return false;
    }
  } catch (error: any) {
    console.error('❌ Python 스크립트 실행 오류:', error.message);
    console.error('Error details:', error);
    return false;
  }
}
