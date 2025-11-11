import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import db from '@/lib/sqlite';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';

const MAX_LIMIT = 50;

type SnapshotProduct = {
  id: string;
  user_id?: string;
  title: string;
  description: string;
  category: string;
  image_url?: string;
  deep_link?: string;
  original_price?: number;
  discount_price?: number;
  created_at: string;
};

type SnapshotCategory = {
  category: string;
  count: number;
  thumbnail?: string;
};

function ensureAdmin(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || !user.isAdmin) {
    throw new Error('AUTH_REQUIRED');
  }
}

function buildSnapshot() {
  const products = db.prepare(`
    SELECT
      id,
      user_id,
      title,
      description,
      category,
      image_url,
      deep_link,
      original_price,
      discount_price,
      created_at
    FROM coupang_products
    WHERE status IN ('active', 'published')
    ORDER BY datetime(created_at) DESC
  `).all() as SnapshotProduct[];

  const categories = db.prepare(`
    SELECT
      category,
      COUNT(*) as count,
      MAX(image_url) as thumbnail
    FROM coupang_products
    WHERE status IN ('active', 'published')
    GROUP BY category
    ORDER BY count DESC
  `).all() as SnapshotCategory[];

  const snapshot = {
    generatedAt: new Date().toISOString(),
    totalProducts: products.length,
    products,
    categories,
  };

  return snapshot;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    ensureAdmin(user);

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit'));
    const offsetParam = Number(searchParams.get('offset'));

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), MAX_LIMIT)
      : 10;
    const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 0;

    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM shop_versions`).get() as { count: number };
    const rows = db.prepare(`
      SELECT
        id,
        version_number,
        name,
        description,
        total_products,
        is_published,
        created_at,
        updated_at,
        published_at,
        git_commit_hash
      FROM shop_versions
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    const versions = rows.map((row) => ({
      id: row.id,
      versionNumber: row.version_number,
      name: row.name,
      description: row.description,
      totalProducts: row.total_products,
      isPublished: row.is_published === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      gitCommitHash: row.git_commit_hash,
    }));

    return NextResponse.json({
      versions,
      total: totalRow?.count ?? 0,
      limit,
      offset,
    });
  } catch (error: any) {
    if (error.message === 'AUTH_REQUIRED') {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', errorCode: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    console.error('❌ 쇼핑몰 버전 목록 조회 실패:', error);
    return NextResponse.json(
      { error: error?.message || '버전 목록을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    ensureAdmin(user);

    const body = await request.json().catch(() => ({}));
    const { name, description, publish } = body || {};

    // Get current git commit hash
    const gitCommitHash = execSync('git rev-parse HEAD').toString().trim();

    const snapshot = buildSnapshot();
    const versionId = uuidv4();
    const versionNumberRow = db.prepare(`SELECT IFNULL(MAX(version_number), 0) + 1 AS next FROM shop_versions`).get() as { next: number };
    const versionNumber = versionNumberRow?.next || 1;

    db.prepare(`
      INSERT INTO shop_versions (
        id,
        version_number,
        name,
        description,
        data,
        total_products,
        is_published,
        created_at,
        updated_at,
        git_commit_hash
      ) VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'), ?)
    `).run(
      versionId,
      versionNumber,
      name || `버전 ${versionNumber}`,
      description || null,
      JSON.stringify(snapshot),
      snapshot.totalProducts,
      gitCommitHash
    );

    if (publish) {
      db.prepare(`UPDATE shop_versions SET is_published = 0 WHERE id != ?`).run(versionId);
      db.prepare(`
        UPDATE shop_versions
        SET is_published = 1,
            published_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(versionId);
    }

    return NextResponse.json({
      success: true,
      version: {
        id: versionId,
        versionNumber,
        name: name || `버전 ${versionNumber}`,
        totalProducts: snapshot.totalProducts,
        isPublished: !!publish,
        createdAt: new Date().toISOString(),
        gitCommitHash,
      }
    });
  } catch (error: any) {
    if (error.message === 'AUTH_REQUIRED') {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', errorCode: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    console.error('❌ 쇼핑몰 버전 생성 실패:', error);
    return NextResponse.json(
      { error: error?.message || '버전을 생성하지 못했습니다.' },
      { status: 500 }
    );
  }
}
