/**
 * 소재찾기 카테고리 기반 검색 통합 테스트
 * - 자동화 시스템의 카테고리를 기반으로 YouTube 검색
 * - 시니어 사연, 북한 등 카테고리별로 의미있는 결과 확인
 */

const BASE_URL = 'http://localhost:3000';

const CATEGORIES_TO_TEST = [
  { name: '시니어사연', minResults: 5, keywords: ['시니어', '시어머니', '할머니', '노인', '사연'] },
  { name: '북한탈북자사연', minResults: 5, keywords: ['북한', '탈북', '탈북자', '새터민'] },
  { name: '막장드라마', minResults: 5, keywords: ['막장', '시댁', '시어머니', '며느리', '복수'] },
  { name: '감동실화', minResults: 5, keywords: ['감동', '실화', '눈물'] },
  { name: '복수극', minResults: 5, keywords: ['복수', '통쾌', '반전'] }
];

let testResults = {
  passed: 0,
  failed: 0,
  tests: [],
  details: []
};

function addTestResult(name, passed, message, details = null) {
  testResults.tests.push({ name, passed, message });
  if (details) {
    testResults.details.push({ test: name, ...details });
  }
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${name}: ${message}`);
  } else {
    testResults.failed++;
    console.error(`❌ ${name}: ${message}`);
  }
}

// 제목에 키워드가 포함되어 있는지 확인
function checkTitleRelevance(title, keywords) {
  const lowerTitle = title.toLowerCase();
  return keywords.some(keyword => lowerTitle.includes(keyword.toLowerCase()));
}

// 카테고리별로 YouTube 검색 테스트
async function testCategorySearch(category) {
  console.log(`\n🔍 테스트 카테고리: ${category.name}`);

  try {
    const response = await fetch(`${BASE_URL}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contentCategory: category.name,
        videoType: 'all',
        dateFilter: 'month',
        sortBy: 'views',
        viewRange: { min: 100000, max: 100000000 },
        subRange: { min: 1, max: 10000000 },
        durationRangeSeconds: { min: 0, max: 7200 }
      })
    });

    if (!response.ok) {
      addTestResult(
        `${category.name} - API 호출`,
        false,
        `HTTP ${response.status}`,
        { category: category.name, status: response.status }
      );
      return;
    }

    const data = await response.json();
    const videos = data.videos || [];

    // 결과 개수 확인
    const hasEnoughResults = videos.length >= category.minResults;
    addTestResult(
      `${category.name} - 결과 개수`,
      hasEnoughResults,
      `${videos.length}개 (최소 ${category.minResults}개 필요)`,
      { category: category.name, resultCount: videos.length, required: category.minResults }
    );

    if (videos.length === 0) {
      console.log(`⚠️ ${category.name}: 검색 결과 없음`);
      return;
    }

    // 제목 관련성 확인
    const relevantVideos = videos.filter(v => checkTitleRelevance(v.title, category.keywords));
    const relevanceRate = (relevantVideos.length / videos.length) * 100;
    const isRelevant = relevanceRate >= 30; // 30% 이상이 관련성 있어야 함

    addTestResult(
      `${category.name} - 제목 관련성`,
      isRelevant,
      `${relevanceRate.toFixed(1)}% (${relevantVideos.length}/${videos.length})`,
      {
        category: category.name,
        relevanceRate: relevanceRate.toFixed(1),
        relevantCount: relevantVideos.length,
        totalCount: videos.length
      }
    );

    // 상위 5개 영상 제목 출력
    console.log(`\n📺 ${category.name} 상위 5개 영상:`);
    videos.slice(0, 5).forEach((video, index) => {
      const isRelevant = checkTitleRelevance(video.title, category.keywords);
      const mark = isRelevant ? '✅' : '⚠️';
      console.log(`  ${mark} ${index + 1}. ${video.title.substring(0, 80)}`);
      console.log(`     👁️ ${(video.views || 0).toLocaleString()}회 | 📅 ${video.publishedAt.substring(0, 10)}`);
    });

  } catch (error) {
    addTestResult(
      `${category.name} - API 호출`,
      false,
      `에러: ${error.message}`,
      { category: category.name, error: error.message }
    );
  }
}

// 모든 카테고리 테스트
async function testAllCategories() {
  console.log('='.repeat(80));
  console.log('🧪 소재찾기 카테고리 기반 검색 통합 테스트');
  console.log('='.repeat(80));
  console.log(`📅 ${new Date().toLocaleString('ko-KR')}`);
  console.log(`🌐 테스트 서버: ${BASE_URL}`);
  console.log(`📋 테스트 카테고리: ${CATEGORIES_TO_TEST.map(c => c.name).join(', ')}`);

  for (const category of CATEGORIES_TO_TEST) {
    await testCategorySearch(category);
    // API 호출 간격 두기
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 결과 출력
  console.log('\n' + '='.repeat(80));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(80));
  console.log(`✅ 통과: ${testResults.passed}`);
  console.log(`❌ 실패: ${testResults.failed}`);
  console.log(`📝 총 테스트: ${testResults.tests.length}`);

  // 카테고리별 성공률
  console.log('\n📈 카테고리별 성공률:');
  CATEGORIES_TO_TEST.forEach(category => {
    const categoryTests = testResults.tests.filter(t => t.name.startsWith(category.name));
    const passed = categoryTests.filter(t => t.passed).length;
    const total = categoryTests.length;
    const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
    const status = passed === total ? '✅' : passed > 0 ? '⚠️' : '❌';
    console.log(`  ${status} ${category.name}: ${passed}/${total} (${rate}%)`);
  });

  // 실패한 테스트 출력
  const failedTests = testResults.tests.filter(t => !t.passed);
  if (failedTests.length > 0) {
    console.log('\n⚠️ 실패한 테스트:');
    failedTests.forEach(t => {
      console.log(`  - ${t.name}: ${t.message}`);
    });
  }

  // 상세 정보 출력
  if (testResults.details.length > 0) {
    console.log('\n📋 상세 정보:');
    testResults.details.forEach(detail => {
      console.log(`  ${detail.test}:`);
      Object.entries(detail).forEach(([key, value]) => {
        if (key !== 'test') {
          console.log(`    - ${key}: ${value}`);
        }
      });
    });
  }

  console.log('\n' + '='.repeat(80));

  // 전체 통과 여부
  if (testResults.failed === 0) {
    console.log('🎉 모든 테스트 통과!');
    process.exit(0);
  } else {
    console.log(`⚠️ ${testResults.failed}개 테스트 실패`);
    process.exit(1);
  }
}

// 실행
testAllCategories().catch(error => {
  console.error('테스트 실행 중 오류:', error);
  process.exit(1);
});
