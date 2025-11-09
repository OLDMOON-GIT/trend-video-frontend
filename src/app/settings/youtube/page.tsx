'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 기존 YouTube 설정 페이지
 * -> 통합 설정 페이지로 리다이렉트
 */
export default function YouTubeSettingsPage() {
  const router = useRouter();

  useEffect(() => {
    // URL 파라미터 유지하면서 리다이렉트
    const params = new URLSearchParams(window.location.search);
    const query = params.toString();
    router.replace(query ? `/admin/settings?${query}&tab=youtube` : '/admin/settings?tab=youtube');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <p className="text-slate-300 text-lg">설정 페이지로 이동 중...</p>
      </div>
    </div>
  );
}
