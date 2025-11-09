import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/sqlite';

type SnapshotProduct = {
  id: string;
  user_id?: string;
  title: string;
  description: string;
  category: string;
  original_price?: number;
  discount_price?: number;
  image_url?: string;
  deep_link?: string;
  created_at: string;
};

interface VersionMeta {
  id: string;
  name: string | null;
  publishedAt?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const category = searchParams.get('category');
    const versionId = searchParams.get('versionId');
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.max(1, Math.min(limitParam, 200));

    const { products, versionMeta } = getProductsFromSnapshot(versionId);

    const filtered = products
      .filter((product) => {
        if (userId && product.user_id !== userId) return false;
        if (category && product.category !== category) return false;
        return true;
      })
      .slice(0, limit);

    return NextResponse.json(
      {
        success: true,
        products: filtered,
        count: filtered.length,
        version: versionMeta,
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error: any) {
    console.error('공개 상품 목록 조회 실패:', error);
    return NextResponse.json(
      { error: error?.message || '상품 목록 조회 실패' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}

function getProductsFromSnapshot(versionId: string | null): {
  products: SnapshotProduct[];
  versionMeta: VersionMeta | null;
} {
  // 특정 버전 ID가 지정된 경우만 스냅샷 사용
  if (versionId) {
    const versionRow: any = db.prepare(`SELECT id, name, data, published_at FROM shop_versions WHERE id = ?`).get(versionId);

    if (versionRow) {
      try {
        const snapshot = JSON.parse(versionRow.data || '{}');
        const snapshotProducts = Array.isArray(snapshot.products)
          ? (snapshot.products as SnapshotProduct[])
          : [];
        return {
          products: snapshotProducts,
          versionMeta: {
            id: versionRow.id,
            name: versionRow.name,
            publishedAt: versionRow.published_at,
          },
        };
      } catch (err) {
        console.warn('shop_versions 데이터 파싱 실패:', err);
      }
    }
  }

  // versionId가 없는 경우 (퍼블리시 탭) - 실시간 published 상품 반환
  const liveProducts = db.prepare(`
    SELECT
      id,
      user_id,
      title,
      description,
      category,
      original_price,
      discount_price,
      image_url,
      deep_link,
      created_at
    FROM coupang_products
    WHERE status IN ('active', 'published')
    ORDER BY datetime(created_at) DESC
  `).all() as SnapshotProduct[];

  return {
    products: liveProducts,
    versionMeta: null,
  };
}
