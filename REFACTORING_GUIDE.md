# Contents 통합 리팩토링 가이드

## 개요

**scripts, scripts_temp, jobs** 3개 테이블을 **contents** 1개로 통합하여 코드 간소화 및 유연성 향상

## 핵심 개념

### 통합 테이블 구조

```
contents
├── type: 'script' | 'video'           # 컨텐츠 타입
├── format: 'longform' | 'shortform' | 'sora2'  # 포맷
├── status: 'pending' | 'processing' | 'completed' | 'failed'
├── published: boolean                  # 유튜브 업로드 여부
└── 시간 기반 ID로 정렬 가능
```

### 장점

✅ **하나의 테이블**로 모든 컨텐츠 관리
✅ **JOIN 불필요** - 단순한 쿼리
✅ **유연한 필터링** - type, format으로 쉽게 필터
✅ **재시작 = 새 ID** - 간단한 재시도 로직
✅ **published 마킹**만으로 업로드 상태 관리

---

## 마이그레이션 완료됨

### 1. 테이블 생성
```bash
sqlite3 data/database.sqlite < schema-contents.sql
```

### 2. 데이터 마이그레이션
```bash
sqlite3 data/database.sqlite < migrate-to-contents.sql
```

### 3. 결과 확인
```bash
sqlite3 data/database.sqlite "SELECT COUNT(*) as total, type, format FROM contents GROUP BY type, format"
```

**결과:**
- 36 script (format NULL)
- 30 script longform
- 19 script shortform
- 20 script sora2
- 141 video

---

## 새로운 API 구조

### `lib/content.ts` - 통합 CRUD

```typescript
import { createContent, findContentById, updateContent, deleteContent } from '@/lib/content';

// 대본 생성
const script = createContent(userId, 'script', '제목', {
  format: 'longform',
  content: 'JSON 대본...',
  tokenUsage: { input_tokens: 100, output_tokens: 200 }
});

// 영상 생성
const video = createContent(userId, 'video', '영상 제목', {
  format: 'shortform'
});

// 조회
const content = findContentById(contentId);

// 업데이트
updateContent(contentId, {
  status: 'completed',
  videoPath: '/path/to/video.mp4'
});

// 퍼블리시 마킹
updateContent(contentId, {
  published: true
});
```

### 통합 API 엔드포인트: `/api/my-content`

```typescript
// 모든 컨텐츠 조회
GET /api/my-content

// 대본만 조회
GET /api/my-content?type=script

// 숏폼 영상만 조회
GET /api/my-content?type=video&format=shortform

// 삭제 (대본/영상 구분 없이)
DELETE /api/my-content?contentId=xxx
```

---

## 기존 API 리팩토링 방법

### Before (scripts/jobs 분리)

```typescript
// ❌ 복잡함
import { getScriptsByUserId } from '@/lib/db';
import { getJobsByUserId } from '@/lib/db';

const scripts = await getScriptsByUserId(userId);
const jobs = await getJobsByUserId(userId);
const all = [...scripts, ...jobs].sort(...);
```

### After (contents 통합)

```typescript
// ✅ 간단함
import { getContentsByUserId } from '@/lib/content';

const allContent = getContentsByUserId(userId);
const scriptsOnly = getContentsByUserId(userId, { type: 'script' });
const videosOnly = getContentsByUserId(userId, { type: 'video' });
const shortforms = getContentsByUserId(userId, { format: 'shortform' });
```

---

## 재시작 로직

### Before (scripts_temp 복잡)

```typescript
// ❌ 복잡: scripts_temp → scripts 연결 필요
const tempScript = findScriptTempById(id);
const actualScript = findScriptById(tempScript.scriptId);
// 재시작 시 기존 temp 업데이트? 새로 생성?
```

### After (contents 통합)

```typescript
// ✅ 간단: 새 ID 생성
const original = findContentById(originalId);

// 대본 재시도
const newScript = createContent(userId, 'script', original.title, {
  format: original.format,
  originalTitle: original.originalTitle
});

// 영상 재시도 (같은 대본 사용)
const newVideo = createContent(userId, 'video', original.title, {
  format: original.format
});
```

---

## 프론트엔드 타입

### TypeScript 타입

```typescript
// src/lib/content.ts
export interface Content {
  id: string;
  userId: string;

  type: 'script' | 'video';
  format?: 'longform' | 'shortform' | 'sora2';

  title: string;
  originalTitle?: string;
  content?: string;  // 대본일 때만

  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;

  pid?: number;  // 취소용

  videoPath?: string;
  thumbnailPath?: string;
  published?: boolean;
  publishedAt?: string;

  tokenUsage?: { input_tokens: number; output_tokens: number };
  useClaudeLocal?: boolean;

  logs?: string[];

  createdAt: string;
  updatedAt: string;
}
```

---

## 리팩토링 체크리스트

### ✅ 완료된 작업
- [x] contents 테이블 스키마 설계
- [x] content_logs 테이블 (로그 통합)
- [x] 마이그레이션 스크립트 작성
- [x] lib/content.ts 함수 작성
- [x] 마이그레이션 실행 (246 rows 성공)
- [x] API 예시 작성 (/api/my-content)

### 🔄 남은 작업

#### 1. 기존 API 엔드포인트 수정

**수정 필요한 파일들:**
```
src/app/api/
├── scripts/
│   ├── generate/route.ts       # createContent() 사용
│   ├── [id]/route.ts           # findContentById() 사용
│   └── route.ts                # getContentsByUserId() 사용
├── my-scripts/route.ts         # 삭제 또는 my-content로 통합
├── convert-format/route.ts     # createContent() 사용
├── restart-script/route.ts     # createContent() 사용
├── download-script/route.ts    # findContentById() 사용
└── generate-video-upload/route.ts  # createContent() 사용
```

#### 2. 프론트엔드 컴포넌트 수정

**수정 필요한 파일들:**
```
src/app/
├── page.tsx                    # 통합 Content 타입 사용
├── my-content/page.tsx         # type/format 필터링
└── ...
```

#### 3. 기존 테이블 제거 (백업 후)

```sql
-- 백업 확인 후 실행
DROP TABLE scripts;
DROP TABLE scripts_temp;
DROP TABLE script_logs;
DROP TABLE jobs;
DROP TABLE job_logs;
```

---

## 예시: API 리팩토링

### `/api/scripts/generate/route.ts`

**Before:**
```typescript
import { createScript } from '@/lib/db';

const script = await createScript(userId, title, '', tokenUsage);
```

**After:**
```typescript
import { createContent } from '@/lib/content';

const content = createContent(userId, 'script', title, {
  format: 'longform',
  tokenUsage
});
```

### `/api/generate-video-upload/route.ts`

**Before:**
```typescript
import { createJob } from '@/lib/db';

createJob(userId, jobId, title, type);
```

**After:**
```typescript
import { createContent } from '@/lib/content';

const content = createContent(userId, 'video', title, {
  format: type  // 'longform' | 'shortform' | 'sora2'
});
```

---

## 주의사항

1. **PID 관리**: 프로세스 취소 시 `pid` 필드 사용
2. **로그 저장**: `addContentLog()` 사용
3. **소유자 확인**: `content.userId === user.userId`
4. **published 마킹**: 유튜브 업로드 시 `updateContent(id, { published: true })`

---

## 롤백 방법

혹시 문제가 생기면:

```sql
-- contents에서 scripts로 복구
INSERT INTO scripts (id, user_id, title, content, ...)
SELECT id, user_id, title, content, ...
FROM contents WHERE type = 'script';

-- contents에서 jobs로 복구
INSERT INTO jobs (id, user_id, title, video_url, ...)
SELECT id, user_id, title, video_path, ...
FROM contents WHERE type = 'video';
```

---

**마지막 업데이트:** 2025-01-20
**마이그레이션 상태:** ✅ 완료 (246 rows)
**다음 단계:** 기존 API 엔드포인트 리팩토링
