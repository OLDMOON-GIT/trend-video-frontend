/**
 * 스마트 크롭 기능 테스트
 *
 * 테스트 시나리오:
 * 1. 16:9 가로 이미지를 사용하여 9:16 숏폼 영상 생성 요청
 * 2. 서버 로그에서 스마트 크롭 적용 확인
 * 3. 생성된 영상의 이미지가 올바르게 크롭되었는지 확인
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000';

async function testSmartCrop() {
  console.log('\n🧪 스마트 크롭 테스트 시작\n');

  // 테스트용 16:9 이미지 경로 (존재하는 이미지 사용)
  const testImageFolder = 'C:\\Users\\oldmoon\\workspace\\trend-video-backend\\uploads';

  // 테스트 폴더 찾기
  const folders = fs.readdirSync(testImageFolder)
    .filter(f => f.startsWith('uploaded_'))
    .sort((a, b) => {
      const statA = fs.statSync(path.join(testImageFolder, a));
      const statB = fs.statSync(path.join(testImageFolder, b));
      return statB.mtimeMs - statA.mtimeMs;
    });

  if (folders.length === 0) {
    console.log('❌ 테스트할 업로드 폴더가 없습니다.');
    return;
  }

  const latestFolder = folders[0];
  const folderPath = path.join(testImageFolder, latestFolder);

  console.log(`📁 테스트 폴더: ${latestFolder}`);

  // 16:9 비율의 이미지 찾기
  const imageFiles = fs.readdirSync(folderPath)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f) && f.startsWith('scene_'));

  if (imageFiles.length === 0) {
    console.log('❌ 테스트할 이미지가 없습니다.');
    return;
  }

  console.log(`\n📊 테스트 시나리오:`);
  console.log(`  - 폴더: ${latestFolder}`);
  console.log(`  - 이미지 개수: ${imageFiles.length}`);
  console.log(`  - 영상 형식: 9:16 (숏폼)`);
  console.log(`  - 예상 동작: 16:9 이미지가 있으면 스마트 크롭 적용\n`);

  // 숏폼 영상 생성 요청
  try {
    const response = await fetch(`${API_BASE}/api/generate-video-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        folder: latestFolder,
        aspectRatio: '9:16',  // 숏폼
        resolution: '1080x1920',
        fps: 30,
        videoCodec: 'h264_nvenc',
        audioBitrate: '192k',
        ttsVoice: 'ko-KR-SunHiNeural',
        bgm: 'uploads/bgm/default.mp3',
        bgmVolume: 0.3,
        maxDuration: 60,
        outputPath: 'test_smart_crop_output.mp4'
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ 영상 생성 작업 시작됨');
      console.log(`  - Job ID: ${result.jobId}`);
      console.log(`\n📝 서버 로그를 확인하여 다음 메시지를 찾아보세요:`);
      console.log(`  - "🎨 씨 X: 롱폼 이미지 감지"`);
      console.log(`  - "✂️ 스마트 크롭 적용 중"`);
      console.log(`  - "✨ 얼굴 중심 크롭" 또는 "ℹ️ 얼굴 미감지 (중앙 크롭 사용)"`);
      console.log(`  - "✅ 스마트 크롭 완료"`);

      console.log(`\n🔍 작업 상태 확인:`);
      console.log(`  ${API_BASE}/api/job-status/${result.jobId}`);

      // 작업 상태 폴링
      await pollJobStatus(result.jobId);
    } else {
      console.error('❌ 영상 생성 요청 실패:', result);
    }
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  }
}

async function pollJobStatus(jobId) {
  const maxAttempts = 60;  // 최대 5분 대기
  const interval = 5000;   // 5초마다 체크

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, interval));

    try {
      const response = await fetch(`${API_BASE}/api/job-status/${jobId}`);
      const status = await response.json();

      if (status.status === 'completed') {
        console.log('\n✅ 영상 생성 완료!');
        console.log(`  - 출력 파일: ${status.outputPath || 'test_smart_crop_output.mp4'}`);
        console.log(`\n✨ 테스트 성공! 생성된 영상을 재생하여 이미지가 올바르게 크롭되었는지 확인하세요.`);
        break;
      } else if (status.status === 'failed') {
        console.log('\n❌ 영상 생성 실패');
        console.log(`  - 오류: ${status.error || '알 수 없는 오류'}`);
        break;
      } else {
        process.stdout.write(`\r⏳ 진행 중... (${i * 5}초 경과, 상태: ${status.status})`);
      }
    } catch (error) {
      console.error('\n❌ 상태 확인 실패:', error.message);
      break;
    }
  }
}

// 테스트 실행
testSmartCrop().catch(console.error);
