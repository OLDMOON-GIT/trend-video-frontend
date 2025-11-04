'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ChineseConverterPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 비디오 파일 검증
      if (!file.type.startsWith('video/')) {
        alert('비디오 파일만 업로드할 수 있습니다.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        alert('비디오 파일만 업로드할 수 있습니다.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleConvert = async () => {
    if (!selectedFile) {
      alert('먼저 비디오 파일을 선택해주세요.');
      return;
    }

    setIsConverting(true);
    setProgress(0);
    setStatusMessage('🚀 변환 작업 시작 중...');

    try {
      // FormData 생성
      const formData = new FormData();
      formData.append('video', selectedFile);

      // API 호출
      const response = await fetch('/api/chinese-converter/convert', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '변환 실패');
      }

      setStatusMessage('✅ 변환 작업이 시작되었습니다!');

      // 작업 ID가 있으면 상태 폴링 시작
      if (data.jobId) {
        pollJobStatus(data.jobId);
      }

    } catch (error: any) {
      console.error('변환 오류:', error);
      alert(error.message || '변환 중 오류가 발생했습니다.');
      setIsConverting(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/chinese-converter/status?jobId=${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(interval);
          setProgress(100);
          setStatusMessage('✅ 변환 완료!');
          setIsConverting(false);

          // 완료 후 내 콘텐츠로 이동
          setTimeout(() => {
            router.push('/my-content');
          }, 2000);
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setStatusMessage(`❌ 변환 실패: ${data.error}`);
          setIsConverting(false);
          setProgress(0);
        } else if (data.status === 'processing') {
          setProgress(data.progress || 50);
          setStatusMessage(data.message || '🔄 변환 진행 중...');
        }
      } catch (error) {
        console.error('상태 조회 오류:', error);
      }
    }, 3000); // 3초마다 상태 확인

    // 10분 후 자동 중지
    setTimeout(() => {
      clearInterval(interval);
      if (isConverting) {
        setIsConverting(false);
        setStatusMessage('⏱️ 시간 초과');
      }
    }, 10 * 60 * 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="mx-auto max-w-4xl">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">🇨🇳 중국영상변환</h1>
            <p className="mt-2 text-slate-400">
              중국어 자막과 음성을 한국어로 변환합니다
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-white/10 px-4 py-2 text-white transition hover:bg-white/20"
          >
            ← 돌아가기
          </Link>
        </div>

        {/* 메인 컨텐츠 */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 backdrop-blur">
          {/* 파일 업로드 영역 */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="mb-6 cursor-pointer rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-12 text-center transition hover:border-white/40 hover:bg-white/10"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {selectedFile ? (
              <div>
                <div className="mb-2 text-4xl">📹</div>
                <p className="text-lg font-semibold text-white">{selectedFile.name}</p>
                <p className="mt-1 text-sm text-slate-400">
                  크기: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <p className="mt-4 text-sm text-purple-400">
                  클릭하여 다른 파일 선택
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-4 text-6xl">🎬</div>
                <p className="mb-2 text-xl font-semibold text-white">
                  비디오 파일을 드래그하거나 클릭하여 선택
                </p>
                <p className="text-sm text-slate-400">
                  MP4, AVI, MOV 등 모든 비디오 형식 지원
                </p>
              </div>
            )}
          </div>

          {/* 변환 프로세스 설명 */}
          <div className="mb-6 rounded-lg bg-purple-900/20 p-4">
            <h3 className="mb-3 font-semibold text-white">🔄 변환 프로세스</h3>
            <ol className="space-y-2 text-sm text-slate-300">
              <li>1️⃣ 중국어 자막 추출</li>
              <li>2️⃣ 중국어 → 한국어 번역</li>
              <li>3️⃣ 한국어 TTS 음성 생성</li>
              <li>4️⃣ 원본 영상과 합성</li>
              <li>5️⃣ 완료 후 내 콘텐츠에서 다운로드</li>
            </ol>
          </div>

          {/* 진행 상황 */}
          {isConverting && (
            <div className="mb-6 rounded-lg bg-blue-900/20 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {statusMessage}
                </span>
                <span className="text-sm text-slate-400">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 변환 버튼 */}
          <button
            onClick={handleConvert}
            disabled={!selectedFile || isConverting}
            className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-600 px-6 py-4 text-lg font-semibold text-white transition hover:from-red-500 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConverting ? '⏳ 변환 중...' : '🚀 변환 시작'}
          </button>

          {/* 주의사항 */}
          <div className="mt-6 rounded-lg border border-yellow-500/20 bg-yellow-900/10 p-4">
            <h4 className="mb-2 flex items-center gap-2 font-semibold text-yellow-400">
              ⚠️ 주의사항
            </h4>
            <ul className="space-y-1 text-sm text-slate-300">
              <li>• 중국어 자막이 포함된 영상만 변환 가능합니다</li>
              <li>• 변환에는 영상 길이에 따라 수 분이 소요될 수 있습니다</li>
              <li>• 완료된 영상은 내 콘텐츠 페이지에서 확인하세요</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
