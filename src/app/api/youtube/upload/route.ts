import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getYouTubeChannelById, getDefaultYouTubeChannel, createYouTubeUpload } from '@/lib/db';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import kill from 'tree-kill';

const BACKEND_PATH = path.join(process.cwd(), '..', 'trend-video-backend');
const YOUTUBE_CLI = path.join(BACKEND_PATH, 'youtube_upload_cli.py');
const CREDENTIALS_DIR = path.join(BACKEND_PATH, 'config');

// 실행 중인 YouTube 업로드 프로세스 관리
const runningUploads = new Map<string, ChildProcess>();

const COMMON_CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'youtube_client_secret.json');
function getUserTokenPath(userId: string): string {
  return path.join(CREDENTIALS_DIR, `youtube_token_${userId}.json`);
}

/**
 * POST /api/youtube/upload - 비디오 업로드
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const body = await request.json();
    const {
      videoPath,
      title,
      description = '',
      tags = [],
      privacy = 'unlisted',
      categoryId = '27',
      thumbnailPath,
      captionsPath,
      publishAt,
      channelId, // 업로드할 YouTube 채널 ID (선택사항, 없으면 기본 채널 사용)
      jobId
    } = body;

    if (!videoPath || !title) {
      return NextResponse.json({ error: 'videoPath와 title은 필수입니다' }, { status: 400 });
    }

    // Job 데이터에서 aspect_ratio 확인하여 Shorts 여부 판단
    let isShorts = false;
    if (jobId) {
      try {
        const { findJobById } = await import('@/lib/db');
        const job = await findJobById(jobId);
        if (job && job.aspectRatio === '9:16') {
          isShorts = true;
          console.log('✅ 숏폼(9:16) 감지 - YouTube Shorts로 업로드');
        }
      } catch (error) {
        console.warn('⚠️ Job 조회 실패, aspect_ratio 확인 불가:', error);
      }
    }

    // 사용할 채널 결정
    let selectedChannel;
    if (channelId) {
      // 특정 채널 ID가 제공된 경우
      console.log('🔍 채널 ID로 조회:', channelId);
      selectedChannel = await getYouTubeChannelById(channelId);
      console.log('📺 조회된 채널:', selectedChannel);
      console.log('👤 현재 사용자 ID:', user.userId);

      if (!selectedChannel) {
        console.error('❌ 채널을 찾을 수 없음:', channelId);
        return NextResponse.json({ error: '채널을 찾을 수 없습니다' }, { status: 404 });
      }

      if (selectedChannel.userId !== user.userId) {
        console.error('❌ 채널 소유자 불일치:', {
          channelUserId: selectedChannel.userId,
          currentUserId: user.userId
        });
        return NextResponse.json({ error: '유효하지 않은 채널입니다' }, { status: 403 });
      }

      console.log('✅ 채널 검증 성공:', selectedChannel.channelTitle);
    } else {
      // channelId가 없으면 기본 채널 사용
      console.log('🔍 기본 채널 조회 중... 사용자 ID:', user.userId);
      selectedChannel = await getDefaultYouTubeChannel(user.userId);
      if (!selectedChannel) {
        console.error('❌ 기본 채널 없음');
        return NextResponse.json({ error: 'YouTube 채널이 연결되지 않았습니다' }, { status: 400 });
      }
      console.log('✅ 기본 채널 선택:', selectedChannel.channelTitle);
    }

    // videoPath가 절대 경로인지 확인
    const fullVideoPath = path.isAbsolute(videoPath) ? videoPath : path.join(BACKEND_PATH, videoPath);

    console.log('📹 비디오 경로 확인:', { videoPath, fullVideoPath, exists: fs.existsSync(fullVideoPath) });

    if (!fs.existsSync(fullVideoPath)) {
      console.error('❌ 비디오 파일을 찾을 수 없음:', fullVideoPath);
      return NextResponse.json({ error: '비디오 파일을 찾을 수 없습니다' }, { status: 404 });
    }

    // Shorts인 경우 제목과 설명 자동 수정
    let finalTitle = title;
    let finalDescription = description;

    if (isShorts) {
      // 제목에 #Shorts 추가 (이미 있으면 추가 안 함)
      if (!finalTitle.includes('#Shorts') && !finalTitle.includes('#shorts')) {
        finalTitle = `${finalTitle} #Shorts`;
        console.log('📝 제목에 #Shorts 추가:', finalTitle);
      }

      // 설명 맨 앞에 #Shorts 추가 (YouTube가 더 잘 인식함)
      if (!finalDescription.includes('#Shorts') && !finalDescription.includes('#shorts')) {
        finalDescription = `#Shorts\n\n${finalDescription}`;
        console.log('📝 설명 맨 앞에 #Shorts 추가');
      }
    }

    // 메타데이터 JSON 생성
    const metadata = {
      title: finalTitle,
      description: finalDescription,
      tags,
      category_id: categoryId,
      privacy_status: privacy,
      publish_at: publishAt
    };
    const metadataPath = path.join(CREDENTIALS_DIR, `youtube_metadata_${Date.now()}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // 업로드 실행
    return new Promise((resolve) => {
      const credentialsPath = COMMON_CREDENTIALS_PATH;
      // 채널 추가 시와 동일한 토큰 경로 사용
      const tokenPath = path.join(CREDENTIALS_DIR, `youtube_token_${user.userId}_${selectedChannel.channelId}.json`);

      // 토큰 파일 존재 여부 확인
      console.log('🔑 토큰 파일 확인:', {
        userId: user.userId,
        channelId: selectedChannel.channelId,
        tokenPath,
        exists: fs.existsSync(tokenPath)
      });

      if (!fs.existsSync(tokenPath)) {
        console.error('❌ 토큰 파일이 존재하지 않음:', tokenPath);
        return resolve(NextResponse.json({
          error: '인증 실패',
          details: 'YouTube 토큰 파일을 찾을 수 없습니다. 채널을 다시 연결해주세요.',
          tokenPath
        }, { status: 401 }));
      }

      if (!fs.existsSync(credentialsPath)) {
        console.error('❌ Credentials 파일이 존재하지 않음:', credentialsPath);
        return resolve(NextResponse.json({
          error: '인증 실패',
          details: 'YouTube API Credentials가 설정되지 않았습니다.',
          credentialsPath
        }, { status: 401 }));
      }

      const args = [
        YOUTUBE_CLI,
        '--action', 'upload',
        '--credentials', credentialsPath,
        '--token', tokenPath,
        '--video', fullVideoPath,
        '--metadata', metadataPath
      ];

      if (thumbnailPath) {
        const fullThumbnailPath = path.isAbsolute(thumbnailPath) ? thumbnailPath : path.join(BACKEND_PATH, thumbnailPath);
        console.log('🖼️ 썸네일 경로 확인:', { thumbnailPath, fullThumbnailPath, exists: fs.existsSync(fullThumbnailPath) });
        if (fs.existsSync(fullThumbnailPath)) {
          args.push('--thumbnail', fullThumbnailPath);
        }
      }

      if (captionsPath) {
        const fullCaptionsPath = path.join(BACKEND_PATH, captionsPath);
        if (fs.existsSync(fullCaptionsPath)) {
          args.push('--captions', fullCaptionsPath);
        }
      }

      console.log('🐍 Python 실행 명령:', 'python', args.join(' '));

      const python = spawn('python', args);

      // jobId가 있으면 프로세스를 Map에 등록하여 취소 가능하도록 함
      const uploadId = body.jobId || `upload_${Date.now()}`;
      if (python.pid) {
        runningUploads.set(uploadId, python);
        console.log(`✅ YouTube 업로드 프로세스 등록: ${uploadId}, PID: ${python.pid}`);
      }

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('📤 Python stdout:', text);
        output += text;
      });

      python.stderr.on('data', (data) => {
        const text = data.toString();
        console.error('🔴 Python stderr:', text);
        errorOutput += text;
      });

      python.on('close', (code) => {
        // Map에서 제거
        runningUploads.delete(uploadId);
        console.log(`✅ YouTube 업로드 프로세스 제거: ${uploadId}`);

        // 메타데이터 파일 삭제
        try {
          if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
          }
        } catch {}

        console.log('🐍 Python 종료 코드:', code);
        console.log('📤 Python stdout:', output);
        if (errorOutput) {
          console.error('🔴 Python stderr:', errorOutput);
        }

        try {
          // 마지막 줄에서 JSON 추출 (로그 제외)
          const lines = output.trim().split('\n');
          const jsonLine = lines[lines.length - 1];
          const result = JSON.parse(jsonLine);
          if (result.success) {
            // YouTube 업로드 기록 저장
            try {
              const thumbnailUrl = `https://img.youtube.com/vi/${result.video_id}/maxresdefault.jpg`;

              createYouTubeUpload({
                userId: user.userId,
                jobId: body.jobId || undefined,
                videoId: result.video_id,
                videoUrl: result.video_url,
                title,
                description,
                thumbnailUrl,
                channelId: selectedChannel.channelId,
                channelTitle: selectedChannel.channelTitle,
                privacyStatus: privacy
              });

              console.log('✅ YouTube 업로드 기록 저장 완료');
            } catch (dbError) {
              console.error('❌ DB 저장 실패:', dbError);
              // DB 저장 실패해도 업로드는 성공이므로 계속 진행
            }

            resolve(NextResponse.json({
              success: true,
              videoId: result.video_id,
              videoUrl: result.video_url
            }));
          } else {
            resolve(NextResponse.json({
              error: result.error || '업로드 실패',
              details: errorOutput || '상세 정보 없음',
              stdout: output,
              stderr: errorOutput
            }, { status: 500 }));
          }
        } catch (parseError) {
          console.error('❌ JSON 파싱 실패:', parseError);
          console.error('❌ 원본 출력:', output);
          resolve(NextResponse.json({
            error: '업로드 프로세스 오류',
            details: errorOutput || output || 'No output',
            stdout: output,
            stderr: errorOutput,
            exitCode: code
          }, { status: 500 }));
        }
      });
    });

  } catch (error: any) {
    return NextResponse.json({ error: 'YouTube 업로드 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/youtube/upload - YouTube 업로드 중지
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const uploadId = searchParams.get('uploadId') || searchParams.get('jobId');

    if (!uploadId) {
      return NextResponse.json(
        { error: 'uploadId 또는 jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 YouTube 업로드 중지 요청: ${uploadId}`);

    const process = runningUploads.get(uploadId);

    if (process && process.pid) {
      const pid = process.pid;
      console.log(`🛑 프로세스 트리 종료 시작: Upload ${uploadId}, PID ${pid}`);

      try {
        // 먼저 SIGTERM으로 정상 종료 시도 (Python의 KeyboardInterrupt 실행)
        console.log(`🛑 SIGTERM 전송: PID ${pid} (정상 종료 시도)`);
        await new Promise<void>((resolve, reject) => {
          kill(pid, 'SIGTERM', (err) => {
            if (err) {
              console.error(`⚠️ SIGTERM 실패: ${err.message}`);
              reject(err);
            } else {
              console.log(`✅ SIGTERM 전송 완료: PID ${pid}`);
              resolve();
            }
          });
        });

        // Python 프로세스가 정리 작업을 할 시간 부여 (5초)
        console.log('⏳ Python 정리 작업 대기 중 (5초)...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 프로세스가 아직 살아있으면 SIGKILL로 강제 종료
        try {
          process.kill(pid, 0); // 프로세스 존재 확인 (signal 0)
          console.log(`⚠️ 프로세스 아직 실행 중, SIGKILL 전송: PID ${pid}`);
          await new Promise<void>((resolve, reject) => {
            kill(pid, 'SIGKILL', (err) => {
              if (err) {
                console.error(`❌ SIGKILL 실패: ${err.message}`);
                reject(err);
              } else {
                console.log(`✅ SIGKILL 성공: PID ${pid} 강제 종료`);
                resolve();
              }
            });
          });
        } catch {
          // 프로세스가 이미 종료됨
          console.log(`✅ 프로세스 정상 종료됨: PID ${pid}`);
        }

        // Windows 고아 Python 프로세스 정리
        if (process.platform === 'win32') {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          try {
            await execAsync('taskkill /F /FI "IMAGENAME eq python.exe" /FI "STATUS eq RUNNING" 2>nul');
            console.log('✅ Windows 좀비 프로세스 정리 완료');
          } catch {
            // 프로세스가 없으면 무시
          }
        }

        runningUploads.delete(uploadId);
        console.log(`✅ runningUploads에서 제거: ${uploadId}`);

        return NextResponse.json({
          success: true,
          message: 'YouTube 업로드가 중지되었습니다.',
        });

      } catch (error: any) {
        console.error(`❌ 프로세스 종료 실패: ${error.message}`);
        runningUploads.delete(uploadId);

        return NextResponse.json({
          error: '업로드 중지 실패',
          details: error.message
        }, { status: 500 });
      }
    } else {
      console.log(`⚠️ 실행 중인 업로드 프로세스 없음: ${uploadId}`);
      return NextResponse.json({
        success: true,
        message: '실행 중인 업로드가 없습니다.',
      });
    }

  } catch (error: any) {
    console.error('DELETE 핸들러 에러:', error);
    return NextResponse.json(
      { error: 'YouTube 업로드 중지 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
