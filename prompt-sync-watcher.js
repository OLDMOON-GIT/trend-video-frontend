/**
 * 프롬프트 파일 동기화 Watcher
 *
 * trend-video-frontend/prompts 폴더와 multi-ai-aggregator 폴더 간의
 * 프롬프트 파일을 양방향 자동 동기화합니다.
 */

const chokidar = require('chokidar');
const fs = require('fs').promises;
const path = require('path');

// 경로 설정
const PROMPTS_DIR = path.join(__dirname, 'prompts');
const MULTI_AI_DIR = path.join(__dirname, '..', 'multi-ai-aggregator');

// 동기화 매핑
const SYNC_MAP = {
  // trend-video-frontend/prompts → multi-ai-aggregator
  'shortform_prompt.txt': 'prompt_shortform.txt',
  'prompt_longform.txt': 'prompt_longform.txt',
  'sora2_prompt.txt': 'prompt_sora2.txt'
};

// 역방향 매핑
const REVERSE_SYNC_MAP = Object.entries(SYNC_MAP).reduce((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {});

// 동기화 중 플래그 (무한 루프 방지)
const syncingFiles = new Set();

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  const timestamp = new Date().toLocaleTimeString('ko-KR');
  console.log(`${colors.bright}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

async function syncFile(sourcePath, targetPath, direction) {
  const syncKey = `${sourcePath}→${targetPath}`;

  if (syncingFiles.has(syncKey)) {
    // 이미 동기화 중이면 무한 루프 방지
    return;
  }

  try {
    syncingFiles.add(syncKey);

    // 소스 파일 읽기
    const content = await fs.readFile(sourcePath, 'utf-8');

    // 타겟 파일에 쓰기
    await fs.writeFile(targetPath, content, 'utf-8');

    const sourceFileName = path.basename(sourcePath);
    const targetFileName = path.basename(targetPath);
    const arrow = direction === 'forward' ? '→' : '←';

    log(
      `✅ 동기화 완료: ${sourceFileName} ${arrow} ${targetFileName} (${content.length.toLocaleString()}자)`,
      colors.green
    );
  } catch (error) {
    log(`❌ 동기화 실패: ${error.message}`, colors.red);
  } finally {
    // 동기화 완료 후 플래그 제거 (약간의 지연)
    setTimeout(() => {
      syncingFiles.delete(syncKey);
    }, 1000);
  }
}

async function handleFileChange(filePath, watchDir, isMultiAi = false) {
  const fileName = path.basename(filePath);

  // 파일이 동기화 대상인지 확인
  const targetFileName = isMultiAi ? REVERSE_SYNC_MAP[fileName] : SYNC_MAP[fileName];

  if (!targetFileName) {
    // 동기화 대상이 아님
    return;
  }

  const targetDir = isMultiAi ? PROMPTS_DIR : MULTI_AI_DIR;
  const targetPath = path.join(targetDir, targetFileName);

  log(
    `📝 파일 변경 감지: ${fileName}`,
    colors.cyan
  );

  await syncFile(filePath, targetPath, isMultiAi ? 'backward' : 'forward');
}

async function checkDirectories() {
  try {
    await fs.access(PROMPTS_DIR);
    log(`✅ 프롬프트 디렉토리 확인: ${PROMPTS_DIR}`, colors.blue);
  } catch (error) {
    log(`❌ 프롬프트 디렉토리 없음: ${PROMPTS_DIR}`, colors.red);
    throw new Error('프롬프트 디렉토리가 없습니다');
  }

  try {
    await fs.access(MULTI_AI_DIR);
    log(`✅ multi-ai-aggregator 디렉토리 확인: ${MULTI_AI_DIR}`, colors.blue);
  } catch (error) {
    log(`⚠️ multi-ai-aggregator 디렉토리 없음: ${MULTI_AI_DIR}`, colors.yellow);
    log(`   스크립트 생성 시 오류가 발생할 수 있습니다`, colors.yellow);
  }
}

async function initialSync() {
  log('🔄 초기 동기화 시작...', colors.bright);

  for (const [frontendFile, multiAiFile] of Object.entries(SYNC_MAP)) {
    const frontendPath = path.join(PROMPTS_DIR, frontendFile);
    const multiAiPath = path.join(MULTI_AI_DIR, multiAiFile);

    try {
      // 프론트엔드 파일 존재 확인
      await fs.access(frontendPath);

      // multi-ai 파일 존재 확인
      try {
        await fs.access(multiAiPath);
        log(`   ${frontendFile} ↔ ${multiAiFile} (양쪽 모두 존재)`, colors.blue);
      } catch {
        // multi-ai 파일 없으면 생성
        log(`   ${frontendFile} → ${multiAiFile} (신규 생성)`, colors.yellow);
        await syncFile(frontendPath, multiAiPath, 'forward');
      }
    } catch {
      log(`   ${frontendFile} (파일 없음, 스킵)`, colors.yellow);
    }
  }

  log('✅ 초기 동기화 완료', colors.green);
}

async function startWatching() {
  await checkDirectories();
  await initialSync();

  log('\n👀 파일 감시 시작...', colors.bright);
  log(`   프롬프트 폴더: ${PROMPTS_DIR}`, colors.cyan);
  log(`   Multi-AI 폴더: ${MULTI_AI_DIR}`, colors.cyan);
  log('\n📝 동기화 매핑:', colors.bright);
  Object.entries(SYNC_MAP).forEach(([key, value]) => {
    log(`   ${key} ↔ ${value}`, colors.blue);
  });
  log('\n');

  // trend-video-frontend/prompts 폴더 감시
  const promptsWatcher = chokidar.watch(PROMPTS_DIR, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  promptsWatcher
    .on('change', (filePath) => handleFileChange(filePath, PROMPTS_DIR, false))
    .on('error', (error) => log(`❌ Watcher 오류 (prompts): ${error}`, colors.red));

  // multi-ai-aggregator 폴더 감시
  try {
    await fs.access(MULTI_AI_DIR);
    const multiAiWatcher = chokidar.watch(MULTI_AI_DIR, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    multiAiWatcher
      .on('change', (filePath) => handleFileChange(filePath, MULTI_AI_DIR, true))
      .on('error', (error) => log(`❌ Watcher 오류 (multi-ai): ${error}`, colors.red));
  } catch (error) {
    log('⚠️ multi-ai-aggregator 폴더를 감시할 수 없습니다', colors.yellow);
  }

  log('✅ 파일 감시 활성화됨', colors.green);
  log('   프롬프트 파일을 수정하면 자동으로 동기화됩니다', colors.cyan);
  log('   종료하려면 Ctrl+C를 누르세요\n', colors.cyan);
}

// 에러 핸들러
process.on('unhandledRejection', (error) => {
  log(`❌ 처리되지 않은 에러: ${error}`, colors.red);
});

process.on('SIGINT', () => {
  log('\n\n👋 프롬프트 동기화 Watcher 종료', colors.yellow);
  process.exit(0);
});

// 시작
log('🚀 프롬프트 동기화 Watcher 시작', colors.bright);
log('=' .repeat(60), colors.blue);
startWatching().catch((error) => {
  log(`❌ 시작 실패: ${error.message}`, colors.red);
  process.exit(1);
});
