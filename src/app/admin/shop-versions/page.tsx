'use client';

import { useState } from 'react';
import ShopVersionManager from '@/components/ShopVersionManager';
import ShopVersionPreview from '@/components/ShopVersionPreview';

export default function ShopVersionsAdminPage() {
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">
              🏪 쇼핑몰 버전 관리
            </h1>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        <ShopVersionManager onPreview={setPreviewVersionId} />

        {previewVersionId && (
          <ShopVersionPreview
            versionId={previewVersionId}
            onClose={() => setPreviewVersionId(null)}
            showHeader={true}
          />
        )}
      </main>
    </div>
  );
}
