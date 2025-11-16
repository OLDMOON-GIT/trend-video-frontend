'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';

interface TitlePoolItem {
  id: string;
  category: string;
  title: string;
  score: number;
  validated: number;
  used: number;
  created_at: string;
}

interface Stats {
  category: string;
  total: number;
  unused: number;
  avg_score: number;
  max_score: number;
}

export default function TitlePoolPage() {
  const router = useRouter();
  const [titles, setTitles] = useState<TitlePoolItem[]>([]);
  const [stats, setStats] = useState<Stats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [minScore, setMinScore] = useState(90);

  useEffect(() => {
    loadData();
  }, [selectedCategory, minScore]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // 통계 로드
      const statsRes = await fetch('/api/admin/title-pool/stats');
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats || []);
      }

      // 제목 로드
      const params = new URLSearchParams({
        category: selectedCategory,
        minScore: minScore.toString(),
        limit: '100'
      });
      const titlesRes = await fetch(`/api/admin/title-pool?${params}`);
      if (titlesRes.ok) {
        const data = await titlesRes.json();
        setTitles(data.titles || []);
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error);
      toast.error('데이터 로드 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 제목을 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/admin/title-pool/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('삭제되었습니다');
        loadData();
      } else {
        toast.error('삭제 실패');
      }
    } catch (error) {
      console.error('삭제 실패:', error);
      toast.error('삭제 실패');
    }
  };

  const handleResetUsed = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/title-pool/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ used: 0 })
      });

      if (res.ok) {
        toast.success('사용 표시 초기화');
        loadData();
      } else {
        toast.error('초기화 실패');
      }
    } catch (error) {
      console.error('초기화 실패:', error);
      toast.error('초기화 실패');
    }
  };

  const categories = ['all', ...stats.map(s => s.category)];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <Toaster position="top-right" />

      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">🎯 제목 풀 관리</h1>
            <p className="text-slate-400 mt-2">90점 이상 고품질 제목 모음</p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded"
          >
            ← 관리자
          </button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.category} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div className="text-sm text-slate-400 mb-2">{stat.category}</div>
              <div className="text-3xl font-bold mb-2">{stat.total}</div>
              <div className="text-sm text-slate-400">
                미사용: {stat.unused}개 | 평균: {stat.avg_score.toFixed(1)}점
              </div>
              <div className="text-xs text-slate-500 mt-1">
                최고: {stat.max_score}점
              </div>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6 border border-slate-700">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <label className="block text-sm text-slate-400 mb-2">카테고리</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? '전체' : cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm text-slate-400 mb-2">최소 점수</label>
              <input
                type="number"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                min="0"
                max="100"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>

            <div className="pt-6">
              <button
                onClick={loadData}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded"
              >
                🔍 검색
              </button>
            </div>
          </div>
        </div>

        {/* 제목 목록 */}
        <div className="bg-slate-800 rounded-lg border border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-xl font-bold">
              제목 목록 ({titles.length}개)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">점수</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">카테고리</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">제목</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">상태</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">생성일</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">작업</th>
                </tr>
              </thead>
              <tbody>
                {titles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      제목이 없습니다. <br />
                      <code className="text-xs bg-slate-700 px-2 py-1 rounded mt-2 inline-block">
                        node batch-generate-titles.js
                      </code> 실행으로 제목을 생성하세요.
                    </td>
                  </tr>
                ) : (
                  titles.map((title) => (
                    <tr key={title.id} className="border-b border-slate-700 hover:bg-slate-750">
                      <td className="px-4 py-3">
                        <span className={`font-bold ${
                          title.score >= 95 ? 'text-green-400' :
                          title.score >= 90 ? 'text-blue-400' :
                          'text-yellow-400'
                        }`}>
                          {title.score}점
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {title.category}
                      </td>
                      <td className="px-4 py-3">
                        {title.title}
                      </td>
                      <td className="px-4 py-3">
                        {title.used === 1 ? (
                          <span className="text-xs bg-slate-600 text-slate-300 px-2 py-1 rounded">
                            사용됨
                          </span>
                        ) : (
                          <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                            미사용
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {new Date(title.created_at).toLocaleString('ko-KR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {title.used === 1 && (
                            <button
                              onClick={() => handleResetUsed(title.id)}
                              className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded"
                              title="사용 표시 초기화"
                            >
                              🔄
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(title.id)}
                            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 rounded"
                            title="삭제"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 안내 */}
        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
          <h3 className="font-bold mb-2">💡 사용 방법</h3>
          <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
            <li><code className="bg-slate-700 px-1 rounded">node batch-generate-titles.js</code> 실행으로 대량 제목 생성</li>
            <li>automation_settings에서 <code className="bg-slate-700 px-1 rounded">use_title_pool = 'true'</code>로 설정</li>
            <li>자동화 실행 시 제목 풀에서 90점 이상 제목 자동 선택</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
