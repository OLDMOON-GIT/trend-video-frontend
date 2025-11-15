/**
 * 로그 로테이션 스크립트
 * - 서버 시작 시 기존 로그를 날짜-시간 기반 파일로 백업
 * - 7일 이상 된 로그 자동 삭제
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
const currentLogFile = path.join(logsDir, 'server.log');

// logs 폴더 생성
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 현재 시간 기반 파일명 생성 (YYYY-MM-DD-HH)
function getTimestampedFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  return `server-${year}-${month}-${day}-${hour}.log`;
}

// 기존 로그 파일 백업
function rotateCurrentLog() {
  if (fs.existsSync(currentLogFile)) {
    const stats = fs.statSync(currentLogFile);

    // 파일이 비어있지 않으면 백업
    if (stats.size > 0) {
      const backupFilename = getTimestampedFilename();
      const backupPath = path.join(logsDir, backupFilename);

      // 같은 이름의 파일이 이미 있으면 내용 추가
      if (fs.existsSync(backupPath)) {
        const existingContent = fs.readFileSync(backupPath, 'utf-8');
        const currentContent = fs.readFileSync(currentLogFile, 'utf-8');
        fs.writeFileSync(backupPath, existingContent + '\n' + currentContent, 'utf-8');
        console.log(`📝 로그 추가됨: ${backupFilename}`);
      } else {
        fs.renameSync(currentLogFile, backupPath);
        console.log(`📦 로그 백업됨: ${backupFilename} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
      }
    } else {
      // 빈 파일이면 그냥 삭제
      fs.unlinkSync(currentLogFile);
      console.log('🗑️ 빈 로그 파일 삭제됨');
    }
  }

  // 새 로그 파일 생성
  fs.writeFileSync(currentLogFile, '', 'utf-8');
  console.log('✅ 새 로그 파일 생성됨: server.log');
}

// 오래된 로그 파일 삭제 (7일 이상)
function cleanOldLogs() {
  const files = fs.readdirSync(logsDir);
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  let deletedCount = 0;
  let deletedSize = 0;

  files.forEach(file => {
    if (file.startsWith('server-') && file.endsWith('.log')) {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);

      if (stats.mtimeMs < sevenDaysAgo) {
        deletedSize += stats.size;
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`🗑️ 오래된 로그 삭제: ${file}`);
      }
    }
  });

  if (deletedCount > 0) {
    console.log(`✅ ${deletedCount}개 파일 삭제됨 (${(deletedSize / 1024 / 1024).toFixed(2)}MB 확보)`);
  } else {
    console.log('✅ 삭제할 오래된 로그 없음');
  }
}

// 로그 파일 목록 표시
function showLogFiles() {
  const files = fs.readdirSync(logsDir);
  const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();

  if (logFiles.length === 0) {
    console.log('📂 로그 파일 없음');
    return;
  }

  console.log('\n📂 현재 로그 파일:');
  let totalSize = 0;

  logFiles.forEach(file => {
    const filePath = path.join(logsDir, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    totalSize += stats.size;

    if (file === 'server.log') {
      console.log(`   🟢 ${file.padEnd(30)} ${sizeMB.padStart(8)}MB (현재)`);
    } else {
      console.log(`   📄 ${file.padEnd(30)} ${sizeMB.padStart(8)}MB`);
    }
  });

  console.log(`   ${'─'.repeat(45)}`);
  console.log(`   총 ${logFiles.length}개 파일, ${(totalSize / 1024 / 1024).toFixed(2)}MB\n`);
}

// 실행
console.log('🔄 로그 로테이션 시작...\n');
rotateCurrentLog();
cleanOldLogs();
showLogFiles();
console.log('✅ 로그 로테이션 완료!\n');
