import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// GET - 사용자의 링크 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    try {
      // coupang_products 테이블에서 active 상태의 상품만 조회
      const products = db.prepare(`
        SELECT
          id,
          title as productName,
          deep_link as shortUrl,
          product_url,
          image_url,
          category,
          original_price as price,
          status,
          view_count as clicks,
          created_at as createdAt
        FROM coupang_products
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at DESC
      `).all(user.userId);

      db.close();

      // 데이터 형식 변환
      const links = products.map((product: any) => ({
        id: product.id,
        productName: product.productName,
        shortUrl: product.shortUrl,
        productUrl: product.product_url,
        imageUrl: product.image_url,
        category: product.category,
        price: product.price,
        clicks: product.clicks || 0,
        createdAt: product.createdAt
      }));

      return NextResponse.json({
        success: true,
        links
      });
    } catch (error) {
      db.close();
      throw error;
    }

  } catch (error: any) {
    console.error('링크 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: '링크 조회 실패'
    }, { status: 500 });
  }
}
