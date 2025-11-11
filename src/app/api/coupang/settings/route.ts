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
  openaiApiKey?: string;
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
      openaiApiKey: '',
      isConnected: false
    };

    // Secret Key와 OpenAI API Key 마스킹 (구글 스타일: sk-proj-...***ABC)
    const maskKey = (key: string) => {
      if (!key) return '';
      if (key.length <= 8) return '****';
      // 앞부분 유지, 중간 마스킹, 마지막 3글자 표시
      const start = key.substring(0, Math.min(12, key.length - 3));
      const end = key.substring(key.length - 3);
      return `${start}...***${end}`;
    };

    return NextResponse.json({
      settings: {
        ...userSettings,
        secretKey: maskKey(userSettings.secretKey),
        openaiApiKey: maskKey(userSettings.openaiApiKey || '')
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
    const { accessKey, secretKey, trackingId, openaiApiKey } = body;

    const allSettings = await loadSettings();

    // 기존 설정이 있으면 유지하고 업데이트
    const existingSettings = allSettings[user.userId] || {};

    // 마스킹된 값이 전송되면 기존 값 유지
    const isMasked = (value: string) => value && (value.includes('****') || value.includes('...***'));

    allSettings[user.userId] = {
      userId: user.userId,
      accessKey: accessKey || existingSettings.accessKey || '',
      secretKey: secretKey && !isMasked(secretKey) ? secretKey : existingSettings.secretKey || '',
      trackingId: trackingId || existingSettings.trackingId || '',
      openaiApiKey: openaiApiKey && !isMasked(openaiApiKey) ? openaiApiKey : existingSettings.openaiApiKey || '',
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
