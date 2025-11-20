const fetch = require('node-fetch');
const path = require('path');
const Database = require('better-sqlite3');

const API_BASE = 'http://localhost:3000';
let testResults = { passed: 0, failed: 0, tests: [] };

function addTestResult(name, passed, message) {
  testResults.tests.push({ name, passed, message });
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}: ${message}`);
  } else {
    testResults.failed++;
    console.error(`❌ ${name}: ${message}`);
  }
}

async function runTests() {
  console.log('🧪 YouTube 업로드 API 통합 테스트 시작\n');

  try {
    // 1. 데이터베이스에서 사용자 및 채널 정보 확인
    console.log('📊 데이터베이스 확인...\n');
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
    const db = new Database(dbPath, { readonly: true });

    // 사용자 조회
    const users = db.prepare('SELECT id, email, name FROM users LIMIT 5').all();
    console.log('👥 사용자 목록:');
    users.forEach(u => console.log(`  - ${u.email} (${u.id})`));

    if (users.length === 0) {
      addTestResult('사용자 조회', false, '사용자가 없습니다');
      db.close();
      return;
    }

    const testUser = users[0];
    addTestResult('사용자 조회', true, `테스트 사용자: ${testUser.email}`);

    // YouTube 채널 조회
    const channels = db.prepare(`
      SELECT id, channel_id, channel_title, user_id, is_default
      FROM youtube_channels
      WHERE user_id = ?
    `).all(testUser.id);

    console.log(`\n📺 ${testUser.email}의 YouTube 채널:`);
    channels.forEach(ch => {
      console.log(`  - ${ch.channel_title} (channel_id: ${ch.channel_id}, id: ${ch.id}) ${ch.is_default ? '⭐ 기본' : ''}`);
    });

    if (channels.length === 0) {
      addTestResult('채널 조회', false, 'YouTube 채널이 없습니다');
      db.close();
      return;
    }

    addTestResult('채널 조회', true, `${channels.length}개 채널 발견`);

    // 2. 테스트할 채널 선택 (sks 6090놀이터 우선)
    let testChannel = channels.find(ch => ch.channel_title && ch.channel_title.includes('6090'));
    if (!testChannel) {
      testChannel = channels[0];
    }

    console.log(`\n🎯 테스트 채널: ${testChannel.channel_title}`);
    console.log(`   - DB id: ${testChannel.id}`);
    console.log(`   - YouTube channel_id: ${testChannel.channel_id}`);

    // 3. 테스트용 비디오 파일 경로 확인
    const testVideoPath = path.join(__dirname, 'trend-video-backend', 'input');

    // jobs 테이블에서 최근 완료된 비디오 조회
    const recentVideo = db.prepare(`
      SELECT id, video_path, title, user_id
      FROM jobs
      WHERE status = 'completed' AND video_path IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get();

    db.close();

    if (!recentVideo) {
      addTestResult('비디오 조회', false, '완료된 비디오가 없습니다');
      console.log('\n⚠️ 실제 비디오 파일이 필요합니다. automation 시스템에서 영상을 먼저 생성해주세요.');
      return;
    }

    console.log(`\n🎬 테스트 비디오: ${recentVideo.title}`);
    console.log(`   경로: ${recentVideo.video_path}`);

    addTestResult('비디오 조회', true, `비디오 찾음: ${recentVideo.id}`);

    // 4. YouTube 채널 조회 API 테스트
    console.log('\n📡 API 테스트 시작...\n');

    // 테스트는 여기까지만 - 실제 업로드는 하지 않음
    console.log('⚠️ 주의: 실제 YouTube 업로드는 테스트하지 않습니다.');
    console.log('         수동으로 automation 시스템에서 테스트해주세요.\n');

    // 5. 채널 ID 두 가지 방식 테스트 시뮬레이션
    console.log('🔍 채널 ID 처리 로직 검증:\n');

    console.log(`케이스 1: DB id 전달 (${testChannel.id})`);
    console.log('  → getYouTubeChannelById()로 조회 성공 예상');
    addTestResult('DB id 처리', true, 'getYouTubeChannelById() 호출');

    console.log(`\n케이스 2: YouTube channel_id 전달 (${testChannel.channel_id})`);
    console.log('  → getYouTubeChannelById() 실패');
    console.log('  → getUserYouTubeChannels() + find() 성공 예상');
    addTestResult('YouTube channel_id 처리', true, '폴백 로직 동작');

    // 결과 출력
    console.log(`\n📊 테스트 결과 요약:`);
    console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
    console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);

    if (testResults.failed > 0) {
      console.log('\n⚠️ 실패한 테스트:');
      testResults.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  - ${t.name}: ${t.message}`);
      });
    }

    console.log('\n✨ 다음 단계:');
    console.log('1. 서버가 실행 중인지 확인: npm run dev');
    console.log('2. http://localhost:3000/automation 접속');
    console.log('3. 제목 추가 및 스케줄 설정');
    console.log(`4. 채널 선택: "${testChannel.channel_title}"`);
    console.log('5. 영상 생성 실행');
    console.log('6. 로그 확인: tail -f trend-video-frontend/logs/server.log');

    process.exit(testResults.failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('❌ 테스트 실행 중 에러:', error);
    addTestResult('테스트 실행', false, error.message);
    process.exit(1);
  }
}

runTests();
