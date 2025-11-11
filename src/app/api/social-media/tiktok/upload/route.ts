import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getSocialMediaAccountById, getDefaultSocialMediaAccount, createSocialMediaUpload } from '@/lib/db';
import fs from 'fs';

/**
 * POST /api/social-media/tiktok/upload - TikTok 비디오 업로드
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
      privacy = 'SELF_ONLY', // PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, SELF_ONLY
      accountId // 업로드할 TikTok 계정 ID (선택사항)
    } = body;

    if (!videoPath || !title) {
      return NextResponse.json({ error: 'videoPath와 title은 필수입니다' }, { status: 400 });
    }

    // 사용할 계정 결정
    let selectedAccount;
    if (accountId) {
      selectedAccount = getSocialMediaAccountById(accountId);
      if (!selectedAccount || selectedAccount.userId !== user.userId || selectedAccount.platform !== 'tiktok') {
        return NextResponse.json({ error: '유효하지 않은 계정입니다' }, { status: 403 });
      }
    } else {
      selectedAccount = getDefaultSocialMediaAccount(user.userId, 'tiktok');
      if (!selectedAccount) {
        return NextResponse.json({ error: 'TikTok 계정이 연결되지 않았습니다' }, { status: 400 });
      }
    }

    // 비디오 파일 확인
    if (!fs.existsSync(videoPath)) {
      return NextResponse.json({ error: '비디오 파일을 찾을 수 없습니다' }, { status: 404 });
    }

    const fileSize = fs.statSync(videoPath).size;

    // Step 1: 업로드 초기화
    const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${selectedAccount.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({
        post_info: {
          title: title,
          description: description,
          privacy_level: privacy,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: fileSize,
          chunk_size: fileSize, // 한 번에 업로드
          total_chunk_count: 1
        }
      })
    });

    if (!initResponse.ok) {
      const errorData = await initResponse.json().catch(() => ({}));
      console.error('TikTok 업로드 초기화 실패:', errorData);
      return NextResponse.json({
        error: errorData.error?.message || '업로드 초기화에 실패했습니다'
      }, { status: 500 });
    }

    const initData = await initResponse.json();
    const { publish_id, upload_url } = initData.data;

    // Step 2: 비디오 파일 업로드
    const videoBuffer = fs.readFileSync(videoPath);

    const uploadResponse = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize.toString()
      },
      body: videoBuffer
    });

    if (!uploadResponse.ok) {
      console.error('TikTok 파일 업로드 실패');
      return NextResponse.json({ error: '파일 업로드에 실패했습니다' }, { status: 500 });
    }

    // Step 3: 업로드 완료 확인
    const statusResponse = await fetch(
      `https://open.tiktokapis.com/v2/post/publish/status/${publish_id}/`,
      {
        headers: {
          'Authorization': `Bearer ${selectedAccount.accessToken}`
        }
      }
    );

    if (!statusResponse.ok) {
      console.error('TikTok 업로드 상태 확인 실패');
      return NextResponse.json({ error: '업로드 상태 확인에 실패했습니다' }, { status: 500 });
    }

    const statusData = await statusResponse.json();

    // 업로드 기록 저장
    try {
      createSocialMediaUpload({
        userId: user.userId,
        jobId: body.jobId || undefined,
        platform: 'tiktok',
        postId: publish_id,
        postUrl: statusData.data?.share_url || `https://www.tiktok.com/@${selectedAccount.username}`,
        title,
        description,
        accountId: selectedAccount.id,
        accountUsername: selectedAccount.username,
        privacyStatus: privacy
      });
    } catch (dbError) {
      console.error('DB 저장 실패:', dbError);
    }

    return NextResponse.json({
      success: true,
      publishId: publish_id,
      postUrl: statusData.data?.share_url,
      status: statusData.data?.status
    });

  } catch (error: any) {
    console.error('TikTok 업로드 실패:', error);
    return NextResponse.json({
      error: error.message || 'TikTok 업로드에 실패했습니다'
    }, { status: 500 });
  }
}
