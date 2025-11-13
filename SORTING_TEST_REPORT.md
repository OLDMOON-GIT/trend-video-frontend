# 미디어 정렬 로직 리그레션 테스트 완료 보고서

## 📋 요약

**사용자 요구사항**: 무조건 번호순 → 오래된순 (파일 타입과 무관)

**테스트 결과**:
- ✅ Frontend 테스트: **13/13 통과**
- ✅ Backend 테스트: **12/12 통과**
- ✅ **총 25개 테스트 모두 통과**

---

## 🎯 정렬 규칙 (확정)

### 1순위: 번호 추출 및 정렬
파일명에서 다음 패턴으로 번호 추출:

1. **숫자로 시작**: `01.jpg`, `02.mp4`, `123.png`
2. **언더스코어/대시 + 숫자**: `image_01.jpg`, `scene-02.png`
3. **괄호 안 숫자** (랜덤ID 없을 때만): `Image_fx (47).jpg`

### 2순위: 수정 시간 (lastModified)
- 번호가 없거나 같은 번호일 때 **오래된 순서**로 정렬
- `lastModified` 오름차순 (작은 값 우선)

### 정렬 우선순위
```
번호 있는 파일 (번호순) → 번호 없는 파일 (시간순)
```

---

## ✅ 테스트 케이스 목록

### Frontend 테스트 (13개)

#### 1. extractSequence - 번호 추출 (5개)
- ✅ 숫자로 시작하는 파일명 (`01.jpg`, `02.jpg`, ...)
- ✅ `_숫자` 또는 `-숫자` 패턴 (`image_01.jpg`, `scene-02.png`)
- ✅ `(숫자)` 패턴 (`Image_fx (47).jpg`)
- ✅ 랜덤 ID가 있으면 번호 추출 안 함
- ✅ 번호가 없는 파일

#### 2. 실제 사용자 케이스 (4개)
- ✅ **케이스 1**: `01.jpg, 02.jpg, 03.jpg, 04.mp4, 05.mp4` → 번호순
- ✅ **케이스 2**: 모두 같은 시간에 업로드된 경우
- ✅ **케이스 3**: `image_XX, video_XX` 파일명 (구버전)
- ✅ **케이스 4**: 번호가 섞여있고 lastModified도 다른 경우

#### 3. 번호 없는 파일 (2개)
- ✅ 번호가 없으면 오래된 순서대로
- ✅ 번호 있는 파일이 번호 없는 파일보다 우선

#### 4. 에지 케이스 (2개)
- ✅ 같은 번호, 다른 타입 → lastModified로 정렬
- ✅ 제로 패딩 vs 비패딩 (`01` vs `1`)

### Backend 테스트 (12개)

동일한 로직을 Python으로 구현하여 검증:
- ✅ 시퀀스 번호 추출 (5개)
- ✅ 미디어 파일 정렬 (4개)
- ✅ 에지 케이스 (3개)

---

## 📂 실제 케이스 검증

### 테스트 폴더
```
C:\Users\oldmoon\workspace\trend-video-backend\uploads\uploaded_upload_1762971853314_fazsj400e
```

### 파일 목록
```
01.jpg (3.2MB) - 2025-11-13 03:24:13
02.jpg (2.4MB) - 2025-11-13 03:24:13
03.jpg (0.8MB) - 2025-11-13 03:24:13
04.mp4 (1.5MB) - 2025-11-13 03:24:13
05.mp4 (1.7MB) - 2025-11-13 03:24:13
```

### Backend 정렬 결과 (로그)
```
🎯 통합 정렬 결과 (총 5개):
  씬 1: 01.jpg (IMAGE, 시퀀스: 1) ✓
  씬 2: 02.jpg (IMAGE, 시퀀스: 2) ✓
  씬 3: 03.jpg (IMAGE, 시퀀스: 3) ✓
  씬 4: 04.mp4 (VIDEO, 시퀀스: 4) ✓
  씬 5: 05.mp4 (VIDEO, 시퀀스: 5) ✓
```

**결과**: ✅ 완벽하게 번호순 정렬됨 (이미지/비디오 타입 무관)

### 영상 생성 결과
```
씬 1: IMAGE 사용 - 01.jpg ✓
씬 2: IMAGE 사용 - 02.jpg ✓
씬 3: IMAGE 사용 - 03.jpg ✓
씬 4: VIDEO 사용 - 04.mp4 ✓
```

**참고**: 씬 5 (05.mp4)는 story.json에 씬이 4개만 있어서 사용되지 않음 (정상)

---

## 🔧 수정된 파일

### Frontend
1. `src/components/SortableMediaList.tsx`
   - `extractSequence` 함수 강화
   - 단순 번호 패턴 (`01.jpg`) 인식 추가

2. `src/app/api/generate-video-upload/route.ts`
   - 파일 저장 로직 확인 (이미 올바름)

### Backend
1. `create_video_from_folder.py`
   - 이미지 `extract_sequence` 함수 수정 (라인 425-460)
   - 비디오 `extract_sequence` 함수 수정 (라인 512-547)

2. `video_merge.py`
   - `extract_sequence` 함수 수정 (라인 956-992)

### 테스트 파일 (신규 작성)
1. `trend-video-frontend/__tests__/components/SortableMediaList.test.ts`
   - 13개 테스트 케이스
   - 실제 사용자 케이스 포함

2. `trend-video-backend/tests/test_media_sorting_regression.py`
   - 12개 테스트 케이스
   - Frontend와 동일한 로직 검증

---

## 📊 테스트 실행 방법

### Frontend
```bash
cd trend-video-frontend
npm test -- __tests__/components/SortableMediaList.test.ts
```

### Backend
```bash
cd trend-video-backend
python -m pytest tests/test_media_sorting_regression.py -v
```

---

## ✅ 결론

**모든 테스트가 통과했으며, 정렬 로직이 요구사항대로 정확히 동작합니다.**

- ✅ 번호가 있으면 **무조건 번호순** 정렬
- ✅ 번호가 없거나 같으면 **오래된순** 정렬
- ✅ **파일 타입(이미지/비디오)과 무관**하게 번호만 보고 정렬
- ✅ Frontend와 Backend 정렬 로직 **완벽 동기화**
- ✅ 실제 업로드 폴더 케이스 검증 완료

---

**작성일**: 2025-11-13
**테스트 버전**: Frontend v1.0 / Backend v1.0
**테스트 통과율**: 100% (25/25)
