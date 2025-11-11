/**
 * 서버 시작 전 AI 모델 로그인 체크
 * Claude, ChatGPT, Gemini 세 모델 모두 브라우저 탭으로 열어 체크
 */

const { spawn } = require('child_process');
const path = require('path');

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

  const devProcess = spawn('npm', ['run', 'dev:server-only'], {
    stdio: 'inherit',
    shell: true
  });

  devProcess.on('error', (err) => {
    console.error('❌ 서버 시작 실패:', err.message);
    process.exit(1);
  });
}

async function startPromptWatcher() {
  console.log('👁️ 프롬프트 파일 감시 시작...\n');

  const watcherProcess = spawn('node', ['prompt-sync-watcher.js'], {
    stdio: 'inherit',
    shell: true
  });

  watcherProcess.on('error', (err) => {
    console.error('⚠️ 프롬프트 감시 시작 실패:', err.message);
  });
}

async function main() {
  try {
    // 1단계: 로그인 체크 (브라우저 열림) - 개발 중에는 비활성화
    // await checkLogins();

    // 2단계: 서버 시작
    await startServer();

    // 3단계: 프롬프트 감시 시작
    await startPromptWatcher();

  } catch (error) {
    console.error('❌ 시작 중 오류 발생:', error);
    process.exit(1);
  }
}

main();
