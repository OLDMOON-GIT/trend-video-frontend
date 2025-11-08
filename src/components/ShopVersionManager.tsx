'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

type ShopVersion = {
  id: string;
  versionNumber?: number;
  name?: string | null;
  description?: string | null;
  totalProducts: number;
  isPublished: boolean;
  createdAt: string;
  publishedAt?: string | null;
  gitCommitHash?: string | null;
};

interface VersionsResponse {
  versions: ShopVersion[];
  total: number;
}

interface ExportState {
  busy: boolean;
  versionId?: string;
}

interface ShopVersionManagerProps {
  onPreview: (versionId: string) => void;
}

export default function ShopVersionManager({ onPreview }: ShopVersionManagerProps) {
  const [versions, setVersions] = useState<ShopVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ busy: false });
  const [googleSitesUrl, setGoogleSitesUrl] = useState('');

  const liveVersion = useMemo(() => versions.find((v) => v.isPublished), [versions]);

  const embedUrl = origin ? `${origin}/shop/embed` : '';
  const shopUrl = origin ? `${origin}/shop` : '';

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/shop/versions');
      const data: VersionsResponse = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setError('관리자 로그인이 필요합니다.');
          return;
        }
        throw new Error((data as any)?.error || '버전 목록을 불러오지 못했습니다.');
      }

      setVersions(data.versions || []);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || '버전 목록을 불러오지 못했습니다.');
    }
    finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
    loadVersions();
    loadGoogleSitesUrl();
  }, [loadVersions]);

  const loadGoogleSitesUrl = async () => {
    try {
      const res = await fetch('/api/user/settings');
      const data = await res.json();
      if (res.ok && data.googleSitesUrl) {
        setGoogleSitesUrl(data.googleSitesUrl);
      }
    } catch (err) {
      console.warn('Google Sites URL 로드 실패:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => toast.success('주소가 복사되었습니다.'))
        .catch(() => toast.error('복사에 실패했습니다.'));
      return;
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('주소가 복사되었습니다.');
    } catch (error) {
      toast.error('복사에 실패했습니다.');
    }
  };

  const handlePublishCurrent = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch('/api/shop/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish: true }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || '퍼블리시하지 못했습니다.');
      }

      toast.success('현재 상태가 Google Sites에 퍼블리시되었습니다.');
      loadVersions();
    } catch (err: any) {
      toast.error(err?.message || '퍼블리시에 실패했습니다.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishVersion = async (versionId: string) => {
    try {
      const res = await fetch(`/api/shop/versions/${versionId}/publish`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || '퍼블리시하지 못했습니다.');
      }

      toast.success('선택한 버전이 퍼블리시되었습니다.');
      loadVersions();
    } catch (err: any) {
      toast.error(err?.message || '퍼블리시에 실패했습니다.');
    }
  };

  const handlePreview = (versionId: string) => {
    onPreview(versionId);
  };

  const downloadHtml = async (versionId: string) => {
    const res = await fetch(`/api/shop/versions/${versionId}/html`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'HTML을 생성하지 못했습니다.');
    }
    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shop-version-${versionId}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('HTML 파일을 다운로드했습니다.');
  };

  const copyHtml = async (versionId: string) => {
    setExportState({ busy: true, versionId });
    try {
      const res = await fetch(`/api/shop/versions/${versionId}/html`);
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
    <div className="mb-12 rounded-2xl border border-blue-500/30 bg-blue-950/20 p-6 shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            🌐 Google Sites 배포 설정
          </h3>
          <p className="text-sm text-slate-300 mt-1">
            Google Sites에 아래 주소를 임베드하고, 필요할 때마다 이 상태를 퍼블리시하세요.
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-400">Shop URL</span>
              <code className="bg-black/30 rounded px-2 py-1 text-slate-200">
                {shopUrl || '로딩 중...'}
              </code>
              {shopUrl && (
                <button
                  onClick={() => copyToClipboard(shopUrl)}
                  className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  복사
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-400">Embed URL</span>
              <code className="bg-black/30 rounded px-2 py-1 text-slate-200">
                {embedUrl ? `${embedUrl}?userId=YOUR_ID` : '로딩 중...'}
              </code>
              {embedUrl && (
                <button
                  onClick={() => copyToClipboard(embedUrl)}
                  className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  복사
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={loadVersions}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            disabled={isLoading}
          >
            {isLoading ? '새로고침 중...' : '버전 새로고침'}
          </button>
          <button
            onClick={handlePublishCurrent}
            disabled={isPublishing}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-2 text-sm font-semibold text-white hover:from-emerald-500 hover:to-green-500 disabled:opacity-60"
          >
            {isPublishing ? '퍼블리시 중...' : '이 상태로 퍼블리시'}
          </button>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4 text-sm text-slate-200">
        <p className="font-semibold text-white mb-2">Google Sites에 붙여넣는 방법</p>
        <ol className="list-decimal list-inside space-y-1 text-slate-300">
          <li>아래 버전 카드에서 <strong>HTML 내보내기</strong>를 눌러 코드를 복사합니다.</li>
          <li className="flex flex-wrap items-center gap-2">
            <span>Google Sites 편집 화면에서 <em>삽입 → 임베드 → 코드</em> 탭을 선택합니다.</span>
            {googleSitesUrl && (
              <button
                onClick={() => window.open(googleSitesUrl, '_blank')}
                className="rounded-full border border-blue-500/40 px-3 py-1 text-xs text-blue-200 hover:bg-blue-600/20"
              >
                내 Google Sites 열기
              </button>
            )}
          </li>
          <li>복사한 HTML을 그대로 붙여넣어 저장하면 해당 버전이 노출됩니다.</li>
          <li>새 버전을 퍼블리시한 뒤에는 HTML을 다시 내보내 Google Sites에도 다시 붙여넣어야 최신 상태가 반영됩니다.</li>
        </ol>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-white">버전 히스토리</h4>
          {liveVersion && (
            <span className="text-xs text-emerald-300">
              현재 퍼블리시된 버전: {liveVersion.name || `버전 ${liveVersion.versionNumber}`}
            </span>
          )}
        </div>

        {isLoading && versions.length === 0 ? (
          <p className="text-slate-400 text-sm">버전 목록을 불러오는 중입니다...</p>
        ) : versions.length === 0 ? (
          <p className="text-slate-400 text-sm">아직 저장된 배포 버전이 없습니다. 위 버튼을 눌러 첫 버전을 생성하세요.</p>
        ) : (
          <div className="space-y-4">
            {versions.map((version) => (
              <div
                key={version.id}
                className={`rounded-xl border px-4 py-3 ${
                  version.isPublished
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-800/60'
                }`}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">
                        {version.name || `버전 ${version.versionNumber}`}
                      </span>
                      {version.isPublished && (
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">
                          현재 퍼블리시됨
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">
                      상품 {version.totalProducts}개 • 생성 {new Date(version.createdAt).toLocaleString('ko-KR')}
                      {version.publishedAt && (
                        <span className="ml-2 text-slate-500">
                          (퍼블리시 {new Date(version.publishedAt).toLocaleString('ko-KR')})
                        </span>
                      )}
                    </p>
                    {version.description && (
                      <p className="text-xs text-slate-400 mt-1">{version.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handlePreview(version.id)}
                      className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                    >
                      미리보기
                    </button>
                    <button
                      onClick={async () => {
                        setExportState({ busy: true, versionId: version.id });
                        try {
                          await downloadHtml(version.id);
                        } catch (err: any) {
                          toast.error(err?.message || 'HTML 다운로드에 실패했습니다.');
                        } finally {
                          setExportState({ busy: false });
                        }
                      }}
                      disabled={exportState.busy && exportState.versionId === version.id}
                      className="rounded-lg border border-blue-600/60 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-600/20 disabled:opacity-60"
                    >
                      {exportState.busy && exportState.versionId === version.id ? '내보내는 중...' : 'HTML 내보내기'}
                    </button>
                    <button
                      onClick={() => copyHtml(version.id)}
                      disabled={exportState.busy && exportState.versionId === version.id}
                      className="rounded-lg border border-purple-600/60 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-600/20 disabled:opacity-60"
                    >
                      {exportState.busy && exportState.versionId === version.id ? '복사 중...' : '코드 복사'}
                    </button>
                    {!version.isPublished && (
                      <button
                        onClick={() => handlePublishVersion(version.id)}
                        className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-purple-500 hover:to-pink-500"
                      >
                        롤백 & 퍼블리시
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
