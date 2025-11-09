# WordPress.com OAuth 자동 연결 설정 가이드

WordPress.com 계정과 자동으로 연결하여 Application Password 없이 간편하게 포스팅할 수 있습니다.

## 🎯 OAuth vs Application Password

### OAuth 방식 (권장)
- ✅ 원클릭 자동 연결
- ✅ WordPress.com 계정 정보 불필요
- ✅ 안전한 토큰 기반 인증
- ✅ 연결 해제 간편
- 🎯 **WordPress.com** 또는 **Jetpack 설치된 사이트** 전용

### Application Password 방식
- ✅ 자체 호스팅 워드프레스 지원
- ⚠️ 수동으로 사이트 URL, 사용자명, 비밀번호 입력 필요
- ⚠️ Application Password 생성 필요

## 📋 OAuth 사전 준비

### 1. WordPress.com 애플리케이션 등록

WordPress.com에서 OAuth 애플리케이션을 등록해야 합니다.

**등록 방법:**
1. [WordPress.com Developer Portal](https://developer.wordpress.com/apps/) 접속
2. **Create New Application** 클릭
3. 애플리케이션 정보 입력:
   - **Name**: Trend Video Auto Post (또는 원하는 이름)
   - **Description**: 쿠팡 상품을 워드프레스에 자동 포스팅
   - **Website URL**: `https://your-domain.com` (프론트엔드 도메인)
   - **Redirect URL**: `https://your-domain.com/api/wordpress/oauth/callback`
   - **Type**: Web
4. **Create** 클릭
5. **Client ID**와 **Client Secret** 복사

⚠️ **중요:** Client Secret은 한 번만 표시되므로 반드시 복사하여 저장하세요!

**예시:**
```
Client ID: 12345
Client Secret: AbCdEfGh1234567890AbCdEfGh1234567890
```

### 2. 환경 변수 설정

프론트엔드 프로젝트의 `.env.local` 파일에 다음 환경 변수를 추가하세요:

```bash
# WordPress.com OAuth 설정
WORDPRESS_OAUTH_CLIENT_ID=12345
WORDPRESS_OAUTH_CLIENT_SECRET=AbCdEfGh1234567890AbCdEfGh1234567890
WORDPRESS_OAUTH_REDIRECT_URI=https://your-domain.com/api/wordpress/oauth/callback

# 또는 NEXT_PUBLIC_BASE_URL로 자동 생성
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

⚠️ **로컬 개발 환경:**
```bash
WORDPRESS_OAUTH_CLIENT_ID=12345
WORDPRESS_OAUTH_CLIENT_SECRET=AbCdEfGh1234567890AbCdEfGh1234567890
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

로컬 개발 시 WordPress.com 애플리케이션 설정에서 Redirect URL에 `http://localhost:3000/api/wordpress/oauth/callback`도 추가해야 합니다.

### 3. 서버 재시작

환경 변수를 설정한 후 반드시 Next.js 개발 서버를 재시작하세요:

```bash
npm run dev
# 또는
yarn dev
```

## 🚀 사용 방법

### 1. WordPress.com 연결

1. 네비게이션 바에서 **"📝 워드프레스"** 클릭
2. **"🔗 WordPress.com 자동 연결"** 섹션 확인
3. **"WordPress.com으로 연결"** 버튼 클릭
4. WordPress.com 로그인 페이지로 리다이렉트
5. 로그인 후 권한 승인 (Approve)
6. 자동으로 연결 완료 및 워드프레스 페이지로 돌아옴

### 2. 연결 확인

연결이 성공하면 다음 정보가 표시됩니다:
- ✅ 연결됨 상태
- 블로그 URL
- 연결 시간

### 3. 자동 포스팅

OAuth 연결 후에는 수동 설정 없이 바로 포스팅할 수 있습니다:

1. 쿠팡 상품 URL 입력
2. (선택) 카테고리 입력
3. **"🚀 자동 포스팅 시작"** 클릭

완료되면 포스트 URL과 쿠팡 딥링크가 표시됩니다.

### 4. 연결 해제

OAuth 연결을 해제하려면:

1. **"🔗 WordPress.com 자동 연결"** 섹션에서
2. **"🔌 연결 해제"** 버튼 클릭
3. 확인 후 연결 해제

## 🔧 OAuth 플로우

### 인증 흐름

```
1. 사용자가 "WordPress.com으로 연결" 클릭
   ↓
2. /api/wordpress/oauth/authorize 호출
   ↓
3. WordPress.com 인증 페이지로 리다이렉트
   ↓
4. 사용자가 로그인 및 권한 승인
   ↓
5. /api/wordpress/oauth/callback으로 리다이렉트 (인증 코드 포함)
   ↓
6. 서버에서 인증 코드를 액세스 토큰으로 교환
   ↓
7. 액세스 토큰을 데이터베이스에 저장
   ↓
8. 워드프레스 페이지로 리다이렉트 (성공 메시지)
```

### 포스팅 흐름 (OAuth 사용 시)

```
1. 사용자가 상품 URL 입력 및 "자동 포스팅 시작" 클릭
   ↓
2. /api/wordpress/auto-post 호출 (OAuth 토큰 자동 사용)
   ↓
3. 쿠팡 딥링크 생성
   ↓
4. 상품 정보 크롤링
   ↓
5. AI 카테고리 분류 및 설명 생성
   ↓
6. WordPress.com REST API로 포스트 생성 (OAuth 토큰 인증)
   ↓
7. 포스트 URL 반환
```

## 🗄️ 데이터베이스 구조

OAuth 토큰은 `wordpress_oauth_tokens` 테이블에 저장됩니다:

```sql
CREATE TABLE wordpress_oauth_tokens (
  user_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  blog_id TEXT NOT NULL,
  blog_url TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## 🔒 보안

- **액세스 토큰**: 암호화되지 않지만 데이터베이스에 안전하게 저장
- **State 파라미터**: CSRF 공격 방지 (10분 타임아웃)
- **사용자별 토큰**: 각 사용자가 자신의 WordPress.com 계정만 연결
- **자동 삭제**: 사용자 삭제 시 토큰도 함께 삭제 (CASCADE)

## 🛠️ 트러블슈팅

### OAuth 연결 실패

**오류:** "OAuth 인증 실패"

**해결 방법:**
1. `WORDPRESS_OAUTH_CLIENT_ID`와 `WORDPRESS_OAUTH_CLIENT_SECRET`가 올바른지 확인
2. WordPress.com 애플리케이션의 Redirect URL이 정확한지 확인
3. 서버를 재시작했는지 확인
4. 브라우저 콘솔에서 자세한 오류 확인

### 포스팅 실패 (OAuth 사용 시)

**오류:** "워드프레스 포스팅 중 오류가 발생했습니다"

**해결 방법:**
1. OAuth 연결 상태 확인 (연결 해제 후 재연결)
2. WordPress.com 사이트가 활성화되어 있는지 확인
3. 액세스 토큰이 만료되지 않았는지 확인 (일반적으로 만료되지 않음)
4. 서버 로그에서 자세한 오류 확인

### 로컬 개발 환경 OAuth 오류

**오류:** Redirect URL 불일치

**해결 방법:**
1. WordPress.com 애플리케이션 설정에서 Redirect URL에 `http://localhost:3000/api/wordpress/oauth/callback` 추가
2. `.env.local`에서 `NEXT_PUBLIC_BASE_URL=http://localhost:3000` 설정
3. 서버 재시작

## 📊 OAuth vs Application Password 비교

| 기능 | OAuth | Application Password |
|------|-------|----------------------|
| 설정 난이도 | 쉬움 (원클릭) | 중간 (수동 입력) |
| 지원 사이트 | WordPress.com, Jetpack | 모든 워드프레스 |
| 보안 | 높음 (토큰) | 높음 (비밀번호) |
| 연결 해제 | 원클릭 | 수동 |
| 이미지 업로드 | URL 자동 | 수동 업로드 |
| 카테고리 | 이름으로 자동 생성 | ID 기반 |

## 🚀 향후 개발 계획

- [ ] OAuth 토큰 자동 갱신 (Refresh Token)
- [ ] 여러 WordPress.com 사이트 연결 지원
- [ ] OAuth 토큰 암호화
- [ ] Google OAuth 연동 (Google Workspace 통합)
- [ ] 포스트 수정/삭제 API
- [ ] 예약 포스팅

## 📝 개발자 정보

### API 엔드포인트

- **OAuth 인증 시작**: `GET /api/wordpress/oauth/authorize`
- **OAuth 콜백**: `GET /api/wordpress/oauth/callback`
- **OAuth 상태 확인**: `GET /api/wordpress/oauth/status`
- **OAuth 연결 해제**: `DELETE /api/wordpress/oauth/status`
- **자동 포스팅**: `POST /api/wordpress/auto-post` (OAuth 또는 Application Password)

### 클라이언트 라이브러리

- **WordPress.com OAuth 클라이언트**: `src/lib/wordpress-oauth-client.ts`
- **WordPress REST API 클라이언트**: `src/lib/wordpress-client.ts` (Application Password)

## 📞 문의

OAuth 연동 문제가 발생하거나 기능 요청이 있으시면 이슈를 등록해주세요.

---

*Last Updated: 2025-11-05*
