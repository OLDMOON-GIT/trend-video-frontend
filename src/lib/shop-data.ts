/**
 * 쇼핑몰 데이터 소스 추상화
 * - 로컬/관리 서버: SQLite 직접 사용
 * - Vercel 프로덕션: 관리 서버 API 호출
 */

import db from '@/lib/sqlite';

const IS_VERCEL = process.env.VERCEL === '1';
const ADMIN_SERVER_URL = process.env.ADMIN_SERVER_URL || 'http://localhost:3000';

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  image_url: string;
  deep_link?: string;
  original_price?: number;
  discount_price?: number;
  view_count: number;
  click_count: number;
  created_at: string;
}

interface Category {
  category: string;
  count: number;
  thumbnail?: string;
}

/**
 * 모든 상품 + 카테고리 조회
 */
export async function fetchShopData(): Promise<{
  products: Product[];
  categories: Category[];
}> {
  if (IS_VERCEL) {
    const response = await fetch(`${ADMIN_SERVER_URL}/api/shop/products`, {
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      throw new Error(`API 호출 실패: ${response.status}`);
    }

    const data = await response.json();
    return {
      products: data.products,
      categories: data.categories
    };
  } else {
    const published = db.prepare(`
      SELECT id, name, data FROM shop_versions
      WHERE is_published = 1
      ORDER BY datetime(published_at) DESC
      LIMIT 1
    `).get() as any;

    if (published?.data) {
      try {
        const snapshot = JSON.parse(published.data);
        return {
          products: snapshot.products || [],
          categories: snapshot.categories || []
        };
      } catch (error) {
        console.warn('⚠️ shop_versions 스냅샷 파싱 실패:', error);
      }
    }

    const products = db.prepare(`
      SELECT
        id, title, description, category, image_url, deep_link,
        original_price, discount_price, view_count, click_count,
        created_at
      FROM coupang_products
      WHERE status IN ('active', 'published')
      ORDER BY created_at DESC
    `).all() as Product[];

    const categories = db.prepare(`
      SELECT
        category,
        COUNT(*) as count,
        MAX(image_url) as thumbnail
      FROM coupang_products
      WHERE status IN ('active', 'published')
      GROUP BY category
      ORDER BY count DESC
    `).all() as Category[];

    return { products, categories };
  }
}

/**
 * 카테고리별 상품 조회
 */
export async function fetchProductsByCategory(category: string): Promise<Product[]> {
  if (IS_VERCEL) {
    // Vercel: 전체 데이터 가져온 후 필터링
    const { products } = await fetchShopData();
    return products.filter(p => p.category === category);
  } else {
    // 로컬: SQLite 직접 조회 (최신 데이터 반영)
    return db.prepare(`
      SELECT * FROM coupang_products
      WHERE category = ? AND status IN ('active', 'published')
      ORDER BY created_at DESC
    `).all(category) as Product[];
  }
}

/**
 * 개별 상품 조회
 */
export async function fetchProductById(id: string): Promise<Product | null> {
  if (IS_VERCEL) {
    // Vercel: 관리 서버 API 호출
    const response = await fetch(`${ADMIN_SERVER_URL}/api/shop/products/${id}`, {
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.product;
  } else {
    // 로컬: SQLite 직접 조회 (최신 데이터 반영)
    return db.prepare(`
      SELECT * FROM coupang_products
      WHERE id = ? AND status IN ('active', 'published')
    `).get(id) as Product | null;
  }
}

/**
 * 모든 카테고리 목록 (SSG용)
 */
export async function fetchAllCategories(): Promise<string[]> {
  if (IS_VERCEL) {
    const { categories } = await fetchShopData();
    return categories.map(c => c.category);
  } else {
    const result = db.prepare(`
      SELECT DISTINCT category FROM coupang_products
      WHERE status IN ('active', 'published')
    `).all() as { category: string }[];
    return result.map(r => r.category);
  }
}

/**
 * 모든 상품 ID 목록 (SSG용)
 */
export async function fetchAllProductIds(): Promise<string[]> {
  if (IS_VERCEL) {
    const { products } = await fetchShopData();
    return products.map(p => p.id);
  } else {
    const result = db.prepare(`
      SELECT id FROM coupang_products
      WHERE status IN ('active', 'published')
    `).all() as { id: string }[];
    return result.map(r => r.id);
  }
}
