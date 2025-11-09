# 🛒 쿠팡 쇼핑몰 무료 배포 가이드 (Vercel)

트래픽 제로! 완전 무료 쿠팡 상품 카탈로그 사이트 구축 가이드입니다.

## 🎯 시스템 구조

```
┌─────────────────────────────────────┐
│ oldmoon.iptime.org (관리 서버)        │
│ - 상품 추가/수정/삭제 (관리자 전용)    │
│ - AI 자동 카테고리 분류               │
│ - 쿠팡 딥링크 생성                    │
│ - 트래픽: 거의 없음 (본인만 접속)      │
└─────────────────────────────────────┘
          ↓ 상품 데이터 (SQLite)
┌─────────────────────────────────────┐
│ Vercel (무료 CDN)                    │
│ shop.yourdomain.com                 │
│ - 정적 HTML 페이지 (SSG)             │
│ - 무제한 트래픽 무료!                 │
│ - 글로벌 CDN (초고속)                │
│ - 자동 HTTPS                        │
└─────────────────────────────────────┘
          ↓ 방문자
┌─────────────────────────────────────┐
│ 👥 일반 사용자                        │
│ - 카테고리별 상품 구경                │
│ - 상품 상세 확인                      │
│ - 쿠팡 딥링크 클릭 → 수수료 Get!      │
└─────────────────────────────────────┘
```

## ✅ 구현 완료 내역

### 1. **데이터베이스**
- ✅ `coupang_products` 테이블 생성
- ✅ 상품 정보, 카테고리, 가격, 딥링크 저장
- ✅ 조회수/클릭수 추적

### 2. **관리자 기능** (`/admin/coupang-products`)
- ✅ 쿠팡 상품 URL 입력
- ✅ AI 자동 카테고리 분류
- ✅ AI 자동 상세 설명 생성
- ✅ 썸네일 자동 추출
- ✅ 상품 목록 관리 (수정/삭제)

### 3. **공개 쇼핑몰** (`/shop`)
- ✅ 메인 페이지: 카테고리 타일 표시
- ✅ 카테고리 페이지: 상품 목록 그리드
- ✅ 상품 상세 페이지: 이미지, 설명, 가격, 구매 버튼
- ✅ 클릭 추적 (수수료 성과 측정)

### 4. **SSG 최적화**
- ✅ 모든 페이지 정적 HTML 생성
- ✅ 1시간마다 자동 재생성 (ISR)
- ✅ 트래픽 제로 (쿠팡 CDN에서 이미지 로드)

## 🚀 Vercel 배포 방법

### 1단계: GitHub 저장소 설정

```bash
# 현재 프로젝트 Git 초기화 (아직 안 했다면)
cd C:\Users\oldmoon\workspace\trend-video-frontend
git add .
git commit -m "feat: 쿠팡 쇼핑몰 시스템 추가"
git push origin master
```

### 2단계: Vercel 계정 생성

1. [Vercel 웹사이트](https://vercel.com) 접속
2. **GitHub 계정으로 로그인**
3. 무료 Hobby 플랜 선택

### 3단계: 프로젝트 배포

1. Vercel 대시보드에서 **"Add New Project"** 클릭
2. GitHub 저장소 선택: `trend-video-frontend`
3. **Framework Preset**: Next.js (자동 감지)
4. **Root Directory**: `.` (루트)
5. **Build Command**: `npm run build` (기본값)
6. **Output Directory**: `.next` (기본값)

### 4단계: 환경 변수 설정

Vercel 프로젝트 설정에서 환경 변수 추가:

```bash
# 필수 환경 변수
ANTHROPIC_API_KEY=your_anthropic_api_key
COUPANG_ACCESS_KEY=your_coupang_access_key
COUPANG_SECRET_KEY=your_coupang_secret_key

# 데이터베이스 (Vercel은 SQLite 지원 안 함 - 별도 설정 필요)
# 아래 "데이터베이스 옵션" 참조
```

### 5단계: 배포 완료!

- **Deploy** 버튼 클릭
- 2-3분 후 배포 완료
- 생성된 URL 확인: `https://your-project.vercel.app`

## 🗄️ 데이터베이스 옵션

Vercel은 SQLite를 직접 지원하지 않습니다. 다음 옵션 중 선택:

### 옵션 1: Vercel Postgres (권장)

**무료 플랜:**
- 60시간 compute time/월
- 256 MB 저장공간
- 작은 쇼핑몰에 충분

**설정 방법:**
1. Vercel 프로젝트 → Storage → Create Database
2. Postgres 선택
3. 자동으로 환경 변수 설정됨
4. `src/lib/sqlite.ts`를 `src/lib/postgres.ts`로 변경 필요

### 옵션 2: Supabase (무제한 무료)

**무료 플랜:**
- 500 MB 데이터베이스
- 무제한 API 요청
- 실시간 업데이트

**설정 방법:**
1. [Supabase](https://supabase.com) 가입
2. 새 프로젝트 생성
3. Database URL 복사
4. Vercel 환경 변수에 추가:
   ```
   DATABASE_URL=postgresql://...
   ```

### 옵션 3: 하이브리드 구조 (추천!)

```
관리 서버 (oldmoon.iptime.org)
- SQLite 사용
- 상품 관리 API만 운영

Vercel (shop.yourdomain.com)
- 관리 서버 API 호출
- 정적 페이지만 제공
- 완전 무료!
```

**구현 방법:**

1. **관리 서버에 API 엔드포인트 추가** (`/api/shop/products`)
2. **Vercel 빌드 시 관리 서버에서 데이터 가져오기**
3. **정적 HTML 생성**

이 방법이 가장 간단하고 완전 무료입니다!

## 📝 하이브리드 구조 구현

### 1. 관리 서버에 공개 API 추가

`src/app/api/shop/products/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import db from '@/lib/sqlite';

// 공개 API (인증 불필요)
export async function GET() {
  const products = db.prepare(`
    SELECT id, title, description, category, image_url,
           original_price, discount_price, view_count, click_count
    FROM coupang_products
    WHERE status = 'active'
    ORDER BY created_at DESC
  `).all();

  const categories = db.prepare(`
    SELECT DISTINCT category, COUNT(*) as count
    FROM coupang_products
    WHERE status = 'active'
    GROUP BY category
  `).all();

  return NextResponse.json({ products, categories });
}
```

### 2. Vercel 빌드 시 데이터 fetch

`src/app/shop/page.tsx` 수정:
```typescript
// 빌드 타임에 관리 서버에서 데이터 가져오기
export default async function ShopPage() {
  const res = await fetch('http://oldmoon.iptime.org/api/shop/products');
  const { categories } = await res.json();

  return (
    // ... JSX
  );
}
```

### 3. 빌드 스크립트 설정

`package.json`:
```json
{
  "scripts": {
    "build": "next build",
    "vercel-build": "npm run build"
  }
}
```

## 🔄 자동 재배포 설정

### 방법 1: Vercel Deploy Hook

1. Vercel 프로젝트 → Settings → Git → Deploy Hooks
2. Hook 이름 입력: `product-update`
3. Hook URL 복사: `https://api.vercel.com/v1/integrations/deploy/...`

4. 상품 추가 후 자동 재배포:
   ```typescript
   // src/app/api/coupang-products/route.ts
   // 상품 추가 후
   await fetch('https://api.vercel.com/v1/integrations/deploy/...', {
     method: 'POST'
   });
   ```

### 방법 2: GitHub Actions (자동화)

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to Vercel
on:
  schedule:
    - cron: '0 */6 * * *'  # 6시간마다
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: curl -X POST https://api.vercel.com/v1/integrations/deploy/...
```

## 💰 비용 분석

| 항목 | 비용 | 설명 |
|------|------|------|
| **Vercel 호스팅** | 0원 | 무제한 트래픽 무료 |
| **Vercel 빌드** | 0원 | 6000분/월 무료 |
| **CDN** | 0원 | 글로벌 CDN 무료 |
| **이미지 호스팅** | 0원 | 쿠팡 CDN 사용 |
| **관리 서버** | 기존 | 추가 비용 없음 |
| **총 비용** | **0원** | **완전 무료!** |

**월 100만 방문자도 무료!**

## 🌐 커스텀 도메인 설정

### 무료 도메인
- Vercel 제공: `your-project.vercel.app`

### 커스텀 도메인 (선택)
1. Vercel 프로젝트 → Settings → Domains
2. 도메인 입력: `shop.yourdomain.com`
3. DNS 설정:
   ```
   CNAME  shop  cname.vercel-dns.com
   ```
4. 자동 HTTPS 설정 완료!

## 📊 성과 측정

### 조회수/클릭수 확인

관리자 페이지 (`/admin/coupang-products`)에서 실시간 확인:
- 👁️ 조회수: 상품 상세 페이지 방문
- 🖱️ 클릭수: 쿠팡 딥링크 클릭

### 수수료 확인

쿠팡 파트너스 대시보드에서 확인:
- 클릭수 = 수수료 기회
- 구매 전환율 추적
- 월별 수익 통계

## 🔧 트러블슈팅

### 빌드 실패: "Cannot find module 'uuid'"

```bash
npm install uuid
npm install --save-dev @types/uuid
```

### 데이터베이스 연결 오류

- Vercel은 SQLite 미지원
- 하이브리드 구조 또는 Postgres 사용

### 이미지 로딩 느림

- 쿠팡 이미지는 쿠팡 CDN에서 로드 (무료)
- Next.js Image Optimization 비활성화:
  ```js
  // next.config.js
  module.exports = {
    images: {
      unoptimized: true
    }
  }
  ```

## ✅ 완료 체크리스트

- [ ] 관리자 페이지에서 상품 추가 테스트
- [ ] AI 카테고리 분류 확인
- [ ] 쿠팡 딥링크 생성 확인
- [ ] GitHub 저장소 푸시
- [ ] Vercel 계정 생성
- [ ] Vercel 프로젝트 배포
- [ ] 환경 변수 설정
- [ ] `/shop` 페이지 접속 테스트
- [ ] 상품 상세 페이지 테스트
- [ ] 쿠팡 딥링크 클릭 테스트
- [ ] 클릭 추적 확인
- [ ] 커스텀 도메인 설정 (선택)
- [ ] Deploy Hook 설정 (선택)

## 🎉 축하합니다!

이제 완전 무료 쿠팡 상품 카탈로그 사이트가 완성되었습니다!

**장점:**
- ✅ 무제한 트래픽
- ✅ 초고속 CDN
- ✅ 자동 HTTPS
- ✅ AI 자동화
- ✅ 클릭 추적
- ✅ 0원 운영 비용

**다음 단계:**
1. SNS/블로그에 사이트 공유
2. SEO 최적화 (meta tags)
3. Google Analytics 설치
4. 정기적으로 신상품 추가
5. 쿠팡 파트너스 수수료 확인!

---

*Last Updated: 2025-11-05*
