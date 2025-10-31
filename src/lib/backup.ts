import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const copyFile = promisify(fs.copyFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const backupDir = path.join(process.cwd(), 'data', 'backups');

// 백업 디렉토리 생성
export function ensureBackupDir() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

// DB 백업 생성
export async function createBackup(reason: string = 'manual'): Promise<string> {
  ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
  const backupFileName = `database_${timestamp}_${reason}.sqlite`;
  const backupPath = path.join(backupDir, backupFileName);

  try {
    // WAL 모드 체크포인트 (WAL 파일을 메인 DB로 병합)
    const db = new Database(dbPath);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    // 파일 복사
    await copyFile(dbPath, backupPath);

    console.log(`✅ 백업 생성 완료: ${backupFileName}`);

    // 오래된 백업 정리 (최근 30개만 유지)
    await cleanOldBackups(30);

    return backupPath;
  } catch (error) {
    console.error('❌ 백업 생성 실패:', error);
    throw error;
  }
}

// 백업 복원
export async function restoreBackup(backupFileName: string): Promise<void> {
  const backupPath = path.join(backupDir, backupFileName);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`백업 파일을 찾을 수 없습니다: ${backupFileName}`);
  }

  try {
    // 현재 DB 백업 (복원 전 안전장치)
    await createBackup('before_restore');

    // 복원
    await copyFile(backupPath, dbPath);

    console.log(`✅ 백업 복원 완료: ${backupFileName}`);
  } catch (error) {
    console.error('❌ 백업 복원 실패:', error);
    throw error;
  }
}

// 백업 목록 조회
export async function listBackups(): Promise<Array<{
  name: string;
  path: string;
  size: number;
  createdAt: Date;
  reason: string;
}>> {
  ensureBackupDir();

  try {
    const files = await readdir(backupDir);
    const backupFiles = files.filter(f => f.endsWith('.sqlite'));

    const backups = await Promise.all(
      backupFiles.map(async (file) => {
        const filePath = path.join(backupDir, file);
        const stats = await stat(filePath);

        // 파일명에서 reason 추출
        const match = file.match(/_([^_]+)\.sqlite$/);
        const reason = match ? match[1] : 'unknown';

        return {
          name: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.mtime,
          reason
        };
      })
    );

    // 최신순 정렬
    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (error) {
    console.error('❌ 백업 목록 조회 실패:', error);
    return [];
  }
}

// 오래된 백업 정리
export async function cleanOldBackups(keepCount: number = 30): Promise<number> {
  const backups = await listBackups();

  if (backups.length <= keepCount) {
    return 0;
  }

  const toDelete = backups.slice(keepCount);
  let deletedCount = 0;

  for (const backup of toDelete) {
    try {
      await unlink(backup.path);
      deletedCount++;
      console.log(`🗑️ 오래된 백업 삭제: ${backup.name}`);
    } catch (error) {
      console.error(`❌ 백업 삭제 실패: ${backup.name}`, error);
    }
  }

  return deletedCount;
}

// 백업 삭제
export async function deleteBackup(backupFileName: string): Promise<void> {
  const backupPath = path.join(backupDir, backupFileName);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`백업 파일을 찾을 수 없습니다: ${backupFileName}`);
  }

  await unlink(backupPath);
  console.log(`🗑️ 백업 삭제 완료: ${backupFileName}`);
}

// DB 상태 체크
export function checkDatabaseHealth(): {
  exists: boolean;
  size: number;
  walSize: number;
  shmSize: number;
  integrity: boolean;
} {
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  const result = {
    exists: fs.existsSync(dbPath),
    size: 0,
    walSize: 0,
    shmSize: 0,
    integrity: false
  };

  if (result.exists) {
    result.size = fs.statSync(dbPath).size;
    result.walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;
    result.shmSize = fs.existsSync(shmPath) ? fs.statSync(shmPath).size : 0;

    try {
      const db = new Database(dbPath);
      const integrityCheck = db.pragma('integrity_check');
      result.integrity = integrityCheck[0]?.integrity_check === 'ok';
      db.close();
    } catch (error) {
      console.error('❌ DB integrity check 실패:', error);
      result.integrity = false;
    }
  }

  return result;
}
