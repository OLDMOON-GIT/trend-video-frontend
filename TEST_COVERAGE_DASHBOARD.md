# 테스트 커버리지 대시보드

관리자 페이지에서 모듈별 테스트 커버리지를 확인할 수 있는 대시보드를 구현했습니다.

## 📊 기능 소개

### 1. 모듈별 커버리지 확인
- **Components**: React 컴포넌트 파일
- **Pages**: Next.js 페이지 파일
- **API Routes**: API 엔드포인트 파일
- **Utils/Lib**: 유틸리티 및 라이브러리 파일
- **Tests**: 테스트 파일
- **Other**: 기타 파일

### 2. 전체 통계 대시보드
- **Statements**: 구문 커버리지
- **Branches**: 분기 커버리지
- **Functions**: 함수 커버리지
- **Lines**: 라인 커버리지

### 3. 상세 정보
- 모듈별 파일 목록
- 파일별 커버리지 상세
- 색상 코딩 (80% 이상: 녹색, 60-80%: 노란색, 40-60%: 주황색, 40% 미만: 빨간색)

## 🚀 사용 방법

### 1. 커버리지 데이터 생성
```bash
# 터미널에서 실행
npm test -- --coverage
```

### 2. 대시보드 접속
1. 관리자 로그인
2. 관리자 페이지 접속: `http://localhost:3000/admin`
3. "📊 테스트 커버리지" 카드 클릭
4. 또는 직접 URL: `http://localhost:3000/admin/test-coverage`

### 3. 커버리지 재생성
- 대시보드 우측 상단의 "🔄 재생성" 버튼 클릭
- 백그라운드에서 커버리지 재생성 (약 15-30초 소요)

## 📁 구현 파일

### 1. API 엔드포인트
**파일**: `src/app/api/test-coverage/route.ts`

**기능**:
- `GET /api/test-coverage`: 커버리지 데이터 조회
- `POST /api/test-coverage`: 커버리지 재생성

**주요 로직**:
- `coverage/coverage-summary.json` 파일 읽기
- 파일 경로 기반 모듈 분류
- 모듈별 요약 통계 계산

### 2. 관리자 페이지
**파일**: `src/app/admin/test-coverage/page.tsx`

**컴포넌트**:
- `TestCoveragePage`: 메인 페이지
- `CoverageCard`: 전체 통계 카드
- `MetricBadge`: 메트릭 뱃지

**주요 기능**:
- 모듈 확장/축소 토글
- 커버리지 색상 표시
- 파일별 상세 정보

### 3. 관리자 메뉴 추가
**파일**: `src/app/admin/page.tsx`

- 테스트 커버리지 카드 추가
- 쿠팡 상품 관리 카드 추가
- 안내 문구 업데이트

### 4. Jest 설정 업데이트
**파일**: `jest.config.js`

```javascript
coverageReporters: ['text', 'lcov', 'json-summary'],
```

## 🎨 UI 특징

### 색상 체계
- **녹색 (80% 이상)**: 우수한 커버리지
- **노란색 (60-80%)**: 양호한 커버리지
- **주황색 (40-60%)**: 보통 커버리지
- **빨간색 (40% 미만)**: 미흡한 커버리지

### 반응형 디자인
- 데스크톱: 4열 그리드
- 태블릿: 2열 그리드
- 모바일: 1열 스택

### 인터랙션
- 모듈 클릭으로 파일 목록 확장/축소
- 진행바로 시각적 피드백
- 호버 효과 및 애니메이션

## 📊 데이터 구조

### Coverage Summary JSON
```json
{
  "total": {
    "lines": { "total": 17141, "covered": 195, "pct": 1.13 },
    "statements": { "total": 17732, "covered": 202, "pct": 1.13 },
    "functions": { "total": 2386, "covered": 35, "pct": 1.46 },
    "branches": { "total": 9805, "covered": 84, "pct": 0.85 }
  },
  "파일경로": {
    "lines": { ... },
    "statements": { ... },
    "functions": { ... },
    "branches": { ... }
  }
}
```

### 모듈 분류 로직
```typescript
if (path.includes('/components/')) → 'Components'
if (path.includes('/app/') && path.includes('/page.tsx')) → 'Pages'
if (path.includes('/app/api/')) → 'API Routes'
if (path.includes('/lib/') || path.includes('/utils/')) → 'Utils/Lib'
if (path.includes('__tests__')) → 'Tests'
else → 'Other'
```

## 🔧 기술 스택

- **Next.js 16**: 서버 컴포넌트 및 API 라우트
- **React 19**: 클라이언트 컴포넌트
- **TypeScript**: 타입 안전성
- **Tailwind CSS**: 스타일링
- **Jest**: 테스트 및 커버리지
- **React Hot Toast**: 알림

## 🚦 API 응답 예시

### GET /api/test-coverage
```json
{
  "available": true,
  "lastUpdated": "2025-01-11T14:00:00.000Z",
  "total": {
    "lines": { "total": 17141, "covered": 195, "pct": 1.13 },
    "statements": { "total": 17732, "covered": 202, "pct": 1.13 },
    "functions": { "total": 2386, "covered": 35, "pct": 1.46 },
    "branches": { "total": 9805, "covered": 84, "pct": 0.85 }
  },
  "modules": [
    {
      "name": "Components",
      "files": [
        {
          "path": "src/components/ShopVersionPreview.tsx",
          "coverage": { ... }
        }
      ],
      "summary": { ... }
    }
  ],
  "fileCount": 150
}
```

### POST /api/test-coverage
```json
{
  "success": true,
  "message": "커버리지가 재생성되었습니다."
}
```

## 🎯 활용 방안

### 1. 코드 품질 모니터링
- 주기적으로 커버리지 확인
- 낮은 커버리지 모듈 파악
- 테스트 작성 우선순위 결정

### 2. 리팩토링 안전성
- 리팩토링 전후 커버리지 비교
- 변경 영향 범위 파악
- 회귀 테스트 필요성 판단

### 3. 코드 리뷰
- PR 리뷰 시 커버리지 확인
- 새로운 코드의 테스트 여부 검증
- 테스트 작성 요청 근거 제시

### 4. 팀 목표 설정
- 모듈별 커버리지 목표 설정
- 진행 상황 추적
- 성과 측정 및 보고

## 📈 개선 계획

### Phase 1 (완료)
- ✅ 기본 커버리지 대시보드
- ✅ 모듈별 분류
- ✅ 파일별 상세 정보
- ✅ 색상 코딩

### Phase 2 (예정)
- [ ] 커버리지 이력 추적 (트렌드 그래프)
- [ ] 커버리지 변화 알림
- [ ] 커버리지 임계값 설정
- [ ] 커버리지 배지 생성

### Phase 3 (계획)
- [ ] 파일별 미커버 라인 하이라이트
- [ ] 테스트 케이스 추천
- [ ] CI/CD 통합
- [ ] 슬랙/이메일 알림

## 🐛 트러블슈팅

### 문제 1: 커버리지 데이터 없음
**증상**: "커버리지 데이터 없음" 메시지 표시

**해결**:
```bash
# 커버리지 생성
npm test -- --coverage

# 또는 대시보드에서 "재생성" 버튼 클릭
```

### 문제 2: 커버리지 재생성 실패
**증상**: "재생성 실패" 에러

**원인**: 테스트 실행 시간 초과 (2분)

**해결**:
```bash
# 로컬에서 수동 실행
npm test -- --coverage --maxWorkers=4
```

### 문제 3: 퍼센티지가 0%로 표시
**증상**: 모든 파일이 0% 커버리지

**원인**: 테스트 파일이 실제 코드를 import하지 않음

**해결**:
- 테스트 파일에서 실제 컴포넌트/함수 import 확인
- 테스트 케이스가 실제로 실행되는지 확인

## 📝 주의사항

1. **성능**: 커버리지 재생성은 시간이 오래 걸립니다 (15-30초)
2. **서버 부하**: 동시에 여러 명이 재생성하면 서버 부하 증가
3. **캐싱**: 커버리지 데이터는 파일 시스템에서 읽으므로 별도 캐싱 불필요
4. **권한**: 관리자만 접근 가능 (인증 필요)

## 🎉 결론

테스트 커버리지 대시보드를 통해:
- 코드 품질을 시각적으로 모니터링
- 테스트가 필요한 영역 파악
- 팀원들과 커버리지 현황 공유
- 지속적인 품질 개선 추진

코드 품질 향상을 위해 정기적으로 확인하세요!
