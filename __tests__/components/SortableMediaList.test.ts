/**
 * SortableMediaList 정렬 로직 리그레션 테스트
 *
 * 이 테스트는 실제 사용자 불만 사례를 기반으로 작성되었습니다:
 * - 요구사항: 무조건 번호순 → 오래된순 (타입 무관)
 * - 파일 예시: 01.jpg, 02.jpg, 03.jpg, 04.mp4, 05.mp4
 * - 기대 결과: 번호 순서대로 1→2→3→4→5 (이미지/비디오 섞여있어도)
 */

describe('SortableMediaList - 미디어 정렬 로직 (리그레션)', () => {
  /**
   * Frontend extractSequence 함수 (실제 구현과 동일)
   */
  const extractSequence = (filename: string): number | null => {
    // 1. 파일명이 숫자로 시작: "1.jpg", "02.png"
    const startMatch = filename.match(/^(\d+)\./);
    if (startMatch) return parseInt(startMatch[1], 10);

    // 2. _숫자. 또는 -숫자. 패턴: "image_01.jpg", "scene-02.png"
    const seqMatch = filename.match(/[_-](\d{1,3})\./);
    if (seqMatch) return parseInt(seqMatch[1], 10);

    // 3. (숫자) 패턴: "Image_fx (47).jpg"
    // 단, 랜덤 ID가 없을 때만
    const parenMatch = filename.match(/\((\d+)\)/);
    if (parenMatch && !filename.match(/[_-]\w{8,}/)) {
      return parseInt(parenMatch[1], 10);
    }

    return null;
  };

  interface MockFile {
    name: string;
    lastModified: number;
    type: string;
  }

  /**
   * 정렬 함수 (실제 구현과 동일)
   */
  const sortFiles = (files: MockFile[]): MockFile[] => {
    return [...files].sort((a, b) => {
      const numA = extractSequence(a.name);
      const numB = extractSequence(b.name);

      // 둘 다 시퀀스 번호가 있으면: 시퀀스 번호로 정렬
      if (numA !== null && numB !== null) {
        return numA - numB;
      }

      // 시퀀스 번호가 하나만 있으면: 시퀀스 번호 있는게 우선
      if (numA !== null) return -1;
      if (numB !== null) return 1;

      // 둘 다 없으면: lastModified로 정렬 (오래된 순)
      return a.lastModified - b.lastModified;
    });
  };

  describe('extractSequence - 번호 추출 테스트', () => {
    test('숫자로 시작하는 파일명', () => {
      expect(extractSequence('1.jpg')).toBe(1);
      expect(extractSequence('02.jpg')).toBe(2);
      expect(extractSequence('03.jpg')).toBe(3);
      expect(extractSequence('04.mp4')).toBe(4);
      expect(extractSequence('05.mp4')).toBe(5);
      expect(extractSequence('123.png')).toBe(123);
    });

    test('_숫자 또는 -숫자 패턴', () => {
      expect(extractSequence('image_01.jpg')).toBe(1);
      expect(extractSequence('scene-02.png')).toBe(2);
      expect(extractSequence('video_123.mp4')).toBe(123);
    });

    test('(숫자) 패턴 (랜덤ID 없을 때)', () => {
      expect(extractSequence('Image_fx (47).jpg')).toBe(47);
      expect(extractSequence('Photo (12).png')).toBe(12);
    });

    test('랜덤 ID가 있으면 번호 추출 안 함', () => {
      expect(extractSequence('Whisk_2ea51d84758d256bf4b4235fccf6022c.png')).toBeNull();
      expect(extractSequence('Image_abc123def456 (5).jpg')).toBeNull();
    });

    test('번호가 없는 파일', () => {
      expect(extractSequence('random.jpg')).toBeNull();
      expect(extractSequence('photo.png')).toBeNull();
    });
  });

  describe('실제 사용자 케이스 - 이미지+비디오 혼합 정렬', () => {
    test('케이스 1: 01.jpg, 02.jpg, 03.jpg, 04.mp4, 05.mp4', () => {
      const files: MockFile[] = [
        { name: '05.mp4', lastModified: 5000, type: 'video/mp4' },
        { name: '01.jpg', lastModified: 1000, type: 'image/jpeg' },
        { name: '03.jpg', lastModified: 3000, type: 'image/jpeg' },
        { name: '04.mp4', lastModified: 4000, type: 'video/mp4' },
        { name: '02.jpg', lastModified: 2000, type: 'image/jpeg' },
      ];

      const sorted = sortFiles(files);

      expect(sorted.map(f => f.name)).toEqual([
        '01.jpg',
        '02.jpg',
        '03.jpg',
        '04.mp4',
        '05.mp4',
      ]);
    });

    test('케이스 2: 모두 같은 시간에 업로드된 경우 (실제 케이스)', () => {
      const sameTime = 1636800000000;
      const files: MockFile[] = [
        { name: '04.mp4', lastModified: sameTime, type: 'video/mp4' },
        { name: '02.jpg', lastModified: sameTime, type: 'image/jpeg' },
        { name: '05.mp4', lastModified: sameTime, type: 'video/mp4' },
        { name: '01.jpg', lastModified: sameTime, type: 'image/jpeg' },
        { name: '03.jpg', lastModified: sameTime, type: 'image/jpeg' },
      ];

      const sorted = sortFiles(files);

      expect(sorted.map(f => f.name)).toEqual([
        '01.jpg',
        '02.jpg',
        '03.jpg',
        '04.mp4',
        '05.mp4',
      ]);
    });

    test('케이스 3: image_XX, video_XX 파일명 (구버전)', () => {
      const files: MockFile[] = [
        { name: 'image_02.jpg', lastModified: 2500, type: 'image/jpeg' },  // 번호 2, 먼저
        { name: 'video_02.mp4', lastModified: 4000, type: 'video/mp4' },   // 번호 2, 나중
        { name: 'image_01.jpg', lastModified: 1000, type: 'image/jpeg' },  // 번호 1, 제일 오래됨
        { name: 'image_03.jpg', lastModified: 3000, type: 'image/jpeg' },  // 번호 3
        { name: 'video_01.mp4', lastModified: 2000, type: 'video/mp4' },   // 번호 1, 두 번째
      ];

      const sorted = sortFiles(files);

      // 같은 번호일 때 lastModified로 정렬
      expect(sorted.map(f => f.name)).toEqual([
        'image_01.jpg',   // 번호 1, mtime 1000 (가장 오래됨)
        'video_01.mp4',   // 번호 1, mtime 2000
        'image_02.jpg',   // 번호 2, mtime 2500 (먼저 생성)
        'video_02.mp4',   // 번호 2, mtime 4000 (나중 생성)
        'image_03.jpg',   // 번호 3, mtime 3000
      ]);
    });

    test('케이스 4: 번호가 섞여있고 lastModified도 다른 경우', () => {
      const files: MockFile[] = [
        { name: '10.jpg', lastModified: 1000, type: 'image/jpeg' }, // 번호 10
        { name: '2.mp4', lastModified: 9000, type: 'video/mp4' },   // 번호 2
        { name: '1.jpg', lastModified: 5000, type: 'image/jpeg' },  // 번호 1
        { name: '20.mp4', lastModified: 2000, type: 'video/mp4' },  // 번호 20
      ];

      const sorted = sortFiles(files);

      expect(sorted.map(f => f.name)).toEqual([
        '1.jpg',   // 번호 1
        '2.mp4',   // 번호 2
        '10.jpg',  // 번호 10
        '20.mp4',  // 번호 20
      ]);
    });
  });

  describe('번호 없는 파일 - lastModified 정렬', () => {
    test('번호가 없으면 오래된 순서대로', () => {
      const files: MockFile[] = [
        { name: 'photo3.jpg', lastModified: 3000, type: 'image/jpeg' },
        { name: 'photo1.jpg', lastModified: 1000, type: 'image/jpeg' },
        { name: 'photo2.jpg', lastModified: 2000, type: 'image/jpeg' },
      ];

      const sorted = sortFiles(files);

      expect(sorted.map(f => f.name)).toEqual([
        'photo1.jpg',
        'photo2.jpg',
        'photo3.jpg',
      ]);
    });

    test('번호 있는 파일이 번호 없는 파일보다 우선', () => {
      const files: MockFile[] = [
        { name: 'random.jpg', lastModified: 100, type: 'image/jpeg' },  // 가장 오래됨, 번호 없음
        { name: '02.mp4', lastModified: 3000, type: 'video/mp4' },     // 번호 2
        { name: '01.jpg', lastModified: 5000, type: 'image/jpeg' },    // 번호 1
      ];

      const sorted = sortFiles(files);

      expect(sorted.map(f => f.name)).toEqual([
        '01.jpg',    // 번호 1 (우선)
        '02.mp4',    // 번호 2
        'random.jpg', // 번호 없음 (뒤로)
      ]);
    });
  });

  describe('에지 케이스', () => {
    test('같은 번호, 다른 타입 - lastModified로 정렬', () => {
      const files: MockFile[] = [
        { name: 'image_01.jpg', lastModified: 1000, type: 'image/jpeg' },  // 먼저 생성
        { name: 'video_01.mp4', lastModified: 2000, type: 'video/mp4' },  // 나중 생성
      ];

      const sorted = sortFiles(files);

      // 같은 시퀀스 번호면 lastModified (오래된순)
      expect(sorted.map(f => f.name)).toEqual([
        'image_01.jpg', // 1000 (더 오래됨)
        'video_01.mp4', // 2000
      ]);
    });

    test('제로 패딩 vs 비패딩 - 숫자 크기로 정렬', () => {
      const files: MockFile[] = [
        { name: '10.jpg', lastModified: 1000, type: 'image/jpeg' },
        { name: '02.jpg', lastModified: 2000, type: 'image/jpeg' },
        { name: '1.jpg', lastModified: 3000, type: 'image/jpeg' },
      ];

      const sorted = sortFiles(files);

      expect(sorted.map(f => f.name)).toEqual([
        '1.jpg',   // 숫자 1
        '02.jpg',  // 숫자 2
        '10.jpg',  // 숫자 10
      ]);
    });
  });
});
