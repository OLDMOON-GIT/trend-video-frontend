'use client';

import { useRouter } from 'next/navigation';

/**
 * Google Sites 배포 안내 버튼
 * (Vercel 배포에서 변경됨)
 */
export default function DeployButton() {
  const router = useRouter();

  const handleGoToSettings = () => {
    router.push('/admin/settings?tab=google-sites');
  };

  return (
    <button
      onClick={handleGoToSettings}
      className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:from-blue-500 hover:to-cyan-500 transition-all"
    >
      🌐 Google Sites 배포 설정
    </button>
  );
}
