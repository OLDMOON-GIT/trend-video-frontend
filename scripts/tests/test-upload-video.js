const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// 테스트할 titleId와 scriptId (실제 값으로 변경 필요)
const TITLE_ID = 'title_1763034024808_apvhfsle2';
const SCRIPT_ID = 'job_1763044825741_bh5psnf8a';

console.log('📹 [영상 제작 테스트] 시작');
console.log('   titleId:', TITLE_ID);
console.log('   scriptId:', SCRIPT_ID);

// 1. story.json 가져오기
console.log('\n1️⃣ story.json 가져오기...');
fetch(`http://localhost:3000/api/automation/get-story?scriptId=${SCRIPT_ID}`)
  .then(res => {
    console.log('   응답 상태:', res.status);
    return res.json();
  })
  .then(data => {
    if (data.error) {
      console.error('   ❌ 실패:', data.error);
      return;
    }

    console.log('   ✅ story.json 읽기 성공');
    console.log('   씬 개수:', data.storyJson?.scenes?.length || 0);

    // 2. 영상 생성 API 호출
    console.log('\n2️⃣ 영상 생성 API 호출...');
    return fetch('http://localhost:3000/api/generate-video-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'automation-system'
      },
      body: JSON.stringify({
        storyJson: data.storyJson,
        userId: 'b5d1f064-60b9-45ab-9bcd-d36948196459',
        imageSource: 'none',
        imageModel: 'dalle3',
        videoFormat: 'shortform',
        ttsVoice: 'ko-KR-SoonBokNeural',
        title: '테스트 영상',
        scriptId: SCRIPT_ID
      })
    });
  })
  .then(res => {
    console.log('   응답 상태:', res.status);
    return res.json();
  })
  .then(data => {
    if (data.error) {
      console.error('   ❌ 영상 생성 실패:', data.error);
    } else {
      console.log('   ✅ 영상 생성 성공:', data.jobId);
    }
  })
  .catch(error => {
    console.error('\n❌ 에러:', error.message);
  });
