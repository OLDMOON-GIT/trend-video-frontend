import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
const promptsDir = path.join(process.cwd(), 'prompts');

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

    const db = new Database(dbPath);

    try {
      const versions = db.prepare(`
        SELECT id, name, display_name, version, content, change_reason,
               changed_by, is_active, created_at
        FROM prompt_templates
        WHERE name = ?
        ORDER BY version DESC
      `).all(name);

      if (versions.length === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json({ versions, count: versions.length });
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(
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
    const body = await request.json();
    const { content, changeReason } = body;

    if (!content || !changeReason) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    const db = new Database(dbPath);

    try {
      const existing = db.prepare(
        'SELECT display_name, MAX(version) as max_version FROM prompt_templates WHERE name = ?'
      ).get(name) as any;

      if (!existing) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const newVersion = existing.max_version + 1;
      const id = uuidv4();

      db.prepare('BEGIN').run();

      try {
        db.prepare(
          'UPDATE prompt_templates SET is_active = 0 WHERE name = ? AND is_active = 1'
        ).run(name);

        db.prepare(`
          INSERT INTO prompt_templates (
            id, name, display_name, version, content, change_reason, changed_by, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(id, name, existing.display_name, newVersion, content, changeReason, user.userId);

        const fileName = `prompt_${name}.txt`;
        const filePath = path.join(promptsDir, fileName);
        fs.writeFileSync(filePath, content, 'utf-8');

        try {
          const commitMsg = `chore: ${existing.display_name} v${newVersion}\n\n${changeReason}`;
          await execAsync(`git add "${filePath}"`, { cwd: process.cwd() });
          await execAsync(`git commit -m "${commitMsg}"`, { cwd: process.cwd() });
          console.log(`Git commit: ${fileName} v${newVersion}`);
        } catch (gitError: any) {
          console.warn('Git commit failed:', gitError.message);
        }

        db.prepare('COMMIT').run();

        return NextResponse.json({
          success: true,
          version: newVersion,
          id,
          message: `v${newVersion} created`
        });
      } catch (error) {
        db.prepare('ROLLBACK').run();
        throw error;
      }
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
