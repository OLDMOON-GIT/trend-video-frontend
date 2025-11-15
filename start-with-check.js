/**
 * 서버 시작 전 AI 모델 로그인 체크
 * Claude, ChatGPT, Gemini 세 모델 모두 브라우저 탭으로 열어 체크
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function checkLogins() {
  console.log('\n🔐 AI 모델 로그인 상태 체크 중...\n');

  const setupPath = path.join(__dirname, '..', 'trend-video-backend', 'src', 'ai_aggregator');
  const pythonScript = path.join(setupPath, 'setup_login.py');

  return new Promise((resolve, reject) => {
    // setup_login.py의 기본값(claude,chatgpt,gemini) 사용
    console.log('🔍 디버그: Python 명령어:', `python ${pythonScript}`);

    const checkProcess = spawn('python', [pythonScript], {
      cwd: setupPath,
      stdio: 'inherit', // 출력을 그대로 표시
      shell: true
    });

    checkProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ 로그인 체크 완료!\n');
        resolve();
      } else {
        console.log('\n⚠️ 로그인 체크 중 문제가 발생했지만 계속 진행합니다...\n');
        resolve(); // 실패해도 계속 진행
      }
    });

    checkProcess.on('error', (err) => {
      console.error('\n❌ 로그인 체크 실행 실패:', err.message);
      console.log('서버를 시작합니다...\n');
      resolve(); // 에러가 나도 계속 진행
    });
  });
}

async function startServer() {
  console.log('🚀 Next.js 개발 서버 시작 중...\n');

  // 로그 로테이션 실행
  try {
    const rotateScript = path.join(__dirname, 'scripts', 'rotate-logs.js');
    if (fs.existsSync(rotateScript)) {
      require(rotateScript);
    }
  } catch (err) {
    console.error('⚠️ 로그 로테이션 중 오류:', err.message);
  }

  // 로그 디렉토리 생성
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // 로그 파일 스트림 생성
  const logFile = path.join(logsDir, 'server.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  // 타임스탬프 추가 함수
  function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}]`;
  }

  const devProcess = spawn('npm', ['run', 'dev:server-only'], {
    stdio: ['ignore', 'pipe', 'pipe'], // stdin 무시, stdout/stderr 파이프
    shell: true
  });

  // stdout 처리 (콘솔 + 파일에 타임스탬프와 함께 출력)
  devProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const timestampedLine = `${getTimestamp()} ${line}`;
        console.log(line); // 콘솔에는 원본 출력
        logStream.write(timestampedLine + '\n'); // 파일에는 타임스탬프 포함
      }
    });
  });

  // stderr 처리
  devProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const timestampedLine = `${getTimestamp()} ${line}`;
        console.error(line); // 콘솔에는 원본 출력
        logStream.write(timestampedLine + '\n'); // 파일에는 타임스탬프 포함
      }
    });
  });

  devProcess.on('error', (err) => {
    console.error('❌ 서버 시작 실패:', err.message);
    logStream.end();
    process.exit(1);
  });

  devProcess.on('close', (code) => {
    logStream.end();
    if (code !== 0) {
      console.error(`서버가 코드 ${code}로 종료되었습니다`);
    }
  });
}

async function main() {
  try {
    // 1단계: 로그인 체크 (브라우저 열림) - 개발 중에는 비활성화
    // await checkLogins();

    // 2단계: 서버 시작
    await startServer();

  } catch (error) {
    console.error('❌ 시작 중 오류 발생:', error);
    process.exit(1);
  }
}

main();
