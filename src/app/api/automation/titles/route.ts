import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import {
  initAutomationTables,
  addVideoTitle,
  getAllVideoTitles
} from '@/lib/automation';

// 테이블 초기화 (최초 1회)
try {
  initAutomationTables();
} catch (error) {
  console.error('Failed to initialize automation tables:', error);
}

// GET: 모든 제목 가져오기
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const titles = getAllVideoTitles();
    return NextResponse.json({ titles });
  } catch (error: any) {
    console.error('GET /api/automation/titles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 새 제목 추가
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, type, category, tags, priority, productUrl, channel, scriptMode, mediaMode, youtubeSchedule, model } = body;

    if (!title || !type) {
      return NextResponse.json({ error: 'Title and type are required' }, { status: 400 });
    }

    if (!['shortform', 'longform', 'product'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const titleId = addVideoTitle({
      title,
      type,
      category,
      tags,
      priority: priority || 0,
      productUrl,
      channel,
      scriptMode,
      mediaMode,
      youtubeSchedule,
      model: model || 'claude',
      userId: user.userId
    });

    return NextResponse.json({ success: true, titleId });
  } catch (error: any) {
    console.error('POST /api/automation/titles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: 제목 삭제
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const titleId = searchParams.get('id');

    if (!titleId) {
      return NextResponse.json({ error: 'Title ID is required' }, { status: 400 });
    }

    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    db.prepare('DELETE FROM video_titles WHERE id = ?').run(titleId);
    db.close();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/automation/titles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 제목 업데이트
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, type, category, tags, priority, status, productUrl, channelId, scriptMode, mediaMode, model } = body;

    if (!id) {
      return NextResponse.json({ error: 'Title ID is required' }, { status: 400 });
    }

    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const updates: string[] = [];
    const values: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      values.push(type);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (tags !== undefined) {
      updates.push('tags = ?');
      values.push(tags);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (productUrl !== undefined) {
      updates.push('product_url = ?');
      values.push(productUrl);
    }
    if (channelId !== undefined) {
      updates.push('channel_id = ?');
      values.push(channelId);
    }
    if (scriptMode !== undefined) {
      updates.push('script_mode = ?');
      values.push(scriptMode);
    }
    if (mediaMode !== undefined) {
      updates.push('media_mode = ?');
      values.push(mediaMode);
    }
    if (model !== undefined) {
      updates.push('model = ?');
      values.push(model);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`
      UPDATE video_titles
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    db.close();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/automation/titles error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
