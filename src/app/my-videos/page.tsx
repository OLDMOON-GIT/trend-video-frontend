'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';
import YouTubeUploadButton from '@/components/YouTubeUploadButton';

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step: string;
  videoPath?: string;
  thumbnailPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
  logs?: any[];
}

export default function MyVideosPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<'all' | 'active'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [expandedLogJobId, setExpandedLogJobId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      // 필터나 검색어가 변경되면 처음부터 다시 로드
      setJobs([]);
      setOffset(0);
      fetchJobs(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, searchQuery]);

  // 쿠키 기반 인증 사용 - 쿠키가 자동으로 전송됨
  const getAuthHeaders = (): HeadersInit => {
    return {}; // 빈 객체 반환 (쿠키가 자동으로 전송됨)
  };

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (!data.user) {
        router.push('/auth');
        return;
      }

      setUser(data.user);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    }
  };

  const fetchJobs = async (reset = false) => {
    const currentOffset = reset ? 0 : offset;

    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        filter,
        limit: '10',
        offset: currentOffset.toString(),
        ...(searchQuery && { search: searchQuery })
      });

      const response = await fetch(`/api/my-videos?${params}`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (response.ok) {
        if (reset) {
          setJobs(data.jobs);
        } else {
          setJobs(prev => [...prev, ...data.jobs]);
        }
        setTotal(data.total);
        setHasMore(data.hasMore);
        setOffset(currentOffset + data.jobs.length);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchJobs(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      localStorage.removeItem('sessionId');
      router.push('/auth');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('정말로 영상 생성을 취소하시겠습니까?')) {
      return;
    }

    console.log('🛑 취소 요청 시작:', jobId);
    const url = `/api/generate-video-upload?jobId=${jobId}`;
    console.log('🔗 요청 URL:', url);
    console.log('🔑 인증 헤더:', getAuthHeaders());

    try {
      console.log('📡 DELETE 요청 전송 중...');
      const response = await fetch(url, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      console.log('📥 응답 수신:', response.status, response.statusText);

      const data = await response.json();
      console.log('📄 응답 데이터:', data);

      if (response.ok) {
        alert('영상 생성이 취소되었습니다.');
        fetchJobs(true); // 목록 새로고침
      } else {
        console.error('❌ 취소 실패:', data);
        alert('취소 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('❌ Cancel error:', error);
      alert('취소 중 오류가 발생했습니다: ' + error);
    }
  };

  const handleOpenFolder = async (jobId: string) => {
    console.log('📁 폴더 열기 버튼 클릭됨, jobId:', jobId);

    try {
      const response = await fetch(`/api/open-folder?jobId=${jobId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await response.json();
      console.log('📁 폴더 열기 응답:', data);

      if (response.ok) {
        alert('폴더를 열었습니다.');
      } else {
        alert('폴더 열기 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('❌ 폴더 열기 오류:', error);
      alert('폴더 열기 중 오류가 발생했습니다.');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-300',
      processing: 'bg-blue-500/20 text-blue-300',
      completed: 'bg-green-500/20 text-green-300',
      failed: 'bg-red-500/20 text-red-300',
      cancelled: 'bg-gray-500/20 text-gray-300'
    };

    const labels = {
      pending: '대기 중',
      processing: '진행 중',
      completed: '완료',
      failed: '실패',
      cancelled: '취소됨'
    };

    return (
      <span className={`rounded px-2 py-1 text-xs font-semibold ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-6xl">
{/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              내 영상 목록
              {total > 0 && <span className="ml-3 text-lg text-slate-400">전체 {total}개</span>}
            </h1>
            {user && <p className="mt-1 text-sm text-slate-400">{user.email}</p>}
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
          >
            로그아웃
          </button>
        </div>

        {/* 검색 */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="영상 제목, ID, 상태로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg bg-white/10 px-4 py-2 text-white placeholder-slate-400 border border-white/20 focus:border-purple-500 focus:outline-none transition"
          />
        </div>

        {/* 필터 */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              filter === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              filter === 'active'
                ? 'bg-purple-600 text-white'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            진행 중
          </button>
        </div>

        {/* 영상 목록 */}
        {isLoading ? (
          <div className="text-center text-slate-400">로딩 중...</div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center backdrop-blur">
            <p className="text-slate-400">
              {filter === 'active' ? '진행 중인 작업이 없습니다.' : '생성한 영상이 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:bg-white/10"
              >
                <div className="flex items-start gap-4">
                  {/* 썸네일 */}
                  {job.status === 'completed' && job.thumbnailPath && (
                    <a
                      href={`/api/download-thumbnail?jobId=${job.id}`}
                      download
                      className="flex-shrink-0 cursor-pointer group"
                      title="클릭하여 썸네일 다운로드"
                    >
                      <img
                        src={`/api/thumbnail?jobId=${job.id}`}
                        alt="썸네일"
                        className="w-48 h-auto object-contain rounded-lg border-2 border-white/20 group-hover:border-purple-500 transition"
                      />
                    </a>
                  )}

                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">
                        {job.title || job.id}
                      </h3>
                      {getStatusBadge(job.status)}
                    </div>

                    <div className="mb-3 space-y-1 text-sm text-slate-400">
                      <p>진행 상태: {job.step}</p>
                      <p>생성 시간: {formatDate(job.createdAt)}</p>
                      {job.updatedAt !== job.createdAt && (
                        <p>마지막 업데이트: {formatDate(job.updatedAt)}</p>
                      )}
                    </div>

                    {job.status === 'processing' && (
                      <div className="mb-3">
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span>{job.step}</span>
                          <span>{job.progress}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-purple-500 transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {job.error && (
                      <div className="rounded bg-red-500/20 p-3 text-sm text-red-300">
                        {job.error}
                      </div>
                    )}
                  </div>

                  <div className="ml-4 flex gap-2">
                    {(job.status === 'pending' || job.status === 'processing') && (
                      <button
                        onClick={() => handleCancelJob(job.id)}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
                      >
                        🛑 중지
                      </button>
                    )}
                    {job.logs && job.logs.length > 0 && (
                      <button
                        onClick={() => setExpandedLogJobId(expandedLogJobId === job.id ? null : job.id)}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                      >
                        {expandedLogJobId === job.id ? '📋 로그 닫기' : '📋 로그 보기'}
                      </button>
                    )}
                    {job.status === 'completed' && job.videoPath && (
                      <>
                        <YouTubeUploadButton
                          videoPath={job.videoPath}
                          thumbnailPath={job.thumbnailPath}
                          defaultTitle={job.title || ''}
                          jobId={job.id}
                        />
                        <button
                          onClick={() => handleOpenFolder(job.id)}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                          title="폴더 열기"
                        >
                          📁 폴더 열기
                        </button>
                        <a
                          href={`/api/download-video?jobId=${job.id}`}
                          download
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500"
                        >
                          다운로드
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* 로그 표시 영역 */}
                {expandedLogJobId === job.id && job.logs && job.logs.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-600 bg-slate-900/80 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">📋 서버 로그</span>
                      <span className="text-xs text-slate-500">{job.logs.length}개 항목</span>
                    </div>
                    <div className="max-h-96 overflow-y-auto rounded bg-black/50 p-3 font-mono text-xs leading-relaxed">
                      {job.logs.map((log, idx) => (
                        <div key={idx} className="text-green-400 whitespace-pre-wrap break-all mb-1">
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 더 보기 버튼 */}
            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? '로딩 중...' : '더 보기'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 맨 위로 플로팅 버튼 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 rounded-full bg-purple-600 p-4 text-white shadow-lg transition hover:bg-purple-500 hover:shadow-xl z-50"
        title="맨 위로"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>
    </div>
  );
}
