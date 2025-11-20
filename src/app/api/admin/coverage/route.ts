import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

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

async function generateCoverageReport(): Promise<{
  coverage: CoverageData[];
  summary: CoverageSummary;
}> {
  try {
    // Jest로 coverage 리포트 생성
    console.log('📊 Coverage 리포트 생성 중...');

    const coverageDir = path.join(process.cwd(), 'coverage');
    const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json');

    // coverage 디렉토리 확인
    if (!fs.existsSync(coverageDir)) {
      console.warn('⚠️ Coverage 디렉토리 없음. 테스트를 실행하지 않았을 수 있습니다.');
      return {
        coverage: [],
        summary: {
          totalFiles: 0,
          averageStatements: 0,
          averageBranches: 0,
          averageFunctions: 0,
          averageLines: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: 0,
          totalTests: 0,
        },
      };
    }

    // coverage-summary.json 읽기
    let coverageData: any = {};
    if (fs.existsSync(coverageSummaryPath)) {
      const content = fs.readFileSync(coverageSummaryPath, 'utf-8');
      coverageData = JSON.parse(content);
    }

    // 파일별 커버리지 추출
    const coverage: CoverageData[] = [];
    let totalStatements = 0,
      totalBranches = 0,
      totalFunctions = 0,
      totalLines = 0;
    let fileCount = 0;

    for (const [filePath, stats] of Object.entries(coverageData)) {
      if (filePath === 'total') continue;

      const stat: any = stats;
      const file = filePath.replace(process.cwd(), '');

      coverage.push({
        file,
        statements: Math.round((stat.statements?.pct || 0) * 100) / 100,
        branches: Math.round((stat.branches?.pct || 0) * 100) / 100,
        functions: Math.round((stat.functions?.pct || 0) * 100) / 100,
        lines: Math.round((stat.lines?.pct || 0) * 100) / 100,
      });

      totalStatements += stat.statements?.pct || 0;
      totalBranches += stat.branches?.pct || 0;
      totalFunctions += stat.functions?.pct || 0;
      totalLines += stat.lines?.pct || 0;
      fileCount++;
    }

    // 정렬 (coverage 내림차순)
    coverage.sort((a, b) => {
      const avgA = (a.statements + a.branches + a.functions + a.lines) / 4;
      const avgB = (b.statements + b.branches + b.functions + b.lines) / 4;
      return avgB - avgA;
    });

    // 테스트 결과 파싱 (최근 테스트 실행 결과)
    let passedTests = 0,
      failedTests = 0,
      skippedTests = 0,
      totalTests = 0;

    try {
      const testResultsPath = path.join(coverageDir, 'test-results.json');
      if (fs.existsSync(testResultsPath)) {
        const testResults = JSON.parse(fs.readFileSync(testResultsPath, 'utf-8'));
        passedTests = testResults.numPassedTests || 0;
        failedTests = testResults.numFailedTests || 0;
        skippedTests = testResults.numPendingTests || 0;
        totalTests = testResults.numTotalTests || 0;
      }
    } catch (e) {
      // 테스트 결과 파일이 없을 수 있음
      console.log('ℹ️ 테스트 결과 파일을 찾을 수 없습니다.');
    }

    // 요약 정보
    const summary: CoverageSummary = {
      totalFiles: fileCount,
      averageStatements: fileCount > 0 ? Math.round((totalStatements / fileCount) * 100) / 100 : 0,
      averageBranches: fileCount > 0 ? Math.round((totalBranches / fileCount) * 100) / 100 : 0,
      averageFunctions: fileCount > 0 ? Math.round((totalFunctions / fileCount) * 100) / 100 : 0,
      averageLines: fileCount > 0 ? Math.round((totalLines / fileCount) * 100) / 100 : 0,
      passedTests,
      failedTests,
      skippedTests,
      totalTests: totalTests || passedTests + failedTests + skippedTests,
    };

    console.log('✅ Coverage 리포트 생성 완료');
    console.log(`   - 파일: ${fileCount}개`);
    console.log(`   - 평균 커버리지: ${summary.averageLines}%`);
    console.log(`   - 테스트: ${summary.totalTests}개`);

    return { coverage, summary };
  } catch (error: any) {
    console.error('❌ Coverage 리포트 생성 실패:', error.message);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인 (필요시 추가)
    const { searchParams } = new URL(request.url);
    const regenerate = searchParams.get('regenerate') === 'true';

    console.log('📊 Coverage API 요청');

    // Coverage 데이터 생성/조회
    const { coverage, summary } = await generateCoverageReport();

    return NextResponse.json(
      {
        success: true,
        coverage,
        summary,
        timestamp: new Date().toISOString(),
        message: '✅ Coverage 데이터를 성공적으로 로드했습니다.',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('❌ Coverage API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to load coverage data',
        coverage: [],
        summary: null,
        message:
          '⚠️ Coverage 데이터를 로드할 수 없습니다. 테스트를 실행한 후 다시 시도하세요.',
      },
      { status: 500 }
    );
  }
}
