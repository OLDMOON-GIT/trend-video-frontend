import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

interface CoupangSettings {
  userId: string;
  accessKey: string;
  secretKey: string;
  trackingId: string;
  isConnected: boolean;
  lastChecked?: string;
}

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadSettings(): Promise<Record<string, CoupangSettings>> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveSettings(settings: Record<string, CoupangSettings>) {
  await ensureDataDir();
  await fs.writeFile(COUPANG_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// GET - 설정 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const allSettings = await loadSettings();
    const userSettings = allSettings[user.userId] || {
      userId: user.userId,
      accessKey: '',
      secretKey: '',
      trackingId: '',
      isConnected: false
    };

    // Secret Key는 앞 4자리만 보여주기
    return NextResponse.json({
      settings: {
        ...userSettings,
        secretKey: userSettings.secretKey ? userSettings.secretKey.substring(0, 4) + '****' : ''
      }
    });
  } catch (error: any) {
    console.error('설정 조회 실패:', error);
    return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
  }
}

// POST - 설정 저장
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { accessKey, secretKey, trackingId } = body;

    const allSettings = await loadSettings();

    // 기존 설정이 있으면 유지하고 업데이트
    const existingSettings = allSettings[user.userId] || {};

    allSettings[user.userId] = {
      userId: user.userId,
      accessKey: accessKey || existingSettings.accessKey || '',
      secretKey: secretKey && !secretKey.includes('****') ? secretKey : existingSettings.secretKey || '',
      trackingId: trackingId || existingSettings.trackingId || '',
      isConnected: existingSettings.isConnected || false,
      lastChecked: existingSettings.lastChecked
    };

    await saveSettings(allSettings);

    return NextResponse.json({ success: true, message: '설정이 저장되었습니다.' });
  } catch (error: any) {
    console.error('설정 저장 실패:', error);
    return NextResponse.json({ error: '설정 저장 실패' }, { status: 500 });
  }
}
