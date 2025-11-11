import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { writeFile } from 'fs/promises';
import path from 'path';
import {
  findChineseConverterJobById,
  updateChineseConverterJob,
  addChineseConverterJobLog
} from '@/lib/db-chinese-converter';

/**
 * POST /api/chinese-converter/stop
 * 중국어 영상 변환 중지
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 사용자 인증
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    // jobId 파싱
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json({ error: 'jobId가 필요합니다' }, { status: 400 });
    }

    // 작업 확인
    const job = findChineseConverterJobById(jobId);
    if (!job) {
      return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });
    }

    // 권한 확인
    if (job.userId !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    // STOP 파일 생성 (영상 제작과 동일한 방식)
    const videoDir = path.dirname(job.videoPath || '');
    const stopFilePath = path.join(videoDir, 'STOP');

    // STOP 파일 생성
    await writeFile(stopFilePath, '');

    console.log(`🛑 중국영상변환 중지 요청: ${jobId}`);
    console.log(`   STOP 파일 생성: ${stopFilePath}`);

    // 로그 추가
    addChineseConverterJobLog(jobId, '🛑 사용자가 중지를 요청했습니다');

    // 상태 업데이트는 Python 프로세스가 STOP 파일을 감지하고 처리
    // 프로세스가 종료되면 자동으로 상태가 업데이트됨

    return NextResponse.json({
      success: true,
      message: '중지 요청이 전송되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 중국영상변환 중지 오류:', error);
    return NextResponse.json(
      { error: error.message || '중지 요청 중 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
