'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [kakaoId, setKakaoId] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const verified = searchParams.get('verified');
    if (!verified) return;

    if (verified === 'true') {
      setSuccessMessage('이메일 인증이 완료되었습니다. 로그인해주세요.');
      setError('');
      setMode('login');
    } else if (verified === 'invalid') {
      setError('유효하지 않은 인증 링크입니다. 이미 사용했거나 만료되었을 수 있어요.');
    } else if (verified === 'missing') {
      setError('인증 토큰이 없습니다. 메일의 링크를 다시 확인해주세요.');
    } else if (verified === 'error') {
      setError('인증 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    }

    const timeout = window.setTimeout(() => {
      setSuccessMessage('');
      setError('');
    }, 5000);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('verified');
      window.history.replaceState(null, '', url.toString());
    }

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const body = mode === 'login'
        ? { email, password, rememberMe }
        : { email, password, name, phone, address, kakaoId: kakaoId || undefined, rememberMe };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '오류가 발생했습니다.');
      }

      // 이메일 인증이 필요한 경우
      if (data.requiresVerification) {
        setError('');
        alert('회원가입이 완료되었습니다. 이메일을 확인하여 인증을 완료해주세요.');
        setMode('login');
        return;
      }

      // 쿠키 기반 인증 사용 - localStorage에 저장하지 않음
      // 세션 쿠키는 서버에서 자동으로 설정됨
      console.log('✅ 로그인 성공 - 세션 쿠키 설정됨');

      // 성공 - 메인 페이지로 이동 (전체 페이지 새로고침하여 세션 상태 반영)
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/50 p-8 shadow-2xl backdrop-blur">
        <h1 className="mb-6 text-center text-3xl font-bold text-white">
          {mode === 'login' ? '로그인' : '회원가입'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
              placeholder="최소 6자 이상"
            />
          </div>

          {mode === 'signup' && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  이름 *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
                  placeholder="홍길동"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  핸드폰번호 *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
                  placeholder="01012345678 (하이픈 없이)"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  주소 *
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
                  placeholder="서울시 강남구 테헤란로 123"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  카카오톡 ID (선택)
                </label>
                <input
                  type="text"
                  value={kakaoId}
                  onChange={(e) => setKakaoId(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-slate-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20"
                  placeholder="선택사항"
                />
              </div>
            </>
          )}

          {mode === 'login' && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/10 text-purple-600 focus:ring-2 focus:ring-purple-400/20 focus:ring-offset-0"
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-slate-300 cursor-pointer">
                로그인 상태 유지
              </label>
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg bg-green-500/20 p-3 text-sm text-green-300">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/20 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError('');
            }}
            className="text-sm text-purple-400 hover:text-purple-300"
          >
            {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white">로딩 중...</div>
      </div>
    }>
      <AuthContent />
    </Suspense>
  );
}
