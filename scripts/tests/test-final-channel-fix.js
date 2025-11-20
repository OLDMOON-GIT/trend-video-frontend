const fs = require('fs');
const path = require('path');

async function runTest() {
  console.log('🧪 최종 채널 선택 수정 검증\n');

  try {
    // 1. youtube_channels.json 읽기
    const channelsFile = path.join(__dirname, 'trend-video-frontend', 'data', 'youtube_channels.json');
    const channelsData = JSON.parse(fs.readFileSync(channelsFile, 'utf-8'));

    const targetChannel = channelsData.find(ch => ch.channelTitle && ch.channelTitle.includes('6090'));
    if (!targetChannel) {
      console.error('❌ 6090놀이터 채널을 찾을 수 없습니다');
      return;
    }

    console.log('📺 테스트 대상 채널:');
    console.log(`   - 채널명: ${targetChannel.channelTitle}`);
    console.log(`   - youtube_channels.json id: ${targetChannel.id}`);
    console.log(`   - YouTube channel_id: ${targetChannel.channelId}`);

    // 2. 임시 비디오 파일 생성
    const testVideoPath = path.join(__dirname, 'test-video.mp4');
    if (!fs.existsSync(testVideoPath)) {
      fs.writeFileSync(testVideoPath, Buffer.alloc(1024));
    }

    // 3. 테스트 1: youtube_channels.json의 id로 요청 (automation이 사용하는 방식)
    console.log(`\n\n🧪 테스트: youtube_channels.json의 id로 요청`);
    console.log(`전달할 channelId: ${targetChannel.id}`);
    console.log(`기대 결과: youtube_channels.json에서 id로 매칭 → "${targetChannel.channelTitle}" 선택`);

    const response = await fetch('http://localhost:3000/api/youtube/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'test'
      },
      body: JSON.stringify({
        videoPath: testVideoPath,
        title: '[최종테스트] 6090놀이터 채널 선택',
        description: '채널 ID 처리 최종 테스트',
        channelId: targetChannel.id, // youtube_channels.json의 id 전달
        userId: targetChannel.userId
      })
    });

    console.log(`\n응답 상태: ${response.status}`);

    // 1초 대기
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 4. 서버 로그 확인
    const logPath = path.join(__dirname, 'trend-video-frontend', 'logs', 'server.log');
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n');
      const recentLogs = lines.slice(-100);

      const channelLogs = recentLogs.filter(line =>
        (line.includes('채널') ||
         line.includes('channel') ||
         line.includes('Channel') ||
         line.includes('조회') ||
         line.includes('재조회') ||
         line.includes('검증')) &&
        !line.includes('Navbar')
      ).slice(-50);

      console.log('\n📋 서버 로그 (채널 관련):');
      console.log('─'.repeat(80));
      channelLogs.forEach(log => console.log(log));
      console.log('─'.repeat(80));

      // 로그 분석
      const hasCorrectChannel = channelLogs.some(log =>
        log.includes(targetChannel.channelTitle)
      );

      const hasRequery = channelLogs.some(log =>
        log.includes('youtube_channels.json에서 재조회')
      );

      const hasSuccess = channelLogs.some(log =>
        log.includes('✅ 채널 검증 성공') && log.includes(targetChannel.channelTitle)
      );

      const hasError = channelLogs.some(log =>
        log.includes('❌') || (log.includes('Error') && !log.includes('NoError'))
      );

      console.log('\n📊 테스트 결과:');
      console.log('─'.repeat(80));
      console.log(`✅ youtube_channels.json 재조회: ${hasRequery ? 'YES' : 'NO'}`);
      console.log(`✅ 올바른 채널 선택: ${hasCorrectChannel ? `YES - "${targetChannel.channelTitle}"` : 'NO'}`);
      console.log(`✅ 채널 검증 성공: ${hasSuccess ? 'YES' : 'NO'}`);
      console.log(`❌ 에러 발생: ${hasError ? 'YES - 에러 있음' : 'NO - 정상'}`);
      console.log('─'.repeat(80));

      if (hasCorrectChannel && !hasError) {
        console.log('\n🎉 테스트 성공!');
        console.log(`   ✅ "${targetChannel.channelTitle}" 채널이 올바르게 선택되었습니다`);
        console.log(`   ✅ youtube_channels.json의 id로 정상 조회됨`);
        console.log('\n✨ automation 시스템에서도 올바른 채널로 업로드될 것입니다!');
      } else {
        console.log('\n❌ 테스트 실패');
        if (!hasCorrectChannel) {
          console.log(`   - "${targetChannel.channelTitle}" 채널을 찾을 수 없습니다`);
        }
        if (hasError) {
          console.log('   - 에러가 발생했습니다');
        }
      }
    }

    // 5. 임시 파일 삭제
    if (fs.existsSync(testVideoPath)) {
      fs.unlinkSync(testVideoPath);
      console.log(`\n🗑️ 임시 파일 삭제`);
    }

  } catch (error) {
    console.error('\n❌ 테스트 실행 중 에러:', error);
    console.error(error.stack);
  }
}

runTest();
