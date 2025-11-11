import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getSocialMediaAccountById, getDefaultSocialMediaAccount, createSocialMediaUpload } from '@/lib/db';
import fs from 'fs';

/**
 * POST /api/social-media/instagram/upload - Instagram Reels 업로드
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    }

    const body = await request.json();
    const {
      videoUrl, // Instagram은 공개 URL이 필요
      caption = '',
      shareToFeed = true,
      accountId // 업로드할 Instagram 계정 ID (선택사항)
    } = body;

    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl은 필수입니다 (공개 URL)' }, { status: 400 });
    }

    // 사용할 계정 결정
    let selectedAccount;
    if (accountId) {
      selectedAccount = getSocialMediaAccountById(accountId);
      if (!selectedAccount || selectedAccount.userId !== user.userId || selectedAccount.platform !== 'instagram') {
        return NextResponse.json({ error: '유효하지 않은 계정입니다' }, { status: 403 });
      }
    } else {
      selectedAccount = getDefaultSocialMediaAccount(user.userId, 'instagram');
      if (!selectedAccount) {
        return NextResponse.json({ error: 'Instagram 계정이 연결되지 않았습니다' }, { status: 400 });
      }
    }

    // Step 1: 미디어 컨테이너 생성 (Reels)
    const containerParams = new URLSearchParams({
      video_url: videoUrl,
      caption: caption,
      share_to_feed: shareToFeed.toString(),
      media_type: 'REELS',
      access_token: selectedAccount.accessToken
    });

    const containerResponse = await fetch(
      `https://graph.instagram.com/v18.0/${selectedAccount.accountId}/media?${containerParams.toString()}`,
      { method: 'POST' }
    );

    if (!containerResponse.ok) {
      const errorData = await containerResponse.json().catch(() => ({}));
      console.error('Instagram 컨테이너 생성 실패:', errorData);
      return NextResponse.json({
        error: errorData.error?.message || '미디어 컨테이너 생성에 실패했습니다'
      }, { status: 500 });
    }

    const containerData = await containerResponse.json();
    const containerId = containerData.id;

    // Step 2: 업로드 상태 확인 (처리 완료 대기)
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 30; // 최대 30번 시도 (약 5분)

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10초 대기

      const statusResponse = await fetch(
        `https://graph.instagram.com/v18.0/${containerId}?fields=status_code&access_token=${selectedAccount.accessToken}`
      );

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        status = statusData.status_code;
      }

      attempts++;
    }

    if (status !== 'FINISHED') {
      return NextResponse.json({
        error: '비디오 처리가 완료되지 않았습니다. 나중에 다시 시도해주세요.'
      }, { status: 500 });
    }

    // Step 3: 미디어 퍼블리시
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: selectedAccount.accessToken
    });

    const publishResponse = await fetch(
      `https://graph.instagram.com/v18.0/${selectedAccount.accountId}/media_publish?${publishParams.toString()}`,
      { method: 'POST' }
    );

    if (!publishResponse.ok) {
      const errorData = await publishResponse.json().catch(() => ({}));
      console.error('Instagram 퍼블리시 실패:', errorData);
      return NextResponse.json({
        error: errorData.error?.message || '미디어 퍼블리시에 실패했습니다'
      }, { status: 500 });
    }

    const publishData = await publishResponse.json();
    const mediaId = publishData.id;

    // 업로드 기록 저장
    try {
      createSocialMediaUpload({
        userId: user.userId,
        jobId: body.jobId || undefined,
        platform: 'instagram',
        postId: mediaId,
        postUrl: `https://www.instagram.com/p/${mediaId}/`,
        title: caption.substring(0, 100),
        description: caption,
        accountId: selectedAccount.id,
        accountUsername: selectedAccount.username,
        privacyStatus: shareToFeed ? 'public' : 'reels_only'
      });
    } catch (dbError) {
      console.error('DB 저장 실패:', dbError);
    }

    return NextResponse.json({
      success: true,
      mediaId: mediaId,
      postUrl: `https://www.instagram.com/p/${mediaId}/`
    });

  } catch (error: any) {
    console.error('Instagram 업로드 실패:', error);
    return NextResponse.json({
      error: error.message || 'Instagram 업로드에 실패했습니다'
    }, { status: 500 });
  }
}
