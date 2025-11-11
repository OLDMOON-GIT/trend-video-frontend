// C:\Users\oldmoon\workspace\trend-video-frontend\src\components\ShopClientView.tsx
'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import ShopVersionPreview from '@/components/ShopVersionPreview';

interface Category {
  name: string;
  count: number;
  thumbnail?: string;
}

interface ShopClientViewProps {
  initialCategories: Category[];
  initialTotalProducts: number;
  googleSitesEditUrl?: string;
  googleSitesHomeUrl?: string;
}

interface ExportState {
  busy: boolean;
}

export default function ShopClientView({ initialCategories, initialTotalProducts, googleSitesEditUrl, googleSitesHomeUrl }: ShopClientViewProps) {
  const [publishedVersionId, setPublishedVersionId] = useState<string>('live'); // 'live'는 실시간 상품을 의미
  const [loading, setLoading] = useState(false); // 로딩 불필요
  const [exportState, setExportState] = useState<ExportState>({ busy: false });

  // 퍼블리시 탭은 항상 실시간 상품을 표시하므로 API 호출 불필요
  // versionId를 'live'로 설정하여 ShopVersionPreview에서 versionId 없이 API 호출하도록 함

  const downloadHtml = async () => {
    if (!publishedVersionId) return;

    setExportState({ busy: true });
    try {
      const res = await fetch(`/api/shop/versions/${publishedVersionId}/html`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'HTML을 생성하지 못했습니다.');
      }
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shop-published.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('HTML 파일을 다운로드했습니다.');
    } catch (err: any) {
      toast.error(err?.message || 'HTML 다운로드에 실패했습니다.');
    } finally {
      setExportState({ busy: false });
    }
  };

  const copyHtml = async () => {
    if (!publishedVersionId) return;

    setExportState({ busy: true });
    try {
      const res = await fetch(`/api/shop/versions/${publishedVersionId}/html`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'HTML을 생성하지 못했습니다.');
      }
      const html = await res.text();
      if (!html) {
        throw new Error('복사할 내용이 없습니다.');
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(html);
        toast.success('HTML 코드가 클립보드에 복사되었습니다.');
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = html;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            toast.success('HTML 코드가 클립보드에 복사되었습니다.');
          } else {
            throw new Error('브라우저에서 복사를 지원하지 않거나 차단되었습니다.');
          }
        } catch (err) {
          throw new Error('클립보드 복사에 실패했습니다. 브라우저 보안 설정을 확인해주세요.');
        } finally {
          document.body.removeChild(textarea);
        }
      }
    } catch (err: any) {
      toast.error(err.message || '코드를 복사하는데 실패했습니다.');
    } finally {
      setExportState({ busy: false });
    }
  };


  return (
    <>
      {/* 상단 액션 버튼들 */}
      <div className="mb-0 flex flex-wrap justify-between items-center gap-1">
        {/* Google Sites 버튼들 */}
        <div className="flex flex-wrap gap-1">
          {googleSitesEditUrl && (
            <button
              onClick={() => window.open(googleSitesEditUrl, '_blank')}
              className="rounded-lg bg-gradient-to-r from-yellow-600 to-orange-600 px-4 py-2 text-sm font-bold text-white hover:from-yellow-500 hover:to-orange-500 transition shadow-md hover:shadow-lg"
              title="Google Sites 편집 페이지 열기"
            >
              🖊️ 사이트 편집
            </button>
          )}
          {googleSitesHomeUrl && (
            <button
              onClick={() => window.open(googleSitesHomeUrl, '_blank')}
              className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-sm font-bold text-white hover:from-green-500 hover:to-emerald-500 transition shadow-md hover:shadow-lg"
              title="Google Sites 실제 사이트 열기"
            >
              🏠 사이트 보기
            </button>
          )}
        </div>

        {/* HTML 내보내기 버튼 */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={downloadHtml}
            disabled={exportState.busy}
            className="rounded-lg border border-blue-600/60 px-4 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-600/20 disabled:opacity-60"
          >
            {exportState.busy ? '내보내는 중...' : 'HTML 내보내기'}
          </button>
          <button
            onClick={copyHtml}
            disabled={exportState.busy}
            className="rounded-lg border border-purple-600/60 px-4 py-2 text-sm font-semibold text-purple-200 hover:bg-purple-600/20 disabled:opacity-60"
          >
            {exportState.busy ? '복사 중...' : '코드 복사'}
          </button>
        </div>
      </div>

      <ShopVersionPreview
        versionId={publishedVersionId}
        onClose={() => {}} // 일반 사용자 페이지에서는 닫기 버튼 불필요
      />
    </>
  );
}
