'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

interface CoverageMetrics {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

interface FileCoverage {
  lines: CoverageMetrics;
  statements: CoverageMetrics;
  functions: CoverageMetrics;
  branches: CoverageMetrics;
}

interface ModuleCoverage {
  name: string;
  files: Array<{
    path: string;
    coverage: FileCoverage;
  }>;
  summary: FileCoverage;
}

interface IntegrationTestResult {
  testName: string;
  category: string;
  timestamp: string;
  passed: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    percentage: number;
  };
  tests: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

interface CoverageData {
  available: boolean;
  lastUpdated?: string;
  total?: FileCoverage;
  modules?: ModuleCoverage[];
  fileCount?: number;
  integrationTests?: IntegrationTestResult[];
  error?: string;
}

export default function TestCoveragePage() {
  const [coverageData, setCoverageData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const fetchCoverage = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/test-coverage');
      const data = await res.json();
      setCoverageData(data);
    } catch (error) {
      console.error('커버리지 로드 실패:', error);
      toast.error('커버리지 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const regenerateCoverage = async () => {
    if (regenerating) return;

    setRegenerating(true);
    const toastId = toast.loading('커버리지를 재생성하는 중...');

    try {
      const res = await fetch('/api/test-coverage', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        toast.success('커버리지가 재생성되었습니다.', { id: toastId });
        await fetchCoverage();
      } else {
        toast.error(data.error || '재생성 실패', { id: toastId });
      }
    } catch (error) {
      toast.error('재생성 중 오류가 발생했습니다.', { id: toastId });
    } finally {
      setRegenerating(false);
    }
  };

  const toggleModule = (moduleName: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleName)) {
        next.delete(moduleName);
      } else {
        next.add(moduleName);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchCoverage();
  }, []);

  const getCoverageColor = (pct: number): string => {
    if (pct >= 80) return 'text-green-400';
    if (pct >= 60) return 'text-yellow-400';
    if (pct >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getCoverageBgColor = (pct: number): string => {
    if (pct >= 80) return 'bg-green-600';
    if (pct >= 60) return 'bg-yellow-600';
    if (pct >= 40) return 'bg-orange-600';
    return 'bg-red-600';
  };

  const getCoverageBorderColor = (pct: number): string => {
    if (pct >= 80) return 'border-green-500';
    if (pct >= 60) return 'border-yellow-500';
    if (pct >= 40) return 'border-orange-500';
    return 'border-red-500';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white">📊 테스트 커버리지</h1>
            <p className="text-slate-400">코드 테스트 커버리지를 모듈별로 확인합니다</p>
          </div>

          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-purple-400" />
              <p className="text-slate-300">커버리지 데이터를 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!coverageData?.available) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white">📊 테스트 커버리지</h1>
            <p className="text-slate-400">코드 테스트 커버리지를 모듈별로 확인합니다</p>
          </div>

          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-8 text-center">
            <div className="mb-4 text-6xl">⚠️</div>
            <h2 className="mb-2 text-xl font-bold text-red-200">커버리지 데이터 없음</h2>
            <p className="mb-6 text-slate-300">
              {coverageData?.error || '커버리지 데이터를 생성하려면 아래 버튼을 클릭하세요.'}
            </p>
            <button
              onClick={regenerateCoverage}
              disabled={regenerating}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-semibold text-white transition hover:from-purple-500 hover:to-pink-500 disabled:opacity-50"
            >
              {regenerating ? '생성 중...' : '🔄 커버리지 생성'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { total, modules, fileCount, lastUpdated, integrationTests } = coverageData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
        {/* 헤더 */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">📊 테스트 커버리지</h1>
            <p className="text-slate-400">
              {lastUpdated && `Jest 커버리지 업데이트: ${new Date(lastUpdated).toLocaleString('ko-KR')}`}
            </p>
            <div className="mt-2 flex gap-3 text-sm">
              <span className="rounded-full bg-blue-600/20 px-3 py-1 text-blue-300">
                Jest 단위 테스트 (*.test.tsx)
              </span>
              <span className="rounded-full bg-green-600/20 px-3 py-1 text-green-300">
                통합 테스트 (test-*.js)
              </span>
            </div>
          </div>
          <button
            onClick={regenerateCoverage}
            disabled={regenerating}
            className="rounded-lg border border-purple-600/60 bg-purple-600/20 px-4 py-2 font-semibold text-purple-200 transition hover:bg-purple-600/40 disabled:opacity-50"
          >
            {regenerating ? '재생성 중...' : '🔄 Jest 재생성'}
          </button>
        </div>

        {/* Jest 단위 테스트 커버리지 */}
        {total && (
          <div className="mb-6">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white">🧪 Jest 단위 테스트 커버리지</h2>
              <span className="rounded-full bg-yellow-600/20 px-3 py-1 text-xs text-yellow-300">
                낮은 커버리지: 통합테스트는 별도 (아래 참조)
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <CoverageCard
                title="Statements"
                metrics={total.statements}
                icon="📝"
              />
              <CoverageCard
                title="Branches"
                metrics={total.branches}
                icon="🌿"
              />
              <CoverageCard
                title="Functions"
                metrics={total.functions}
                icon="⚡"
              />
              <CoverageCard
                title="Lines"
                metrics={total.lines}
                icon="📄"
              />
            </div>
          </div>
        )}

        {/* 파일 카운트 */}
        <div className="mb-6 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
          <div className="flex items-center gap-2 text-blue-200">
            <span className="text-2xl">📁</span>
            <span className="text-lg font-semibold">
              총 {fileCount}개 파일 분석됨
            </span>
          </div>
        </div>

        {/* 통합테스트 결과 */}
        {integrationTests && integrationTests.length > 0 ? (
          <div className="mb-6">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-white">🚀 통합테스트 결과 (E2E)</h2>
              <p className="text-sm text-slate-400">
                실제 API 호출 및 시스템 동작 검증 (test-*.js 스크립트)
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {integrationTests.map((test, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl border p-4 ${
                    test.passed
                      ? 'border-green-500/50 bg-green-500/10'
                      : 'border-red-500/50 bg-red-500/10'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm text-slate-400">{test.category}</div>
                      <div className="font-semibold text-white">{test.testName}</div>
                    </div>
                    <div className="text-2xl">{test.passed ? '✅' : '❌'}</div>
                  </div>
                  <div className="mb-2 text-3xl font-bold">
                    <span className={test.passed ? 'text-green-400' : 'text-red-400'}>
                      {test.summary.percentage}%
                    </span>
                  </div>
                  <div className="text-sm text-slate-300">
                    통과: {test.summary.passed}/{test.summary.total}
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {new Date(test.timestamp).toLocaleString('ko-KR')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6">
            <div className="flex items-start gap-3">
              <span className="text-3xl">⚠️</span>
              <div className="flex-1">
                <h3 className="mb-2 text-lg font-bold text-yellow-200">통합테스트 결과 없음</h3>
                <p className="mb-3 text-sm text-slate-300">
                  통합테스트를 실행하면 여기에 결과가 표시됩니다.
                </p>
                <div className="rounded-lg bg-slate-900/50 p-3">
                  <code className="text-xs text-green-400">
                    node test-image-upload-ordering.js
                  </code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 모듈별 커버리지 */}
        <div className="space-y-4">
          {modules && modules.map((module) => (
            <div
              key={module.name}
              className={`overflow-hidden rounded-2xl border ${getCoverageBorderColor(module.summary.statements.pct)} bg-slate-800/50 transition-all`}
            >
              {/* 모듈 헤더 */}
              <button
                onClick={() => toggleModule(module.name)}
                className="w-full p-4 text-left transition hover:bg-slate-700/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">
                      {expandedModules.has(module.name) ? '📂' : '📁'}
                    </span>
                    <div>
                      <h3 className="text-xl font-bold text-white">{module.name}</h3>
                      <p className="text-sm text-slate-400">{module.files.length}개 파일</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${getCoverageColor(module.summary.statements.pct)}`}>
                        {module.summary.statements.pct.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-400">
                        {module.summary.statements.covered}/{module.summary.statements.total}
                      </div>
                    </div>
                    <span className="text-slate-400">
                      {expandedModules.has(module.name) ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {/* 진행바 */}
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className={`h-full transition-all ${getCoverageBgColor(module.summary.statements.pct)}`}
                    style={{ width: `${module.summary.statements.pct}%` }}
                  />
                </div>
              </button>

              {/* 모듈 상세 (확장 시) */}
              {expandedModules.has(module.name) && (
                <div className="border-t border-slate-700 p-4">
                  {/* 모듈 요약 */}
                  <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-900/50 p-3 sm:grid-cols-4">
                    <MetricBadge
                      label="Statements"
                      metrics={module.summary.statements}
                    />
                    <MetricBadge
                      label="Branches"
                      metrics={module.summary.branches}
                    />
                    <MetricBadge
                      label="Functions"
                      metrics={module.summary.functions}
                    />
                    <MetricBadge
                      label="Lines"
                      metrics={module.summary.lines}
                    />
                  </div>

                  {/* 파일 목록 */}
                  <div className="space-y-2">
                    <h4 className="mb-2 font-semibold text-slate-300">파일 목록</h4>
                    {module.files.map((file, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-slate-700 bg-slate-900/30 p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <code className="flex-1 break-all text-xs text-slate-300">
                            {file.path.split('/').pop() || file.path}
                          </code>
                          <span className={`text-sm font-bold ${getCoverageColor(file.coverage.statements.pct)}`}>
                            {file.coverage.statements.pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div>
                            <span className="text-slate-500">S: </span>
                            <span className="text-slate-300">
                              {file.coverage.statements.covered}/{file.coverage.statements.total}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">B: </span>
                            <span className="text-slate-300">
                              {file.coverage.branches.covered}/{file.coverage.branches.total}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">F: </span>
                            <span className="text-slate-300">
                              {file.coverage.functions.covered}/{file.coverage.functions.total}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">L: </span>
                            <span className="text-slate-300">
                              {file.coverage.lines.covered}/{file.coverage.lines.total}
                            </span>
                          </div>
                        </div>
                        <code className="mt-2 block text-xs text-slate-500">
                          {file.path}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 범례 */}
        <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
          <h3 className="mb-3 font-semibold text-white">📖 범례</h3>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-600" />
              <span className="text-slate-300">80% 이상 (우수)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-600" />
              <span className="text-slate-300">60-80% (양호)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-600" />
              <span className="text-slate-300">40-60% (보통)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-600" />
              <span className="text-slate-300">40% 미만 (미흡)</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-400">
            S: Statements | B: Branches | F: Functions | L: Lines
          </div>
        </div>
      </div>
    </div>
  );
}

// 커버리지 카드 컴포넌트
function CoverageCard({
  title,
  metrics,
  icon,
}: {
  title: string;
  metrics: CoverageMetrics;
  icon: string;
}) {
  const getCoverageColor = (pct: number): string => {
    if (pct >= 80) return 'text-green-400';
    if (pct >= 60) return 'text-yellow-400';
    if (pct >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getCoverageBgColor = (pct: number): string => {
    if (pct >= 80) return 'bg-green-600';
    if (pct >= 60) return 'bg-yellow-600';
    if (pct >= 40) return 'bg-orange-600';
    return 'bg-red-600';
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-semibold text-slate-400">{title}</span>
      </div>
      <div className={`mb-2 text-3xl font-bold ${getCoverageColor(metrics.pct)}`}>
        {metrics.pct.toFixed(1)}%
      </div>
      <div className="mb-2 text-sm text-slate-400">
        {metrics.covered} / {metrics.total}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full transition-all ${getCoverageBgColor(metrics.pct)}`}
          style={{ width: `${metrics.pct}%` }}
        />
      </div>
    </div>
  );
}

// 메트릭 뱃지 컴포넌트
function MetricBadge({
  label,
  metrics,
}: {
  label: string;
  metrics: CoverageMetrics;
}) {
  const getCoverageColor = (pct: number): string => {
    if (pct >= 80) return 'text-green-400';
    if (pct >= 60) return 'text-yellow-400';
    if (pct >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${getCoverageColor(metrics.pct)}`}>
        {metrics.pct.toFixed(1)}%
      </div>
      <div className="text-xs text-slate-400">
        {metrics.covered}/{metrics.total}
      </div>
    </div>
  );
}
