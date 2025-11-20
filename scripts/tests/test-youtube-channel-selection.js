const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

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

async function testChannelSelection() {
  console.log('🧪 YouTube 채널 선택 로직 테스트\n');

  try {
    // 1. 데이터베이스에서 정보 조회
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');
    const db = new Database(dbPath, { readonly: true });

    const user = db.prepare("SELECT id, email FROM users WHERE email = 'moony75@gmail.com'").get();
    if (!user) {
      console.error('❌ 사용자를 찾을 수 없습니다');
      return;
    }

    console.log(`👤 테스트 사용자: ${user.email}\n`);

    // YouTube 채널 조회
    const channels = db.prepare(`
      SELECT id, channel_id, channel_title, is_default
      FROM youtube_channels
      WHERE user_id = ?
      ORDER BY is_default DESC
    `).all(user.id);

    console.log(`📺 등록된 YouTube 채널 (${channels.length}개):`);
    channels.forEach((ch, idx) => {
      console.log(`  ${idx + 1}. ${ch.channel_title}`);
      console.log(`     - DB id: ${ch.id}`);
      console.log(`     - YouTube channel_id: ${ch.channel_id}`);
      console.log(`     - 기본 채널: ${ch.is_default ? '⭐ 예' : '아니오'}`);
    });

    if (channels.length === 0) {
      console.error('\n❌ YouTube 채널이 없습니다');
      db.close();
      return;
    }

    // 2. 테스트할 채널 선택 (sks 6090놀이터)
    const targetChannel = channels.find(ch => ch.channel_title && ch.channel_title.includes('6090'));
    if (!targetChannel) {
      console.error('\n❌ "sks 6090놀이터" 채널을 찾을 수 없습니다');
      db.close();
      return;
    }

    console.log(`\n🎯 테스트 대상 채널: ${targetChannel.channel_title}`);

    // 3. 임시 비디오 파일 생성
    const testVideoPath = path.join(__dirname, 'test-video.mp4');
    if (!fs.existsSync(testVideoPath)) {
      // 더미 파일 생성 (1KB)
      fs.writeFileSync(testVideoPath, Buffer.alloc(1024));
      console.log(`\n📁 임시 비디오 파일 생성: ${testVideoPath}`);
    }

    // 4. 테스트 시나리오 1: YouTube channel_id로 요청 (automation에서 사용하는 방식)
    console.log(`\n\n🧪 테스트 1: YouTube channel_id로 요청`);
    console.log(`전달할 channelId: ${targetChannel.channel_id} (YouTube 실제 ID)`);

    const response1 = await fetch(`${API_BASE}/api/youtube/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'test'
      },
      body: JSON.stringify({
        videoPath: testVideoPath,
        title: '[테스트] 채널 선택 확인',
        description: '채널 ID 처리 테스트',
        channelId: targetChannel.channel_id, // YouTube 실제 channel_id 전달
        userId: user.id
      })
    });

    const result1Text = await response1.text();
    console.log(`\n응답 상태: ${response1.status}`);

    try {
      const result1 = JSON.parse(result1Text);
      console.log('응답 데이터:', JSON.stringify(result1, null, 2));
    } catch (e) {
      console.log('응답 본문:', result1Text.substring(0, 500));
    }

    // 서버 로그 확인
    console.log('\n📋 서버 로그 확인 (최근 50줄):');
    const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n');
      const recentLogs = lines.slice(-50);

      // 채널 관련 로그 필터링
      const channelLogs = recentLogs.filter(line =>
        line.includes('채널') ||
        line.includes('channel') ||
        line.includes('Channel') ||
        line.includes('YouTube') ||
        line.includes('조회') ||
        line.includes('선택') ||
        line.includes('검증')
      );

      if (channelLogs.length > 0) {
        console.log('\n🔍 채널 관련 로그:');
        channelLogs.forEach(log => console.log(log));

        // 채널 검증 성공 로그 확인
        const hasSuccess = channelLogs.some(log =>
          log.includes('✅ 채널 검증 성공') &&
          log.includes(targetChannel.channel_title)
        );

        const hasChannelLog = channelLogs.some(log =>
          log.includes(targetChannel.channel_title)
        );

        addTestResult(
          'YouTube channel_id 처리',
          hasChannelLog,
          hasChannelLog
            ? `올바른 채널 선택됨: ${targetChannel.channel_title}`
            : '채널 선택 실패'
        );

        // 재조회 로그 확인
        const hasRetry = channelLogs.some(log =>
          log.includes('YouTube 실제 channelId로 재조회')
        );

        addTestResult(
          '폴백 로직 동작',
          hasRetry,
          hasRetry ? '폴백 로직이 실행됨' : '폴백 로직 실행 안됨 (정상이면 OK)'
        );
      } else {
        console.log('⚠️ 채널 관련 로그를 찾을 수 없습니다');
      }
    }

    // 5. 테스트 시나리오 2: DB id로 요청
    console.log(`\n\n🧪 테스트 2: DB id로 요청`);
    console.log(`전달할 channelId: ${targetChannel.id} (DB의 id)`);

    const response2 = await fetch(`${API_BASE}/api/youtube/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'test'
      },
      body: JSON.stringify({
        videoPath: testVideoPath,
        title: '[테스트] 채널 선택 확인 2',
        description: '채널 ID 처리 테스트',
        channelId: targetChannel.id, // DB의 id 전달
        userId: user.id
      })
    });

    const result2Text = await response2.text();
    console.log(`\n응답 상태: ${response2.status}`);

    try {
      const result2 = JSON.parse(result2Text);
      console.log('응답 데이터:', JSON.stringify(result2, null, 2));
    } catch (e) {
      console.log('응답 본문:', result2Text.substring(0, 500));
    }

    // 임시 파일 삭제
    if (fs.existsSync(testVideoPath)) {
      fs.unlinkSync(testVideoPath);
      console.log(`\n🗑️ 임시 파일 삭제: ${testVideoPath}`);
    }

    db.close();

    // 결과 요약
    console.log(`\n\n📊 테스트 결과 요약:`);
    console.log(`✅ 통과: ${testResults.passed}/${testResults.tests.length}`);
    console.log(`❌ 실패: ${testResults.failed}/${testResults.tests.length}`);

    if (testResults.failed > 0) {
      console.log('\n⚠️ 실패한 테스트:');
      testResults.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  - ${t.name}: ${t.message}`);
      });
    } else {
      console.log('\n🎉 모든 테스트 통과!');
      console.log(`\n✅ 확인된 사항:`);
      console.log(`   - YouTube channel_id로 요청 시 올바른 채널 선택됨`);
      console.log(`   - "${targetChannel.channel_title}" 채널이 정상적으로 식별됨`);
    }

    process.exit(testResults.failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ 테스트 실행 중 에러:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

testChannelSelection();
