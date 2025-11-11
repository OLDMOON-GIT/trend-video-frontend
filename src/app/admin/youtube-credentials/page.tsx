'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function YouTubeCredentialsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    checkAdmin();
    checkCredentials();
  }, []);

  const checkAdmin = async () => {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await response.json();

      if (!data.user || !data.user.isAdmin) {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
        return;
      }
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  const checkCredentials = async () => {
    try {
      const res = await fetch('/api/admin/youtube-credentials');
      const data = await res.json();
      setHasCredentials(data.hasCredentials || false);
    } catch (error) {
      console.error('Credentials 확인 실패:', error);
    }
  };

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      toast.error('JSON 파일만 업로드 가능합니다');
      return;
    }

    try {
      setIsUploading(true);
      toast.loading('Credentials 파일 업로드 중...', { id: 'upload' });

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/youtube-credentials', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Credentials 파일 업로드 완료!', { id: 'upload' });
        setHasCredentials(true);
      } else {
        throw new Error(data.error || '업로드 실패');
      }
    } catch (error: any) {
      console.error('Credentials 업로드 실패:', error);
      toast.error(`업로드 실패: ${error.message}`, { id: 'upload' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const handleDelete = async () => {
    if (!confirm('정말로 Credentials 파일을 삭제하시겠습니까?\n모든 사용자의 YouTube 연결이 작동하지 않게 됩니다.')) {
      return;
    }

    try {
      toast.loading('삭제 중...', { id: 'delete' });
      const res = await fetch('/api/admin/youtube-credentials', { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        toast.success('Credentials 파일 삭제 완료', { id: 'delete' });
        setHasCredentials(false);
      } else {
        throw new Error(data.error || '삭제 실패');
      }
    } catch (error: any) {
      console.error('삭제 실패:', error);
      toast.error(`삭제 실패: ${error.message}`, { id: 'delete' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-slate-300 text-lg">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <a href="/admin" className="text-slate-400 hover:text-slate-300 transition-colors">
              ← 관리자 대시보드
            </a>
            <div className="text-2xl">|</div>
            <h1 className="text-3xl font-bold text-white">YouTube Credentials 관리</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 overflow-hidden">

          {/* 상태 */}
          <div className="p-8 border-b border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">Credentials 상태</h2>

            {hasCredentials ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-green-400 font-semibold">설정됨 - 모든 사용자가 YouTube 연결 가능</span>
                </div>

                <button
                  onClick={handleDelete}
                  className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Credentials 파일 삭제
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg">
                  <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                  <span className="text-slate-300">설정되지 않음</span>
                </div>

                {/* 업로드 섹션 */}
                <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg">
                  <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    OAuth 2.0 JSON 파일 업로드
                  </h3>

                  <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm text-blue-300 mb-2 font-semibold">📍 Google Cloud Console에서 다운로드한 JSON 파일:</p>
                    <ol className="text-sm text-slate-300 space-y-1 ml-4">
                      <li>1. Google Cloud Console → API 및 서비스 → 사용자 인증 정보</li>
                      <li>2. OAuth 2.0 클라이언트 ID 목록에서 항목 찾기</li>
                      <li>3. 우측 ⋮ 메뉴 → "JSON 다운로드" 선택</li>
                      <li>4. 다운로드한 JSON 파일을 아래에 업로드</li>
                    </ol>
                  </div>

                  {/* 파일 선택 버튼 */}
                  <div className="mb-4">
                    <input
                      type="file"
                      id="credentials-file-input"
                      accept=".json"
                      onChange={handleUpload}
                      disabled={isUploading}
                      className="hidden"
                    />
                    <label
                      htmlFor="credentials-file-input"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      파일 선택
                    </label>
                  </div>

                  {/* 드래그 앤 드롭 영역 */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-all ${
                      isDragging
                        ? 'border-purple-400 bg-purple-500/20 scale-[1.02]'
                        : 'border-purple-500/50 bg-slate-900/50'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center pointer-events-none">
                      <svg className={`w-10 h-10 mb-3 transition-colors ${isDragging ? 'text-purple-300' : 'text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="mb-2 text-sm text-slate-300 font-semibold">
                        {isDragging ? '파일을 여기에 놓으세요' : '또는 파일을 여기에 드래그하세요'}
                      </p>
                      <p className="text-xs text-slate-400">JSON 파일만 가능</p>
                    </div>
                  </div>

                  {isUploading && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-sm text-purple-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>
                      <span>업로드 중...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 안내 */}
          <div className="p-8">
            <h2 className="text-xl font-bold text-white mb-4">⚠️ 중요 안내</h2>
            <div className="space-y-3 text-sm text-slate-300">
              <p>• 이 Credentials 파일은 <strong className="text-white">모든 사용자가 공용으로 사용</strong>합니다.</p>
              <p>• 각 사용자는 이 Credentials로 <strong className="text-white">개인 YouTube 채널을 연결</strong>합니다.</p>
              <p>• Credentials를 삭제하면 <strong className="text-red-400">모든 사용자의 YouTube 업로드가 불가능</strong>해집니다.</p>
              <p>• Google Cloud Console에서 <strong className="text-white">"데스크톱 앱"</strong> 타입의 OAuth 클라이언트 ID를 사용하세요.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
