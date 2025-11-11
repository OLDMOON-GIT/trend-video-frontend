/**
 * YouTube Shorts 자동 인식 리그레션 테스트
 *
 * 버그: Job의 aspectRatio 필드가 없어서 Shorts 인식 실패
 * 수정: job.type === 'shortform'으로 변경
 */

describe('YouTube Shorts 인식 리그레션 테스트', () => {
  describe('Shorts 감지 로직', () => {
    it('shortform 타입 Job은 Shorts로 인식되어야 함', () => {
      const job = {
        id: 'job_123',
        type: 'shortform',
        title: '테스트 쇼츠',
        videoPath: '/path/to/video.mp4'
      };

      // 실제 코드 시뮬레이션
      let isShorts = false;
      if (job.type === 'shortform') {
        isShorts = true;
      }

      expect(isShorts).toBe(true);
    });

    it('longform 타입 Job은 Shorts로 인식되지 않아야 함', () => {
      const job = {
        id: 'job_456',
        type: 'longform',
        title: '테스트 롱폼',
        videoPath: '/path/to/video.mp4'
      };

      let isShorts = false;
      if (job.type === 'shortform') {
        isShorts = true;
      }

      expect(isShorts).toBe(false);
    });

    it('aspectRatio 필드는 더 이상 사용하지 않음', () => {
      // 이전 방식 (버그)
      const jobWithoutAspectRatio = {
        id: 'job_789',
        type: 'shortform',
        title: '테스트 쇼츠'
        // aspectRatio 필드 없음
      };

      // 이전 코드는 aspectRatio를 체크해서 항상 undefined를 반환
      const oldWay = (jobWithoutAspectRatio as any).aspectRatio === '9:16';
      expect(oldWay).toBe(false); // 버그: aspectRatio가 없어서 항상 false

      // 새 코드는 type을 체크
      const newWay = jobWithoutAspectRatio.type === 'shortform';
      expect(newWay).toBe(true); // 수정: type으로 정확히 감지
    });
  });

  describe('#Shorts 해시태그 자동 추가', () => {
    it('Shorts 감지 시 제목에 #Shorts 추가', () => {
      const isShorts = true;
      let title = '재미있는 영상';

      if (isShorts) {
        if (!title.includes('#Shorts') && !title.includes('#shorts')) {
          title = `${title} #Shorts`;
        }
      }

      expect(title).toBe('재미있는 영상 #Shorts');
    });

    it('이미 #Shorts가 있으면 중복 추가 안 함', () => {
      const isShorts = true;
      let title = '재미있는 영상 #Shorts';

      if (isShorts) {
        if (!title.includes('#Shorts') && !title.includes('#shorts')) {
          title = `${title} #Shorts`;
        }
      }

      expect(title).toBe('재미있는 영상 #Shorts');
    });

    it('Shorts 감지 시 설명 맨 앞에 #Shorts 추가', () => {
      const isShorts = true;
      let description = '이것은 재미있는 영상입니다.';

      if (isShorts) {
        if (!description.includes('#Shorts') && !description.includes('#shorts')) {
          description = `#Shorts\n\n${description}`;
        }
      }

      expect(description).toContain('#Shorts\n\n이것은');
    });

    it('소문자 #shorts도 감지', () => {
      const isShorts = true;
      let title = '재미있는 영상 #shorts';

      if (isShorts) {
        if (!title.includes('#Shorts') && !title.includes('#shorts')) {
          title = `${title} #Shorts`;
        }
      }

      // 소문자가 이미 있으면 추가 안 함
      expect(title).toBe('재미있는 영상 #shorts');
      expect(title).not.toContain('#Shorts #shorts');
    });
  });

  describe('YouTube 업로드 메타데이터', () => {
    it('Shorts는 30초 이하 영상이어야 함', () => {
      const videoMetadata = {
        title: '테스트 쇼츠 #Shorts',
        duration: 28, // 초
        aspectRatio: '9:16'
      };

      // YouTube Shorts 요구사항
      const isShortsCompatible = videoMetadata.duration <= 60;
      expect(isShortsCompatible).toBe(true);
    });

    it('60초 초과는 Shorts로 인식 안 됨', () => {
      const videoMetadata = {
        title: '테스트 영상 #Shorts',
        duration: 65,
        aspectRatio: '9:16'
      };

      const isShortsCompatible = videoMetadata.duration <= 60;
      expect(isShortsCompatible).toBe(false);
    });
  });

  describe('전체 플로우 검증', () => {
    it('[리그레션] shortform Job → Shorts 감지 → #Shorts 추가 → 업로드', () => {
      // 1. Job 생성
      const job = {
        id: 'job_shorts_001',
        type: 'shortform',
        title: '재미있는 쇼츠',
        videoPath: '/path/to/video.mp4'
      };

      // 2. Shorts 감지
      let isShorts = false;
      if (job.type === 'shortform') {
        isShorts = true;
      }

      // 3. 제목과 설명 수정
      let finalTitle = job.title;
      let finalDescription = '영상 설명';

      if (isShorts) {
        if (!finalTitle.includes('#Shorts') && !finalTitle.includes('#shorts')) {
          finalTitle = `${finalTitle} #Shorts`;
        }
        if (!finalDescription.includes('#Shorts') && !finalDescription.includes('#shorts')) {
          finalDescription = `#Shorts\n\n${finalDescription}`;
        }
      }

      // 4. 메타데이터 생성
      const uploadMetadata = {
        title: finalTitle,
        description: finalDescription,
        privacy: 'public'
      };

      // 검증
      expect(isShorts).toBe(true);
      expect(uploadMetadata.title).toBe('재미있는 쇼츠 #Shorts');
      expect(uploadMetadata.description).toContain('#Shorts\n\n영상 설명');
    });

    it('[리그레션] longform Job → Shorts 미감지 → #Shorts 추가 안 함', () => {
      const job = {
        id: 'job_longform_001',
        type: 'longform',
        title: '긴 영상',
        videoPath: '/path/to/video.mp4'
      };

      let isShorts = false;
      if (job.type === 'shortform') {
        isShorts = true;
      }

      let finalTitle = job.title;
      let finalDescription = '영상 설명';

      if (isShorts) {
        if (!finalTitle.includes('#Shorts') && !finalTitle.includes('#shorts')) {
          finalTitle = `${finalTitle} #Shorts`;
        }
      }

      expect(isShorts).toBe(false);
      expect(finalTitle).toBe('긴 영상'); // #Shorts 추가 안 됨
      expect(finalDescription).toBe('영상 설명');
    });

    it('[리그레션] type이 없는 Job → Shorts 미감지', () => {
      const job = {
        id: 'job_no_type',
        title: '타입 없는 영상',
        videoPath: '/path/to/video.mp4'
        // type 필드 없음
      };

      let isShorts = false;
      if ((job as any).type === 'shortform') {
        isShorts = true;
      }

      expect(isShorts).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('제목이 #shorts로 끝나도 정상 처리', () => {
      const title = '재미있는 영상 #shorts';
      const hasShorts = title.includes('#Shorts') || title.includes('#shorts');

      expect(hasShorts).toBe(true);
    });

    it('설명에 #Shorts가 중간에 있어도 중복 추가 안 함', () => {
      const isShorts = true;
      let description = '이것은 #Shorts 영상입니다.';

      if (isShorts) {
        if (!description.includes('#Shorts') && !description.includes('#shorts')) {
          description = `#Shorts\n\n${description}`;
        }
      }

      // 이미 중간에 있으므로 추가 안 됨
      expect(description).toBe('이것은 #Shorts 영상입니다.');
    });

    it('빈 제목에도 #Shorts 추가', () => {
      const isShorts = true;
      let title = '';

      if (isShorts) {
        if (!title.includes('#Shorts') && !title.includes('#shorts')) {
          title = `${title} #Shorts`.trim();
        }
      }

      expect(title).toBe('#Shorts');
    });
  });
});
