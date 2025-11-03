# 쿠팡 파트너스 연동 가이드

## 📋 목차

1. [개요](#개요)
2. [빠른 시작](#빠른-시작)
3. [API 키 발급](#api-키-발급)
4. [환경 설정](#환경-설정)
5. [사용 방법](#사용-방법)
6. [API 문서](#api-문서)
7. [문제 해결](#문제-해결)

---

## 개요

이 프로젝트는 **쿠팡 파트너스 OpenAPI**를 통합하여 다음 기능을 제공합니다:

- ✅ 상품 검색 (키워드 기반)
- ✅ 파트너스 딥링크 생성 (제휴 수수료 적용)
- ✅ 링크 관리 및 클릭 통계
- ✅ 예상 수익 대시보드
- ✅ API 연결 테스트

---

## 빠른 시작

### 1단계: 쿠팡 파트너스 가입

[쿠팡 파트너스](https://partners.coupang.com)에 가입하고 승인을 받으세요.

### 2단계: API 키 발급

1. [쿠팡 파트너스 개발자 센터](https://developers.coupang.com/hc/ko) 접속
2. **마이페이지 > API 관리** 메뉴로 이동
3. **Access Key**와 **Secret Key** 발급
4. **파트너스 ID (Tracking ID)** 확인

### 3단계: 웹 애플리케이션 접속

1. 프론트엔드 실행:
   ```bash
   cd trend-video-frontend
   npm run dev
   ```

2. 브라우저에서 `http://localhost:3000/coupang` 접속

3. API 키 입력 후 **연결 테스트** 클릭

---

## API 키 발급

### Access Key 및 Secret Key 발급 절차

1. **쿠팡 파트너스 로그인**
   - https://partners.coupang.com 접속
   - 로그인 후 대시보드로 이동

2. **API 관리 페이지**
   - 상단 메뉴에서 **마이페이지** 클릭
   - 좌측 메뉴에서 **API 관리** 선택

3. **API 키 생성**
   - **Access Key 생성** 버튼 클릭
   - 생성된 **Access Key**와 **Secret Key** 복사
   - ⚠️ **Secret Key는 재발급 불가**하므로 안전하게 보관!

4. **파트너스 ID 확인**
   - 대시보드에서 **파트너스 ID** 확인
   - 예: `moony75` 또는 `affiliate_12345`

### API 키 보안

- ✅ `.env.local` 파일에 저장 (Git 제외)
- ✅ 프론트엔드에서는 직접 노출하지 않음
- ✅ 서버 사이드에서만 사용
- ❌ 클라이언트 JavaScript에 하드코딩 금지

---

## 환경 설정

### 옵션 1: 웹 UI에서 설정 (권장)

1. `http://localhost:3000/coupang` 접속
2. **API 설정** 섹션에 다음 정보 입력:
   - Access Key
   - Secret Key
   - Tracking ID (파트너스 ID)
3. **저장** 버튼 클릭
4. **연결 테스트** 클릭하여 정상 작동 확인

### 옵션 2: 환경 변수 설정 (선택사항)

`.env.local` 파일에 추가:

```env
# 쿠팡 파트너스 API (선택사항 - 웹 UI에서 설정 가능)
COUPANG_ACCESS_KEY=your-access-key
COUPANG_SECRET_KEY=your-secret-key
COUPANG_TRACKING_ID=your-tracking-id
```

---

## 사용 방법

### 1. 상품 검색

```typescript
// 프론트엔드에서 API 호출
const response = await fetch('/api/coupang/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ keyword: '노트북' })
});

const data = await response.json();
console.log(data.products); // 검색 결과
```

### 2. 딥링크 생성

```typescript
const response = await fetch('/api/coupang/generate-link', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    productId: '12345',
    productName: '맥북 프로',
    productUrl: 'https://www.coupang.com/vp/products/12345'
  })
});

const data = await response.json();
console.log(data.link.shortUrl); // 파트너스 단축 링크
```

### 3. 프로그래밍 방식 (서버 사이드)

```typescript
import { createCoupangClient } from '@/lib/coupang-client';

const client = createCoupangClient({
  accessKey: 'your-access-key',
  secretKey: 'your-secret-key',
  trackingId: 'your-tracking-id'
});

// 상품 검색
const products = await client.searchProducts('노트북', 20);

// 딥링크 생성
const deepLink = await client.generateDeepLink('https://www.coupang.com/vp/products/12345');

// 연결 테스트
const isConnected = await client.testConnection();
```

---

## API 문서

### 사용 가능한 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|----------|--------|------|
| `/api/coupang/settings` | GET | 현재 API 설정 조회 |
| `/api/coupang/settings` | POST | API 설정 저장 |
| `/api/coupang/test` | POST | API 연결 테스트 |
| `/api/coupang/search` | POST | 상품 검색 |
| `/api/coupang/generate-link` | POST | 딥링크 생성 |
| `/api/coupang/links` | GET | 생성된 링크 목록 조회 |
| `/api/coupang/stats` | GET | 통계 조회 |

### 상품 검색 API

**요청:**
```json
POST /api/coupang/search
{
  "keyword": "노트북"
}
```

**응답:**
```json
{
  "success": true,
  "products": [
    {
      "productId": "12345",
      "productName": "맥북 프로 14인치",
      "productPrice": 2490000,
      "productImage": "https://...",
      "productUrl": "https://www.coupang.com/vp/products/12345",
      "categoryName": "노트북/PC",
      "isRocket": true
    }
  ]
}
```

### 딥링크 생성 API

**요청:**
```json
POST /api/coupang/generate-link
{
  "productId": "12345",
  "productName": "맥북 프로 14인치",
  "productUrl": "https://www.coupang.com/vp/products/12345"
}
```

**응답:**
```json
{
  "success": true,
  "link": {
    "id": "link_1234567890",
    "userId": "user123",
    "productId": "12345",
    "productName": "맥북 프로 14인치",
    "originalUrl": "https://www.coupang.com/vp/products/12345",
    "shortUrl": "https://link.coupang.com/a/xyz123",
    "clicks": 0,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### 통계 API

**요청:**
```
GET /api/coupang/stats
```

**응답:**
```json
{
  "success": true,
  "stats": {
    "totalLinks": 50,
    "totalClicks": 320,
    "estimatedRevenue": 48000,
    "conversionRate": 10.0
  }
}
```

---

## 쿠팡 클라이언트 라이브러리

### 주요 메서드

#### `searchProducts(keyword, limit)`
키워드로 상품 검색

```typescript
const products = await client.searchProducts('노트북', 20);
```

#### `generateDeepLink(productUrl)`
파트너스 딥링크 생성

```typescript
const deepLink = await client.generateDeepLink('https://www.coupang.com/vp/products/12345');
```

#### `generateMultipleDeepLinks(productUrls)`
여러 상품 URL을 한 번에 딥링크로 변환 (최대 20개)

```typescript
const urls = [
  'https://www.coupang.com/vp/products/12345',
  'https://www.coupang.com/vp/products/67890'
];
const deepLinks = await client.generateMultipleDeepLinks(urls);
```

#### `getBestProducts(categoryId, limit)`
베스트 카테고리 상품 조회

```typescript
import { COUPANG_CATEGORIES } from '@/lib/coupang-client';

const products = await client.getBestProducts(COUPANG_CATEGORIES.DIGITAL, 10);
```

#### `testConnection()`
API 연결 테스트

```typescript
const isConnected = await client.testConnection();
```

---

## 카테고리 목록

```typescript
import { COUPANG_CATEGORIES } from '@/lib/coupang-client';

COUPANG_CATEGORIES.FASHION_WOMEN  // 1001 - 여성패션
COUPANG_CATEGORIES.FASHION_MEN    // 1002 - 남성패션
COUPANG_CATEGORIES.BEAUTY         // 1013 - 뷰티
COUPANG_CATEGORIES.FOOD           // 1029 - 식품
COUPANG_CATEGORIES.DIGITAL        // 1020 - 디지털/가전
COUPANG_CATEGORIES.SPORTS         // 1016 - 스포츠/레저
// ... 더 많은 카테고리
```

---

## 문제 해결

### 1. "로그인이 필요합니다" 오류

**원인:** 세션이 만료되거나 로그인하지 않음

**해결:**
- 로그아웃 후 다시 로그인
- 브라우저 쿠키 확인

### 2. "API 키를 먼저 설정하세요" 오류

**원인:** 쿠팡 파트너스 API 키가 설정되지 않음

**해결:**
1. `/coupang` 페이지로 이동
2. **API 설정** 섹션에 키 입력
3. **저장** 버튼 클릭

### 3. "API 키가 올바르지 않습니다" 오류

**원인:** Access Key 또는 Secret Key가 잘못됨

**해결:**
- 쿠팡 파트너스 대시보드에서 키 재확인
- Secret Key 재발급 (기존 키는 사용 불가)
- 복사 시 공백이나 특수문자 포함 여부 확인

### 4. "검색 결과가 없습니다" 오류

**원인:** 검색어에 해당하는 상품이 없거나 API 제한

**해결:**
- 다른 키워드로 검색
- 키워드를 더 구체적으로 입력
- 쿠팡 파트너스 계정 상태 확인

### 5. 딥링크 생성 실패

**원인:** 유효하지 않은 상품 URL 또는 API 제한

**해결:**
- 상품 URL이 올바른지 확인
- 쿠팡 파트너스 약관 위반 여부 확인
- Tracking ID가 올바르게 설정되었는지 확인

### 6. 데이터 파일 권한 오류

**원인:** `data/` 디렉토리 쓰기 권한 없음

**해결:**
```bash
mkdir -p trend-video-frontend/data
chmod 755 trend-video-frontend/data
```

---

## 주의사항

### 쿠팡 파트너스 이용 약관

- ✅ 적법한 방법으로 링크 공유
- ✅ 사용자에게 제휴 링크임을 명시
- ❌ 스팸성 링크 발송 금지
- ❌ 자동화 봇을 통한 클릭 조작 금지
- ❌ 쿠팡 브랜드 무단 사용 금지

### API 사용 제한

- **Rate Limit**: 시간당 1,000 요청
- **검색 결과**: 최대 100개
- **딥링크 생성**: 요청당 최대 20개 URL
- **동시 요청**: 최대 10개

### 수수료 정책

- **평균 수수료율**: 상품 카테고리별로 1.5% ~ 5%
- **지급 기준**: 실제 구매 발생 시
- **최소 지급액**: 월 10,000원 이상
- **지급 주기**: 익월 말일

---

## 추가 리소스

- [쿠팡 파트너스 공식 사이트](https://partners.coupang.com)
- [쿠팡 파트너스 개발자 문서](https://developers.coupang.com/hc/ko)
- [쿠팡 파트너스 FAQ](https://partners.coupang.com/faq)
- [쿠팡 파트너스 블로그](https://blog.partners.coupang.com)

---

## 개발자 정보

**프로젝트**: Trend Video Frontend
**작성일**: 2025-01-01
**버전**: 1.0.0

**연락처**:
- Email: moony75@gmail.com
- GitHub: [Repository URL]

---

## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.

쿠팡 파트너스 API는 쿠팡(주)의 소유이며, 사용 시 [쿠팡 파트너스 약관](https://partners.coupang.com/terms)을 준수해야 합니다.

---

**"이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."**
