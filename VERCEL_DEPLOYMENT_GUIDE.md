# 🚀 Vercel 무료 배포 가이드 (하이브리드 구조)

완전 무료! 월 100만 방문자도 무료로 서비스할 수 있는 쿠팡 쇼핑몰 배포 가이드입니다.

## 🎯 시스템 구조

```
┌─────────────────────────────────────┐
│ oldmoon.iptime.org (관리 서버)        │
│ - SQLite 사용                        │
│ - 상품 관리 (/admin/coupang-products)│
│ - 공개 API (/api/shop/products)      │
│ - 트래픽: 거의 없음 (본인만 접속)      │
└─────────────────────────────────────┘
          ↓ 빌드 시 API 호출
┌─────────────────────────────────────┐
│ Vercel (무료 CDN)                    │
│ your-shop.vercel.app                │
│ - 정적 HTML 페이지 (SSG)             │
│ - 무제한 트래픽 무료!                 │
│ - 글로벌 CDN (초고속)                │
│ - 자동 HTTPS                        │
│ - 1시간마다 자동 재생성 (ISR)         │
└─────────────────────────────────────┘
          ↓ 방문자
┌─────────────────────────────────────┐
│ 👥 일반 사용자                        │
│ - 카테고리별 상품 구경                │
│ - 상품 상세 확인                      │
│ - 쿠팡 딥링크 클릭 → 수수료 Get!      │
└─────────────────────────────────────┘
```

## ✅ 준비 사항

### 1. 로컬에서 테스트
```bash
# 관리 서버에서 상품 추가 확인
http://localhost:3000/admin/coupang-products

# 쇼핑몰 페이지 접속 테스트
http://localhost:3000/shop
```

### 2. 공개 API 테스트
```bash
# 브라우저에서 직접 접속
http://oldmoon.iptime.org/api/shop/products
```

응답 예시:
```json
{
  "products": [...],
  "categories": [...],
  "total": 5,
  "lastUpdated": "2025-11-05T..."
}
```

## 🚀 Vercel 배포 단계

### 1단계: GitHub에 푸시

```bash
cd C:\Users\oldmoon\workspace\trend-video-frontend

git add .
git commit -m "feat: 하이브리드 쿠팡 쇼핑몰 배포 준비"
git push origin master
```

### 2단계: Vercel 계정 생성

1. https://vercel.com 접속
2. **Sign Up with GitHub** 클릭
3. GitHub 계정 연동
4. **Hobby (Free)** 플랜 선택

### 3단계: 프로젝트 배포

1. Vercel 대시보드 → **Add New...** → **Project**
2. GitHub 저장소 선택: `trend-video-frontend`
3. **Import** 클릭

### 4단계: 환경 변수 설정

**Framework Preset**: Next.js (자동 감지)
**Build Command**: `npm run build`
**Output Directory**: `.next`

**환경 변수 추가**:
```bash
ADMIN_SERVER_URL=http://oldmoon.iptime.org
```

⚠️ **중요**: `http://`를 반드시 포함하세요!

### 5단계: 배포 시작

1. **Deploy** 버튼 클릭
2. 2-3분 대기 (빌드 진행 중...)
3. 🎉 배포 완료!

생성된 URL 확인:
```
https://your-project.vercel.app
```

## 🔍 배포 확인

### 1. 쇼핑몰 메인 페이지
```
https://your-project.vercel.app/shop
```

### 2. 카테고리 페이지
```
https://your-project.vercel.app/shop/category/디지털
```

### 3. 상품 상세 페이지
```
https://your-project.vercel.app/shop/product/[상품ID]
```

### 4. 구매 버튼 테스트
- 상품 상세 페이지에서 "🛒 쿠팡에서 구매하기" 클릭
- 쿠팡 페이지로 리다이렉트 확인
- 관리 서버에서 클릭 추적 확인

## 🔄 자동 업데이트 설정

### 방법 1: 시간 기반 재생성 (이미 설정됨)
- **1시간마다** 자동으로 페이지 재생성
- 새 상품 추가 후 최대 1시간 내에 반영

### 방법 2: Deploy Hook (즉시 반영)

1. Vercel 프로젝트 → **Settings** → **Git** → **Deploy Hooks**
2. Hook 이름: `product-update`
3. Branch: `master`
4. **Create Hook** 클릭
5. Hook URL 복사:
   ```
   https://api.vercel.com/v1/integrations/deploy/...
   ```

6. 관리 서버에서 상품 추가 후 자동 재배포:
   ```typescript
   // src/app/api/coupang-products/route.ts
   // 상품 저장 후 추가:

   if (process.env.VERCEL_DEPLOY_HOOK) {
     await fetch(process.env.VERCEL_DEPLOY_HOOK, { method: 'POST' });
     console.log('✅ Vercel 재배포 트리거');
   }
   ```

7. 관리 서버 `.env.local`에 추가:
   ```bash
   VERCEL_DEPLOY_HOOK=https://api.vercel.com/v1/integrations/deploy/...
   ```

## 🌐 커스텀 도메인 설정 (선택)

### 무료 도메인
- Vercel 제공: `your-project.vercel.app` ✅ 무료

### 커스텀 도메인 (유료)
1. 도메인 구매 (예: `myshop.com`)
2. Vercel → **Settings** → **Domains**
3. 도메인 입력: `myshop.com` 또는 `shop.myshop.com`
4. DNS 설정:
   ```
   Type: CNAME
   Name: @ (또는 shop)
   Value: cname.vercel-dns.com
   ```
5. 자동 HTTPS 설정 완료! 🔒

## 💰 비용 분석

| 항목 | Vercel 무료 플랜 |
|------|-----------------|
| 트래픽 | ✅ 무제한 |
| 빌드 시간 | 6000분/월 |
| 함수 실행 | 100GB-시간/월 |
| 대역폭 | 100GB/월 |
| 이미지 최적화 | 1,000장/월 (사용 안 함) |
| **총 비용** | **0원** |

**월 100만 방문자도 무료!** (정적 HTML이라 서버 부하 없음)

## 📊 성과 측정

### Vercel Analytics (무료)
1. Vercel 대시보드 → **Analytics**
2. 실시간 방문자 수
3. 페이지별 조회수
4. 지역별 트래픽

### 쿠팡 파트너스 대시보드
1. https://partners.coupang.com
2. 클릭수 확인
3. 주문 수 확인
4. 수수료 확인

### 관리 서버 통계
- `/admin/coupang-products`에서 상품별 클릭수/조회수 확인

## 🎛️ 관리 및 업데이트

### 자동 배포 (Deploy Hook) 설정

관리자 페이지에서 **🚀 Vercel 배포** 버튼으로 한 번에 배포할 수 있습니다!

#### 1단계: Deploy Hook 생성

1. Vercel 대시보드 접속
   ```
   https://vercel.com/oldmoons-projects-5ac90ca0
   ```

2. 프로젝트 선택 → **Settings** → **Git**

3. **Deploy Hooks** 섹션에서:
   - Hook Name: `Admin Panel Trigger`
   - Branch: `master` (또는 `main`)
   - **Create Hook** 클릭

4. 생성된 URL 복사 (예시):
   ```
   https://api.vercel.com/v1/integrations/deploy/prj_xxx/yyy
   ```

#### 2단계: 로컬 서버 환경변수 설정

관리 서버의 `.env.local` 파일에 추가:

```bash
# Vercel Deploy Hook
VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/prj_xxx/yyy
```

#### 3단계: 서버 재시작

```bash
# 관리 서버 재시작
npm run dev
```

#### 4단계: 배포 테스트

1. http://oldmoon.iptime.org:3000/admin/coupang-products 접속
2. **📦 내 목록** 탭에서 상품이 1개 이상 있는지 확인
3. 오른쪽 상단 **🚀 Vercel 배포** 버튼 클릭
4. 약 1-2분 후 Vercel 사이트에서 변경사항 확인

### 일상적인 업데이트 워크플로우

```
1. 상품 추가/수정
   ↓
2. 로컬에서 미리보기
   http://oldmoon.iptime.org:3000/shop
   ↓
3. Vercel 배포 버튼 클릭
   ↓
4. 1-2분 후 반영 확인
   https://your-shop.vercel.app
```

**배포 없이도 자동 업데이트**:
- Vercel은 1시간마다 자동으로 데이터를 새로고침합니다 (ISR)
- 급한 경우에만 배포 버튼 사용
- 일반적으로는 상품 추가만 하면 1시간 내 자동 반영

## 🔧 트러블슈팅

### 빌드 실패: "Cannot connect to ADMIN_SERVER_URL"

**원인**: 관리 서버가 꺼져있거나 접속 불가

**해결**:
1. 관리 서버 실행 확인
2. 포트 포워딩 확인 (80번 포트)
3. 공개 API 직접 테스트:
   ```bash
   curl http://oldmoon.iptime.org/api/shop/products
   ```

### 빌드 성공했지만 페이지가 비어있음

**원인**: 관리 서버 API가 빈 데이터 반환

**해결**:
1. 관리 서버에서 상품 추가
2. API 응답 확인:
   ```bash
   curl http://oldmoon.iptime.org/api/shop/products
   ```

### 이미지가 안 보임

**원인**: 쿠팡 CDN 차단 또는 URL 문제

**해결**:
1. 브라우저에서 이미지 URL 직접 열기
2. `next.config.ts`에서 쿠팡 도메인 확인
3. `unoptimized: true` 확인

### 클릭 추적이 안 됨

**원인**: Vercel에서 관리 서버 API 호출 실패

**해결**:
1. 클릭 API는 클라이언트에서 직접 호출
2. CORS 설정 확인
3. 브라우저 콘솔에서 에러 확인

## 🎉 배포 완료 체크리스트

- [ ] GitHub 저장소 푸시 완료
- [ ] Vercel 계정 생성
- [ ] 프로젝트 Import
- [ ] 환경 변수 설정 (`ADMIN_SERVER_URL`)
- [ ] 첫 배포 성공
- [ ] `/shop` 페이지 접속 확인
- [ ] 카테고리 페이지 확인
- [ ] 상품 상세 페이지 확인
- [ ] 구매 버튼 클릭 테스트
- [ ] Deploy Hook 설정 (선택)
- [ ] 커스텀 도메인 설정 (선택)

## 📈 다음 단계

1. **SEO 최적화**
   - 메타 태그 추가
   - sitemap.xml 생성
   - robots.txt 설정

2. **소셜 공유**
   - SNS에 쇼핑몰 링크 공유
   - 블로그 포스팅
   - 유튜브 영상 설명란

3. **Google Analytics 설치**
   ```bash
   npm install @next/third-parties
   ```

4. **정기적인 상품 추가**
   - 매일 신상품 1-2개 추가
   - 인기 카테고리 집중 관리
   - 계절별 특집 상품

5. **수수료 최적화**
   - 쿠팡 파트너스 대시보드 분석
   - 클릭률 높은 카테고리 확대
   - 전환율 높은 상품 우선 배치

---

## 💡 팁

### 무료 트래픽 무제한 활용법
- 정적 HTML = 서버 부하 제로
- 쿠팡 CDN 이미지 = 대역폭 제로
- 클릭 추적만 관리 서버 사용 (트래픽 극소)

### 관리 서버 부하 최소화
- Vercel 빌드는 1시간마다 1회만
- 실제 사용자는 Vercel에만 접속
- 관리자만 관리 서버 접속

### 수익 극대화
- SEO 키워드 최적화
- 인기 상품 상단 배치
- 계절 상품 적극 활용
- SNS 마케팅 병행

---

**축하합니다!** 🎉

완전 무료 쿠팡 파트너스 쇼핑몰이 배포되었습니다!

**이제 수익을 내볼까요?** 💰

---

*Last Updated: 2025-11-05*
