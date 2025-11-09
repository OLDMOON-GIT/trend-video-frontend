// C:\Users\oldmoon\workspace\trend-video-frontend\src\components\SourceCodeModal.tsx
'use client';

import { useEffect } from 'react';

interface SourceCodeModalProps {
  code: string | null;
  filename: string;
  onClose: () => void;
}

export default function SourceCodeModal({ code, filename, onClose }: SourceCodeModalProps) {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!code) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100000] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden shadow-2xl shadow-blue-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
            <div>
                <h3 className="text-lg font-bold text-white">소스 코드 보기</h3>
                <p className="text-sm text-slate-400">{filename}</p>
            </div>
            <button
                onClick={onClose}
                className="text-slate-400 hover:text-white"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </header>
        <main className="p-4 overflow-auto bg-black/20 flex-grow">
          <pre className="text-sm text-white whitespace-pre-wrap">
            <code>{code}</code>
          </pre>
        </main>
        <footer className="p-3 border-t border-slate-700 flex-shrink-0 text-right">
            <button
                onClick={onClose}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold py-2 px-4 rounded-lg transition"
            >
                닫기
            </button>
        </footer>
      </div>
    </div>
  );
}
