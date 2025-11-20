const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('🧪 YouTube 채널 선택 API 테스트\n');

  try {
    // 1. YouTube 채널 JSON 파일 읽기
    const channelsFile = path.join(__dirname, 'trend-video-frontend', 'data', 'youtube_channels.json');

    if (!fs.existsSync(channelsFile)) {
      console.error('❌ youtube_channels.json 파일을 찾을 수 없습니다');
      return;
    }

    const channelsData = JSON.parse(fs.readFileSync(channelsFile, 'utf-8'));
    console.log(`📺 등록된 YouTube 채널 (${channelsData.length}개):\n`);

    channelsData.forEach((ch, idx) => {
      console.log(`  ${idx + 1}. ${ch.channelTitle}`);
      console.log(`     - DB id: ${ch.id}`);
      console.log(`     - YouTube channel_id: ${ch.channelId}`);
      console.log(`     - 사용자 ID: ${ch.userId}`);
      console.log(`     - 기본 채널: ${ch.isDefault ? '⭐ 예' : '아니오'}\n`);
    });

    if (channelsData.length === 0) {
      console.error('❌ YouTube 채널이 없습니다');
      return;
    }

    // 2. sks 6090놀이터 채널 찾기
    const targetChannel = channelsData.find(ch => ch.channelTitle && ch.channelTitle.includes('6090'));
    if (!targetChannel) {
      console.error('❌ "sks 6090놀이터" 채널을 찾을 수 없습니다');
      console.log('\n등록된 채널:');
      channelsData.forEach(ch => console.log(`  - ${ch.channelTitle}`));
      return;
    }

    console.log(`\n🎯 테스트 대상 채널: ${targetChannel.channelTitle}`);
    console.log(`   - DB id: ${targetChannel.id}`);
    console.log(`   - YouTube channel_id: ${targetChannel.channelId}`);
    console.log(`   - 사용자 ID: ${targetChannel.userId}`);

    // 3. 임시 비디오 파일 생성
    const testVideoPath = path.join(__dirname, 'test-video.mp4');
    if (!fs.existsSync(testVideoPath)) {
      fs.writeFileSync(testVideoPath, Buffer.alloc(1024));
      console.log(`\n📁 임시 비디오 파일 생성: ${testVideoPath}`);
    }

    // 4. 테스트 1: YouTube channel_id로 API 호출
    console.log(`\n\n🧪 테스트 1: YouTube channel_id로 업로드 API 호출`);
    console.log(`전달할 channelId: ${targetChannel.channelId} (YouTube 실제 ID)`);
    console.log(`기대 동작: DB id로 조회 실패 → getUserYouTubeChannels()로 재조회 → 성공`);

    const response1 = await fetch('http://localhost:3000/api/youtube/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'test'
      },
      body: JSON.stringify({
        videoPath: testVideoPath,
        title: '[테스트] 채널 선택 확인 - YouTube ID',
        description: '채널 ID 처리 테스트',
        channelId: targetChannel.channelId, // YouTube 실제 channel_id 전달
        userId: targetChannel.userId
      })
    });

    console.log(`\n응답 상태: ${response1.status}`);

    // 5. 1초 대기 후 로그 확인
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 6. 서버 로그 확인
    const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n');

      // 최근 로그 100줄 중 채널 관련 로그만 필터링
      const recentLogs = lines.slice(-100);
      const channelLogs = recentLogs.filter(line =>
        (line.includes('채널') ||
         line.includes('channel') ||
         line.includes('Channel') ||
         line.includes('조회') ||
         line.includes('선택') ||
         line.includes('검증') ||
         line.includes('재조회')) &&
        !line.includes('Navbar')
      ).slice(-40);

      console.log('\n📋 서버 로그 (채널 관련 최근 40줄):');
      console.log('─'.repeat(80));
      channelLogs.forEach(log => console.log(log));
      console.log('─'.repeat(80));

      // 로그 분석
      const hasRequery = channelLogs.some(log =>
        log.includes('YouTube 실제 channelId로 재조회')
      );

      const hasCorrectChannel = channelLogs.some(log =>
        log.includes(targetChannel.channelTitle)
      );

      const hasSuccess = channelLogs.some(log =>
        log.includes('✅ 채널 검증 성공')
      );

      const hasError = channelLogs.some(log =>
        log.includes('❌') || log.includes('에러') || log.includes('Error')
      );

      console.log('\n📊 테스트 결과 분석:');
      console.log(`─`.repeat(80));
      console.log(`✅ 폴백 로직 실행: ${hasRequery ? 'YES - YouTube channel_id로 재조회 실행됨' : 'NO - DB id로 바로 조회 성공'}`);
      console.log(`✅ 올바른 채널 선택: ${hasCorrectChannel ? `YES - "${targetChannel.channelTitle}" 선택됨` : 'NO - 로그에서 확인 불가'}`);
      console.log(`✅ 채널 검증 성공: ${hasSuccess ? 'YES' : 'NO - 로그에서 확인 불가'}`);
      console.log(`❌ 에러 발생: ${hasError ? 'YES - 에러 있음' : 'NO - 정상'}`);
      console.log(`─`.repeat(80));

      if (hasCorrectChannel && !hasError) {
        console.log('\n🎉 테스트 성공!');
        console.log(`   - 채널 "${targetChannel.channelTitle}"이(가) 올바르게 선택되었습니다.`);
        console.log(`   - YouTube channel_id (${targetChannel.channelId})로 요청 시 정상 처리됨`);
        console.log(`   - ${hasRequery ? '폴백 로직이 정상 동작함' : 'DB id로 직접 조회 성공'}`);
      } else {
        console.log('\n⚠️ 테스트 확인 필요');
        if (!hasCorrectChannel) {
          console.log(`   - 로그에서 "${targetChannel.channelTitle}" 채널을 확인할 수 없습니다`);
        }
        if (hasError) {
          console.log('   - 에러가 발생했습니다. 위 로그를 확인하세요');
        }
      }
    } else {
      console.log('\n❌ 서버 로그 파일을 찾을 수 없습니다');
    }

    // 7. 임시 파일 삭제
    if (fs.existsSync(testVideoPath)) {
      fs.unlinkSync(testVideoPath);
      console.log(`\n🗑️ 임시 파일 삭제: ${testVideoPath}`);
    }

    console.log('\n✨ 테스트 완료');

  } catch (error) {
    console.error('\n❌ 테스트 실행 중 에러:', error);
    console.error(error.stack);
  }
}

runTest();
