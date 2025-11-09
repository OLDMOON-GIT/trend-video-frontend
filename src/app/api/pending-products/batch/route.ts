import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { v4 as uuidv4 } from 'uuid';

/**
 * DELETE - 작업 중지
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🛑 작업 중지 요청: ${jobId}`);

    // job 소유자 확인
    const job = db.prepare(`
      SELECT * FROM jobs WHERE id = ? AND user_id = ?
    `).get(jobId, user.userId) as any;

    if (!job) {
      return NextResponse.json(
        { error: '작업을 찾을 수 없거나 권한이 없습니다.' },
        { status: 404 }
      );
    }

    // 이미 완료/실패된 작업은 중지할 수 없음
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json(
        { error: '이미 완료된 작업은 중지할 수 없습니다.' },
        { status: 400 }
      );
    }

    // status를 cancelled로 업데이트
    db.prepare(`
      UPDATE jobs
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ?
    `).run(jobId);

    // 중지 로그 추가
    db.prepare(`
      INSERT INTO job_logs (job_id, log_message)
      VALUES (?, ?)
    `).run(jobId, '🛑 사용자가 작업을 중지했습니다.');

    console.log(`✅ 작업 ${jobId} 중지됨`);

    return NextResponse.json({
      success: true,
      message: '작업이 중지되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ 작업 중지 오류:', error);
    return NextResponse.json(
      { error: error?.message || '작업 중지 실패' },
      { status: 500 }
    );
  }
}

/**
 * 일괄 처리 API
 * - 여러 대기 상품을 한 번에 내 목록으로 이동
 * - 일괄 크롤링 + AI 처리
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: '처리할 상품을 선택해주세요.' },
        { status: 400 }
      );
    }

    console.log(`🚀 일괄 처리 시작: ${ids.length}개 상품, 액션: ${action}`);

    if (action === 'move-all-to-main') {
      // Job 생성
      const jobId = uuidv4();
      db.prepare(`
        INSERT INTO jobs (
          id, user_id, status, progress, step, title, type
        ) VALUES (?, ?, 'processing', 0, '준비 중', '상품 일괄 이동', 'product_batch')
      `).run(jobId, user.userId);

      // 초기 로그
      db.prepare(`
        INSERT INTO job_logs (job_id, log_message)
        VALUES (?, ?)
      `).run(jobId, `🚀 ${ids.length}개 상품 일괄 이동 시작`);

      // 즉시 jobId 반환
      const response = NextResponse.json({
        success: true,
        jobId,
        message: '백그라운드에서 처리 중입니다.'
      });

      // 백그라운드 작업 시작 (응답 후에도 계속 실행)
      processProductBatch(jobId, user.userId, ids).catch(error => {
        console.error('❌ 백그라운드 작업 실패:', error);
      });

      return response;
    }

    if (action === 'delete-all') {
      // 일괄 삭제
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`
        DELETE FROM crawled_product_links
        WHERE id IN (${placeholders}) AND user_id = ?
      `).run(...ids, user.userId);

      return NextResponse.json({
        success: true,
        deletedCount: result.changes,
        message: `${result.changes}개 상품이 삭제되었습니다.`
      });
    }

    return NextResponse.json(
      { error: '알 수 없는 액션' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('❌ 일괄 처리 오류:', error);
    return NextResponse.json(
      { error: error?.message || '일괄 처리 실패' },
      { status: 500 }
    );
  }
}

/**
 * 백그라운드 상품 일괄 처리
 */
async function processProductBatch(jobId: string, userId: string, ids: string[]) {
  let successCount = 0;
  let failCount = 0;
  const totalCount = ids.length;

  try {
    for (let i = 0; i < ids.length; i++) {
      const pendingId = ids[i];
      const currentIndex = i + 1;

      // 중지 요청 확인
      const jobStatus = db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId) as { status: string } | undefined;
      if (jobStatus?.status === 'cancelled') {
        console.log(`🛑 작업 ${jobId} 중지 요청됨`);
        db.prepare(`
          INSERT INTO job_logs (job_id, log_message)
          VALUES (?, ?)
        `).run(jobId, `🛑 사용자 요청으로 작업 중지됨 (${currentIndex - 1}/${totalCount} 완료)`);
        return; // 루프 종료
      }

      try {
        // 진행 상태 업데이트
        const progress = Math.floor((currentIndex / totalCount) * 100);
        db.prepare(`
          UPDATE jobs
          SET progress = ?, step = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(progress, `🖼️ [${currentIndex}/${totalCount}] 상품 정보 크롤링 중...`, jobId);

        // 로그 추가
        db.prepare(`
          INSERT INTO job_logs (job_id, log_message)
          VALUES (?, ?)
        `).run(jobId, `🖼️ [${currentIndex}/${totalCount}] 상품 정보 크롤링 중...`);

        // 대기 목록에서 조회
        const pending = db.prepare(`
          SELECT * FROM crawled_product_links
          WHERE id = ? AND user_id = ?
        `).get(pendingId, userId) as any;

        if (!pending) {
          failCount++;
          db.prepare(`
            INSERT INTO job_logs (job_id, log_message)
            VALUES (?, ?)
          `).run(jobId, `❌ [${currentIndex}/${totalCount}] 실패: 상품을 찾을 수 없음`);
          continue;
        }

        // 상품 정보 크롤링 (기본 정보만)
        let productInfo = {
          title: pending.title || '상품명',
          description: pending.description || '',
          imageUrl: pending.image_url || '',
          originalPrice: pending.original_price,
          discountPrice: pending.discount_price
        };

        // 상품 URL에서 정보 추출 시도
        if (!pending.title) {
          try {
            const scrapeResult = await scrapeBasicInfo(pending.product_url);
            productInfo = { ...productInfo, ...scrapeResult };
          } catch (error) {
            console.warn('⚠️ 크롤링 실패, 기본값 사용:', pendingId);
            db.prepare(`
              INSERT INTO job_logs (job_id, log_message)
              VALUES (?, ?)
            `).run(jobId, `⚠️ [${currentIndex}/${totalCount}] 크롤링 실패, 기본값 사용`);
          }
        }

        // 내 목록에 추가
        const productId = uuidv4();
        db.prepare(`
          INSERT INTO coupang_products (
            id, user_id, product_url, deep_link, title, description,
            category, original_price, discount_price, image_url, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `).run(
          productId,
          userId,
          pending.product_url,
          pending.product_url, // 딥링크는 나중에 생성
          productInfo.title,
          productInfo.description,
          pending.category || '기타',
          productInfo.originalPrice || null,
          productInfo.discountPrice || null,
          productInfo.imageUrl
        );

        // 대기 목록에서 삭제
        db.prepare(`
          DELETE FROM crawled_product_links WHERE id = ?
        `).run(pendingId);

        successCount++;
        db.prepare(`
          INSERT INTO job_logs (job_id, log_message)
          VALUES (?, ?)
        `).run(jobId, `✅ [${currentIndex}/${totalCount}] 성공: ${productInfo.title}`);

      } catch (error: any) {
        console.error(`❌ 상품 ${pendingId} 처리 실패:`, error);
        failCount++;
        db.prepare(`
          INSERT INTO job_logs (job_id, log_message)
          VALUES (?, ?)
        `).run(jobId, `❌ [${currentIndex}/${totalCount}] 실패: ${error.message}`);
      }
    }

    // 작업 완료
    db.prepare(`
      UPDATE jobs
      SET status = 'completed', progress = 100, step = '완료', updated_at = datetime('now')
      WHERE id = ?
    `).run(jobId);

    db.prepare(`
      INSERT INTO job_logs (job_id, log_message)
      VALUES (?, ?)
    `).run(jobId, `✅ 일괄 처리 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    console.log(`✅ Job ${jobId} 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

  } catch (error: any) {
    console.error(`❌ Job ${jobId} 실패:`, error);
    db.prepare(`
      UPDATE jobs
      SET status = 'failed', error = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(error.message, jobId);

    db.prepare(`
      INSERT INTO job_logs (job_id, log_message)
      VALUES (?, ?)
    `).run(jobId, `❌ 작업 실패: ${error.message}`);
  }
}

/**
 * 기본 정보 크롤링 (간단히)
 */
async function scrapeBasicInfo(productUrl: string): Promise<{
  title: string;
  description: string;
  imageUrl: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 제한 (쿠팡 파트너스 링크는 느림)

    const response = await fetch(productUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);

    const html = await response.text();

    // Open Graph 태그에서 정보 추출
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

    return {
      title: titleMatch ? titleMatch[1] : '상품명',
      description: descMatch ? descMatch[1] : '',
      imageUrl: imageMatch ? imageMatch[1] : ''
    };
  } catch (error) {
    return {
      title: '상품명',
      description: '',
      imageUrl: ''
    };
  }
}
