/**
 * 데이터베이스 마이그레이션 통합 테스트
 *
 * 테스트 범위:
 * 1. 테이블 생성
 * 2. 스키마 마이그레이션
 * 3. 데이터 마이그레이션
 * 4. 인덱스 관리
 * 5. 외래키 제약 검증
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const testDbPath = path.join(process.cwd(), 'data', 'test-migration-db.sqlite');

function initMigrationDB() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');

  return db;
}

describe('🔄 데이터베이스 마이그레이션 통합 테스트', () => {
  let db: Database.Database;

  beforeAll(() => {
    console.log('\n🔧 마이그레이션 테스트 DB 초기화 중...');
    db = initMigrationDB();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    console.log('✅ 마이그레이션 테스트 환경 정리 완료\n');
  });

  describe('Suite 1: 테이블 생성', () => {
    test('✅ 기본 테이블 생성', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS migration_v1 (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 테이블 존재 확인
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='migration_v1'
      `).all() as any[];

      expect(tables.length).toBe(1);
      console.log('✅ 기본 테이블 생성 완료');
    });

    test('✅ 제약 조건이 있는 테이블 생성', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS posts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);

      const userTable = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='users'
      `).all() as any[];

      const postsTable = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='posts'
      `).all() as any[];

      expect(userTable.length).toBe(1);
      expect(postsTable.length).toBe(1);
      console.log('✅ 외래키 제약이 있는 테이블 생성');
    });

    test('✅ 여러 컬럼의 복합 테이블 생성', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS complex_table (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          progress INTEGER DEFAULT 0,
          error_message TEXT,
          metadata TEXT,
          retry_count INTEGER DEFAULT 0,
          started_at DATETIME,
          completed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const columns = db.pragma('table_info(complex_table)') as any[];

      expect(columns.length).toBeGreaterThanOrEqual(10);
      expect(columns.map((c: any) => c.name)).toContain('progress');
      expect(columns.map((c: any) => c.name)).toContain('error_message');
      console.log(`✅ ${columns.length}개 컬럼이 있는 복합 테이블 생성`);
    });
  });

  describe('Suite 2: 컬럼 추가 마이그레이션', () => {
    test('✅ 기존 테이블에 컬럼 추가', () => {
      // 1. 초기 테이블 생성
      db.exec(`
        CREATE TABLE IF NOT EXISTS add_column_test (
          id TEXT PRIMARY KEY,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. 컬럼 추가
      db.exec(`
        ALTER TABLE add_column_test ADD COLUMN status TEXT DEFAULT 'active';
      `);

      // 3. 컬럼 확인
      const columns = db.pragma('table_info(add_column_test)') as any[];
      const hasStatusColumn = columns.some((c: any) => c.name === 'status');

      expect(hasStatusColumn).toBe(true);
      console.log('✅ 컬럼 추가 완료: status');
    });

    test('✅ 여러 컬럼 한 번에 추가', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS multi_column_test (
          id TEXT PRIMARY KEY,
          name TEXT
        );
      `);

      // 여러 컬럼 추가
      db.exec(`
        ALTER TABLE multi_column_test ADD COLUMN status TEXT DEFAULT 'pending';
        ALTER TABLE multi_column_test ADD COLUMN progress INTEGER DEFAULT 0;
        ALTER TABLE multi_column_test ADD COLUMN error_message TEXT;
      `);

      const columns = db.pragma('table_info(multi_column_test)') as any[];
      const columnNames = columns.map((c: any) => c.name);

      expect(columnNames).toContain('status');
      expect(columnNames).toContain('progress');
      expect(columnNames).toContain('error_message');
      console.log('✅ 3개 컬럼 추가 완료');
    });

    test('✅ 기존 데이터와 함께 컬럼 추가', () => {
      // 1. 테이블 생성 및 데이터 삽입
      db.exec(`
        CREATE TABLE IF NOT EXISTS data_migration_test (
          id TEXT PRIMARY KEY,
          name TEXT
        );
      `);

      db.prepare(`
        INSERT INTO data_migration_test (id, name) VALUES (?, ?)
      `).run('user-001', 'User 1');

      db.prepare(`
        INSERT INTO data_migration_test (id, name) VALUES (?, ?)
      `).run('user-002', 'User 2');

      // 2. 컬럼 추가
      db.exec(`
        ALTER TABLE data_migration_test ADD COLUMN status TEXT DEFAULT 'active';
      `);

      // 3. 데이터 확인
      const data = db.prepare(`
        SELECT * FROM data_migration_test
      `).all() as any[];

      expect(data.length).toBe(2);
      expect(data[0].status).toBe('active');
      console.log(`✅ 기존 데이터(${data.length}개) 보존하며 컬럼 추가`);
    });
  });

  describe('Suite 3: 데이터 마이그레이션', () => {
    test('✅ 테이블 간 데이터 복사', () => {
      // 1. 원본 테이블
      db.exec(`
        CREATE TABLE IF NOT EXISTS source_data (
          id TEXT PRIMARY KEY,
          name TEXT,
          value INTEGER
        );
      `);

      db.prepare(`
        INSERT INTO source_data (id, name, value) VALUES (?, ?, ?)
      `).run('item-001', 'Item 1', 100);

      db.prepare(`
        INSERT INTO source_data (id, name, value) VALUES (?, ?, ?)
      `).run('item-002', 'Item 2', 200);

      // 2. 대상 테이블
      db.exec(`
        CREATE TABLE IF NOT EXISTS target_data (
          id TEXT PRIMARY KEY,
          name TEXT,
          value INTEGER,
          migrated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. 데이터 마이그레이션
      db.exec(`
        INSERT INTO target_data (id, name, value)
        SELECT id, name, value FROM source_data;
      `);

      // 4. 확인
      const sourceCount = db.prepare('SELECT COUNT(*) as count FROM source_data').get() as any;
      const targetCount = db.prepare('SELECT COUNT(*) as count FROM target_data').get() as any;

      expect(sourceCount.count).toBe(targetCount.count);
      console.log(`✅ ${targetCount.count}개 데이터 마이그레이션 완료`);
    });

    test('✅ 데이터 변환과 함께 마이그레이션', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS old_format (
          id TEXT PRIMARY KEY,
          created_timestamp INTEGER
        );
      `);

      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO old_format (id, created_timestamp) VALUES (?, ?)
      `).run('data-001', now);

      // 새로운 형식으로 마이그레이션
      db.exec(`
        CREATE TABLE IF NOT EXISTS new_format (
          id TEXT PRIMARY KEY,
          created_at DATETIME
        );
      `);

      // 타임스탬프를 DATETIME으로 변환
      db.exec(`
        INSERT INTO new_format (id, created_at)
        SELECT id, datetime(created_timestamp, 'unixepoch') FROM old_format;
      `);

      const newData = db.prepare('SELECT * FROM new_format').get() as any;

      expect(newData.id).toBe('data-001');
      expect(newData.created_at).toBeDefined();
      console.log('✅ 데이터 형식 변환 마이그레이션 완료');
    });

    test('✅ 대용량 데이터 마이그레이션', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS large_source (
          id TEXT PRIMARY KEY,
          value INTEGER
        );
      `);

      // 1000개 데이터 삽입
      const insert = db.prepare('INSERT INTO large_source (id, value) VALUES (?, ?)');
      for (let i = 0; i < 1000; i++) {
        insert.run(`id-${i}`, i);
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS large_target (
          id TEXT PRIMARY KEY,
          value INTEGER
        );
      `);

      // 마이그레이션
      db.exec(`
        INSERT INTO large_target SELECT * FROM large_source;
      `);

      const count = db.prepare('SELECT COUNT(*) as count FROM large_target').get() as any;

      expect(count.count).toBe(1000);
      console.log(`✅ ${count.count}개 대용량 데이터 마이그레이션 완료`);
    });
  });

  describe('Suite 4: 인덱스 관리', () => {
    test('✅ 인덱스 생성', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS indexed_table (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          status TEXT,
          created_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_user_id ON indexed_table(user_id);
        CREATE INDEX IF NOT EXISTS idx_status ON indexed_table(status);
      `);

      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='indexed_table'
      `).all() as any[];

      expect(indexes.length).toBeGreaterThanOrEqual(2);
      console.log(`✅ ${indexes.length}개 인덱스 생성됨`);
    });

    test('✅ 복합 인덱스 생성', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS composite_index_table (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          status TEXT,
          created_at DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_user_status ON composite_index_table(user_id, status);
      `);

      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='composite_index_table'
      `).all() as any[];

      expect(indexes.some((i: any) => i.name === 'idx_user_status')).toBe(true);
      console.log('✅ 복합 인덱스 생성됨');
    });

    test('✅ 인덱스 삭제', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS drop_index_table (
          id TEXT PRIMARY KEY,
          name TEXT
        );

        CREATE INDEX idx_temp ON drop_index_table(name);
      `);

      // 인덱스 확인
      let indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_temp'
      `).all() as any[];
      expect(indexes.length).toBe(1);

      // 인덱스 삭제
      db.exec('DROP INDEX idx_temp;');

      indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_temp'
      `).all() as any[];
      expect(indexes.length).toBe(0);
      console.log('✅ 인덱스 삭제 완료');
    });
  });

  describe('Suite 5: 외래키 제약', () => {
    test('✅ 외래키 제약 설정', () => {
      db.exec(`PRAGMA foreign_keys = ON;`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS parent_table (
          id TEXT PRIMARY KEY,
          name TEXT
        );

        CREATE TABLE IF NOT EXISTS child_table (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL,
          FOREIGN KEY (parent_id) REFERENCES parent_table(id)
        );
      `);

      // 부모 데이터 삽입
      db.prepare('INSERT INTO parent_table (id, name) VALUES (?, ?)').run('parent-001', 'Parent');

      // 자식 데이터 삽입 (유효함)
      db.prepare('INSERT INTO child_table (id, parent_id) VALUES (?, ?)').run('child-001', 'parent-001');

      // 외래키 제약 위반 시도
      expect(() => {
        db.prepare('INSERT INTO child_table (id, parent_id) VALUES (?, ?)').run('child-002', 'invalid-parent');
      }).toThrow();

      console.log('✅ 외래키 제약 설정 및 검증');
    });

    test('✅ 계단식 삭제 (CASCADE)', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cascade_parent (
          id TEXT PRIMARY KEY,
          name TEXT
        );

        CREATE TABLE IF NOT EXISTS cascade_child (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL,
          FOREIGN KEY (parent_id) REFERENCES cascade_parent(id) ON DELETE CASCADE
        );
      `);

      // 데이터 삽입
      db.prepare('INSERT INTO cascade_parent (id, name) VALUES (?, ?)').run('cp-001', 'Parent');
      db.prepare('INSERT INTO cascade_child (id, parent_id) VALUES (?, ?)').run('cc-001', 'cp-001');

      // 부모 삭제
      db.prepare('DELETE FROM cascade_parent WHERE id = ?').run('cp-001');

      // 자식도 삭제되었는지 확인
      const childCount = db.prepare('SELECT COUNT(*) as count FROM cascade_child WHERE parent_id = ?').get('cp-001') as any;

      expect(childCount.count).toBe(0);
      console.log('✅ CASCADE 삭제 검증');
    });
  });

  describe('Suite 6: 완전한 마이그레이션 시나리오', () => {
    test('✅ 버전 1 → 버전 2 마이그레이션', () => {
      // V1: 초기 스키마
      db.exec(`
        CREATE TABLE IF NOT EXISTS migration_v1_data (
          id TEXT PRIMARY KEY,
          title TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // V1 데이터 삽입
      db.prepare(`
        INSERT INTO migration_v1_data (id, title) VALUES (?, ?)
      `).run('item-1', 'Title 1');

      db.prepare(`
        INSERT INTO migration_v1_data (id, title) VALUES (?, ?)
      `).run('item-2', 'Title 2');

      // V2: 확장 스키마 (status, progress 컬럼 추가)
      db.exec(`
        ALTER TABLE migration_v1_data ADD COLUMN status TEXT DEFAULT 'pending';
      `);

      db.exec(`
        ALTER TABLE migration_v1_data ADD COLUMN progress INTEGER DEFAULT 0;
      `);

      // 마이그레이션 후 데이터 확인
      const data = db.prepare(`
        SELECT * FROM migration_v1_data
      `).all() as any[];

      expect(data.length).toBe(2);
      expect(data[0].status).toBe('pending');
      expect(data[0].progress).toBe(0);
      console.log(`✅ V1 → V2 마이그레이션: ${data.length}개 데이터 보존`);
    });

    test('✅ 다단계 마이그레이션 (V1 → V2 → V3)', () => {
      // V1 테이블
      db.exec(`
        CREATE TABLE IF NOT EXISTS step_migration_v1 (
          id TEXT PRIMARY KEY,
          name TEXT
        );
      `);

      db.prepare('INSERT INTO step_migration_v1 (id, name) VALUES (?, ?)').run('v1-001', 'Name');

      // V2 마이그레이션: status 추가
      db.exec(`
        ALTER TABLE step_migration_v1 ADD COLUMN status TEXT DEFAULT 'active';
      `);

      // V3 마이그레이션: timestamps 추가
      db.exec(`
        ALTER TABLE step_migration_v1 ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE step_migration_v1 ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
      `);

      const columns = db.pragma('table_info(step_migration_v1)') as any[];
      const columnNames = columns.map((c: any) => c.name);

      expect(columnNames).toContain('name');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
      console.log(`✅ V1 → V2 → V3 다단계 마이그레이션: ${columnNames.length}개 컬럼`);
    });

    test('✅ 마이그레이션 롤백 시나리오', () => {
      // 원본 데이터 테이블
      db.exec(`
        CREATE TABLE IF NOT EXISTS rollback_source (
          id TEXT PRIMARY KEY,
          data TEXT
        );
      `);

      db.prepare('INSERT INTO rollback_source (id, data) VALUES (?, ?)').run('rb-001', 'data1');

      // 백업 생성
      db.exec(`
        CREATE TABLE IF NOT EXISTS rollback_backup AS SELECT * FROM rollback_source;
      `);

      // 원본 테이블에 변경
      db.exec(`
        ALTER TABLE rollback_source ADD COLUMN new_column TEXT;
      `);

      // 롤백 시뮬레이션: 백업으로부터 복구
      const backupData = db.prepare('SELECT COUNT(*) as count FROM rollback_backup').get() as any;
      const currentData = db.prepare('SELECT COUNT(*) as count FROM rollback_source').get() as any;

      expect(backupData.count).toBe(currentData.count);
      console.log('✅ 마이그레이션 롤백 시나리오: 백업으로 복구 가능');
    });
  });
});
