# JSON 파싱 가이드

## 개요

Claude AI 등의 LLM이 생성한 JSON 응답을 안전하게 파싱하기 위한 가이드입니다.

## 문제점

AI가 생성한 JSON은 다음과 같은 문제가 발생할 수 있습니다:

1. **코드 블록 마커**
   ```
   ```json
   {"title": "Hello"}
   ```
   ```

2. **설명문 포함**
   ```
   I'll create a complete JSON for you.

   {"title": "Hello"}

   Thank you!
   ```

3. **이스케이프되지 않은 따옴표**
   ```json
   {
     "title": "The "Best" Movie"  // ❌ 잘못된 형식
   }
   ```

4. **Trailing commas**
   ```json
   {
     "title": "Hello",
     "scenes": [1, 2, 3,]  // ❌ 마지막 쉼표
   }
   ```

## 해결 방법

### 1. 유틸리티 함수 사용 (권장)

`src/lib/json-utils.ts`의 `parseJsonSafely` 함수를 사용하세요.

```typescript
import { parseJsonSafely } from '@/lib/json-utils';

// 사용 예시
const result = parseJsonSafely<MyType>(jsonString);

if (result.success) {
  console.log('파싱 성공:', result.data);

  if (result.fixed) {
    console.log('⚠️ 자동 수정이 적용되었습니다');
  }
} else {
  console.error('파싱 실패:', result.error);
}
```

### 2. 함수 사용법

#### 기본 사용

```typescript
const result = parseJsonSafely(jsonString);
```

#### 옵션 지정

```typescript
const result = parseJsonSafely(jsonString, {
  logErrors: false,    // 에러 로그 출력 안 함
  attemptFix: true     // 자동 수정 시도
});
```

#### TypeScript 타입 지정

```typescript
interface MyData {
  title: string;
  scenes: Array<{
    narration: string;
    image_prompt: string;
  }>;
}

const result = parseJsonSafely<MyData>(jsonString);

if (result.success) {
  // result.data는 MyData 타입으로 추론됨
  console.log(result.data.title);
  console.log(result.data.scenes[0].narration);
}
```

### 3. 순수 JSON 추출 (옵션)

JSON 앞뒤의 텍스트만 제거하고 싶은 경우:

```typescript
import { extractPureJson } from '@/lib/json-utils';

const pureJson = extractPureJson(content);
// 이후 직접 JSON.parse() 사용
```

## 적용 위치

모든 JSON 파싱 코드에서 이 유틸리티 함수를 사용해야 합니다:

### 1. 프론트엔드

- ✅ `src/app/my-content/page.tsx` - 대본에서 영상으로 버튼
- ✅ `src/app/page.tsx` - SORA2 대본 검증

### 2. 백엔드 API

- ✅ `src/app/api/scripts/generate/route.ts` - SORA2 JSON 정리
- ✅ `src/app/api/generate-script/route.ts` - API Claude 대본 생성

### 3. 추가 확인 필요

다음 파일들도 JSON.parse()를 사용하고 있으므로 확인이 필요합니다:

- `src/app/api/generate-video-upload/route.ts`
- `src/app/api/script-status/route.ts`
- `src/app/api/my-scripts/route.ts`
- `src/app/api/youtube/upload/route.ts`
- `src/app/api/video-merge/route.ts`
- `src/app/api/restart-video/route.ts`
- `src/app/api/generate-video/route.ts`
- `src/app/api/sora/generate/route.ts`

## 자동 수정 로직

`parseJsonSafely` 함수는 다음과 같은 순서로 JSON을 자동 수정합니다:

### Step 0: 코드 블록 제거
```
```json → (제거)
``` → (제거)
```

### Step 1: JSON 시작점 찾기

**방법 1 (권장):** `{"title"` 패턴 찾기
```
설명문...
{"title": "Hello"}  ← 이 지점부터 시작
```

**방법 2 (Fallback):** 첫 번째 `{` 찾기
```
설명문...
{ "data": "..." }  ← 이 지점부터 시작
```

### Step 2: JSON 끝점 찾기

마지막 `}` 이후의 모든 텍스트 제거
```
{"title": "Hello"}
Thank you!  ← 제거됨
```

### Step 3: 이스케이프된 따옴표 보호

```typescript
\\" → __ESC_QUOTE__ (임시 토큰)
```

### Step 4: 필드별 따옴표 이스케이프

다음 필드들의 값 내부에 있는 따옴표를 자동으로 이스케이프:

- `title`
- `narration`
- `image_prompt`
- `description`
- `text`

```json
// Before
{"title": "The "Best" Movie"}

// After
{"title": "The \"Best\" Movie"}
```

### Step 5: 임시 토큰 복원

```typescript
__ESC_QUOTE__ → \\"
```

### Step 6: Trailing comma 제거

```json
// Before
{"title": "Hello",}
[1, 2, 3,]

// After
{"title": "Hello"}
[1, 2, 3]
```

## 주의사항

1. **원본 보존**: 자동 수정이 실패할 수 있으므로 원본 JSON 문자열은 보존하세요.

2. **로그 확인**: `result.fixed === true`인 경우 자동 수정이 적용되었으므로 로그를 확인하세요.

3. **타입 안전성**: TypeScript 제네릭을 사용하여 파싱 결과의 타입을 명시하세요.

4. **에러 처리**: `result.success === false`인 경우 적절한 에러 메시지를 사용자에게 표시하세요.

## 테스트 예시

```typescript
// 테스트 1: 정상 JSON
const test1 = parseJsonSafely('{"title": "Hello"}');
console.assert(test1.success === true);
console.assert(test1.fixed === false);

// 테스트 2: 코드 블록 포함
const test2 = parseJsonSafely('```json\n{"title": "Hello"}\n```');
console.assert(test2.success === true);
console.assert(test2.fixed === true);

// 테스트 3: 설명문 포함
const test3 = parseJsonSafely('I will create...\n{"title": "Hello"}\nThank you!');
console.assert(test3.success === true);
console.assert(test3.fixed === true);

// 테스트 4: 이스케이프 안 된 따옴표
const test4 = parseJsonSafely('{"title": "The "Best" Movie"}');
console.assert(test4.success === true);
console.assert(test4.fixed === true);

// 테스트 5: Trailing comma
const test5 = parseJsonSafely('{"title": "Hello",}');
console.assert(test5.success === true);
console.assert(test5.fixed === true);
```

## 추가 정보

### 관련 파일

- 유틸리티: `src/lib/json-utils.ts`
- 개발 가이드: `docs/JSON_PARSING_GUIDE.md`

### 업데이트 내역

- 2025-01-03: 초기 버전 작성
- 유틸리티 함수 생성 및 적용

### 참고 자료

- [JSON.parse() - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse)
- [정규표현식 - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
