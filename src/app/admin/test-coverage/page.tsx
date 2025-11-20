'use client';

import { useEffect, useState } from 'react';

interface CoverageData {
  file: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

interface CoverageSummary {
  totalFiles: number;
  averageStatements: number;
  averageBranches: number;
  averageFunctions: number;
  averageLines: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  totalTests: number;
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function CoveragePage() {
  const [coverage, setCoverage] = useState<CoverageData[]>([]);
  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCoverage = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/admin/coverage');
        if (!response.ok) {
          throw new Error('Failed to fetch coverage data');
        }
        const data = await response.json();
        setCoverage(data.coverage || []);
        setSummary(data.summary || null);
      } catch (err: any) {
        setError(err.message || 'Error loading coverage');
      } finally {
        setLoading(false);
      }
    };

    fetchCoverage();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400">Coverage 데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
            <h2 className="text-red-400 font-semibold mb-2">Error</h2>
            <p className="text-red-300">{error}</p>
            <p className="text-red-300 text-sm mt-4">
              Coverage 데이터를 가져올 수 없습니다. 테스트를 실행한 후 다시 시도하세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const testData = summary
    ? [
        { name: 'Passed', value: summary.passedTests, color: '#10b981' },
        { name: 'Failed', value: summary.failedTests, color: '#ef4444' },
        { name: 'Skipped', value: summary.skippedTests, color: '#8b5cf6' },
      ]
    : [];

  const coverageMetrics = summary
    ? [
        { name: 'Statements', value: summary.averageStatements },
        { name: 'Branches', value: summary.averageBranches },
        { name: 'Functions', value: summary.averageFunctions },
        { name: 'Lines', value: summary.averageLines },
      ]
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">📊 Test Coverage Dashboard</h1>
          <p className="text-gray-400">전체 프로젝트의 테스트 커버리지 및 통계</p>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {/* Total Tests */}
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/30 rounded-lg p-6">
              <p className="text-blue-300 text-sm font-semibold mb-2">Total Tests</p>
              <p className="text-4xl font-bold text-blue-400">{summary.totalTests}</p>
              <p className="text-blue-300/70 text-xs mt-2">전체 테스트</p>
            </div>

            {/* Passed Tests */}
            <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/30 rounded-lg p-6">
              <p className="text-green-300 text-sm font-semibold mb-2">Passed</p>
              <p className="text-4xl font-bold text-green-400">{summary.passedTests}</p>
              <p className="text-green-300/70 text-xs mt-2">
                {summary.totalTests > 0 ? ((summary.passedTests / summary.totalTests) * 100).toFixed(1) : 0}%
              </p>
            </div>

            {/* Failed Tests */}
            <div className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/30 rounded-lg p-6">
              <p className="text-red-300 text-sm font-semibold mb-2">Failed</p>
              <p className="text-4xl font-bold text-red-400">{summary.failedTests}</p>
              <p className="text-red-300/70 text-xs mt-2">
                {summary.totalTests > 0 ? ((summary.failedTests / summary.totalTests) * 100).toFixed(1) : 0}%
              </p>
            </div>

            {/* Skipped Tests */}
            <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/30 rounded-lg p-6">
              <p className="text-purple-300 text-sm font-semibold mb-2">Skipped</p>
              <p className="text-4xl font-bold text-purple-400">{summary.skippedTests}</p>
              <p className="text-purple-300/70 text-xs mt-2">
                {summary.totalTests > 0 ? ((summary.skippedTests / summary.totalTests) * 100).toFixed(1) : 0}%
              </p>
            </div>

            {/* Total Files */}
            <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/30 rounded-lg p-6">
              <p className="text-amber-300 text-sm font-semibold mb-2">Files</p>
              <p className="text-4xl font-bold text-amber-400">{summary.totalFiles}</p>
              <p className="text-amber-300/70 text-xs mt-2">테스트된 파일</p>
            </div>
          </div>
        )}

        {/* Coverage Metrics Chart */}
        {coverageMetrics.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-white mb-6">📈 Coverage Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {coverageMetrics.map((metric) => (
                <div key={metric.name} className="bg-gray-700/30 rounded-lg p-4">
                  <p className="text-gray-300 text-sm font-semibold mb-3">{metric.name}</p>
                  <div className="relative h-32 bg-gray-900/50 rounded flex items-end justify-center">
                    <div
                      className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all duration-500"
                      style={{ height: `${metric.value}%` }}
                    ></div>
                    <div className="absolute text-white font-bold text-2xl">{metric.value.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-xs mt-4">
              평균 커버리지 메트릭 (Statements, Branches, Functions, Lines)
            </p>
          </div>
        )}

        {/* Test Results Distribution */}
        {testData.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-white mb-6">🎯 Test Results</h2>
            <div className="grid grid-cols-3 gap-4">
              {testData.map((test) => (
                <div key={test.name} className="text-center">
                  <div
                    className="h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-3 border-4"
                    style={{
                      backgroundColor: test.color + '20',
                      borderColor: test.color,
                    }}
                  >
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{test.value}</p>
                      <p className="text-xs text-gray-300">
                        {summary && summary.totalTests > 0
                          ? ((test.value / summary.totalTests) * 100).toFixed(0)
                          : 0}%
                      </p>
                    </div>
                  </div>
                  <p className="text-gray-300 font-semibold">{test.name}</p>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-xs mt-4">전체 테스트 결과 분포</p>
          </div>
        )}

        {/* Detailed Coverage Table */}
        {coverage.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 overflow-x-auto">
            <h2 className="text-xl font-semibold text-white mb-4">📋 File Coverage Details</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-4 py-3 text-left text-gray-300 font-semibold">File</th>
                  <th className="px-4 py-3 text-center text-gray-300 font-semibold">Statements</th>
                  <th className="px-4 py-3 text-center text-gray-300 font-semibold">Branches</th>
                  <th className="px-4 py-3 text-center text-gray-300 font-semibold">Functions</th>
                  <th className="px-4 py-3 text-center text-gray-300 font-semibold">Lines</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((file, idx) => (
                  <tr key={idx} className="border-b border-gray-700/30 hover:bg-gray-700/20 transition">
                    <td className="px-4 py-3 text-gray-300">{file.file}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-12 h-6 rounded text-xs font-semibold ${
                          file.statements >= 80
                            ? 'bg-green-500/20 text-green-300'
                            : file.statements >= 60
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {file.statements}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-12 h-6 rounded text-xs font-semibold ${
                          file.branches >= 80
                            ? 'bg-green-500/20 text-green-300'
                            : file.branches >= 60
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {file.branches}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-12 h-6 rounded text-xs font-semibold ${
                          file.functions >= 80
                            ? 'bg-green-500/20 text-green-300'
                            : file.functions >= 60
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {file.functions}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-12 h-6 rounded text-xs font-semibold ${
                          file.lines >= 80
                            ? 'bg-green-500/20 text-green-300'
                            : file.lines >= 60
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {file.lines}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {coverage.length === 0 && !error && (
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-12 text-center">
            <p className="text-gray-400 mb-2">Coverage 데이터가 없습니다.</p>
            <p className="text-gray-500 text-sm">
              다음 명령어를 실행하여 coverage 데이터를 생성하세요:
            </p>
            <div className="mt-4 bg-gray-900 rounded p-3 text-left">
              <code className="text-gray-300 text-sm">npm test -- --coverage</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
