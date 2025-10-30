import nodemailer from 'nodemailer';

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    throw new Error('SMTP credentials are not configured.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

export async function sendVerificationEmail(to: string, token: string) {
  if (!token) {
    throw new Error('Verification token is missing.');
  }

  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    throw new Error('APP_BASE_URL is not configured.');
  }

  const fromName = process.env.SMTP_FROM_NAME || 'Trend Video';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  if (!fromEmail) {
    throw new Error('SMTP_FROM_EMAIL or SMTP_USER must be configured.');
  }

  const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject: 'Trend Video 이메일 인증을 완료해주세요',
    text: `안녕하세요!\n\nTrend Video 서비스를 이용하시려면 아래 인증 링크를 클릭해주세요:\n${verificationUrl}\n\n해당 링크는 한 번만 사용할 수 있습니다. 만약 본인이 요청한 것이 아니라면 이 메일을 무시해주세요.`,
    html: `
      <p>안녕하세요!</p>
      <p>Trend Video 서비스를 이용하시려면 아래 버튼을 클릭하여 이메일 인증을 완료해주세요.</p>
      <p style="text-align:center;margin:32px 0;">
        <a href="${verificationUrl}" style="background-color:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          이메일 인증하기
        </a>
      </p>
      <p>혹시 버튼이 동작하지 않는다면 아래 링크를 브라우저 주소창에 붙여넣기 해주세요:</p>
      <p><a href="${verificationUrl}">${verificationUrl}</a></p>
      <p>이 메일을 요청하지 않으셨다면 안전하게 무시하셔도 됩니다.</p>
      <p>감사합니다.<br/>Trend Video 팀 드림</p>
    `
  });
}
