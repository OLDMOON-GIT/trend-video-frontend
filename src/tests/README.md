# 자동화 파이프라인 회귀 테스트 가이드

## 📋 테스트 개요

이 회귀 테스트 스위트는 자동화 파이프라인의 모든 주요 기능이 정상적으로 작동하는지 확인합니다.

## 🚀 테스트 실행 방법

### 전체 테스트 실행
```bash
npm test
```

### 특정 테스트 파일만 실행
```bash
npm test -- automation-regression.test.ts
```

### 특정 테스트 케이스만 실행
```bash
npm test -- --testNamePattern="데이터베이스 스키마"
npm test -- --testNamePattern="채널 설정 조회"
npm test -- --testNamePattern="YouTube 업로드"
```

### 커버리지 포함 실행
```bash
npm run test:coverage
```

### Watch 모드 (개발 중)
```bash
npm run test:watch
```

## ✅ 테스트 체크리스트

### 1. 데이터베이스 스키마 검증
- [x] `youtube_uploads` 테이블에 필수 컬럼 존재 (video_id, channel_id 등)
- [x] `video_schedules` 테이블에 `youtube_upload_id` 컬럼 존재
- [x] `video_titles` 테이블에 `youtube_schedule`, `channel` 컬럼 존재
- [x] `jobs` 테이블에 `video_path` 컬럼 존재 (video가 아님)

### 2. 채널 설정 조회
- [x] `youtube_channel_settings`에서 `channel_id` 정상 조회
- [x] `video_titles`와 `youtube_channel_settings` JOIN 동작
- [x] 실제 YouTube 채널 ID 반환

### 3. 스케줄 조회
- [x] `getPendingSchedules` 쿼리가 모든 필요한 필드 반환
- [x] `user_id`, `youtube_schedule`, `channel` 필드 정상 조회

### 4. YouTube 업로드 데이터 저장
- [x] `youtube_uploads` 테이블에 데이터 저장
- [x] `video_schedules`에 `youtube_upload_id` 업데이트

### 5. Privacy 설정 로직
- [x] `youtube_schedule === 'immediate'` → `public`
- [x] `youtube_schedule !== 'immediate'` → `private`

### 6. 비디오 파일 경로
- [x] `jobs.video_path` 컬럼 사용 (video가 아님)
- [x] 절대 경로 확인

### 7. 파이프라인 생성 및 상태 추적
- [x] 모든 stage(script, video, upload, publish) 생성
- [x] 파이프라인 상태 업데이트 (pending → running → completed)

### 8. 로그 기록
- [x] `automation_logs`에 로그 저장

### 9. 전체 파이프라인 시뮬레이션
- [x] Title → Script → Video → Upload → Publish 플로우
- [x] 각 단계별 ID 연결

### 10. 에러 케이스
- [x] 존재하지 않는 리소스 조회 시 null 반환
- [x] 채널 설정 없을 때 LEFT JOIN 동작

## 📊 테스트 커버리지 목표

- **최소 목표**: 80% 이상
- **권장 목표**: 90% 이상

## 🔍 주요 수정사항 검증

### 수정 1: YouTube 업로드 테이블 변경
```typescript
// ❌ 이전: social_media_uploads (TikTok/Instagram/Facebook 전용)
// ✅ 현재: youtube_uploads (YouTube 전용)
```

### 수정 2: 채널 정보 조회
```sql
-- ✅ youtube_channel_settings를 JOIN하여 실제 channel_id 가져오기
LEFT JOIN youtube_channel_settings yc ON t.channel = yc.id
```

### 수정 3: Privacy 설정
```typescript
// ✅ youtube_schedule에 따라 동적으로 설정
privacy: schedule.youtube_schedule === 'immediate' ? 'public' : 'private'
```

### 수정 4: 비디오 파일 경로
```typescript
// ❌ 이전: job.video
// ✅ 현재: job.video_path (이미 절대 경로)
```

## 🐛 알려진 이슈

### 1. 썸네일 생성 실패
- **상태**: 로깅 개선 완료 (자동 수정은 미완료)
- **해결책**: 다음 비디오 생성 시 로그 확인하여 원인 파악 필요
- **관련 파일**: `trend-video-backend/create_video_from_folder.py:369-405`

## 📝 테스트 추가 가이드

새로운 기능을 추가할 때 다음 형식으로 테스트를 작성하세요:

```typescript
describe('새로운 기능 이름', () => {
  test('기능이 정상적으로 동작해야 함', () => {
    // Arrange: 테스트 데이터 준비
    const testData = createTestData();

    // Act: 테스트 실행
    const result = performAction(testData);

    // Assert: 결과 검증
    expect(result).toBeDefined();
    expect(result.status).toBe('success');

    // Cleanup: 테스트 데이터 정리
    cleanupTestData(testData.id);
  });
});
```

## 🚨 CI/CD 통합

GitHub Actions에서 자동 실행:

```yaml
# .github/workflows/test.yml
name: Run Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## 📞 문제 발생 시

1. **데이터베이스 권한 오류**
   - `data/database.sqlite` 파일 권한 확인
   - 필요시 새로운 테스트 DB 생성

2. **타임아웃 오류**
   - jest.config.js에서 `testTimeout` 증가
   - 현재: 30000ms (30초)

3. **모듈 import 오류**
   - `npm install` 재실행
   - `node_modules` 삭제 후 재설치

## 🎯 다음 단계

- [ ] 통합 테스트 추가 (실제 API 호출)
- [ ] E2E 테스트 추가 (Playwright/Cypress)
- [ ] 성능 테스트 추가 (대용량 데이터)
- [ ] 썸네일 생성 자동 재시도 로직 추가
