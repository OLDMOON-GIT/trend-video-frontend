import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

function getDiff(oldText: string, newText: string) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff: Array<{
    type: 'unchanged' | 'added' | 'removed';
    line: string;
    lineNumber?: number;
  }> = [];

  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        diff.push({ type: 'unchanged', line: oldLine, lineNumber: i + 1 });
      }
    } else {
      if (oldLine !== undefined && newLine === undefined) {
        diff.push({ type: 'removed', line: oldLine, lineNumber: i + 1 });
      } else if (oldLine === undefined && newLine !== undefined) {
        diff.push({ type: 'added', line: newLine, lineNumber: i + 1 });
      } else {
        diff.push({ type: 'removed', line: oldLine, lineNumber: i + 1 });
        diff.push({ type: 'added', line: newLine, lineNumber: i + 1 });
      }
    }
  }

  return diff;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    }

    const params = await context.params;
    const { name } = params;

    const { searchParams } = new URL(request.url);
    const fromVersion = parseInt(searchParams.get('from') || '1');
    const toVersion = parseInt(searchParams.get('to') || '1');

    if (!fromVersion || !toVersion) {
      return NextResponse.json({ error: 'Missing versions' }, { status: 400 });
    }

    const db = new Database(dbPath);

    try {
      const fromVersionData = db.prepare(
        'SELECT * FROM prompt_templates WHERE name = ? AND version = ?'
      ).get(name, fromVersion) as any;

      const toVersionData = db.prepare(
        'SELECT * FROM prompt_templates WHERE name = ? AND version = ?'
      ).get(name, toVersion) as any;

      if (!fromVersionData || !toVersionData) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }

      const diff = getDiff(fromVersionData.content, toVersionData.content);
      const stats = {
        added: diff.filter(d => d.type === 'added').length,
        removed: diff.filter(d => d.type === 'removed').length,
        unchanged: diff.filter(d => d.type === 'unchanged').length
      };

      return NextResponse.json({
        from: {
          version: fromVersionData.version,
          created_at: fromVersionData.created_at,
          changed_by: fromVersionData.changed_by,
          change_reason: fromVersionData.change_reason
        },
        to: {
          version: toVersionData.version,
          created_at: toVersionData.created_at,
          changed_by: toVersionData.changed_by,
          change_reason: toVersionData.change_reason
        },
        diff,
        stats
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
