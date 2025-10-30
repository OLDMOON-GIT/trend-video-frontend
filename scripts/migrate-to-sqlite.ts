import * as fs from 'fs';
import * as path from 'path';
import db from '../src/lib/sqlite';

const DATA_DIR = path.join(process.cwd(), 'data');

interface OldJob {
  id: string;
  userId: string;
  status: string;
  progress: number;
  step?: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  videoUrl?: string;
  error?: string;
  logs?: string[];
}

interface OldUser {
  id: string;
  email: string;
  password: string;
  isAdmin?: boolean;
  credits?: number;
  isEmailVerified?: boolean;
  verificationToken?: string;
  memo?: string;
  createdAt?: string;
}

interface OldSession {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt?: string;
}

interface OldScript {
  id: string;
  userId: string;
  title: string;
  content: string;
  tokenUsage?: {
    input_tokens: number;
    output_tokens: number;
  };
  status?: string;
  progress?: number;
  error?: string;
  logs?: string[];
  originalTopic?: string;
  createdAt: string;
  updatedAt?: string;
}

async function migrateData() {
  console.log('🔄 JSON 데이터를 SQLite로 마이그레이션 시작...\n');

  try {
    // 1. Users 마이그레이션
    const usersPath = path.join(DATA_DIR, 'users.json');
    if (fs.existsSync(usersPath)) {
      const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf-8')) as OldUser[];
      console.log(`📊 ${usersData.length}개의 사용자 마이그레이션 중...`);

      const insertUser = db.prepare(`
        INSERT OR REPLACE INTO users (id, email, password, is_admin, credits, is_email_verified, verification_token, memo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const migrateUsers = db.transaction((users: OldUser[]) => {
        for (const user of users) {
          insertUser.run(
            user.id,
            user.email,
            user.password,
            user.isAdmin ? 1 : 0,
            user.credits || 0,
            user.isEmailVerified ? 1 : 0,
            user.verificationToken || null,
            user.memo || null,
            user.createdAt || new Date().toISOString(),
            new Date().toISOString()
          );
        }
      });

      migrateUsers(usersData);
      console.log(`✅ ${usersData.length}개 사용자 마이그레이션 완료\n`);
    }

    // 2. Sessions 마이그레이션
    const sessionsPath = path.join(DATA_DIR, 'sessions.json');
    if (fs.existsSync(sessionsPath)) {
      const sessionsData = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));
      const sessionIds = Object.keys(sessionsData);
      console.log(`📊 ${sessionIds.length}개의 세션 마이그레이션 중...`);

      const insertSession = db.prepare(`
        INSERT OR REPLACE INTO sessions (id, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `);

      const migrateSessions = db.transaction((sessionIds: string[]) => {
        let count = 0;
        for (const sessionId of sessionIds) {
          const session = sessionsData[sessionId];

          // 만료된 세션은 건너뛰기
          const expiresAt = new Date(session.expiresAt);
          if (expiresAt < new Date()) {
            continue;
          }

          insertSession.run(
            sessionId,
            session.userId,
            expiresAt.toISOString(),
            new Date().toISOString()
          );
          count++;
        }
        return count;
      });

      const count = migrateSessions(sessionIds);
      console.log(`✅ ${count}개 활성 세션 마이그레이션 완료\n`);
    }

    // 3. Jobs 마이그레이션
    const jobsPath = path.join(DATA_DIR, 'jobs.json');
    if (fs.existsSync(jobsPath)) {
      const jobsData = JSON.parse(fs.readFileSync(jobsPath, 'utf-8')) as OldJob[];
      console.log(`📊 ${jobsData.length}개의 작업 마이그레이션 중...`);

      const insertJob = db.prepare(`
        INSERT OR REPLACE INTO jobs (id, user_id, status, progress, step, created_at, updated_at, title, video_url, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertJobLog = db.prepare(`
        INSERT INTO job_logs (job_id, log_message)
        VALUES (?, ?)
      `);

      const migrateJobs = db.transaction((jobs: OldJob[]) => {
        for (const job of jobs) {
          insertJob.run(
            job.id,
            job.userId,
            job.status,
            job.progress,
            job.step || null,
            job.createdAt,
            job.updatedAt,
            job.title || null,
            job.videoUrl || null,
            job.error || null
          );

          // 로그 추가
          if (job.logs && job.logs.length > 0) {
            for (const log of job.logs) {
              insertJobLog.run(job.id, log);
            }
          }
        }
      });

      migrateJobs(jobsData);
      console.log(`✅ ${jobsData.length}개 작업 마이그레이션 완료\n`);
    }

    // 4. Scripts 마이그레이션
    const scriptsPath = path.join(DATA_DIR, 'scripts.json');
    if (fs.existsSync(scriptsPath)) {
      const scriptsData = JSON.parse(fs.readFileSync(scriptsPath, 'utf-8')) as OldScript[];
      console.log(`📊 ${scriptsData.length}개의 대본 마이그레이션 중...`);

      const insertScript = db.prepare(`
        INSERT OR REPLACE INTO scripts (id, user_id, title, content, status, progress, error, input_tokens, output_tokens, original_topic, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertScriptLog = db.prepare(`
        INSERT INTO script_logs (script_id, log_message)
        VALUES (?, ?)
      `);

      const migrateScripts = db.transaction((scripts: OldScript[]) => {
        for (const script of scripts) {
          insertScript.run(
            script.id,
            script.userId,
            script.title,
            script.content,
            script.status || 'completed',
            script.progress || 100,
            script.error || null,
            script.tokenUsage?.input_tokens || null,
            script.tokenUsage?.output_tokens || null,
            script.originalTopic || null,
            script.createdAt,
            script.updatedAt || script.createdAt
          );

          // 로그 추가
          if (script.logs && script.logs.length > 0) {
            for (const log of script.logs) {
              insertScriptLog.run(script.id, log);
            }
          }
        }
      });

      migrateScripts(scriptsData);
      console.log(`✅ ${scriptsData.length}개 대본 마이그레이션 완료\n`);
    }

    // 5. 기타 데이터 마이그레이션 (credit_history, charge_requests, settings)
    const creditHistoryPath = path.join(DATA_DIR, 'credit_history.json');
    if (fs.existsSync(creditHistoryPath)) {
      const creditHistory = JSON.parse(fs.readFileSync(creditHistoryPath, 'utf-8')) as any[];
      console.log(`📊 ${creditHistory.length}개의 크레딧 히스토리 마이그레이션 중...`);

      const insertCredit = db.prepare(`
        INSERT OR REPLACE INTO credit_history (id, user_id, amount, type, description, balance_after, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const migrateCredits = db.transaction((credits: any[]) => {
        for (const credit of credits) {
          insertCredit.run(
            credit.id,
            credit.userId,
            credit.amount,
            credit.type,
            credit.description || null,
            credit.balanceAfter || credit.balance_after || 0,
            credit.createdAt
          );
        }
      });

      migrateCredits(creditHistory);
      console.log(`✅ ${creditHistory.length}개 크레딧 히스토리 마이그레이션 완료\n`);
    }

    const chargeRequestsPath = path.join(DATA_DIR, 'charge_requests.json');
    if (fs.existsSync(chargeRequestsPath)) {
      const chargeRequests = JSON.parse(fs.readFileSync(chargeRequestsPath, 'utf-8')) as any[];
      console.log(`📊 ${chargeRequests.length}개의 충전 요청 마이그레이션 중...`);

      const insertCharge = db.prepare(`
        INSERT OR REPLACE INTO charge_requests (id, user_id, amount, status, created_at, processed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const migrateCharges = db.transaction((charges: any[]) => {
        for (const charge of charges) {
          insertCharge.run(
            charge.id,
            charge.userId,
            charge.amount,
            charge.status,
            charge.createdAt,
            charge.processedAt || null
          );
        }
      });

      migrateCharges(chargeRequests);
      console.log(`✅ ${chargeRequests.length}개 충전 요청 마이그레이션 완료\n`);
    }

    const settingsPath = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as any;
      console.log(`📊 설정 마이그레이션 중...`);

      db.prepare(`
        UPDATE settings
        SET ai_script_cost = ?, video_generation_cost = ?
        WHERE id = 1
      `).run(settings.aiScriptCost || 25, settings.videoGenerationCost || 50);

      console.log(`✅ 설정 마이그레이션 완료\n`);
    }

    console.log('🎉 모든 데이터 마이그레이션 완료!');
    console.log('\n📝 다음 단계:');
    console.log('  1. 브라우저를 새로고침하여 데이터 확인');
    console.log('  2. 정상 작동 확인 후 data/*.json 파일 백업');
    console.log('  3. (선택) JSON 파일 삭제 또는 .bak으로 이름 변경\n');

  } catch (error: any) {
    console.error('❌ 마이그레이션 오류:', error.message);
    throw error;
  }
}

migrateData().catch(console.error);
