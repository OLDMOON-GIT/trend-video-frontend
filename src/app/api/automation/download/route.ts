import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, existsSync, statSync } from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { pipeline } from 'stream';

const streamPipeline = promisify(pipeline);

/**
 * GET /api/automation/download?scriptId=xxx&type=video|script|materials|all&title=xxx
 * 완료된 프로젝트의 파일 다운로드
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scriptId = searchParams.get('scriptId');
    const type = searchParams.get('type'); // 'video' | 'script' | 'materials' | 'all'
    const title = searchParams.get('title') || 'download';

    if (!scriptId || !type) {
      return NextResponse.json({ error: 'scriptId and type are required' }, { status: 400 });
    }

    const backendPath = path.join(process.cwd(), '..', 'trend-video-backend');
    const inputPath = path.join(backendPath, 'input', `project_${scriptId}`);
    const outputPath = path.join(backendPath, 'output', `project_${scriptId}`);

    // 파일명으로 사용할 수 없는 문자 제거
    const sanitizedTitle = title.replace(/[<>:"/\\|*?]/g, '_');

    switch (type) {
      case 'video': {
        // 영상 파일 찾기 (.mp4)
        try {
          // output 폴더 존재 확인
          if (!existsSync(outputPath)) {
            console.error(`❌ output 폴더 없음: ${outputPath}`);
            return NextResponse.json({
              error: '영상 파일을 찾을 수 없습니다',
              details: `output 폴더가 없습니다. scriptId: ${scriptId}, 경로: ${outputPath}`
            }, { status: 404 });
          }

          console.log(`📂 output 폴더 읽기 시작: ${outputPath}`);
          const outputFiles = await fs.readdir(outputPath);
          console.log(`📋 폴더 내 파일 목록:`, outputFiles);

          const videoFile = outputFiles.find(f => f.endsWith('.mp4'));

          if (!videoFile) {
            console.error(`❌ MP4 파일 없음. 폴더 내 파일:`, outputFiles);
            return NextResponse.json({
              error: '영상 파일을 찾을 수 없습니다',
              details: `폴더에 MP4 파일이 없습니다. 폴더: ${outputPath}, 파일 개수: ${outputFiles.length}`
            }, { status: 404 });
          }

          const videoPath = path.join(outputPath, videoFile);
          console.log(`📹 영상 파일 다운로드 시작: ${videoPath}`);

          const stat = statSync(videoPath);
          const fileStream = createReadStream(videoPath);

          return new NextResponse(fileStream as any, {
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': stat.size.toString(),
              'Content-Disposition': `attachment; filename="${encodeURIComponent(sanitizedTitle)}.mp4"`
            }
          });
        } catch (error: any) {
          console.error('❌ Video download error:', error);
          return NextResponse.json({
            error: '영상 파일 다운로드 실패',
            details: `${error.message} (scriptId: ${scriptId}, outputPath: ${outputPath})`
          }, { status: 500 });
        }
      }

      case 'script': {
        // 대본 파일 (story.json)
        try {
          const storyPath = path.join(inputPath, 'story.json');

          if (!existsSync(storyPath)) {
            return NextResponse.json({ error: '대본 파일을 찾을 수 없습니다' }, { status: 404 });
          }

          const stat = statSync(storyPath);
          const fileStream = createReadStream(storyPath);

          return new NextResponse(fileStream as any, {
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': stat.size.toString(),
              'Content-Disposition': `attachment; filename="${encodeURIComponent(sanitizedTitle)}_script.json"`
            }
          });
        } catch (error: any) {
          console.error('Script download error:', error);
          return NextResponse.json({ error: '대본 파일 다운로드 실패', details: error.message }, { status: 500 });
        }
      }

      case 'materials': {
        // 재료 파일들 (images, audio) - ZIP으로 압축
        try {
          // input 폴더 존재 확인
          if (!existsSync(inputPath)) {
            return NextResponse.json({
              error: '재료 파일을 찾을 수 없습니다',
              details: `input 폴더가 없습니다. scriptId: ${scriptId}`
            }, { status: 404 });
          }

          const zipFilename = `${sanitizedTitle}_materials.zip`;
          const tempZipPath = path.join(backendPath, 'temp', zipFilename);

          // temp 폴더 생성
          await fs.mkdir(path.join(backendPath, 'temp'), { recursive: true });

          console.log('📦 재료 파일 ZIP 압축:', inputPath);

          // PowerShell로 ZIP 생성 (Windows 기본 명령어)
          await new Promise<void>((resolve, reject) => {
            const psCommand = `Compress-Archive -Path "${inputPath}\\*" -DestinationPath "${tempZipPath}" -Force`;

            console.log('PowerShell 명령:', psCommand);

            const ps = spawn('powershell.exe', ['-Command', psCommand]);

            let stderr = '';

            ps.stderr?.on('data', (data) => {
              stderr += data.toString();
            });

            ps.on('close', (code) => {
              if (code === 0) {
                console.log('✅ ZIP 생성 완료:', tempZipPath);
                resolve();
              } else {
                console.error('❌ ZIP 생성 실패:', stderr);
                reject(new Error(`ZIP creation failed: ${stderr || `exit code ${code}`}`));
              }
            });

            ps.on('error', (err) => {
              console.error('❌ PowerShell 프로세스 에러:', err);
              reject(err);
            });
          });

          const stat = statSync(tempZipPath);
          const fileStream = createReadStream(tempZipPath);

          // 스트림이 종료되면 임시 파일 삭제
          fileStream.on('end', async () => {
            try {
              await fs.unlink(tempZipPath);
            } catch (err) {
              console.error('Failed to delete temp ZIP:', err);
            }
          });

          return new NextResponse(fileStream as any, {
            headers: {
              'Content-Type': 'application/zip',
              'Content-Length': stat.size.toString(),
              'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFilename)}"`
            }
          });
        } catch (error: any) {
          console.error('Materials download error:', error);
          return NextResponse.json({ error: '재료 파일 다운로드 실패', details: error.message }, { status: 500 });
        }
      }

      case 'all': {
        // 모든 파일 (input + output) - ZIP으로 압축
        try {
          const zipFilename = `${sanitizedTitle}_all.zip`;
          const tempZipPath = path.join(backendPath, 'temp', zipFilename);

          // 폴더 존재 확인
          const inputExists = existsSync(inputPath);
          const outputExists = existsSync(outputPath);

          if (!inputExists && !outputExists) {
            return NextResponse.json({
              error: '프로젝트 폴더를 찾을 수 없습니다',
              details: `input 폴더와 output 폴더가 모두 없습니다. scriptId: ${scriptId}`
            }, { status: 404 });
          }

          // temp 폴더 생성
          await fs.mkdir(path.join(backendPath, 'temp'), { recursive: true });

          // 존재하는 폴더만 압축 대상에 포함
          const pathsToCompress: string[] = [];
          if (inputExists) pathsToCompress.push(inputPath);
          if (outputExists) pathsToCompress.push(outputPath);

          console.log('📦 ZIP 압축 대상:', pathsToCompress);

          // PowerShell로 ZIP 생성
          await new Promise<void>((resolve, reject) => {
            const pathArgs = pathsToCompress.map(p => `"${p}"`).join(',');
            const psCommand = `Compress-Archive -Path ${pathArgs} -DestinationPath "${tempZipPath}" -Force`;

            console.log('PowerShell 명령:', psCommand);

            const ps = spawn('powershell.exe', ['-Command', psCommand]);

            let stderr = '';

            ps.stderr?.on('data', (data) => {
              stderr += data.toString();
            });

            ps.on('close', (code) => {
              if (code === 0) {
                console.log('✅ ZIP 생성 완료:', tempZipPath);
                resolve();
              } else {
                console.error('❌ ZIP 생성 실패:', stderr);
                reject(new Error(`ZIP creation failed: ${stderr || `exit code ${code}`}`));
              }
            });

            ps.on('error', (err) => {
              console.error('❌ PowerShell 프로세스 에러:', err);
              reject(err);
            });
          });

          const stat = statSync(tempZipPath);
          const fileStream = createReadStream(tempZipPath);

          // 스트림이 종료되면 임시 파일 삭제
          fileStream.on('end', async () => {
            try {
              await fs.unlink(tempZipPath);
            } catch (err) {
              console.error('Failed to delete temp ZIP:', err);
            }
          });

          return new NextResponse(fileStream as any, {
            headers: {
              'Content-Type': 'application/zip',
              'Content-Length': stat.size.toString(),
              'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFilename)}"`
            }
          });
        } catch (error: any) {
          console.error('All files download error:', error);
          return NextResponse.json({ error: '전체 파일 다운로드 실패', details: error.message }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('GET /api/automation/download error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
