import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getSocialMediaAccountById, getDefaultSocialMediaAccount, createSocialMediaUpload } from '@/lib/db';
import fs from 'fs';
import FormData from 'form-data';

/**
 * POST /api/social-media/facebook/upload - Facebook 비디오 업로드
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
      title = '',
      description = '',
      privacy = 'EVERYONE', // EVERYONE, FRIENDS, SELF
      accountId, // 업로드할 Facebook 계정 ID (선택사항)
      pageId // Facebook 페이지에 업로드할 경우
    } = body;

    if (!videoPath) {
      return NextResponse.json({ error: 'videoPath는 필수입니다' }, { status: 400 });
    }

    // 사용할 계정 결정
    let selectedAccount;
    if (accountId) {
      selectedAccount = getSocialMediaAccountById(accountId);
      if (!selectedAccount || selectedAccount.userId !== user.userId || selectedAccount.platform !== 'facebook') {
        return NextResponse.json({ error: '유효하지 않은 계정입니다' }, { status: 403 });
      }
    } else {
      selectedAccount = getDefaultSocialMediaAccount(user.userId, 'facebook');
      if (!selectedAccount) {
        return NextResponse.json({ error: 'Facebook 계정이 연결되지 않았습니다' }, { status: 400 });
      }
    }

    // 비디오 파일 확인
    if (!fs.existsSync(videoPath)) {
      return NextResponse.json({ error: '비디오 파일을 찾을 수 없습니다' }, { status: 404 });
    }

    const fileSize = fs.statSync(videoPath).size;

    // 페이지 또는 개인 프로필에 업로드
    const targetId = pageId || selectedAccount.accountId;

    // Step 1: 업로드 세션 초기화
    const initParams = new URLSearchParams({
      upload_phase: 'start',
      file_size: fileSize.toString(),
      access_token: selectedAccount.accessToken
    });

    const initResponse = await fetch(
      `https://graph.facebook.com/v18.0/${targetId}/videos?${initParams.toString()}`,
      { method: 'POST' }
    );

    if (!initResponse.ok) {
      const errorData = await initResponse.json().catch(() => ({}));
      console.error('Facebook 업로드 세션 초기화 실패:', errorData);
      return NextResponse.json({
        error: errorData.error?.message || '업로드 세션 초기화에 실패했습니다'
      }, { status: 500 });
    }

    const initData = await initResponse.json();
    const { video_id, upload_session_id } = initData;

    // Step 2: 비디오 파일 업로드
    const videoBuffer = fs.readFileSync(videoPath);

    const uploadParams = new URLSearchParams({
      upload_phase: 'transfer',
      upload_session_id: upload_session_id,
      start_offset: '0',
      access_token: selectedAccount.accessToken
    });

    const uploadResponse = await fetch(
      `https://graph.facebook.com/v18.0/${targetId}/videos?${uploadParams.toString()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: videoBuffer
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      console.error('Facebook 파일 업로드 실패:', errorData);
      return NextResponse.json({
        error: errorData.error?.message || '파일 업로드에 실패했습니다'
      }, { status: 500 });
    }

    // Step 3: 업로드 완료 및 퍼블리시
    const finishParams = new URLSearchParams({
      upload_phase: 'finish',
      upload_session_id: upload_session_id,
      access_token: selectedAccount.accessToken
    });

    if (title) finishParams.append('title', title);
    if (description) finishParams.append('description', description);

    // Privacy 설정
    finishParams.append('privacy', JSON.stringify({ value: privacy }));

    const finishResponse = await fetch(
      `https://graph.facebook.com/v18.0/${targetId}/videos?${finishParams.toString()}`,
      { method: 'POST' }
    );

    if (!finishResponse.ok) {
      const errorData = await finishResponse.json().catch(() => ({}));
      console.error('Facebook 업로드 완료 실패:', errorData);
      return NextResponse.json({
        error: errorData.error?.message || '업로드 완료에 실패했습니다'
      }, { status: 500 });
    }

    const finishData = await finishResponse.json();
    const success = finishData.success;

    if (!success) {
      return NextResponse.json({ error: '비디오 퍼블리시에 실패했습니다' }, { status: 500 });
    }

    // 업로드 기록 저장
    try {
      createSocialMediaUpload({
        userId: user.userId,
        jobId: body.jobId || undefined,
        platform: 'facebook',
        postId: video_id,
        postUrl: `https://www.facebook.com/watch/?v=${video_id}`,
        title,
        description,
        accountId: selectedAccount.id,
        accountUsername: selectedAccount.displayName,
        privacyStatus: privacy
      });
    } catch (dbError) {
      console.error('DB 저장 실패:', dbError);
    }

    return NextResponse.json({
      success: true,
      videoId: video_id,
      postUrl: `https://www.facebook.com/watch/?v=${video_id}`
    });

  } catch (error: any) {
    console.error('Facebook 업로드 실패:', error);
    return NextResponse.json({
      error: error.message || 'Facebook 업로드에 실패했습니다'
    }, { status: 500 });
  }
}
