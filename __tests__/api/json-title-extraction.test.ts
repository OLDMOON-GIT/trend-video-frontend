/**
 * Regression Tests for JSON Title Extraction
 *
 * Tests the title extraction logic used in video-merge/route.ts
 */

describe('JSON Title Extraction', () => {
  /**
   * Extract title from JSON content
   * (Logic from video-merge/route.ts)
   */
  const extractTitle = (content: string): string | null => {
    try {
      // Remove markdown code blocks if present
      const cleanContent = content
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const data = JSON.parse(cleanContent);
      return data.title || null;
    } catch (error) {
      return null;
    }
  };

  /**
   * Generate safe filename from title
   * (Logic from video-merge/route.ts)
   */
  const generateSafeFilename = (title: string): string => {
    // Remove Windows forbidden characters: < > : " / \ | ? *
    const safe = title.replace(/[<>:"/\\|?*]/g, '');
    // Trim and limit length
    return safe.trim().substring(0, 100);
  };

  describe('Title Extraction', () => {
    test('should extract title from simple JSON', () => {
      const json = JSON.stringify({
        title: '테스트 비디오',
        format: 'longform'
      });

      expect(extractTitle(json)).toBe('테스트 비디오');
    });

    test('should extract title from JSON with markdown code blocks', () => {
      const json = `\`\`\`json
{
  "title": "마크다운 코드블록 테스트",
  "format": "shortform"
}
\`\`\``;

      expect(extractTitle(json)).toBe('마크다운 코드블록 테스트');
    });

    test('should handle JSON with no title field', () => {
      const json = JSON.stringify({
        format: 'longform',
        scenes: []
      });

      expect(extractTitle(json)).toBeNull();
    });

    test('should handle invalid JSON', () => {
      const invalid = 'not a json string {';
      expect(extractTitle(invalid)).toBeNull();
    });

    test('should handle empty string', () => {
      expect(extractTitle('')).toBeNull();
    });

    test('should handle JSON with empty title', () => {
      const json = JSON.stringify({
        title: '',
        format: 'longform'
      });

      // Empty string is falsy, so should return null
      expect(extractTitle(json)).toBeNull();
    });

    test('should extract title from complex nested JSON', () => {
      const json = JSON.stringify({
        title: '복잡한 JSON 구조',
        metadata: {
          format: 'longform',
          aspect_ratio: '16:9'
        },
        scenes: [
          { scene_number: 1, text: 'Scene 1' },
          { scene_number: 2, text: 'Scene 2' }
        ]
      });

      expect(extractTitle(json)).toBe('복잡한 JSON 구조');
    });
  });

  describe('Safe Filename Generation', () => {
    test('should remove forbidden Windows characters', () => {
      expect(generateSafeFilename('test<>file')).toBe('testfile');
      expect(generateSafeFilename('test:file')).toBe('testfile');
      expect(generateSafeFilename('test"file')).toBe('testfile');
      expect(generateSafeFilename('test/file')).toBe('testfile');
      expect(generateSafeFilename('test\\file')).toBe('testfile');
      expect(generateSafeFilename('test|file')).toBe('testfile');
      expect(generateSafeFilename('test?file')).toBe('testfile');
      expect(generateSafeFilename('test*file')).toBe('testfile');
    });

    test('should remove multiple forbidden characters', () => {
      expect(generateSafeFilename('test:<>file*?')).toBe('testfile');
      expect(generateSafeFilename('a/b\\c|d"e')).toBe('abcde');
    });

    test('should trim whitespace', () => {
      expect(generateSafeFilename('  test file  ')).toBe('test file');
      expect(generateSafeFilename('\ttest\t')).toBe('test');
    });

    test('should limit length to 100 characters', () => {
      const longTitle = 'a'.repeat(150);
      const result = generateSafeFilename(longTitle);
      expect(result.length).toBe(100);
      expect(result).toBe('a'.repeat(100));
    });

    test('should preserve Korean and other Unicode characters', () => {
      expect(generateSafeFilename('한글 제목')).toBe('한글 제목');
      expect(generateSafeFilename('日本語タイトル')).toBe('日本語タイトル');
      expect(generateSafeFilename('Título español')).toBe('Título español');
    });

    test('should handle empty string', () => {
      expect(generateSafeFilename('')).toBe('');
    });

    test('should handle string with only forbidden characters', () => {
      expect(generateSafeFilename('<>:"/\\|?*')).toBe('');
    });
  });

  describe('Integration: Title to Filename', () => {
    const extractAndGenerateFilename = (jsonContent: string, defaultFilename: string): string => {
      const title = extractTitle(jsonContent);
      if (!title) {
        return defaultFilename;
      }
      const safeTitle = generateSafeFilename(title);
      return safeTitle || defaultFilename;
    };

    test('should generate safe filename from JSON title', () => {
      const json = JSON.stringify({
        title: '테스트 비디오 제목',
        format: 'longform'
      });

      expect(extractAndGenerateFilename(json, 'default.mp4')).toBe('테스트 비디오 제목');
    });

    test('should use default filename when no title', () => {
      const json = JSON.stringify({
        format: 'longform'
      });

      expect(extractAndGenerateFilename(json, 'final_with_narration.mp4'))
        .toBe('final_with_narration.mp4');
    });

    test('should sanitize title and use it as filename', () => {
      const json = JSON.stringify({
        title: '비디오: 2024년 <최고> 영상!',
        format: 'shortform'
      });

      expect(extractAndGenerateFilename(json, 'default.mp4'))
        .toBe('비디오 2024년 최고 영상!');
    });

    test('should handle title with only forbidden chars', () => {
      const json = JSON.stringify({
        title: '<>:"/\\|?*',
        format: 'longform'
      });

      expect(extractAndGenerateFilename(json, 'default.mp4'))
        .toBe('default.mp4');
    });
  });
});
