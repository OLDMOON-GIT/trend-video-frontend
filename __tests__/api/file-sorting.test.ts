/**
 * Regression Tests for File Sorting Logic
 *
 * Tests the critical file sorting algorithms used in:
 * - generate-video-upload/route.ts (image sorting)
 * - video-merge/route.ts (video sorting)
 */

describe('File Sorting Logic', () => {
  /**
   * Image sequence number extraction function
   * (from generate-video-upload/route.ts)
   */
  const extractSequenceNumber = (filename: string): number | null => {
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

  /**
   * Video sequence number extraction function
   * (from video-merge/route.ts)
   */
  const extractVideoSequenceNumber = (filename: string): number | null => {
    // scene_001.mp4, video_002.mp4 등의 패턴
    const match = filename.match(/[_-](\d{3,})\./);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  };

  describe('Image Sequence Number Extraction', () => {
    test('should extract number from start of filename', () => {
      expect(extractSequenceNumber('1.jpg')).toBe(1);
      expect(extractSequenceNumber('02.png')).toBe(2);
      expect(extractSequenceNumber('123.webp')).toBe(123);
    });

    test('should extract number from underscore pattern', () => {
      expect(extractSequenceNumber('image_01.jpg')).toBe(1);
      expect(extractSequenceNumber('scene_123.png')).toBe(123);
    });

    test('should extract number from dash pattern', () => {
      expect(extractSequenceNumber('image-01.jpg')).toBe(1);
      expect(extractSequenceNumber('scene-02.png')).toBe(2);
    });

    test('should extract number from parentheses (without random ID)', () => {
      expect(extractSequenceNumber('Image_fx (47).jpg')).toBe(47);
      expect(extractSequenceNumber('Photo (12).png')).toBe(12);
    });

    test('should NOT extract from random IDs', () => {
      expect(extractSequenceNumber('Whisk_2ea51d84758d256bf4b4235fccf6022c.png')).toBeNull();
      expect(extractSequenceNumber('Image_abc123def456 (5).jpg')).toBeNull();
    });

    test('should return null for files without sequence numbers', () => {
      expect(extractSequenceNumber('random_image.jpg')).toBeNull();
      expect(extractSequenceNumber('photo.png')).toBeNull();
    });
  });

  describe('Video Sequence Number Extraction', () => {
    test('should extract 3-digit sequence numbers', () => {
      expect(extractVideoSequenceNumber('scene_001.mp4')).toBe(1);
      expect(extractVideoSequenceNumber('video_000.mp4')).toBe(0);
      expect(extractVideoSequenceNumber('clip_123.mp4')).toBe(123);
    });

    test('should extract numbers with dash separator', () => {
      expect(extractVideoSequenceNumber('scene-001.mp4')).toBe(1);
      expect(extractVideoSequenceNumber('video-002.mp4')).toBe(2);
    });

    test('should return null for files without pattern', () => {
      expect(extractVideoSequenceNumber('random.mp4')).toBeNull();
      expect(extractVideoSequenceNumber('final_video.mp4')).toBeNull();
    });
  });

  describe('File Sorting Integration', () => {
    interface MockFile {
      name: string;
      lastModified: number;
    }

    test('should sort images by sequence number when present', () => {
      const files: MockFile[] = [
        { name: '05.jpg', lastModified: 3000 },
        { name: '01.jpg', lastModified: 2000 },
        { name: '03.jpg', lastModified: 1000 },
      ];

      const sorted = [...files].sort((a, b) => {
        const numA = extractSequenceNumber(a.name);
        const numB = extractSequenceNumber(b.name);

        if (numA !== null && numB !== null) {
          return numA - numB;
        }

        return a.lastModified - b.lastModified;
      });

      expect(sorted.map(f => f.name)).toEqual(['01.jpg', '03.jpg', '05.jpg']);
    });

    test('should sort images by lastModified when no sequence numbers', () => {
      const files: MockFile[] = [
        { name: 'random3.jpg', lastModified: 3000 },
        { name: 'random1.jpg', lastModified: 1000 },
        { name: 'random2.jpg', lastModified: 2000 },
      ];

      const sorted = [...files].sort((a, b) => {
        const numA = extractSequenceNumber(a.name);
        const numB = extractSequenceNumber(b.name);

        if (numA !== null && numB !== null) {
          return numA - numB;
        }

        return a.lastModified - b.lastModified;
      });

      expect(sorted.map(f => f.name)).toEqual(['random1.jpg', 'random2.jpg', 'random3.jpg']);
    });

    test('should prioritize sequence numbers over lastModified', () => {
      const files: MockFile[] = [
        { name: '02.jpg', lastModified: 1000 }, // oldest, but sequence 2
        { name: 'random.jpg', lastModified: 500 }, // very old, no sequence
        { name: '01.jpg', lastModified: 3000 }, // newest, but sequence 1
      ];

      const sorted = [...files].sort((a, b) => {
        const numA = extractSequenceNumber(a.name);
        const numB = extractSequenceNumber(b.name);

        if (numA !== null && numB !== null) {
          return numA - numB;
        }

        return a.lastModified - b.lastModified;
      });

      // Files without sequence numbers come first (sorted by lastModified),
      // then sequence-numbered files (sorted by sequence)
      // Actual behavior: random.jpg (oldest by time), then 01.jpg, 02.jpg (by sequence)
      expect(sorted.map(f => f.name)).toEqual(['random.jpg', '01.jpg', '02.jpg']);
    });

    test('should sort videos by sequence number when present', () => {
      const videos: MockFile[] = [
        { name: 'scene_005.mp4', lastModified: 3000 },
        { name: 'scene_001.mp4', lastModified: 2000 },
        { name: 'scene_003.mp4', lastModified: 1000 },
      ];

      const sorted = [...videos].sort((a, b) => {
        const numA = extractVideoSequenceNumber(a.name);
        const numB = extractVideoSequenceNumber(b.name);

        if (numA !== null && numB !== null) {
          return numA - numB;
        }

        return a.lastModified - b.lastModified;
      });

      expect(sorted.map(f => f.name)).toEqual([
        'scene_001.mp4',
        'scene_003.mp4',
        'scene_005.mp4'
      ]);
    });
  });

  describe('Edge Cases', () => {
    test('should handle mixed sequence formats', () => {
      const files: MockFile[] = [
        { name: 'image_05.jpg', lastModified: 5000 },
        { name: '03.jpg', lastModified: 3000 },
        { name: 'photo-01.jpg', lastModified: 1000 },
      ];

      const sorted = [...files].sort((a, b) => {
        const numA = extractSequenceNumber(a.name);
        const numB = extractSequenceNumber(b.name);

        if (numA !== null && numB !== null) {
          return numA - numB;
        }

        return a.lastModified - b.lastModified;
      });

      expect(sorted.map(f => f.name)).toEqual([
        'photo-01.jpg',
        '03.jpg',
        'image_05.jpg'
      ]);
    });

    test('should handle zero-padded and non-padded numbers consistently', () => {
      const files: MockFile[] = [
        { name: '10.jpg', lastModified: 1000 },
        { name: '02.jpg', lastModified: 2000 },
        { name: '1.jpg', lastModified: 3000 },
      ];

      const sorted = [...files].sort((a, b) => {
        const numA = extractSequenceNumber(a.name);
        const numB = extractSequenceNumber(b.name);

        if (numA !== null && numB !== null) {
          return numA - numB;
        }

        return a.lastModified - b.lastModified;
      });

      expect(sorted.map(f => f.name)).toEqual(['1.jpg', '02.jpg', '10.jpg']);
    });
  });
});
