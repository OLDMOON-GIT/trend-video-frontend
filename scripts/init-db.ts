import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// .env.local 파일 로드
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

async function initDatabase() {
  console.log('🔧 MySQL 데이터베이스 초기화 시작...\n');

  // MySQL 연결 (데이터베이스 없이)
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    console.log('✅ MySQL 서버 연결 성공\n');

    // schema.sql 파일 읽기
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

    console.log('📄 스키마 파일 읽기 완료');
    console.log('🔨 데이터베이스 및 테이블 생성 중...\n');

    // SQL 실행
    await connection.query(schemaSql);

    console.log('✅ 데이터베이스 및 테이블 생성 완료!\n');
    console.log('📊 생성된 테이블:');
    console.log('  - users (사용자)');
    console.log('  - sessions (세션)');
    console.log('  - jobs (작업)');
    console.log('  - job_logs (작업 로그)');
    console.log('  - scripts (대본)');
    console.log('  - script_logs (대본 로그)');
    console.log('  - credit_history (크레딧 히스토리)');
    console.log('  - charge_requests (충전 요청)');
    console.log('  - settings (설정)');
    console.log('  - user_activity_logs (사용자 활동 로그)\n');

    console.log('🎉 데이터베이스 초기화 완료!');

  } catch (error: any) {
    console.error('❌ 오류 발생:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

initDatabase().catch(console.error);
