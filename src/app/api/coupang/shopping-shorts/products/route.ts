import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const TASKS_DIR = path.join(DATA_DIR, 'shopping-shorts-tasks');

interface TaskStatus {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  progress: string;
  startTime: string;
  endTime?: string;
  results?: any[];
  error?: string;
  logs: string[];
}

interface Product {
  id: string;
  taskId: string;
  productName: string;
  productNameChinese?: string;
  category: string;
  status: 'crawling' | 'waiting' | 'processing' | 'published' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
  publishedAt?: string;
  coupangProduct?: any;
  videos?: any[];
}

async function getAllTasks(): Promise<TaskStatus[]> {
  try {
    const files = await fs.readdir(TASKS_DIR);
    const tasks: TaskStatus[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(TASKS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        tasks.push(JSON.parse(content));
      }
    }

    // 최신순 정렬
    tasks.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return tasks;
  } catch {
    return [];
  }
}

function extractProductsFromTasks(tasks: TaskStatus[]): Product[] {
  const products: Product[] = [];

  for (const task of tasks) {
    if (task.results && task.results.length > 0) {
      for (const result of task.results) {
        let status: Product['status'] = 'waiting';

        if (task.status === 'running') {
          status = 'crawling';
        } else if (task.status === 'failed') {
          status = 'failed';
        } else if (result.published) {
          status = 'published';
        } else if (result.video || result.downloaded_video) {
          status = 'processing';
        }

        products.push({
          id: `${task.taskId}_${result.product_info?.product_name_ko || result.coupang_product?.productName || products.length}`,
          taskId: task.taskId,
          productName: result.product_info?.product_name_ko || result.coupang_product?.productName || '알 수 없음',
          productNameChinese: result.product_info?.product_name_zh,
          category: result.coupang_product?.categoryName || '기타',
          status,
          videoUrl: result.video?.video_url || result.downloaded_video,
          thumbnailUrl: result.coupang_product?.productImage,
          createdAt: task.startTime,
          publishedAt: result.published_at,
          coupangProduct: result.coupang_product,
          videos: result.videos || []
        });
      }
    } else if (task.status === 'running') {
      // 실행 중인 작업은 크롤링 큐에 표시
      products.push({
        id: task.taskId,
        taskId: task.taskId,
        productName: task.progress,
        category: '크롤링 중',
        status: 'crawling',
        createdAt: task.startTime
      });
    }
  }

  return products;
}

// GET /api/coupang/shopping-shorts/products - 모든 상품 목록 조회
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // crawling, waiting, processing, published

    const tasks = await getAllTasks();
    let products = extractProductsFromTasks(tasks);

    // 상태별 필터링
    if (statusFilter) {
      products = products.filter(p => p.status === statusFilter);
    }

    // 상태별 카운트
    const counts = {
      mylist: products.length,
      crawling: products.filter(p => p.status === 'crawling').length,
      waiting: products.filter(p => p.status === 'waiting').length,
      published: products.filter(p => p.status === 'published').length
    };

    return NextResponse.json({
      success: true,
      products,
      counts
    });

  } catch (error: any) {
    console.error('상품 목록 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '상품 목록 조회 중 오류 발생'
    }, { status: 500 });
  }
}
