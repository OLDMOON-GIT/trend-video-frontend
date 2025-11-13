/**
 * TTS 미리듣기 기능 Regression Test
 *
 * 테스트 항목:
 * 1. 백엔드 preview_tts.py 스크립트 존재 확인
 * 2. edge-tts 설치 확인
 * 3. TTS 미리듣기 샘플 생성 테스트 (여성 음성)
 * 4. TTS 미리듣기 샘플 생성 테스트 (남성 음성)
 * 5. 속도 조절 테스트 (0.5x, 1.0x, 2.0x)
 * 6. API 엔드포인트 테스트 (로컬 서버 실행 시)
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(color, msg) {
  console.log(`${c[color]}${msg}${c.reset}`);
}

async function runTest() {
  log('cyan', '\n' + '='.repeat(60));
  log('cyan', '  TTS 미리듣기 기능 Regression Test');
  log('cyan', '='.repeat(60) + '\n');

  let testsPassed = 0;
  let testsFailed = 0;

  const backendPath = path.join(__dirname, '..', 'trend-video-backend');
  const previewScriptPath = path.join(backendPath, 'preview_tts.py');
  const tempDir = path.join(backendPath, 'temp_preview_test');

  try {
    // ============================================================
    // Test 1: preview_tts.py 스크립트 존재 확인
    // ============================================================
    log('blue', '\n[Test 1] preview_tts.py 스크립트 존재 확인\n');

    if (!fs.existsSync(previewScriptPath)) {
      throw new Error(`❌ preview_tts.py 스크립트가 없습니다: ${previewScriptPath}`);
    }

    log('green', `✅ preview_tts.py 스크립트 존재: ${previewScriptPath}`);
    testsPassed++;

    // ============================================================
    // Test 2: edge-tts 설치 확인
    // ============================================================
    log('blue', '\n[Test 2] edge-tts 설치 확인\n');

    try {
      const { stdout } = await execAsync('python -c "import edge_tts; print(edge_tts.__version__)"', {
        cwd: backendPath
      });
      log('green', `✅ edge-tts 설치됨: v${stdout.trim()}`);
      testsPassed++;
    } catch (error) {
      throw new Error('❌ edge-tts가 설치되지 않았습니다. pip install edge-tts를 실행하세요.');
    }

    // 테스트용 임시 디렉토리 생성
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // ============================================================
    // Test 3: 여성 음성 미리듣기 테스트
    // ============================================================
    log('blue', '\n[Test 3] 여성 음성 미리듣기 샘플 생성 테스트\n');

    const femaleVoice = 'ko-KR-SunHiNeural';
    const femaleOutputPath = path.join(tempDir, 'test_female.mp3');

    try {
      const cmd = `python "${previewScriptPath}" --voice "${femaleVoice}" --speed 1.0 --output "${femaleOutputPath}"`;
      log('yellow', `  실행: ${cmd}`);

      const { stdout, stderr } = await execAsync(cmd, {
        cwd: backendPath,
        timeout: 30000
      });

      if (stderr && !stderr.includes('✅')) {
        log('yellow', `  경고: ${stderr}`);
      }

      if (!fs.existsSync(femaleOutputPath)) {
        throw new Error('❌ 여성 음성 샘플 파일이 생성되지 않았습니다');
      }

      const stats = fs.statSync(femaleOutputPath);
      log('green', `✅ 여성 음성 샘플 생성 성공 (${femaleVoice})`);
      log('green', `   파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);
      testsPassed++;
    } catch (error) {
      log('red', `❌ 여성 음성 샘플 생성 실패: ${error.message}`);
      testsFailed++;
    }

    // ============================================================
    // Test 4: 남성 음성 미리듣기 테스트
    // ============================================================
    log('blue', '\n[Test 4] 남성 음성 미리듣기 샘플 생성 테스트\n');

    const maleVoice = 'ko-KR-InJoonNeural';
    const maleOutputPath = path.join(tempDir, 'test_male.mp3');

    try {
      const cmd = `python "${previewScriptPath}" --voice "${maleVoice}" --speed 1.0 --output "${maleOutputPath}"`;
      log('yellow', `  실행: ${cmd}`);

      const { stdout, stderr } = await execAsync(cmd, {
        cwd: backendPath,
        timeout: 30000
      });

      if (stderr && !stderr.includes('✅')) {
        log('yellow', `  경고: ${stderr}`);
      }

      if (!fs.existsSync(maleOutputPath)) {
        throw new Error('❌ 남성 음성 샘플 파일이 생성되지 않았습니다');
      }

      const stats = fs.statSync(maleOutputPath);
      log('green', `✅ 남성 음성 샘플 생성 성공 (${maleVoice})`);
      log('green', `   파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);
      testsPassed++;
    } catch (error) {
      log('red', `❌ 남성 음성 샘플 생성 실패: ${error.message}`);
      testsFailed++;
    }

    // ============================================================
    // Test 5: 속도 조절 테스트
    // ============================================================
    log('blue', '\n[Test 5] 속도 조절 테스트\n');

    const speeds = [
      { speed: 0.5, label: '느림 (0.5x)' },
      { speed: 1.0, label: '보통 (1.0x)' },
      { speed: 2.0, label: '빠름 (2.0x)' }
    ];

    for (const { speed, label } of speeds) {
      try {
        const outputPath = path.join(tempDir, `test_speed_${speed}.mp3`);
        const cmd = `python "${previewScriptPath}" --voice "ko-KR-SoonBokNeural" --speed ${speed} --output "${outputPath}"`;

        await execAsync(cmd, {
          cwd: backendPath,
          timeout: 30000
        });

        if (!fs.existsSync(outputPath)) {
          throw new Error(`❌ 속도 ${speed}x 샘플 파일이 생성되지 않았습니다`);
        }

        const stats = fs.statSync(outputPath);
        log('green', `  ✅ ${label}: ${(stats.size / 1024).toFixed(2)} KB`);
      } catch (error) {
        log('red', `  ❌ ${label} 실패: ${error.message}`);
        testsFailed++;
      }
    }

    testsPassed++;

    // ============================================================
    // Test 6: 모든 음성 타입 테스트
    // ============================================================
    log('blue', '\n[Test 6] 모든 TTS 음성 타입 테스트\n');

    const allVoices = [
      { id: 'ko-KR-SunHiNeural', name: '선희' },
      { id: 'ko-KR-SoonBokNeural', name: '순복' },
      { id: 'ko-KR-InJoonNeural', name: '인준' },
      { id: 'ko-KR-BongJinNeural', name: '봉진' },
      { id: 'ko-KR-GookMinNeural', name: '국민' },
    ];

    log('yellow', `  총 ${allVoices.length}개 음성 테스트\n`);

    let voiceSuccessCount = 0;
    for (const voice of allVoices) {
      try {
        const outputPath = path.join(tempDir, `test_${voice.id}.mp3`);
        const cmd = `python "${previewScriptPath}" --voice "${voice.id}" --speed 1.0 --output "${outputPath}"`;

        await execAsync(cmd, {
          cwd: backendPath,
          timeout: 30000
        });

        if (fs.existsSync(outputPath)) {
          log('green', `  ✅ ${voice.name} (${voice.id})`);
          voiceSuccessCount++;
        } else {
          log('red', `  ❌ ${voice.name} (${voice.id}) - 파일 생성 실패`);
        }
      } catch (error) {
        log('red', `  ❌ ${voice.name} (${voice.id}) - ${error.message}`);
      }
    }

    if (voiceSuccessCount === allVoices.length) {
      log('green', `\n✅ 모든 음성 타입 테스트 성공 (${voiceSuccessCount}/${allVoices.length})`);
      testsPassed++;
    } else {
      log('yellow', `\n⚠️ 일부 음성 타입 실패 (${voiceSuccessCount}/${allVoices.length})`);
      testsFailed++;
    }

    // ============================================================
    // Test 7: 테스트 데이터 정리
    // ============================================================
    log('blue', '\n[Test 7] 테스트 데이터 정리\n');

    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
      log('yellow', `  🧹 테스트 파일 ${files.length}개 삭제 완료`);
      testsPassed++;
    } catch (error) {
      log('yellow', `  ⚠️ 정리 중 오류: ${error.message}`);
    }

    // ============================================================
    // 테스트 결과 요약
    // ============================================================
    log('cyan', '\n' + '='.repeat(60));
    log('cyan', '  테스트 결과');
    log('cyan', '='.repeat(60) + '\n');

    log('green', `✅ 성공: ${testsPassed}개`);
    if (testsFailed > 0) {
      log('red', `❌ 실패: ${testsFailed}개`);
    }

    const totalTests = testsPassed + testsFailed;
    const successRate = ((testsPassed / totalTests) * 100).toFixed(1);

    if (testsFailed === 0) {
      log('green', `\n🎉 모든 테스트 통과! (${successRate}%)\n`);
    } else {
      log('red', `\n⚠️ 일부 테스트 실패 (성공률: ${successRate}%)\n`);
      process.exit(1);
    }

  } catch (error) {
    log('red', `\n❌ 테스트 실패: ${error.message}\n`);
    console.error(error);

    // 테스트 데이터 정리 시도
    try {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tempDir, file));
        }
        fs.rmdirSync(tempDir);
        log('yellow', '🧹 테스트 데이터 정리 완료');
      }
    } catch (cleanupError) {
      log('red', '⚠️ 정리 중 오류 발생');
    }

    process.exit(1);
  }
}

runTest();
