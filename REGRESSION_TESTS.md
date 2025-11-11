# Regression Test Suite

이 문서는 최근 UX 개선 작업에 대한 리그레션 테스트를 설명합니다.

## 📋 개요

이 리그레션 테스트 스위트는 다음의 주요 기능과 개선사항들이 제대로 작동하는지 확인합니다:

1. **Shop 퍼블리시 탭 공간 최적화** - 불필요한 여백 제거
2. **Coupang 상품 관리 UX 개선** - 탭 메뉴, 카테고리 필터, 버튼 정렬
3. **쇼츠 변환 중복 클릭 방지** - 즉각적인 피드백 및 상태 관리

## 🧪 테스트 파일 구조

```
src/
├── __tests__/
│   ├── utils/
│   │   └── test-utils.tsx          # 공통 테스트 유틸리티
│   └── mocks/
│       └── handlers.ts              # API 모킹 핸들러
├── components/
│   └── __tests__/
│       ├── ShopVersionPreview.test.tsx    # Shop 미리보기 컴포넌트
│       └── ShopClientView.test.tsx        # Shop 클라이언트 뷰
├── app/
│   ├── admin/
│   │   └── coupang-products/
│   │       └── __tests__/
│   │           └── page.test.tsx          # 상품 관리 페이지
│   └── my-content/
│       └── __tests__/
│           └── shorts-conversion.test.tsx # 쇼츠 변환 기능
```

## 🚀 테스트 실행

### 모든 테스트 실행
```bash
npm test
```

### Watch 모드로 실행
```bash
npm run test:watch
```

### 커버리지 리포트 생성
```bash
npm run test:coverage
```

### 특정 테스트 파일만 실행
```bash
# ShopVersionPreview 테스트만 실행
npm test ShopVersionPreview

# Coupang Products 테스트만 실행
npm test coupang-products

# Shorts conversion 테스트만 실행
npm test shorts-conversion
```

## 📊 테스트 커버리지

### 1. ShopVersionPreview Component (47 tests)

**테스트 영역:**
- ✅ 공간 최적화 (padding, margin, border-radius)
- ✅ 버전 로딩 ('live' vs 특정 버전)
- ✅ 에러 처리
- ✅ 헤더 표시 및 닫기
- ✅ 북마크 기능 (localStorage, sessionStorage, IndexedDB 폴백)

**주요 검증 사항:**
- `p-3` 대신 `p-6` 사용하지 않는지 확인
- `rounded-2xl` 대신 `rounded-3xl` 사용하지 않는지 확인
- `mb-6` 이상의 과도한 margin 사용하지 않는지 확인
- API 호출 시 올바른 URL 사용 (`/api/shop/products/public`)

### 2. ShopClientView Component (58 tests)

**테스트 영역:**
- ✅ 공간 최적화 (mb-4, gap-2)
- ✅ Google Sites 버튼 (편집, 홈)
- ✅ HTML 내보내기 버튼 상태
- ✅ HTML 다운로드 기능
- ✅ HTML 복사 기능 (clipboard API, fallback)
- ✅ ShopVersionPreview 통합

**주요 검증 사항:**
- `mb-8` 이상의 과도한 여백 없음
- `gap-2` 일관된 버튼 간격
- 내보내기 중 버튼 비활성화
- clipboard API 실패 시 fallback 동작

### 3. Coupang Products Page (50 tests)

**테스트 영역:**
- ✅ 탭 메뉴 UX (크고 명확한 그라디언트)
- ✅ 카테고리 필터 UX (작고 명확한 뱃지)
- ✅ 대량 작업 버튼 조직화
- ✅ 전체선택/해제 버튼 위치 고정
- ✅ 상품 카드 단순화 (미리보기 버튼 제거)
- ✅ 버튼 정렬 일관성
- ✅ 검색 결과 레이아웃 (4열 그리드)
- ✅ 색상 체계
- ✅ 반응형 디자인
- ✅ 시각적 피드백

**주요 검증 사항:**
- 탭: `px-6 py-4` + `bg-gradient-to-r`
- 카테고리: `px-4 py-2` + `rounded-full`
- 버튼: 일관된 `py-2` 또는 `py-3`
- 카드: `grid-cols-2` (미리보기 버튼 없음)
- 검색: `lg:grid-cols-4`

### 4. Shorts Conversion (70 tests)

**테스트 영역:**
- ✅ 즉각적인 피드백 (로딩 토스트)
- ✅ 중복 클릭 방지
- ✅ 상태 관리 (convertingJobs Set)
- ✅ Toast 알림
- ✅ API 호출
- ✅ 버튼 시각적 상태
- ✅ Edge cases (연속 클릭, 동시 변환)
- ✅ 전체 플로우 통합 테스트

**주요 검증 사항:**
- 버튼 클릭 시 즉시 `⏳ 변환 중...` 표시
- `convertingJobs` Set에 jobId 추가
- `disabled={true}` + `bg-purple-400` + `opacity-60`
- 중복 클릭 시 에러 토스트 표시
- 완료/실패 시 Set에서 제거

## 🎯 리그레션 시나리오

### Scenario 1: Shop 퍼블리시 탭 공간
```
Given: 사용자가 /admin/shop 페이지의 "퍼블리시" 탭에 있음
When: 페이지가 렌더링됨
Then:
  - 탭과 콘텐츠 사이에 과도한 여백이 없어야 함 (mb-4 이하)
  - 미리보기 컨테이너가 p-3 패딩을 사용해야 함
  - rounded-2xl 테두리를 사용해야 함
```

### Scenario 2: Coupang 상품 관리 UX
```
Given: 사용자가 /admin/coupang-products 페이지에 있음
When: 페이지가 렌더링됨
Then:
  - 탭 메뉴는 크고 명확해야 함 (px-6 py-4, gradient)
  - 카테고리 필터는 작고 구별되어야 함 (px-4 py-2, rounded-full)
  - 전체선택/해제 버튼이 항상 같은 위치에 있어야 함
  - 상품 카드에 미리보기 버튼이 없어야 함
  - 모든 버튼이 일관된 정렬을 가져야 함
```

### Scenario 3: 쇼츠 변환 중복 클릭
```
Given: 사용자가 /my-content 페이지에서 롱폼 영상을 봄
When: "⚡ 쇼츠" 버튼을 클릭
Then:
  - 즉시 "⏳ 변환 중..." 으로 버튼 텍스트 변경
  - 즉시 로딩 토스트 표시
  - 버튼 비활성화 (disabled=true)
  - 버튼 스타일 변경 (bg-purple-400, opacity-60)

When: 변환 중 버튼을 다시 클릭
Then:
  - "이미 변환 중입니다." 에러 토스트 표시
  - 추가 API 호출 없음

When: 변환 완료/실패
Then:
  - 버튼이 정상 상태로 돌아옴
  - 다시 클릭 가능
```

## 🛠️ 테스트 유틸리티 사용법

### Mock 함수 사용

```typescript
import { mockLocalStorage, mockFetch, createMockProduct } from '@/__tests__/utils/test-utils';

// localStorage 모킹
const storage = mockLocalStorage();
storage.setItem('key', 'value');

// fetch 모킹
global.fetch = mockFetch();

// Mock 데이터 생성
const product = createMockProduct({ title: '테스트 상품' });
```

### API 핸들러 사용

```typescript
import { mockHandlers, createMockResponse } from '@/__tests__/mocks/handlers';

// Shop API 모킹
(global.fetch as jest.Mock).mockResolvedValueOnce(
  createMockResponse(mockHandlers.shop.getPublicProducts([product]))
);

// Jobs API 모킹
(global.fetch as jest.Mock).mockResolvedValueOnce(
  mockHandlers.jobs.convertToShorts(true, 'new-job-id')
);
```

## 🔍 테스트 디버깅

### 특정 테스트만 실행
```typescript
test.only('should test specific behavior', () => {
  // 이 테스트만 실행됨
});
```

### 테스트 스킵
```typescript
test.skip('should test later', () => {
  // 이 테스트는 스킵됨
});
```

### 상세 로그 출력
```bash
npm test -- --verbose
```

### Watch 모드에서 패턴 필터링
```bash
npm run test:watch
# 그 후 'p'를 눌러 파일명 패턴 입력
# 또는 't'를 눌러 테스트명 패턴 입력
```

## 📈 CI/CD 통합

### GitHub Actions 예시
```yaml
name: Regression Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v3
```

## 🐛 알려진 이슈 및 해결방법

### 1. "Cannot find module" 에러
```bash
# 모듈 캐시 클리어
npm test -- --clearCache
```

### 2. "Warning: ReactDOM.render" 경고
```bash
# React 19 호환성 이슈 - 무시해도 됨
# 또는 @testing-library/react 최신 버전 사용
```

### 3. IndexedDB 모킹 이슈
```typescript
// jest.setup.js에 추가
import { mockIndexedDB } from '@/__tests__/utils/test-utils';
mockIndexedDB();
```

## 📚 참고 자료

- [Jest 공식 문서](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## 🤝 기여 가이드

새로운 기능을 추가할 때:

1. **기능 구현 전 테스트 작성** (TDD 권장)
2. **기존 리그레션 테스트 실행** (`npm test`)
3. **새로운 테스트 추가** (해당 컴포넌트의 `__tests__` 폴더)
4. **모든 테스트 통과 확인**
5. **커버리지 확인** (`npm run test:coverage`)

### 테스트 작성 체크리스트

- [ ] 컴포넌트 렌더링 테스트
- [ ] 사용자 인터랙션 테스트 (클릭, 입력 등)
- [ ] 비동기 동작 테스트 (API 호출, 로딩 상태)
- [ ] 에러 처리 테스트
- [ ] Edge cases 테스트
- [ ] 반응형 디자인 테스트 (필요시)
- [ ] 접근성 테스트 (필요시)

## 📝 변경 이력

### 2025-01-11 - Initial Regression Test Suite
- ✅ ShopVersionPreview 컴포넌트 테스트 (47 tests)
- ✅ ShopClientView 컴포넌트 테스트 (58 tests)
- ✅ Coupang Products 페이지 테스트 (50 tests)
- ✅ Shorts Conversion 기능 테스트 (70 tests)
- ✅ 공통 테스트 유틸리티 및 mocks
- **Total: 225+ tests**

## 🎉 결론

이 리그레션 테스트 스위트는 최근 UX 개선 작업이 앞으로도 제대로 작동하도록 보장합니다. 새로운 변경사항이 기존 기능을 망가뜨리지 않는지 자동으로 확인할 수 있습니다.

테스트를 정기적으로 실행하고 업데이트하여 코드 품질을 유지하세요!
