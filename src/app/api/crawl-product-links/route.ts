import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { v4 as uuidv4 } from 'uuid';

type CrawlJobState = {
  userId: string;
  aborted: boolean;
  progress: number;
  status: string;
  logs: string[];
  historyId?: string;
  sourceUrl: string;
  totalLinks?: number;
};

// 크롤링 job 관리
const crawlJobs = new Map<string, CrawlJobState>();

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function ensureCrawlHistory(userId: string, sourceUrl: string, jobId: string): string {
  const normalizedUrl = sourceUrl.trim();
  const hostname = extractHostname(normalizedUrl) || null;
  const existing = db.prepare(`
    SELECT id FROM crawl_link_history
    WHERE user_id = ? AND source_url = ?
  `).get(userId, normalizedUrl) as { id: string } | undefined;

  const runningMessage = '크롤링을 준비 중입니다.';

  if (existing?.id) {
    db.prepare(`
      UPDATE crawl_link_history
      SET
        hostname = COALESCE(?, hostname),
        last_status = 'running',
        last_job_id = ?,
        last_message = ?,
        last_crawled_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(hostname, jobId, runningMessage, existing.id);
    return existing.id;
  }

  const historyId = uuidv4();
  db.prepare(`
    INSERT INTO crawl_link_history (
      id, user_id, source_url, hostname,
      last_status, last_job_id, last_message,
      last_crawled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'running', ?, ?, datetime('now'), datetime('now'), datetime('now'))
  `).run(historyId, userId, normalizedUrl, hostname, jobId, runningMessage);
  return historyId;
}

function updateCrawlHistory(
  historyId: string,
  {
    status,
    resultCount,
    duplicateCount,
    errorCount,
    totalLinks,
    message
  }: {
    status: 'running' | 'completed' | 'error' | 'aborted';
    resultCount?: number | null;
    duplicateCount?: number | null;
    errorCount?: number | null;
    totalLinks?: number | null;
    message?: string | null;
  }
) {
  const safeResult = resultCount ?? null;
  const safeDuplicate = duplicateCount ?? null;
  const safeError = errorCount ?? null;
  const safeTotal = totalLinks ?? (safeResult !== null || safeDuplicate !== null
    ? (safeResult ?? 0) + (safeDuplicate ?? 0)
    : null);
  const safeMessage = message ?? null;

  db.prepare(`
    UPDATE crawl_link_history
    SET
      last_status = ?,
      last_result_count = CASE WHEN ? IS NULL THEN last_result_count ELSE ? END,
      last_duplicate_count = CASE WHEN ? IS NULL THEN last_duplicate_count ELSE ? END,
      last_error_count = CASE WHEN ? IS NULL THEN last_error_count ELSE ? END,
      last_total_links = CASE WHEN ? IS NULL THEN last_total_links ELSE ? END,
      last_message = CASE WHEN ? IS NULL THEN last_message ELSE ? END,
      last_crawled_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    status,
    safeResult,
    safeResult,
    safeDuplicate,
    safeDuplicate,
    safeError,
    safeError,
    safeTotal,
    safeTotal,
    safeMessage,
    safeMessage,
    historyId
  );
}

function markHistoryAborted(historyId?: string, message?: string) {
  if (!historyId) return;
  updateCrawlHistory(historyId, {
    status: 'aborted',
    message: message || '사용자가 크롤링을 중지했습니다.'
  });
}

/**
 * 크롤링 job 조회
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    console.log('📡 GET 요청:', { jobId, totalJobs: crawlJobs.size });

    if (jobId) {
      const job = crawlJobs.get(jobId);
      console.log('🔍 Job 조회:', { jobId, found: !!job, userId: job?.userId, requestUserId: user.userId });

      if (job && job.userId === user.userId) {
        return NextResponse.json({ job: { id: jobId, ...job } });
      }

      // Job이 없거나 권한이 없는 경우
      if (!job) {
        console.warn(`⚠️ Job을 찾을 수 없음: ${jobId}. 현재 등록된 Jobs:`, Array.from(crawlJobs.keys()));
      }

      return NextResponse.json({ error: 'Job을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 대기 목록 반환 (기존 로직)
    const products = db.prepare(`
      SELECT * FROM crawled_product_links
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(user.userId);

    return NextResponse.json({ products });
  } catch (error: any) {
    console.error('❌ 조회 실패:', error);
    return NextResponse.json({ error: error?.message || '조회 실패' }, { status: 500 });
  }
}

/**
 * 외부 링크 모음 사이트 크롤링 API (큐 방식)
 * - 쿠팡 링크들을 추출해서 큐에 추가
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
    const sourceUrl = (body.sourceUrl || '').trim();

    if (!sourceUrl) {
      return NextResponse.json(
        { error: '크롤링할 URL을 입력해주세요.' },
        { status: 400 }
      );
    }

    console.log('🔍 링크 모음 크롤링 시작:', sourceUrl);

    // 1. HTML 다운로드
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log('📄 HTML 크기:', html.length, 'bytes');

    // 2. 쿠팡 링크 추출
    const coupangLinkPatterns = [
      /https?:\/\/link\.coupang\.com\/[a-zA-Z0-9\/]+/g,
      /https?:\/\/www\.coupang\.com\/[^\s"'<>]+/g,
      /https?:\/\/[^\s"'<>]*coupang[^\s"'<>]*/g
    ];

    const foundLinks = new Set<string>();

    for (const pattern of coupangLinkPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        matches.forEach(link => {
          const cleanLink = link.split('?')[0].split('#')[0];
          foundLinks.add(cleanLink);
        });
      }
    }

    const totalLinks = foundLinks.size;
    console.log(`✅ 쿠팡 링크 ${totalLinks}개 발견`);

    if (totalLinks === 0) {
      return NextResponse.json({
        success: true,
        addedCount: 0,
        totalLinks: 0,
        message: '쿠팡 링크를 찾을 수 없습니다.'
      });
    }

    // 3. 각 링크를 큐에 추가 (중복 체크)
    let addedCount = 0;
    let duplicateCount = 0;

    for (const productUrl of foundLinks) {
      // 중복 체크 (대기 목록)
      const existingPending = db.prepare(`
        SELECT id FROM crawled_product_links
        WHERE user_id = ? AND product_url = ?
      `).get(user.userId, productUrl);

      if (existingPending) {
        duplicateCount++;
        continue;
      }

      // 중복 체크 (내 목록)
      const existingMain = db.prepare(`
        SELECT id FROM coupang_products
        WHERE user_id = ? AND product_url = ?
      `).get(user.userId, productUrl);

      if (existingMain) {
        duplicateCount++;
        continue;
      }

      // 중복 체크 (큐)
      const existingQueue = db.prepare(`
        SELECT id FROM coupang_crawl_queue
        WHERE user_id = ? AND product_url = ?
      `).get(user.userId, productUrl);

      if (existingQueue) {
        duplicateCount++;
        continue;
      }

      // 큐에 추가
      const queueId = uuidv4();
      db.prepare(`
        INSERT INTO coupang_crawl_queue (
          id, user_id, product_url, status, retry_count, max_retries,
          timeout_seconds, destination, source_url
        ) VALUES (?, ?, ?, 'pending', 0, 3, 60, 'pending_list', ?)
      `).run(queueId, user.userId, productUrl, sourceUrl);

      addedCount++;
    }

    console.log(`✅ 큐에 추가: ${addedCount}개, 중복: ${duplicateCount}개`);

    // 4. 히스토리 업데이트
    const historyId = ensureCrawlHistory(user.userId, sourceUrl, 'batch');
    updateCrawlHistory(historyId, {
      status: 'completed',
      resultCount: addedCount,
      duplicateCount,
      totalLinks,
      message: `신규 ${addedCount}개, 중복 ${duplicateCount}개`
    });

    // 5. Worker 호출
    fetch(`${request.nextUrl.origin}/api/coupang-crawl-worker`, {
      method: 'GET'
    }).catch(err => {
      console.error('Worker 호출 실패:', err);
    });

    return NextResponse.json({
      success: true,
      addedCount,
      duplicateCount,
      totalLinks,
      message: `${addedCount}개 링크가 크롤링 큐에 추가되었습니다.`
    });

  } catch (error: any) {
    console.error('❌ 링크 모음 크롤링 오류:', error);
    return NextResponse.json(
      { error: error?.message || '크롤링 실패' },
      { status: 500 }
    );
  }
}

/**
 * 크롤링 실행 (백그라운드)
 */
async function runCrawlJob(jobId: string, userId: string, sourceUrl: string) {
  const job = crawlJobs.get(jobId);
  if (!job) return;
  const historyId = job.historyId;
  let totalLinks = 0;
  let addedCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  try {
    job.logs.push('📄 HTML 다운로드 중...');
    job.status = 'HTML 다운로드 중...';
    job.progress = 5;
    console.log('🔍 링크 모음 크롤링 시작:', sourceUrl);

    if (historyId) {
      updateCrawlHistory(historyId, {
        status: 'running',
        message: 'HTML을 다운로드하는 중입니다.'
      });
    }

    // 중지 확인
    if (job.aborted) {
      job.status = '중지됨';
      job.logs.push('⛔ 사용자가 크롤링을 중지했습니다.');
      markHistoryAborted(historyId);
      return;
    }

    // 페이지 크롤링
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log('📄 HTML 크기:', html.length, 'bytes');
    job.logs.push(`✅ HTML 다운로드 완료 (${Math.round(html.length / 1024)}KB)`);
    job.progress = 15;

    // 중지 확인
    if (job.aborted) {
      job.status = '중지됨';
      job.logs.push('⛔ 사용자가 크롤링을 중지했습니다.');
      markHistoryAborted(historyId);
      return;
    }

    // 쿠팡 링크 추출 (다양한 패턴 지원)
    job.status = '쿠팡 링크 추출 중...';
    job.logs.push('🔍 쿠팡 링크 추출 중...');

    const coupangLinkPatterns = [
      /https?:\/\/link\.coupang\.com\/[a-zA-Z0-9\/]+/g,
      /https?:\/\/www\.coupang\.com\/[^\s"'<>]+/g,
      /https?:\/\/[^\s"'<>]*coupang[^\s"'<>]*/g
    ];

    const foundLinks = new Set<string>();

    for (const pattern of coupangLinkPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        matches.forEach(link => {
          // URL 정리 (쿼리 파라미터 제거 등)
          const cleanLink = link.split('?')[0].split('#')[0];
          foundLinks.add(cleanLink);
        });
      }
    }

    totalLinks = foundLinks.size;
    console.log(`✅ 쿠팡 링크 ${totalLinks}개 발견`);
    job.logs.push(`✅ 쿠팡 링크 ${totalLinks}개 발견`);
    job.progress = 20;

    if (historyId) {
      updateCrawlHistory(historyId, {
        status: 'running',
        totalLinks,
        message: `쿠팡 링크 ${totalLinks}개를 발견했습니다.`
      });
    }

    if (totalLinks === 0) {
      job.status = '완료 - 링크 없음';
      job.logs.push('⚠️ 쿠팡 링크를 찾을 수 없습니다.');
      job.progress = 100;
      setTimeout(() => crawlJobs.delete(jobId), 60000); // 1분 후 삭제
      if (historyId) {
        updateCrawlHistory(historyId, {
          status: 'completed',
          resultCount: 0,
          duplicateCount: 0,
          errorCount: 0,
          totalLinks: 0,
          message: '쿠팡 링크를 찾을 수 없습니다.'
        });
      }
      return;
    }

    // 중지 확인
    if (job.aborted) {
      job.status = '중지됨';
      job.logs.push('⛔ 사용자가 크롤링을 중지했습니다.');
      return;
    }

    // 대기 목록에 추가 (중복 체크 + 정보 크롤링)
    const errors: string[] = [];

    let currentIndex = 0;
    const linksArray = Array.from(foundLinks);

    for (const productUrl of linksArray) {
      currentIndex++;

      // 중지 확인
      if (job.aborted) {
        job.status = '중지됨';
        job.logs.push(`⛔ 크롤링 중지 (${currentIndex}/${totalLinks})`);
        markHistoryAborted(historyId, `크롤링 중지 (${currentIndex}/${totalLinks})`);
        return;
      }

      try {
        // 진행률 업데이트 (20% ~ 95%)
        const progress = 20 + Math.floor((currentIndex / totalLinks) * 75);
        job.progress = progress;
        job.status = `상품 처리 중... (${currentIndex}/${totalLinks})`;

        // 링크 처리 사이 딜레이 (쿠팡 서버 부담 줄이기)
        if (currentIndex > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
        }

        // 1. 중복 체크
        const existing = db.prepare(`
          SELECT id FROM crawled_product_links
          WHERE user_id = ? AND product_url = ?
        `).get(userId, productUrl) as any;

        if (existing) {
          console.log(`⏭️ 중복 제외 (대기): ${productUrl}`);
          job.logs.push(`⏭️ [${currentIndex}/${totalLinks}] 중복 제외 (대기 중)`);
          duplicateCount++;
          continue;
        }

        const existingInMain = db.prepare(`
          SELECT id FROM coupang_products
          WHERE user_id = ? AND product_url = ?
        `).get(userId, productUrl);

        if (existingInMain) {
          console.log(`⏭️ 중복 제외 (내 목록): ${productUrl}`);
          job.logs.push(`⏭️ [${currentIndex}/${totalLinks}] 중복 제외 (내 목록)`);
          duplicateCount++;
          continue;
        }

        // 중지 확인
        if (job.aborted) {
          job.status = '중지됨';
          job.logs.push('⛔ 사용자가 크롤링을 중지했습니다.');
          markHistoryAborted(historyId);
          return;
        }

        // 2. 상품 정보 크롤링 (개별 추가 방식)
        console.log(`🔍 상품 정보 크롤링: ${productUrl}`);
        job.logs.push(`🖼️ [${currentIndex}/${totalLinks}] 상품 정보 크롤링 중...`);

        const productInfo = await scrapeProductInfo(productUrl);
        console.log(`✅ 제목: ${productInfo.title}, 썸네일: ${productInfo.imageUrl ? 'O' : 'X'}`);

        // 중지 확인
        if (job.aborted) {
          job.status = '중지됨';
          job.logs.push('⛔ 사용자가 크롤링을 중지했습니다.');
          markHistoryAborted(historyId);
          return;
        }

        // 3. AI 카테고리 분류
        let category = '기타';
        if (productInfo.title || productInfo.description) {
          job.logs.push(`🤖 [${currentIndex}/${totalLinks}] AI 카테고리 분류 중...`);
          category = await classifyCategory(productInfo.title, productInfo.description);
          console.log(`🤖 AI 카테고리: ${category}`);
        }

        // 중지 확인
        if (job.aborted) {
          job.status = '중지됨';
          job.logs.push('⛔ 사용자가 크롤링을 중지했습니다.');
          markHistoryAborted(historyId);
          return;
        }

        // 4. 대기 목록에 추가
        const pendingId = uuidv4();
        db.prepare(`
          INSERT INTO crawled_product_links (
            id, user_id, source_url, product_url, title, description,
            image_url, original_price, discount_price, category
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          pendingId,
          userId,
          sourceUrl,
          productUrl,
          productInfo.title,
          productInfo.description,
          productInfo.imageUrl,
          productInfo.originalPrice || null,
          productInfo.discountPrice || null,
          category
        );

        addedCount++;
        job.logs.push(`✅ [${currentIndex}/${totalLinks}] 상품 추가 완료: ${productInfo.title.substring(0, 40)}...`);

      } catch (error: any) {
        console.error(`❌ ${productUrl} 처리 실패:`, error.message);
        errorCount++;
        errors.push(`${productUrl.substring(0, 50)}...: ${error.message}`);
        job.logs.push(`❌ [${currentIndex}/${totalLinks}] 실패: ${error.message}`);
      }
    }

    console.log(`✅ 대기 목록 추가: ${addedCount}개, 중복: ${duplicateCount}개, 에러: ${errorCount}개`);

    job.progress = 100;
    job.status = `완료 - ${addedCount}개 추가, ${duplicateCount}개 중복, ${errorCount}개 실패`;
    job.logs.push(`🎉 크롤링 완료!`);
    job.logs.push(`   ✓ 신규 추가: ${addedCount}개`);
    job.logs.push(`   ⏭️ 중복 제외: ${duplicateCount}개`);
    if (errorCount > 0) {
      job.logs.push(`   ❌ 실패: ${errorCount}개`);
    }

    if (historyId) {
      updateCrawlHistory(historyId, {
        status: 'completed',
        resultCount: addedCount,
        duplicateCount,
        errorCount,
        totalLinks,
        message: `신규 ${addedCount}개, 중복 ${duplicateCount}개, 실패 ${errorCount}개`
      });
    }

    // 60초 후 job 삭제
    setTimeout(() => {
      crawlJobs.delete(jobId);
      console.log(`🗑️ Job ${jobId} 삭제됨`);
    }, 60000);

  } catch (error: any) {
    console.error('❌ 링크 크롤링 오류:', error);
    if (job) {
      job.status = '오류 발생';
      job.logs.push(`❌ 크롤링 오류: ${error.message}`);
      job.progress = 0;

      if (historyId) {
        updateCrawlHistory(historyId, {
          status: 'error',
          errorCount,
          totalLinks,
          message: error?.message || '크롤링 도중 오류가 발생했습니다.'
        });
      }

      // 에러 발생 시에도 60초 후 삭제
      setTimeout(() => crawlJobs.delete(jobId), 60000);
    }
  }
}

/**
 * Job 중지
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId가 필요합니다.' }, { status: 400 });
    }

    const job = crawlJobs.get(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (job.userId !== user.userId) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // Job 중지 플래그 설정
    job.aborted = true;
    job.status = '중지 요청됨...';
    job.logs.push('🛑 사용자가 중지를 요청했습니다.');
    markHistoryAborted(job.historyId, '사용자가 크롤링을 중지했습니다.');

    console.log(`🛑 크롤링 Job 중지: ${jobId}`);

    return NextResponse.json({
      success: true,
      message: '크롤링이 중지되었습니다.'
    });

  } catch (error: any) {
    console.error('❌ Job 중지 실패:', error);
    return NextResponse.json({ error: error?.message || 'Job 중지 실패' }, { status: 500 });
  }
}

/**
 * 축약 링크를 풀 링크로 확장 (리다이렉트 따라가기)
 */
async function expandShortLink(shortUrl: string): Promise<string> {
  // 이미 풀 링크면 그대로 반환
  if (shortUrl.includes('www.coupang.com/vp/products/') ||
      shortUrl.includes('www.coupang.com/re/')) {
    return shortUrl;
  }

  // 최대 2번 재시도 (빠른 실패)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8초로 단축

      const response = await fetch(shortUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      clearTimeout(timeoutId);

      if (response.ok && response.url) {
        console.log(`✅ [시도 ${attempt}] 링크 확장 성공: ${shortUrl} → ${response.url}`);
        return response.url;
      }
    } catch (error: any) {
      console.warn(`⚠️ [시도 ${attempt}/2] 링크 확장 실패: ${shortUrl} - ${error.message}`);
      if (attempt < 2) {
        // 1초 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // 모든 시도 실패 시 원본 반환
  console.error(`❌ 링크 확장 최종 실패, 원본 사용: ${shortUrl}`);
  return shortUrl;
}

/**
 * HTML head에서 meta 태그 추출
 */
function extractMetaTag(html: string, property: string): string | null {
  // og: 태그
  const ogPattern = new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
  let match = html.match(ogPattern);
  if (match) return match[1];

  // content가 먼저 오는 경우
  const ogPattern2 = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`, 'i');
  match = html.match(ogPattern2);
  if (match) return match[1];

  // name 태그
  const namePattern = new RegExp(`<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`, 'i');
  match = html.match(namePattern);
  if (match) return match[1];

  // content가 먼저 오는 경우
  const namePattern2 = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${property}["']`, 'i');
  match = html.match(namePattern2);
  if (match) return match[1];

  return null;
}

/**
 * HTML 엔티티 디코딩
 */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&quot;/g, '"')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&nbsp;/g, ' ')
             .replace(/&#39;/g, "'")
             .replace(/&apos;/g, "'");
}

/**
 * body 콘텐츠에서 상품 정보 추출 (meta 태그 실패 시 fallback)
 */
function extractFromBody(html: string): {
  title?: string;
  imageUrl?: string;
  price?: number;
} {
  const result: any = {};

  // 상품명: prod-buy-header__title, prod_title 등의 클래스 시도
  const titlePatterns = [
    /class=["']prod-buy-header__title["'][^>]*>([^<]+)</i,
    /class=["']prod_title["'][^>]*>([^<]+)</i,
    /class=["'][^"']*product[_-]?name[^"']*["'][^>]*>([^<]+)</i,
    /<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)</i,
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.title = match[1].trim();
      break;
    }
  }

  // 이미지: prod-image__detail, prod_img 등의 클래스나 data-src 속성
  const imagePatterns = [
    /class=["']prod-image__detail["'][^>]*src=["']([^"']+)["']/i,
    /class=["'][^"']*product[_-]?image[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /data-src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ];

  for (const pattern of imagePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.imageUrl = match[1].trim();
      break;
    }
  }

  // 가격: prod-price, total-price 등의 클래스
  const pricePatterns = [
    /class=["'][^"']*total[_-]?price[^"']*["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
    /class=["'][^"']*sale[_-]?price[^"']*["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
    /class=["'][^"']*prod[_-]?price[^"']*["'][^>]*>[\s\S]*?(\d{1,3}(?:,\d{3})*)/i,
  ];

  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const priceStr = match[1].replace(/,/g, '');
      const price = parseInt(priceStr);
      if (!isNaN(price) && price > 0) {
        result.price = price;
        break;
      }
    }
  }

  return result;
}

/**
 * 상품 정보 크롤링 (개선된 HTML 파싱 버전)
 */
async function scrapeProductInfo(productUrl: string): Promise<{
  title: string;
  description: string;
  imageUrl: string;
  originalPrice?: number;
  discountPrice?: number;
}> {
  console.log('🔍 상품 정보 크롤링 시작:', productUrl);

  const startTime = Date.now();

  try {
    // timeout을 60초로 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    console.log('📡 HTML 가져오는 중 (리다이렉트 자동 추적)...');

    // 실제 브라우저처럼 보이기 위한 헤더
    const response = await fetch(productUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Referer': 'https://www.coupang.com/',
      }
    });

    clearTimeout(timeoutId);
    const fetchTime = Date.now() - startTime;
    const finalUrl = response.url;
    console.log(`✅ HTML 다운로드 완료 (${fetchTime}ms)`);
    console.log(`🔗 최종 URL: ${finalUrl}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 HTML 크기: ${html.length.toLocaleString()} bytes`);

    // head 부분만 추출 (효율성)
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headHtml = headMatch ? headMatch[1] : html;

    // title 태그 추출
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : '';

    // 상품명 추출 (여러 방법 시도)
    let title = extractMetaTag(headHtml, 'og:title')
                || extractMetaTag(headHtml, 'twitter:title')
                || extractMetaTag(headHtml, 'title')
                || pageTitle.split('|')[0].split('-')[0].trim()
                || '';

    // HTML 엔티티 디코딩
    if (title) {
      title = decodeHtmlEntities(title);
    }

    // 썸네일 추출 (여러 방법 시도)
    let imageUrl = extractMetaTag(headHtml, 'og:image')
                   || extractMetaTag(headHtml, 'og:image:secure_url')
                   || extractMetaTag(headHtml, 'twitter:image')
                   || extractMetaTag(headHtml, 'twitter:image:src')
                   || '';

    // 상대 URL을 절대 URL로 변환
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = new URL(imageUrl, finalUrl).href;
    }

    // 설명 추출 (여러 방법 시도)
    let description = extractMetaTag(headHtml, 'og:description')
                      || extractMetaTag(headHtml, 'twitter:description')
                      || extractMetaTag(headHtml, 'description')
                      || '';

    // HTML 엔티티 디코딩
    if (description) {
      description = decodeHtmlEntities(description);
    }

    // 설명 길이 제한 (200자)
    if (description.length > 200) {
      description = description.substring(0, 200);
    }

    // 가격 시도 (product:price, og:price 등)
    const priceStr = extractMetaTag(headHtml, 'product:price:amount')
                     || extractMetaTag(headHtml, 'og:price:amount')
                     || extractMetaTag(headHtml, 'product:sale_price')
                     || null;

    let discountPrice: number | undefined;
    if (priceStr) {
      const parsed = parseInt(priceStr.replace(/[^0-9]/g, ''));
      if (!isNaN(parsed)) {
        discountPrice = parsed;
      }
    }

    // Fallback: meta 태그에서 추출 실패 시 body에서 시도
    if (!title || !imageUrl) {
      const bodyData = extractFromBody(html);

      if (!title && bodyData.title) {
        title = decodeHtmlEntities(bodyData.title);
        console.log(`✅ 상품명 (body fallback): ${title.substring(0, 40)}...`);
      }

      if (!imageUrl && bodyData.imageUrl) {
        imageUrl = bodyData.imageUrl;
        if (!imageUrl.startsWith('http')) {
          imageUrl = new URL(imageUrl, finalUrl).href;
        }
        console.log(`✅ 썸네일 (body fallback)`);
      }

      if (!discountPrice && bodyData.price) {
        discountPrice = bodyData.price;
      }
    }

    // 최종 검증
    if (!title) {
      title = '상품명';
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ 크롤링 완료 (총 ${totalTime}ms)`);

    return {
      title,
      description,
      imageUrl,
      originalPrice: undefined,
      discountPrice
    };

  } catch (error: any) {
    console.error('❌ 크롤링 실패:', error?.message);

    if (error.name === 'AbortError') {
      throw new Error('크롤링 타임아웃 (60초 초과)');
    }

    throw new Error(`크롤링 실패: ${error?.message}`);
  }
}

/**
 * AI 카테고리 분류
 */
async function classifyCategory(title: string, description: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return '기타';
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `다음 상품을 카테고리로 분류해주세요. 카테고리 이름만 한글로 답변하세요.

카테고리 목록: 패션, 뷰티, 식품, 생활용품, 디지털, 가전, 스포츠, 완구, 도서, 반려동물, 자동차, 기타

상품명: ${title}
설명: ${description}

카테고리:`
        }]
      })
    });

    const data = await response.json();
    const category = data.content[0].text.trim();
    return category || '기타';
  } catch (error) {
    console.error('AI 카테고리 분류 실패:', error);
    return '기타';
  }
}
