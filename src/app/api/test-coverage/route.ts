import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 커버리지 데이터 타입
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

interface CoverageSummary {
  total: FileCoverage;
  [key: string]: FileCoverage;
}

// 모듈별로 그룹화
interface ModuleCoverage {
  name: string;
  files: Array<{
    path: string;
    coverage: FileCoverage;
  }>;
  summary: FileCoverage;
}

export async function GET(request: NextRequest) {
  try {
    const projectRoot = process.cwd();
    const coveragePath = path.join(projectRoot, 'coverage', 'coverage-summary.json');

    // 커버리지 파일이 없으면 생성 시도
    if (!fs.existsSync(coveragePath)) {
      // 커버리지 생성 (백그라운드에서 실행되도록)
      try {
        await execAsync('npm test -- --coverage --silent --maxWorkers=2', {
          cwd: projectRoot,
          timeout: 60000 // 60초 타임아웃
        });
      } catch (error) {
        // 테스트 실패해도 커버리지는 생성될 수 있음
        console.log('Test execution completed with errors, but coverage may be available');
      }
    }

    // 커버리지 파일 읽기
    if (!fs.existsSync(coveragePath)) {
      return NextResponse.json({
        error: '커버리지 데이터가 없습니다. npm test -- --coverage를 먼저 실행하세요.',
        available: false,
      }, { status: 404 });
    }

    const coverageData: CoverageSummary = JSON.parse(
      fs.readFileSync(coveragePath, 'utf-8')
    );

    // 모듈별로 분류
    const modules: { [key: string]: ModuleCoverage } = {
      'Components': { name: 'Components', files: [], summary: createEmptyCoverage() },
      'Pages': { name: 'Pages', files: [], summary: createEmptyCoverage() },
      'API Routes': { name: 'API Routes', files: [], summary: createEmptyCoverage() },
      'Utils/Lib': { name: 'Utils/Lib', files: [], summary: createEmptyCoverage() },
      'Tests': { name: 'Tests', files: [], summary: createEmptyCoverage() },
      'Other': { name: 'Other', files: [], summary: createEmptyCoverage() },
    };

    // 파일별 데이터를 모듈로 분류
    Object.entries(coverageData).forEach(([filePath, coverage]) => {
      if (filePath === 'total') return;

      // 파일 경로를 정규화
      const normalizedPath = filePath.replace(/\\/g, '/');

      let moduleName = 'Other';

      if (normalizedPath.includes('/components/') || normalizedPath.includes('\\components\\')) {
        moduleName = 'Components';
      } else if (normalizedPath.includes('/app/') && normalizedPath.includes('/page.tsx')) {
        moduleName = 'Pages';
      } else if (normalizedPath.includes('/app/api/') || normalizedPath.includes('\\app\\api\\')) {
        moduleName = 'API Routes';
      } else if (normalizedPath.includes('/lib/') || normalizedPath.includes('/utils/') ||
                 normalizedPath.includes('\\lib\\') || normalizedPath.includes('\\utils\\')) {
        moduleName = 'Utils/Lib';
      } else if (normalizedPath.includes('__tests__') || normalizedPath.endsWith('.test.tsx') ||
                 normalizedPath.endsWith('.test.ts')) {
        moduleName = 'Tests';
      }

      modules[moduleName].files.push({
        path: normalizedPath,
        coverage,
      });
    });

    // 각 모듈의 요약 계산
    Object.values(modules).forEach(module => {
      if (module.files.length > 0) {
        module.summary = calculateModuleSummary(module.files.map(f => f.coverage));
      }
    });

    // 전체 통계
    const totalCoverage = coverageData.total;

    // 최근 업데이트 시간
    const stats = fs.statSync(coveragePath);
    const lastUpdated = stats.mtime.toISOString();

    return NextResponse.json({
      available: true,
      lastUpdated,
      total: totalCoverage,
      modules: Object.values(modules).filter(m => m.files.length > 0),
      fileCount: Object.keys(coverageData).length - 1, // -1 for 'total'
    });

  } catch (error: any) {
    console.error('커버리지 데이터 로드 실패:', error);
    return NextResponse.json({
      error: '커버리지 데이터를 불러오는데 실패했습니다.',
      details: error.message,
      available: false,
    }, { status: 500 });
  }
}

// 빈 커버리지 객체 생성
function createEmptyCoverage(): FileCoverage {
  return {
    lines: { total: 0, covered: 0, skipped: 0, pct: 0 },
    statements: { total: 0, covered: 0, skipped: 0, pct: 0 },
    functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
    branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
  };
}

// 모듈 요약 계산
function calculateModuleSummary(coverages: FileCoverage[]): FileCoverage {
  const summary = createEmptyCoverage();

  coverages.forEach(coverage => {
    summary.lines.total += coverage.lines.total;
    summary.lines.covered += coverage.lines.covered;
    summary.lines.skipped += coverage.lines.skipped;

    summary.statements.total += coverage.statements.total;
    summary.statements.covered += coverage.statements.covered;
    summary.statements.skipped += coverage.statements.skipped;

    summary.functions.total += coverage.functions.total;
    summary.functions.covered += coverage.functions.covered;
    summary.functions.skipped += coverage.functions.skipped;

    summary.branches.total += coverage.branches.total;
    summary.branches.covered += coverage.branches.covered;
    summary.branches.skipped += coverage.branches.skipped;
  });

  // 퍼센티지 계산
  summary.lines.pct = summary.lines.total > 0
    ? (summary.lines.covered / summary.lines.total) * 100
    : 0;
  summary.statements.pct = summary.statements.total > 0
    ? (summary.statements.covered / summary.statements.total) * 100
    : 0;
  summary.functions.pct = summary.functions.total > 0
    ? (summary.functions.covered / summary.functions.total) * 100
    : 0;
  summary.branches.pct = summary.branches.total > 0
    ? (summary.branches.covered / summary.branches.total) * 100
    : 0;

  return summary;
}

// POST: 커버리지 재생성
export async function POST(request: NextRequest) {
  try {
    const projectRoot = process.cwd();

    // 커버리지 재생성
    await execAsync('npm test -- --coverage --silent --maxWorkers=2', {
      cwd: projectRoot,
      timeout: 120000 // 2분 타임아웃
    });

    return NextResponse.json({
      success: true,
      message: '커버리지가 재생성되었습니다.',
    });

  } catch (error: any) {
    console.error('커버리지 재생성 실패:', error);
    return NextResponse.json({
      error: '커버리지 재생성에 실패했습니다.',
      details: error.message,
    }, { status: 500 });
  }
}
