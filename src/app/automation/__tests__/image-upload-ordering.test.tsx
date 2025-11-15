/**
 * 이미지 업로드 순서 검증 Jest 테스트
 * MediaUploadBox 컴포넌트의 정렬 로직 검증
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('이미지 업로드 순서 검증', () => {
  describe('MediaUploadBox 컴포넌트 코드 검증', () => {
    const componentPath = path.join(process.cwd(), 'src', 'components', 'MediaUploadBox.tsx');
    const content = fs.readFileSync(componentPath, 'utf-8');

    it('정렬 로직이 존재해야 함', () => {
      expect(content).toContain('combined.sort((a, b) => {');
      expect(content).toContain('extractSequenceNumber');
    });

    it('정렬 결과를 부모에 전달해야 함', () => {
      expect(content).toContain('onImagesChange(sortedImages)');
      expect(content).toContain('onVideosChange(sortedVideos)');
    });

    it('순서 변경 감지 로직이 있어야 함 (무한 루프 방지)', () => {
      expect(content).toContain('isOrderChanged');
      expect(content).toContain('if (isOrderChanged)');
    });

    it('sortedImages/sortedVideos 추출 로직이 있어야 함', () => {
      expect(content).toContain("const sortedImages = combined.filter(m => m.type === 'image')");
      expect(content).toContain("const sortedVideos = combined.filter(m => m.type === 'video')");
    });

    it('useEffect 의존성 배열이 올바르게 설정되어야 함', () => {
      expect(content).toContain('[uploadedImages, uploadedVideos, isManualSort]');
    });
  });

  describe('automation/page.tsx 코드 검증', () => {
    const pagePath = path.join(process.cwd(), 'src', 'app', 'automation', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');

    it('MediaUploadBox에 콜백을 전달해야 함', () => {
      expect(content).toContain('onImagesChange={');
      expect(content).toContain('onVideosChange={');
    });

    it('중복된 정렬 로직이 없어야 함 (handleImageSelect 제거)', () => {
      expect(content).not.toContain('function handleImageSelect');
      expect(content).not.toContain('const handleImageSelect');
    });

    it('스케줄별 상태 관리가 있어야 함', () => {
      expect(content).toContain('uploadedImagesFor');
      expect(content).toContain('setUploadedImagesFor');
    });
  });

  describe('정렬 로직 시뮬레이션', () => {
    // extractSequenceNumber 시뮬레이션
    function extractSequenceNumber(filename: string): number | null {
      const match = filename.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    }

    it('시퀀스 번호로 정렬되어야 함', () => {
      const files = [
        { name: '3_image.jpg', lastModified: 1000 },
        { name: '1_image.jpg', lastModified: 2000 },
        { name: '2_image.jpg', lastModified: 3000 }
      ];

      const sorted = [...files].sort((a, b) => {
        const numA = extractSequenceNumber(a.name);
        const numB = extractSequenceNumber(b.name);
        if (numA !== null && numB !== null) return numA - numB;
        if (numA !== null) return -1;
        if (numB !== null) return 1;
        return a.lastModified - b.lastModified;
      });

      expect(sorted[0].name).toBe('1_image.jpg');
      expect(sorted[1].name).toBe('2_image.jpg');
      expect(sorted[2].name).toBe('3_image.jpg');
    });

    it('시퀀스 번호가 없으면 lastModified로 정렬되어야 함', () => {
      const files = [
        { name: 'image_c.jpg', lastModified: 3000 },
        { name: 'image_a.jpg', lastModified: 1000 },
        { name: 'image_b.jpg', lastModified: 2000 }
      ];

      const sorted = [...files].sort((a, b) => {
        const numA = extractSequenceNumber(a.name);
        const numB = extractSequenceNumber(b.name);
        if (numA !== null && numB !== null) return numA - numB;
        if (numA !== null) return -1;
        if (numB !== null) return 1;
        return a.lastModified - b.lastModified;
      });

      expect(sorted[0].lastModified).toBe(1000);
      expect(sorted[1].lastModified).toBe(2000);
      expect(sorted[2].lastModified).toBe(3000);
    });

    it('혼합 정렬: 시퀀스 번호 우선, 그 다음 lastModified', () => {
      const files = [
        { name: 'image_z.jpg', lastModified: 5000 },  // 시퀀스 없음
        { name: '2_image.jpg', lastModified: 3000 },  // 시퀀스 2
        { name: 'image_a.jpg', lastModified: 4000 },  // 시퀀스 없음
        { name: '1_image.jpg', lastModified: 2000 }   // 시퀀스 1
      ];

      const sorted = [...files].sort((a, b) => {
        const numA = extractSequenceNumber(a.name);
        const numB = extractSequenceNumber(b.name);
        if (numA !== null && numB !== null) return numA - numB;
        if (numA !== null) return -1;
        if (numB !== null) return 1;
        return a.lastModified - b.lastModified;
      });

      // 시퀀스 번호 있는 것이 먼저, 그 다음 lastModified 순
      expect(sorted[0].name).toBe('1_image.jpg');
      expect(sorted[1].name).toBe('2_image.jpg');
      expect(sorted[2].lastModified).toBe(4000);
      expect(sorted[3].lastModified).toBe(5000);
    });
  });

  describe('코드 플로우 검증', () => {
    it('정렬된 순서가 부모 컴포넌트로 전달되어야 함', () => {
      const componentPath = path.join(process.cwd(), 'src', 'components', 'MediaUploadBox.tsx');
      const content = fs.readFileSync(componentPath, 'utf-8');

      // useEffect 내부에 onImagesChange와 onVideosChange 호출이 있어야 함
      const hasCallback = content.includes('onImagesChange(sortedImages)') &&
                         content.includes('onVideosChange(sortedVideos)');

      expect(hasCallback).toBe(true);
    });
  });
});
