import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { CoupangClient } from './coupang-client';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUPANG_SETTINGS_FILE = path.join(DATA_DIR, 'coupang-settings.json');

interface CacheEntry {
  data: any;
  timestamp: number;
}

const bestsellerCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 60 * 60 * 1000;

export async function loadUserCoupangSettings(userId: string) {
  try {
    const data = await fs.readFile(COUPANG_SETTINGS_FILE, 'utf-8');
    const allSettings = JSON.parse(data);
    return allSettings[userId];
  } catch {
    return null;
  }
}

function generateHMAC(method: string, url: string, accessKey: string, secretKey: string): { datetime: string; authorization: string } {
  const now = new Date();
  const year = String(now.getUTCFullYear()).slice(-2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  const message = datetime + method + url;

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');

  const authorization = `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;

  return { datetime, authorization };
}

async function callCoupangAPI(accessKey: string, secretKey: string, method: string, fullUrl: string) {
  const [path, query] = fullUrl.split('?');
  const { authorization } = generateHMAC(method, path, accessKey, secretKey);

  const DOMAIN = 'https://api-gateway.coupang.com';
  const response = await fetch(DOMAIN + fullUrl, {
    method,
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/json'
    }
  });

  return response;
}

export async function getCoupangBestsellers(userId: string, categoryId: string = '1001') {
  try {
    const settings = await loadUserCoupangSettings(userId);
    if (!settings || !settings.accessKey || !settings.secretKey) {
      throw new Error('Coupang API settings not configured');
    }

    const cacheKey = `${userId}_${categoryId}`;
    const cached = bestsellerCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log('Cache hit for bestsellers:', cacheKey);
      return {
        success: true,
        products: cached.data,
        cached: true
      };
    }

    const url = `/v2/providers/affiliate_open_api/apis/openapi/v1/products/bestcategories/${categoryId}`;
    const response = await callCoupangAPI(settings.accessKey, settings.secretKey, 'GET', url);

    if (response.ok) {
      const data = await response.json();

      const products = data.data?.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        productPrice: item.productPrice,
        productImage: item.productImage,
        productUrl: item.productUrl,
        categoryName: item.categoryName,
        isRocket: item.isRocket || false,
        rank: item.rank
      })) || [];

      bestsellerCache.set(cacheKey, {
        data: products,
        timestamp: now
      });

      return {
        success: true,
        products,
        cached: false
      };
    } else {
      const errorText = await response.text();
      throw new Error(`Coupang API failed: ${response.status} - ${errorText}`);
    }

  } catch (error: any) {
    console.error('Failed to fetch Coupang bestsellers:', error);
    throw error;
  }
}

export async function generateAffiliateDeepLink(userId: string, productUrl: string): Promise<string> {
  try {
    const settings = await loadUserCoupangSettings(userId);
    if (!settings?.accessKey || !settings?.secretKey) {
      console.warn('[Coupang] No API settings, using original URL');
      return productUrl;
    }

    const client = new CoupangClient({
      accessKey: settings.accessKey,
      secretKey: settings.secretKey
    });

    const deepLink = await client.generateDeepLink(productUrl);
    console.log('[Coupang] Generated deep link:', deepLink);
    return deepLink;
  } catch (error: any) {
    console.warn('[Coupang] Deep link generation failed, using original URL:', error?.message || error);
    return productUrl;
  }
}
