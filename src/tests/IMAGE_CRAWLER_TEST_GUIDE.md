# Image Crawler Integration Test Guide

이미지 크롤링 시스템의 통합 테스트 가이드입니다.

## 📋 테스트 개요

`image-crawler-integration.test.ts` 파일은 이미지 크롤링 시스템의 전체 워크플로우를 검증합니다.

### 테스트 범위

#### 1. API Endpoint Tests
- ✅ POST /api/images/crawl - 크롤링 작업 시작
- ✅ taskId 반환 확인
- ✅ 입력 validation (scenes 필수, 빈 배열 거부)
- ✅ 에러 메시지 검증

#### 2. Task Status Polling Tests
- ✅ GET /api/images/crawl?taskId=xxx - 작업 상태 조회
- ✅ status 값 검증 (pending/processing/completed/failed)
- ✅ logs 배열 반환 확인
- ✅ 404 에러 처리 (존재하지 않는 taskId)
- ✅ 400 에러 처리 (taskId 파라미터 누락)

#### 3. File System Verification
- ✅ 이미지 파일이 프로젝트 루트에 다운로드되는지 확인
- ✅ 파일명 규칙 검증 (scene_00_hook.jpeg, scene_01_problem.jpeg 등)
- ✅ 파일 크기 > 0 확인
- ✅ 대본폴더가 생성되지 **않는지** 확인 (중요!)

#### 4. Backup System Verification
- ✅ 재실행 시 backup_{timestamp} 폴더 생성 확인
- ✅ 기존 파일들이 백업 폴더로 이동하는지 확인
- ✅ 타임스탬프 형식 검증

#### 5. Error Handling Tests
- ✅ 잘못된 contentId 처리
- ✅ 잘못된 scene 데이터 처리
- ✅ 서버 에러 시 graceful degradation

#### 6. Python Script Direct Execution Test
- ✅ Python 스크립트 직접 실행 테스트
- ✅ 명령줄 인자 전달 확인
- ✅ 타임아웃 처리

#### 7. Performance Tests
- ✅ 동시 요청 처리 (3개 동시 실행)
- ✅ 각 요청이 독립적으로 taskId를 받는지 확인

#### 8. Authentication Tests
- ✅ 인증 필요 여부 확인 (구현에 따라)

---

## 🔧 사전 준비

### 1. Chrome 디버깅 모드 실행
```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug"

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

### 2. Python 환경 설정
```bash
pip install selenium pyperclip
```

### 3. Next.js 개발 서버 실행
```bash
cd trend-video-frontend
npm run dev
```

### 4. Jest 설정 확인
`package.json`에 다음 설정이 있는지 확인:
```json
{
  "devDependencies": {
    "@jest/globals": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  },
  "scripts": {
    "test": "jest",
    "test:integration": "jest --testPathPattern=integration.test.ts"
  }
}
```

---

## ▶️ 테스트 실행

### 전체 통합 테스트 실행
```bash
npm run test:integration
```

### 특정 describe 블록만 실행
```bash
# API 엔드포인트 테스트만
npm test -- --testNamePattern="API Endpoint Tests"

# 파일 시스템 검증만
npm test -- --testNamePattern="File System Verification"

# 백업 시스템 테스트만
npm test -- --testNamePattern="Backup System Verification"
```

### Watch 모드로 실행
```bash
npm test -- --watch
```

### Verbose 모드 (상세 로그)
```bash
npm test -- --verbose
```

---

## 📊 예상 결과

### 성공 시 출력 예시
```
 PASS  src/tests/image-crawler-integration.test.ts (125.3 s)
  Image Crawler Integration Tests
    1. API Endpoint Tests
      ✓ should start crawling task and return taskId (3245 ms)
      ✓ should reject request without scenes (156 ms)
      ✓ should reject request with empty scenes array (142 ms)
    2. Task Status Polling Tests
      ✓ should return task status with logs (234 ms)
      ✓ should return 404 for non-existent taskId (123 ms)
      ✓ should require taskId parameter (119 ms)
    3. File System Verification
      ✓ should download images to project root folder (118456 ms)
      ✓ should NOT create nested 대본폴더 (89 ms)
    4. Backup System Verification
      ✓ should create backup folder when re-running (95234 ms)
    5. Error Handling Tests
      ✓ should handle invalid contentId gracefully (456 ms)
      ✓ should handle malformed scene data (389 ms)
    6. Python Script Direct Execution Test
      ✓ should execute Python crawler script directly (87123 ms)
  Image Crawler Performance Tests
    ✓ should handle multiple concurrent requests (8234 ms)
  Image Crawler API Authentication Tests
    ✓ should require authentication (167 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        125.372 s
```

### 생성되는 테스트 파일 구조
```
trend-video-backend/input/
├── project_test-crawler-integration/
│   ├── story.json
│   ├── scene_00_hook.jpeg
│   ├── scene_01_test.jpeg
│   ├── backup_20250119_123456/
│   │   ├── scene_00_hook_20250119_123456.jpeg
│   │   └── scene_01_test_20250119_123456.jpeg
│   └── direct_test/
│       ├── scene_00_hook.jpeg
│       └── scene_01_test.jpeg
```

---

## ⚠️ 주의사항

### 1. 타임아웃 설정
- 이미지 생성은 씬당 약 30초~2분 소요
- 테스트 타임아웃은 10분으로 설정됨
- 네트워크 상태에 따라 더 걸릴 수 있음

### 2. Chrome 로그인 상태
- Chrome이 Google 계정에 로그인되어 있어야 함
- Whisk/ImageFX 접근 권한이 필요함

### 3. 리소스 사용
- 테스트 실행 중 Chrome은 활성 상태여야 함
- 다른 브라우저 작업은 피하는 것이 좋음
- 메모리 사용량이 높을 수 있음

### 4. 테스트 격리
- 각 테스트는 독립적으로 실행 가능하도록 설계됨
- `beforeAll`에서 환경 준비
- `afterAll`에서 정리 (주석 처리됨 - 수동 확인용)

### 5. 병렬 실행
- 통합 테스트는 순차 실행 권장
- `--runInBand` 옵션 사용:
  ```bash
  npm test -- --runInBand
  ```

---

## 🐛 문제 해결

### Chrome 연결 실패
```
Error: Chrome not running on port 9222
```
**해결책:**
1. Chrome을 디버깅 모드로 재시작
2. 포트 9222가 사용 중인지 확인:
   ```bash
   # Windows
   netstat -ano | findstr 9222

   # macOS/Linux
   lsof -i :9222
   ```

### Python 실행 오류
```
Error: python: command not found
```
**해결책:**
1. Python 설치 확인: `python --version`
2. PATH 환경변수 확인
3. `python3` 명령어 시도

### 이미지 다운로드 실패
```
Error: Expected file not found
```
**해결책:**
1. Python 스크립트 로그 확인
2. 프롬프트가 Google 정책 위반이 아닌지 확인
3. Blob URL 다운로드 로직 검증

### 테스트 타임아웃
```
Error: Timeout waiting for crawler to complete
```
**해결책:**
1. 네트워크 상태 확인
2. 타임아웃 값 증가 (TEST_CONFIG.maxWaitTime)
3. 수동으로 Python 프로세스 상태 확인

### 백업 폴더 미생성
```
Error: Backup folder not created
```
**해결책:**
1. 첫 실행에서 이미지가 제대로 다운로드되었는지 확인
2. 두 번째 실행이 제대로 트리거되었는지 확인
3. Python 스크립트 백업 로직 검증

---

## 📈 CI/CD 통합

### GitHub Actions 예시
```yaml
name: Image Crawler Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          cd trend-video-frontend
          npm install
          pip install selenium pyperclip

      - name: Start Chrome
        run: |
          google-chrome --remote-debugging-port=9222 --headless --disable-gpu &

      - name: Run integration tests
        run: |
          cd trend-video-frontend
          npm run test:integration
        env:
          CI: true
```

---

## 📚 참고 자료

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Selenium Python Docs](https://selenium-python.readthedocs.io/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Next.js Testing](https://nextjs.org/docs/testing)

---

## ✅ 체크리스트

테스트 실행 전 확인:
- [ ] Chrome 디버깅 모드 실행 중
- [ ] Python 환경 설정 완료
- [ ] Next.js 개발 서버 실행 중
- [ ] Google 계정 로그인 상태
- [ ] Whisk/ImageFX 접근 권한 확인
- [ ] 네트워크 연결 안정적
- [ ] 테스트 폴더 쓰기 권한 확인

---

## 📝 테스트 결과 보고

테스트 실패 시 다음 정보를 포함하여 보고:
1. 실패한 테스트 케이스 이름
2. 에러 메시지 및 스택 트레이스
3. Chrome 콘솔 로그
4. Python 스크립트 출력
5. 생성된 파일 구조 스크린샷
6. 환경 정보 (OS, Chrome 버전, Python 버전)

---

Generated with [Claude Code](https://claude.com/claude-code)
