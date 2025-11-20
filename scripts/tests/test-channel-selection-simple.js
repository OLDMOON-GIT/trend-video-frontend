const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);
const API_BASE = 'http://localhost:3000';

async function runTest() {
  console.log('🧪 YouTube 채널 선택 테스트\n');

  try {
    // 1. 데이터베이스에서 채널 정보 조회
    const dbPath = path.join(__dirname, 'trend-video-frontend', 'data', 'database.sqlite');

    const query = `SELECT id, channel_id, channel_title, is_default FROM youtube_channels ORDER BY is_default DESC LIMIT 5`;
    const { stdout, stderr } = await execAsync(`sqlite3 "${dbPath}" "${query}"`);

    if (stderr) {
      console.error('❌ DB 조회 에러:', stderr);
      return;
    }

    console.log('📺 등록된 YouTube 채널:');
    const channels = stdout.trim().split('\n').filter(line => line).map(line => {
      const [id, channel_id, channel_title, is_default] = line.split('|');
      return { id, channel_id, channel_title, is_default: is_default === '1' };
    });

    channels.forEach((ch, idx) => {
      console.log(`  ${idx + 1}. ${ch.channel_title}`);
      console.log(`     - DB id: ${ch.id}`);
      console.log(`     - YouTube channel_id: ${ch.channel_id}`);
      console.log(`     - 기본 채널: ${ch.is_default ? '⭐ 예' : '아니오'}`);
    });

    if (channels.length === 0) {
      console.error('\n❌ YouTube 채널이 없습니다');
      return;
    }

    // 2. sks 6090놀이터 채널 찾기
    const targetChannel = channels.find(ch => ch.channel_title && ch.channel_title.includes('6090'));
    if (!targetChannel) {
      console.error('\n❌ "sks 6090놀이터" 채널을 찾을 수 없습니다');
      return;
    }

    console.log(`\n🎯 테스트 대상 채널: ${targetChannel.channel_title}`);
    console.log(`   - DB id: ${targetChannel.id}`);
    console.log(`   - YouTube channel_id: ${targetChannel.channel_id}`);

    // 3. 사용자 ID 조회
    const userQuery = `SELECT id FROM users WHERE email = 'moony75@gmail.com'`;
    const userResult = await execAsync(`sqlite3 "${dbPath}" "${userQuery}"`);
    const userId = userResult.stdout.trim();

    if (!userId) {
      console.error('\n❌ 사용자를 찾을 수 없습니다');
      return;
    }

    console.log(`\n👤 사용자 ID: ${userId}`);

    // 4. 임시 비디오 파일 생성
    const testVideoPath = path.join(__dirname, 'test-video.mp4');
    if (!fs.existsSync(testVideoPath)) {
      fs.writeFileSync(testVideoPath, Buffer.alloc(1024));
      console.log(`\n📁 임시 비디오 파일 생성: ${testVideoPath}`);
    }

    // 5. 테스트: YouTube channel_id로 API 호출
    console.log(`\n\n🧪 테스트: YouTube channel_id로 업로드 API 호출`);
    console.log(`전달할 channelId: ${targetChannel.channel_id}`);

    const response = await fetch(`${API_BASE}/api/youtube/upload`, {
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
        userId: userId
      })
    });

    console.log(`\n응답 상태: ${response.status}`);

    const responseText = await response.text();

    // JSON 파싱 시도
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('응답 데이터:', JSON.stringify(responseData, null, 2));
    } catch (e) {
      console.log('응답 본문 (첫 500자):', responseText.substring(0, 500));
    }

    // 6. 서버 로그에서 채널 선택 확인
    console.log('\n\n📋 서버 로그 확인:');

    await new Promise(resolve => setTimeout(resolve, 1000)); // 로그가 쓰여질 시간 대기

    const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n');
      const recentLogs = lines.slice(-100); // 최근 100줄

      // 채널 관련 로그만 필터링
      const channelLogs = recentLogs.filter(line =>
        (line.includes('채널') ||
         line.includes('channel') ||
         line.includes('Channel') ||
         line.includes('조회') ||
         line.includes('선택') ||
         line.includes('검증')) &&
        !line.includes('Navbar') // Navbar 로그 제외
      ).slice(-30); // 최근 30줄만

      if (channelLogs.length > 0) {
        console.log('\n🔍 채널 관련 로그 (최근 30줄):');
        channelLogs.forEach(log => console.log(log));

        // 채널 검증 확인
        const hasCorrectChannel = channelLogs.some(log =>
          log.includes(targetChannel.channel_title)
        );

        const hasChannelSuccess = channelLogs.some(log =>
          log.includes('✅ 채널 검증 성공') && log.includes(targetChannel.channel_title)
        );

        const hasFallback = channelLogs.some(log =>
          log.includes('YouTube 실제 channelId로 재조회')
        );

        console.log('\n\n📊 테스트 결과:');
        console.log(`✅ 올바른 채널 선택: ${hasCorrectChannel ? '예 (' + targetChannel.channel_title + ')' : '❌ 아니오'}`);
        console.log(`✅ 채널 검증 성공: ${hasChannelSuccess ? '예' : '로그 없음 (정상일 수 있음)'}`);
        console.log(`✅ 폴백 로직 실행: ${hasFallback ? '예 (YouTube channel_id로 재조회함)' : '아니오 (DB id로 바로 조회 성공)'}`);

        if (hasCorrectChannel) {
          console.log('\n🎉 테스트 성공! 채널이 올바르게 선택되었습니다.');
        } else {
          console.log('\n⚠️ 로그에서 채널 정보를 확인할 수 없습니다. 수동으로 로그를 확인해주세요.');
        }
      } else {
        console.log('⚠️ 채널 관련 로그를 찾을 수 없습니다. 전체 로그를 확인해주세요.');
        console.log('\n최근 로그 (전체 20줄):');
        recentLogs.slice(-20).forEach(log => console.log(log));
      }
    } else {
      console.log('❌ 서버 로그 파일을 찾을 수 없습니다');
    }

    // 7. 임시 파일 삭제
    if (fs.existsSync(testVideoPath)) {
      fs.unlinkSync(testVideoPath);
      console.log(`\n🗑️ 임시 파일 삭제: ${testVideoPath}`);
    }

  } catch (error) {
    console.error('\n❌ 테스트 실행 중 에러:', error);
    console.error(error.stack);
  }
}

runTest();
