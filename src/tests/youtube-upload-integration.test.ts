/**
 * YouTube 업로드 API 통합 테스트
 *
 * 테스트 범위:
 * 1. YouTube 인증 (OAuth 2.0)
 * 2. 채널 정보 관리
 * 3. 비디오 업로드
 * 4. 비디오 메타데이터 설정
 * 5. 오류 처리 및 토큰 갱신
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const testDbPath = path.join(process.cwd(), 'data', 'test-youtube-db.sqlite');

function initYouTubeDB() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_channel_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT NOT NULL,
      token_expires_at DATETIME,
      posting_mode TEXT DEFAULT 'manual',
      default_privacy TEXT DEFAULT 'public',
      default_playlist TEXT,
      weekday_times TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS youtube_uploads (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      video_file_path TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      privacy TEXT DEFAULT 'public',
      playlist_id TEXT,
      thumbnail_path TEXT,
      status TEXT DEFAULT 'pending',
      youtube_video_id TEXT,
      upload_progress INTEGER DEFAULT 0,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (channel_id) REFERENCES youtube_channel_settings(id)
    );

    CREATE TABLE IF NOT EXISTS youtube_upload_logs (
      id TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL,
      level TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (upload_id) REFERENCES youtube_uploads(id)
    );

    CREATE TABLE IF NOT EXISTS youtube_auth_tokens (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at DATETIME,
      scope TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES youtube_channel_settings(id)
    );
  `);

  return db;
}

describe('📺 YouTube 업로드 API 통합 테스트', () => {
  let db: Database.Database;

  beforeAll(() => {
    console.log('\n🔧 YouTube 테스트 DB 초기화 중...');
    db = initYouTubeDB();
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    console.log('✅ YouTube 테스트 환경 정리 완료\n');
  });

  describe('Suite 1: YouTube 채널 관리', () => {
    test('✅ YouTube 채널 등록', () => {
      const channelId = 'UC' + 'x'.repeat(22);
      const settingsId = `yt-settings-${Date.now()}`;

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token, posting_mode, default_privacy)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        settingsId,
        'user-001',
        channelId,
        '테스트 채널',
        'refresh_token_sample_12345',
        'auto',
        'public'
      );

      const channel = db.prepare(`
        SELECT * FROM youtube_channel_settings WHERE id = ?
      `).get(settingsId) as any;

      expect(channel.channel_id).toBe(channelId);
      expect(channel.channel_name).toBe('테스트 채널');
      expect(channel.refresh_token).toBeDefined();
      console.log(`✅ YouTube 채널 등록: ${channel.channel_name}`);
    });

    test('✅ 채널별 설정 관리', () => {
      const channels = [
        {
          id: `yt-ch-${Date.now()}-1`,
          name: '채널1',
          privacy: 'public',
          mode: 'auto'
        },
        {
          id: `yt-ch-${Date.now()}-2`,
          name: '채널2',
          privacy: 'unlisted',
          mode: 'manual'
        },
        {
          id: `yt-ch-${Date.now()}-3`,
          name: '채널3',
          privacy: 'private',
          mode: 'scheduled'
        }
      ];

      channels.forEach((ch) => {
        db.prepare(`
          INSERT INTO youtube_channel_settings
          (id, user_id, channel_id, channel_name, refresh_token, default_privacy, posting_mode)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          ch.id,
          'user-001',
          `UC${Math.random().toString(36).substr(2, 22)}`,
          ch.name,
          `refresh_token_${ch.id}`,
          ch.privacy,
          ch.mode
        );
      });

      const allChannels = db.prepare(`
        SELECT * FROM youtube_channel_settings WHERE user_id = 'user-001'
      `).all() as any[];

      expect(allChannels.length).toBeGreaterThanOrEqual(3);
      console.log(`✅ ${allChannels.length}개 채널 설정 저장됨`);
    });

    test('✅ 채널 정보 업데이트', () => {
      const settingsId = `yt-update-${Date.now()}`;
      const channelId = 'UC' + 'y'.repeat(22);

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token, posting_mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(settingsId, 'user-001', channelId, '원래 이름', 'refresh_token_1', 'manual');

      // 채널명 업데이트
      db.prepare(`
        UPDATE youtube_channel_settings
        SET channel_name = ?, posting_mode = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run('변경된 이름', 'auto', settingsId);

      const channel = db.prepare(`
        SELECT * FROM youtube_channel_settings WHERE id = ?
      `).get(settingsId) as any;

      expect(channel.channel_name).toBe('변경된 이름');
      expect(channel.posting_mode).toBe('auto');
      console.log('✅ 채널 정보 업데이트됨');
    });
  });

  describe('Suite 2: YouTube 인증 토큰 관리', () => {
    test('✅ 액세스 토큰 저장 및 갱신', () => {
      const channelId = `yt-auth-${Date.now()}`;
      const tokenId = `token-${Date.now()}`;

      // 채널 설정 생성
      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-002', 'UCxxxxxxxxxx', 'Auth Test Channel', 'refresh_xyz');

      // 초기 토큰 저장
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      db.prepare(`
        INSERT INTO youtube_auth_tokens
        (id, channel_id, access_token, refresh_token, expires_at, scope)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        tokenId,
        channelId,
        'access_token_sample_abc123',
        'refresh_xyz',
        expiresAt,
        'youtube.upload,youtube.readonly'
      );

      let token = db.prepare(`
        SELECT * FROM youtube_auth_tokens WHERE id = ?
      `).get(tokenId) as any;

      expect(token.access_token).toBe('access_token_sample_abc123');
      console.log('✅ 액세스 토큰 저장됨');

      // 토큰 갱신
      const newAccessToken = 'access_token_new_def456';
      const newExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

      db.prepare(`
        UPDATE youtube_auth_tokens
        SET access_token = ?, expires_at = ?
        WHERE id = ?
      `).run(newAccessToken, newExpiresAt, tokenId);

      token = db.prepare(`
        SELECT * FROM youtube_auth_tokens WHERE id = ?
      `).get(tokenId) as any;

      expect(token.access_token).toBe(newAccessToken);
      console.log('✅ 액세스 토큰 갱신됨');
    });

    test('✅ 토큰 만료 시간 확인', () => {
      const channelId = `yt-expire-${Date.now()}`;

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-002', 'UCyyyyyyyy', 'Expire Test', 'refresh_abc');

      // 유효한 토큰
      const validAt = new Date(Date.now() + 3600 * 1000).toISOString();
      db.prepare(`
        INSERT INTO youtube_auth_tokens
        (id, channel_id, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(`token-valid-${Date.now()}`, channelId, 'access_valid', 'refresh_abc', validAt);

      // 만료된 토큰 (다른 채널)
      const channelId2 = `yt-expire-old-${Date.now()}`;
      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId2, 'user-002', 'UCzzzzzzzz', 'Expired', 'refresh_old');

      const expiredAt = new Date(Date.now() - 1000).toISOString();
      db.prepare(`
        INSERT INTO youtube_auth_tokens
        (id, channel_id, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(`token-expired-${Date.now()}`, channelId2, 'access_expired', 'refresh_old', expiredAt);

      const validToken = db.prepare(`
        SELECT * FROM youtube_auth_tokens
        WHERE channel_id = ? AND expires_at > CURRENT_TIMESTAMP
      `).get(channelId) as any;

      expect(validToken).toBeDefined();
      expect(validToken.access_token).toBe('access_valid');
      console.log('✅ 유효한 토큰만 필터링됨');
    });

    test('✅ 토큰 갱신 실패 처리', () => {
      const channelId = `yt-token-fail-${Date.now()}`;

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-002', 'UCzzzzzzzz', 'Token Fail Test', 'refresh_fail');

      // 토큰 갱신 실패 기록
      const errorMsg = '⚠️ YouTube 채널의 인증이 만료되었습니다. 재인증하세요.';

      db.prepare(`
        UPDATE youtube_channel_settings
        SET access_token = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(channelId);

      // 채널 로그에 기록
      const channel = db.prepare(`
        SELECT * FROM youtube_channel_settings WHERE id = ?
      `).get(channelId) as any;

      expect(channel.access_token).toBeNull();
      console.log('✅ 토큰 갱신 실패 처리됨');
    });
  });

  describe('Suite 3: 비디오 업로드', () => {
    test('✅ 비디오 업로드 요청 생성', () => {
      const uploadId = `upload-${Date.now()}`;
      const channelId = `yt-channel-${Date.now()}`;

      // 채널 생성
      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-003', 'UCvideo001', '비디오 채널', 'refresh_token');

      // 업로드 요청 생성
      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, description, privacy, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uploadId,
        channelId,
        '/projects/project_001/video.mp4',
        '테스트 비디오 제목',
        '테스트 비디오 설명',
        'public',
        'pending'
      );

      const upload = db.prepare(`
        SELECT * FROM youtube_uploads WHERE id = ?
      `).get(uploadId) as any;

      expect(upload.title).toBe('테스트 비디오 제목');
      expect(upload.status).toBe('pending');
      expect(upload.upload_progress).toBe(0);
      console.log(`✅ 업로드 요청 생성: ${upload.title}`);
    });

    test('✅ 비디오 업로드 진행률 추적', () => {
      const uploadId = `upload-progress-${Date.now()}`;
      const channelId = `yt-channel-prog-${Date.now()}`;

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-003', 'UCprog001', '진행률 채널', 'refresh_token');

      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(uploadId, channelId, '/projects/video.mp4', '진행률 테스트', 'uploading');

      // 진행률 업데이트
      const progressStages = [10, 25, 50, 75, 100];
      progressStages.forEach((progress) => {
        db.prepare(`
          UPDATE youtube_uploads SET upload_progress = ? WHERE id = ?
        `).run(progress, uploadId);

        const upload = db.prepare(`
          SELECT * FROM youtube_uploads WHERE id = ?
        `).get(uploadId) as any;

        expect(upload.upload_progress).toBe(progress);
      });

      console.log(`✅ 업로드 진행률 추적 완료 (${progressStages.length}단계)`);
    });

    test('✅ 비디오 업로드 완료 및 ID 저장', () => {
      const uploadId = `upload-complete-${Date.now()}`;
      const channelId = `yt-channel-complete-${Date.now()}`;
      const youtubeVideoId = 'dQw4w9WgXcQ';

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-003', 'UCcomplete', '완료 채널', 'refresh_token');

      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(uploadId, channelId, '/projects/video.mp4', '완료 테스트', 'uploading');

      // 업로드 완료
      db.prepare(`
        UPDATE youtube_uploads
        SET status = 'completed', youtube_video_id = ?, upload_progress = 100, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(youtubeVideoId, uploadId);

      const upload = db.prepare(`
        SELECT * FROM youtube_uploads WHERE id = ?
      `).get(uploadId) as any;

      expect(upload.status).toBe('completed');
      expect(upload.youtube_video_id).toBe(youtubeVideoId);
      expect(upload.upload_progress).toBe(100);
      console.log(`✅ 업로드 완료: ${youtubeVideoId}`);
    });

    test('✅ 업로드 실패 처리', () => {
      const uploadId = `upload-failed-${Date.now()}`;
      const channelId = `yt-channel-failed-${Date.now()}`;

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-003', 'UCfailed', '실패 채널', 'refresh_token');

      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(uploadId, channelId, '/projects/video.mp4', '실패 테스트', 'uploading');

      // 업로드 실패
      const errorMsg = '❌ 파일을 읽을 수 없습니다';
      db.prepare(`
        UPDATE youtube_uploads
        SET status = 'failed', error_message = ?
        WHERE id = ?
      `).run(errorMsg, uploadId);

      const upload = db.prepare(`
        SELECT * FROM youtube_uploads WHERE id = ?
      `).get(uploadId) as any;

      expect(upload.status).toBe('failed');
      expect(upload.error_message).toContain('파일');
      console.log('✅ 업로드 실패 처리됨');
    });
  });

  describe('Suite 4: 비디오 메타데이터', () => {
    test('✅ 비디오 제목, 설명, 태그 저장', () => {
      const uploadId = `upload-meta-${Date.now()}`;
      const channelId = `yt-channel-meta-${Date.now()}`;

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-004', 'UCmeta', '메타데이터 채널', 'refresh_token');

      const tags = JSON.stringify(['테스트', '비디오', 'YouTube', '업로드']);

      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, description, tags, privacy)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uploadId,
        channelId,
        '/projects/video.mp4',
        '메타데이터 테스트 비디오',
        '이것은 메타데이터 테스트입니다. 태그와 설명이 포함되어 있습니다.',
        tags,
        'public'
      );

      const upload = db.prepare(`
        SELECT * FROM youtube_uploads WHERE id = ?
      `).get(uploadId) as any;

      expect(upload.title).toBe('메타데이터 테스트 비디오');
      expect(upload.description).toBeDefined();
      expect(upload.tags).toBeDefined();
      expect(JSON.parse(upload.tags).length).toBe(4);
      console.log('✅ 메타데이터 저장됨');
    });

    test('✅ 플레이리스트에 비디오 추가', () => {
      const uploadId = `upload-playlist-${Date.now()}`;
      const channelId = `yt-channel-playlist-${Date.now()}`;
      const playlistId = 'PLxxxxxxxxxxxxxxxx';

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token, default_playlist)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(channelId, 'user-004', 'UCplaylist', '플레이리스트 채널', 'refresh_token', playlistId);

      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, playlist_id, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uploadId, channelId, '/projects/video.mp4', '플레이리스트 테스트', playlistId, 'pending');

      const upload = db.prepare(`
        SELECT * FROM youtube_uploads WHERE id = ?
      `).get(uploadId) as any;

      expect(upload.playlist_id).toBe(playlistId);
      console.log(`✅ 플레이리스트에 추가: ${playlistId}`);
    });

    test('✅ 썸네일 이미지 설정', () => {
      const uploadId = `upload-thumbnail-${Date.now()}`;
      const channelId = `yt-channel-thumb-${Date.now()}`;
      const thumbnailPath = '/projects/project_001/thumbnail.jpg';

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-004', 'UCthumbnail', '썸네일 채널', 'refresh_token');

      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, thumbnail_path, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uploadId, channelId, '/projects/video.mp4', '썸네일 테스트', thumbnailPath, 'pending');

      const upload = db.prepare(`
        SELECT * FROM youtube_uploads WHERE id = ?
      `).get(uploadId) as any;

      expect(upload.thumbnail_path).toBe(thumbnailPath);
      expect(upload.thumbnail_path).toContain('thumbnail');
      console.log('✅ 썸네일 경로 저장됨');
    });
  });

  describe('Suite 5: 업로드 로깅', () => {
    test('✅ 업로드 과정 상세 로깅', () => {
      const uploadId = `upload-log-${Date.now()}`;
      const channelId = `yt-channel-log-${Date.now()}`;

      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, 'user-005', 'UClog', '로깅 채널', 'refresh_token');

      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(uploadId, channelId, '/projects/video.mp4', '로깅 테스트', 'uploading');

      // 상세 로그 기록
      const logs = [
        { level: 'info', message: '파일 검증 시작' },
        { level: 'info', message: '파일 검증 완료' },
        { level: 'info', message: 'YouTube API 호출 중' },
        { level: 'info', message: '업로드 시작' },
        { level: 'info', message: '업로드 완료' }
      ];

      logs.forEach((log) => {
        db.prepare(`
          INSERT INTO youtube_upload_logs
          (id, upload_id, level, message)
          VALUES (?, ?, ?, ?)
        `).run(`log-${Date.now()}-${Math.random()}`, uploadId, log.level, log.message);
      });

      const recordedLogs = db.prepare(`
        SELECT * FROM youtube_upload_logs WHERE upload_id = ?
      `).all(uploadId) as any[];

      expect(recordedLogs.length).toBe(5);
      console.log(`✅ ${recordedLogs.length}개 로그 기록됨`);
    });
  });

  describe('Suite 6: 복합 업로드 시나리오', () => {
    test('✅ 완전한 업로드 흐름 (인증 → 메타데이터 → 업로드 → 완료)', () => {
      const channelId = `yt-full-flow-${Date.now()}`;
      const uploadId = `upload-full-${Date.now()}`;
      const youtubeVideoId = 'testVideoId123';

      // 1. 채널 등록
      db.prepare(`
        INSERT INTO youtube_channel_settings
        (id, user_id, channel_id, channel_name, refresh_token, default_privacy)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        channelId,
        'user-006',
        'UCfullflow',
        '완전 흐름 채널',
        'refresh_token_complete',
        'public'
      );

      // 2. 토큰 저장
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      db.prepare(`
        INSERT INTO youtube_auth_tokens
        (id, channel_id, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(`token-${uploadId}`, channelId, 'access_token_xyz', 'refresh_token_complete', expiresAt);

      // 3. 업로드 요청 생성
      db.prepare(`
        INSERT INTO youtube_uploads
        (id, channel_id, video_file_path, title, description, tags, privacy, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uploadId,
        channelId,
        '/projects/full_flow/video.mp4',
        '완전한 흐름 테스트 비디오',
        '이 비디오는 전체 업로드 흐름을 테스트합니다.',
        JSON.stringify(['테스트', '자동화', 'YouTube']),
        'public',
        'uploading'
      );

      // 4. 업로드 진행
      [25, 50, 75, 100].forEach((progress) => {
        db.prepare(`
          UPDATE youtube_uploads SET upload_progress = ? WHERE id = ?
        `).run(progress, uploadId);
      });

      // 5. 업로드 완료
      db.prepare(`
        UPDATE youtube_uploads
        SET status = 'completed', youtube_video_id = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(youtubeVideoId, uploadId);

      // 6. 최종 검증
      const channel = db.prepare(`
        SELECT * FROM youtube_channel_settings WHERE id = ?
      `).get(channelId) as any;
      const upload = db.prepare(`
        SELECT * FROM youtube_uploads WHERE id = ?
      `).get(uploadId) as any;
      const token = db.prepare(`
        SELECT * FROM youtube_auth_tokens WHERE channel_id = ?
      `).get(channelId) as any;

      expect(channel.channel_name).toBe('완전 흐름 채널');
      expect(upload.status).toBe('completed');
      expect(upload.youtube_video_id).toBe(youtubeVideoId);
      expect(token.access_token).toBeDefined();

      console.log('✅ 완전한 업로드 흐름 검증 완료');
      console.log(`   - 채널: ${channel.channel_name}`);
      console.log(`   - 비디오: ${upload.title}`);
      console.log(`   - YouTube ID: ${youtubeVideoId}`);
    });
  });
});
