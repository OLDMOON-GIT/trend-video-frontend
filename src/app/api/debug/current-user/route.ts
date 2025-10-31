import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import Database from 'better-sqlite3';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({
        error: '로그인되지 않음',
        user: null
      });
    }

    // 데이터베이스에서 사용자 정보 가져오기
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    const db = new Database(dbPath);

    const userInfo = db.prepare('SELECT id, email FROM users WHERE id = ?').get(user.userId) as any;

    // 이 사용자의 scripts 개수 확인
    const scriptCount = db.prepare('SELECT COUNT(*) as count FROM scripts WHERE user_id = ?').get(user.userId) as any;

    // 모든 scripts 확인 (디버깅용)
    const allScripts = db.prepare('SELECT id, user_id, title, created_at FROM scripts ORDER BY created_at DESC LIMIT 10').all() as any[];

    db.close();

    return NextResponse.json({
      currentUser: {
        userId: user.userId,
        email: userInfo?.email,
        isAdmin: user.isAdmin
      },
      myScriptCount: scriptCount?.count || 0,
      allScriptsInDB: allScripts.map(s => ({
        id: s.id,
        userId: s.user_id,
        title: s.title,
        createdAt: s.created_at,
        isMyScript: s.user_id === user.userId
      }))
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
