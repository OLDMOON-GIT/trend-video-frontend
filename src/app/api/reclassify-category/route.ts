import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';

/**
 * 대량 카테고리 재분류 API
 * POST /api/reclassify-category
 * Body: { ids: string[], type: 'pending' | 'product' }
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
    const { ids, type = 'product' } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'IDs 배열이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🤖 대량 카테고리 재분류 시작: ${ids.length}개`);

    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;

    // 각 상품에 대해 카테고리 재분류
    for (const id of ids) {
      try {
        // 1. 상품 정보 조회
        let item: any;
        if (type === 'pending') {
          item = db.prepare(`
            SELECT id, title, description
            FROM crawled_product_links
            WHERE id = ? AND user_id = ?
          `).get(id, user.userId);
        } else {
          item = db.prepare(`
            SELECT id, title, description
            FROM coupang_products
            WHERE id = ? AND user_id = ?
          `).get(id, user.userId);
        }

        if (!item) {
          results.push({ id, success: false, error: '상품을 찾을 수 없습니다.' });
          failCount++;
          continue;
        }

        // 2. AI 카테고리 재분류
        const newCategory = await classifyCategory(item.title, item.description);

        // 3. DB 업데이트
        if (type === 'pending') {
          db.prepare(`
            UPDATE crawled_product_links
            SET category = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(newCategory, id);
        } else {
          db.prepare(`
            UPDATE coupang_products
            SET category = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(newCategory, id);
        }

        results.push({ id, success: true, category: newCategory, title: item.title });
        successCount++;

      } catch (error: any) {
        console.error(`❌ ${id} 재분류 실패:`, error);
        results.push({ id, success: false, error: error?.message || '재분류 실패' });
        failCount++;
      }
    }

    console.log(`✅ 대량 재분류 완료: 성공 ${successCount}, 실패 ${failCount}`);

    return NextResponse.json({
      success: true,
      successCount,
      failCount,
      results
    });

  } catch (error: any) {
    console.error('❌ 대량 카테고리 재분류 실패:', error);
    return NextResponse.json(
      { error: error?.message || '대량 카테고리 재분류 실패' },
      { status: 500 }
    );
  }
}

/**
 * 단일 카테고리 재분류 API (기존)
 * PUT /api/reclassify-category?id=xxx&type=pending|product
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type') || 'pending'; // pending 또는 product

    if (!id) {
      return NextResponse.json(
        { error: 'ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 1. 상품 정보 조회
    let item: any;
    if (type === 'pending') {
      item = db.prepare(`
        SELECT id, title, description
        FROM crawled_product_links
        WHERE id = ? AND user_id = ?
      `).get(id, user.userId);
    } else {
      item = db.prepare(`
        SELECT id, title, description
        FROM coupang_products
        WHERE id = ? AND user_id = ?
      `).get(id, user.userId);
    }

    if (!item) {
      return NextResponse.json(
        { error: '상품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 2. AI 카테고리 재분류
    console.log(`🤖 카테고리 재분류 시작: ${item.title}`);
    const newCategory = await classifyCategory(item.title, item.description);
    console.log(`✅ 새 카테고리: ${newCategory}`);

    // 3. DB 업데이트
    if (type === 'pending') {
      db.prepare(`
        UPDATE crawled_product_links
        SET category = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newCategory, id);
    } else {
      db.prepare(`
        UPDATE coupang_products
        SET category = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newCategory, id);
    }

    return NextResponse.json({
      success: true,
      category: newCategory
    });

  } catch (error: any) {
    console.error('❌ 카테고리 재분류 실패:', error);
    return NextResponse.json(
      { error: error?.message || '카테고리 재분류 실패' },
      { status: 500 }
    );
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
          content: `다음 상품을 가장 적합한 카테고리로 분류해주세요.

**카테고리 목록 (아래 중 정확히 하나만 선택):**
- 패션: 의류, 신발, 가방, 액세서리, 잡화
- 뷰티: 화장품, 스킨케어, 향수, 헤어케어
- 식품: 과자, 초콜릿, 음료, 과일, 채소, 육류, 수산물, 가공식품, 건강식품, 간식
- 생활용품: 주방용품, 욕실용품, 청소용품, 수납, 침구
- 디지털: 스마트폰, 태블릿, 노트북, 이어폰, 액세서리
- 가전: TV, 냉장고, 세탁기, 청소기, 에어컨, 소형가전
- 스포츠: 운동기구, 운동복, 등산, 자전거, 캠핑
- 완구: 장난감, 인형, 게임, 교육완구
- 도서: 책, 잡지, 전자책
- 반려동물: 사료, 간식, 용품
- 자동차: 자동차용품, 액세서리, 부품
- 기타: 위 카테고리에 해당하지 않는 상품

**상품 정보:**
상품명: ${title}
설명: ${description}

**중요:** 반드시 위 카테고리 목록에서 정확히 일치하는 카테고리 이름 하나만 답변하세요 (패션, 뷰티, 식품, 생활용품, 디지털, 가전, 스포츠, 완구, 도서, 반려동물, 자동차, 기타 중 하나).

카테고리:`
        }]
      })
    });

    const data = await response.json();
    const category = data.content[0].text.trim();

    // 정확히 카테고리 목록에 있는지 확인
    const validCategories = ['패션', '뷰티', '식품', '생활용품', '디지털', '가전', '스포츠', '완구', '도서', '반려동물', '자동차', '기타'];

    if (validCategories.includes(category)) {
      return category;
    }

    // 카테고리 목록에 없으면 기타로 처리
    console.warn(`예상치 못한 카테고리: ${category}, 기타로 처리`);
    return '기타';
  } catch (error) {
    console.error('AI 카테고리 분류 실패:', error);
    return '기타';
  }
}
