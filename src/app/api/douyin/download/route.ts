import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const BACKEND_DIR = path.join(process.cwd(), '..', 'trend-video-backend');
const OUTPUT_DIR = path.join(BACKEND_DIR, 'douyin_downloads');
const COOKIES_FILE = path.join(OUTPUT_DIR, 'cookies.txt');

// POST - Douyin URL로 영상 다운로드
export async function POST(request: NextRequest) {
  console.log('🎬 [Douyin Download] API 호출됨');

  try {
    console.log('🔐 [Douyin Download] 사용자 인증 확인 중...');
    const user = await getCurrentUser(request);
    if (!user) {
      console.log('❌ [Douyin Download] 인증 실패 - 로그인 필요');
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    console.log('✅ [Douyin Download] 사용자 인증 완료:', user.email);

    const body = await request.json();
    const { videoUrl } = body;
    console.log('📋 [Douyin Download] 요청된 URL:', videoUrl);

    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl이 필요합니다.' }, { status: 400 });
    }

    // URL 검증
    if (!videoUrl.includes('douyin.com') && !videoUrl.includes('iesdouyin.com')) {
      return NextResponse.json({ error: 'Douyin URL이 아닙니다.' }, { status: 400 });
    }

    // 출력 디렉토리 생성
    console.log('📁 [Douyin Download] 출력 디렉토리:', OUTPUT_DIR);
    try {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      console.log('✅ [Douyin Download] 출력 디렉토리 생성/확인 완료');
    } catch (err) {
      console.log('⚠️ [Douyin Download] 디렉토리 생성 실패 (이미 존재):', err);
    }

    // 쿠키 파일 확인
    let cookiesExist = false;
    try {
      await fs.access(COOKIES_FILE);
      cookiesExist = true;
      console.log('🍪 [Douyin Download] 쿠키 파일 발견:', COOKIES_FILE);
    } catch {
      console.log('⚠️ [Douyin Download] 쿠키 파일 없음:', COOKIES_FILE);
    }

    // Python 다운로더 실행
    console.log('🐍 [Douyin Download] Python 프로세스 시작...');
    const pythonCode = `
import sys
sys.path.append('${BACKEND_DIR.replace(/\\/g, '\\\\')}')
from src.douyin.downloader import DouyinDownloader
from pathlib import Path

cookies_file = Path('${COOKIES_FILE.replace(/\\/g, '\\\\')}') if ${cookiesExist ? 'True' : 'False'} else None
downloader = DouyinDownloader(
    output_dir=Path('${OUTPUT_DIR.replace(/\\/g, '\\\\')}'),
    cookies_file=cookies_file
)
result = downloader.download(
    video_url='${videoUrl}',
    video_id='direct_download',
    check_watermark=True
)

import json
print(json.dumps({
    'success': result.success,
    'video_path': str(result.video_path) if result.video_path else None,
    'error': result.error
}))
`;

    const pythonProcess = spawn('python', ['-c', pythonCode], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      }
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('📤 [Douyin Download] Python stdout:', text);
    });

    pythonProcess.stderr?.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error('📤 [Douyin Download] Python stderr:', text);
    });

    // 프로세스 완료 대기
    console.log('⏳ [Douyin Download] Python 프로세스 완료 대기 중...');
    await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        console.log(`🏁 [Douyin Download] Python 프로세스 종료 (코드: ${code})`);
        if (code === 0) {
          resolve(code);
        } else {
          console.error(`❌ [Douyin Download] 프로세스 실패 (코드: ${code})`);
          console.error('Error output:', errorOutput);
          reject(new Error(`프로세스 종료 코드: ${code}\n${errorOutput}`));
        }
      });

      pythonProcess.on('error', (err) => {
        console.error('❌ [Douyin Download] Python 프로세스 에러:', err);
        reject(err);
      });
    });

    // 결과 파싱
    console.log('📊 [Douyin Download] 결과 파싱 시작...');
    console.log('전체 출력:', output);
    const lines = output.split('\n').filter(line => line.trim());
    const lastLine = lines[lines.length - 1];
    console.log('마지막 라인:', lastLine);

    try {
      const result = JSON.parse(lastLine);
      console.log('✅ [Douyin Download] JSON 파싱 성공:', result);

      if (result.success) {
        console.log('🎉 [Douyin Download] 다운로드 성공!');
        return NextResponse.json({
          success: true,
          videoPath: result.video_path,
          message: '영상 다운로드 완료'
        });
      } else {
        console.log('❌ [Douyin Download] 다운로드 실패:', result.error);
        return NextResponse.json({
          success: false,
          error: result.error || '다운로드 실패'
        }, { status: 500 });
      }
    } catch (parseError) {
      console.error('❌ [Douyin Download] JSON 파싱 실패:', parseError);
      console.error('파싱하려던 내용:', output);
      return NextResponse.json({
        success: false,
        error: '결과 파싱 실패: ' + output
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ [Douyin Download] 예외 발생:', error);
    console.error('스택 트레이스:', error.stack);
    return NextResponse.json({
      success: false,
      error: error.message || '다운로드 중 오류 발생'
    }, { status: 500 });
  }
}

