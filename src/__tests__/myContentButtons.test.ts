/**
 * 내 콘텐츠 페이지 버튼 구조 리그레션 테스트
 *
 * 목적: 탭별 버튼 순서와 개수가 일관성 있게 유지되는지 검증
 *
 * 테스트 규칙:
 * 1. 대본 탭이 가장 많은 버튼(12개)을 기준으로 함
 * 2. 전체 탭은 대본 탭과 동일한 버튼 순서를 따름
 * 3. 영상 탭과 대본 탭의 버튼 순서는 각각의 최적화된 구조를 유지
 */

describe('내 콘텐츠 버튼 구조 리그레션 테스트', () => {
  /**
   * 버튼 구조 정의
   */
  const buttonStructures = {
    // 전체 탭 - 영상 completed (9개)
    allTabVideo: [
      'YouTube 업로드',
      '읽어보기 (sourceContentId 있을 때)',
      '폴더 (admin)',
      '로그',
      '이미지크롤링',
      '저장',
      '쇼츠 (longform만)',
      '재시도',
      '삭제'
    ],

    // 전체 탭 - 대본 completed (12개)
    allTabScript: [
      '대본',
      '읽어보기',
      '이미지크롤링',
      '영상',
      '포멧팅',
      '복사',
      '로그',
      '저장',
      '변환 (longform/shortform만)',
      '상품정보 (product만)',
      '재시도',
      '삭제'
    ],

    // 영상 탭 - completed (9개)
    videoTab: [
      'YouTube 업로드',
      '읽어보기 (sourceContentId 있을 때)',
      '폴더 (admin)',
      '로그',
      '이미지크롤링',
      '저장',
      '쇼츠 (longform만)',
      '재시도',
      '삭제'
    ],

    // 대본 탭 - completed (12개)
    scriptTab: [
      '대본',
      '읽어보기',
      '이미지크롤링',
      '영상',
      '포멧팅',
      '복사',
      '로그',
      '저장',
      '변환 (longform/shortform만)',
      '상품정보 (product만)',
      '재시도',
      '삭제'
    ]
  };

  describe('버튼 개수 검증', () => {
    test('전체 탭 영상 카드는 9개 버튼을 가져야 함', () => {
      expect(buttonStructures.allTabVideo.length).toBe(9);
    });

    test('전체 탭 대본 카드는 12개 버튼을 가져야 함 (가장 많음)', () => {
      expect(buttonStructures.allTabScript.length).toBe(12);
    });

    test('영상 탭은 9개 버튼을 가져야 함', () => {
      expect(buttonStructures.videoTab.length).toBe(9);
    });

    test('대본 탭은 12개 버튼을 가져야 함', () => {
      expect(buttonStructures.scriptTab.length).toBe(12);
    });
  });

  describe('버튼 순서 검증', () => {
    test('전체 탭과 영상 탭의 영상 버튼 순서가 동일해야 함', () => {
      expect(buttonStructures.allTabVideo).toEqual(buttonStructures.videoTab);
    });

    test('전체 탭과 대본 탭의 대본 버튼 순서가 동일해야 함', () => {
      expect(buttonStructures.allTabScript).toEqual(buttonStructures.scriptTab);
    });
  });

  describe('필수 버튼 존재 검증', () => {
    describe('영상 카드 필수 버튼', () => {
      test('YouTube 업로드 버튼이 첫 번째 위치에 있어야 함', () => {
        expect(buttonStructures.allTabVideo[0]).toBe('YouTube 업로드');
        expect(buttonStructures.videoTab[0]).toBe('YouTube 업로드');
      });

      test('이미지크롤링 버튼이 반드시 포함되어야 함', () => {
        expect(buttonStructures.allTabVideo).toContain('이미지크롤링');
        expect(buttonStructures.videoTab).toContain('이미지크롤링');
      });

      test('쇼츠 버튼이 반드시 포함되어야 함', () => {
        expect(buttonStructures.allTabVideo).toContain('쇼츠 (longform만)');
        expect(buttonStructures.videoTab).toContain('쇼츠 (longform만)');
      });

      test('저장 버튼이 이미지크롤링 다음에 위치해야 함', () => {
        const allTabIndex = buttonStructures.allTabVideo.indexOf('저장');
        const imageIndex = buttonStructures.allTabVideo.indexOf('이미지크롤링');
        expect(allTabIndex).toBeGreaterThan(imageIndex);
      });

      test('삭제 버튼이 마지막 위치에 있어야 함', () => {
        expect(buttonStructures.allTabVideo[buttonStructures.allTabVideo.length - 1]).toBe('삭제');
        expect(buttonStructures.videoTab[buttonStructures.videoTab.length - 1]).toBe('삭제');
      });
    });

    describe('대본 카드 필수 버튼', () => {
      test('대본 버튼이 첫 번째 위치에 있어야 함', () => {
        expect(buttonStructures.allTabScript[0]).toBe('대본');
        expect(buttonStructures.scriptTab[0]).toBe('대본');
      });

      test('읽어보기 버튼이 두 번째 위치에 있어야 함', () => {
        expect(buttonStructures.allTabScript[1]).toBe('읽어보기');
        expect(buttonStructures.scriptTab[1]).toBe('읽어보기');
      });

      test('이미지크롤링 버튼이 세 번째 위치에 있어야 함', () => {
        expect(buttonStructures.allTabScript[2]).toBe('이미지크롤링');
        expect(buttonStructures.scriptTab[2]).toBe('이미지크롤링');
      });

      test('영상 버튼이 네 번째 위치에 있어야 함', () => {
        expect(buttonStructures.allTabScript[3]).toBe('영상');
        expect(buttonStructures.scriptTab[3]).toBe('영상');
      });

      test('삭제 버튼이 마지막 위치에 있어야 함', () => {
        expect(buttonStructures.allTabScript[buttonStructures.allTabScript.length - 1]).toBe('삭제');
        expect(buttonStructures.scriptTab[buttonStructures.scriptTab.length - 1]).toBe('삭제');
      });
    });
  });

  describe('조건부 버튼 검증', () => {
    test('쇼츠 버튼은 longform 타입에만 표시되어야 함', () => {
      const buttonLabel = '쇼츠 (longform만)';
      expect(buttonStructures.allTabVideo).toContain(buttonLabel);
      expect(buttonStructures.videoTab).toContain(buttonLabel);
    });

    test('변환 버튼은 longform/shortform 타입에만 표시되어야 함', () => {
      const buttonLabel = '변환 (longform/shortform만)';
      expect(buttonStructures.allTabScript).toContain(buttonLabel);
      expect(buttonStructures.scriptTab).toContain(buttonLabel);
    });

    test('상품정보 버튼은 product 타입에만 표시되어야 함', () => {
      const buttonLabel = '상품정보 (product만)';
      expect(buttonStructures.allTabScript).toContain(buttonLabel);
      expect(buttonStructures.scriptTab).toContain(buttonLabel);
    });

    test('읽어보기 버튼(영상)은 sourceContentId가 있을 때만 표시되어야 함', () => {
      const buttonLabel = '읽어보기 (sourceContentId 있을 때)';
      expect(buttonStructures.allTabVideo).toContain(buttonLabel);
      expect(buttonStructures.videoTab).toContain(buttonLabel);
    });

    test('폴더 버튼은 admin 권한이 있을 때만 표시되어야 함', () => {
      const buttonLabel = '폴더 (admin)';
      expect(buttonStructures.allTabVideo).toContain(buttonLabel);
      expect(buttonStructures.videoTab).toContain(buttonLabel);
    });
  });

  describe('버튼 그룹 순서 검증', () => {
    test('대본 카드: 액션 버튼 → 관리 버튼 → 위험 버튼 순서를 따라야 함', () => {
      const actionButtons = ['대본', '읽어보기', '이미지크롤링', '영상'];
      const manageButtons = ['포멧팅', '복사', '로그', '저장', '변환 (longform/shortform만)', '상품정보 (product만)', '재시도'];
      const dangerButtons = ['삭제'];

      const expectedOrder = [...actionButtons, ...manageButtons, ...dangerButtons];
      expect(buttonStructures.scriptTab).toEqual(expectedOrder);
    });

    test('영상 카드: 업로드 → 액션 버튼 → 관리 버튼 → 위험 버튼 순서를 따라야 함', () => {
      const uploadButton = ['YouTube 업로드'];
      const actionButtons = ['읽어보기 (sourceContentId 있을 때)', '폴더 (admin)', '로그', '이미지크롤링'];
      const manageButtons = ['저장', '쇼츠 (longform만)', '재시도'];
      const dangerButtons = ['삭제'];

      const expectedOrder = [...uploadButton, ...actionButtons, ...manageButtons, ...dangerButtons];
      expect(buttonStructures.videoTab).toEqual(expectedOrder);
    });
  });

  describe('통합 일관성 검증', () => {
    test('모든 탭에 저장 버튼이 반드시 포함되어야 함', () => {
      expect(buttonStructures.allTabVideo).toContain('저장');
      expect(buttonStructures.allTabScript).toContain('저장');
      expect(buttonStructures.videoTab).toContain('저장');
      expect(buttonStructures.scriptTab).toContain('저장');
    });

    test('모든 탭에 재시도 버튼이 반드시 포함되어야 함', () => {
      expect(buttonStructures.allTabVideo).toContain('재시도');
      expect(buttonStructures.allTabScript).toContain('재시도');
      expect(buttonStructures.videoTab).toContain('재시도');
      expect(buttonStructures.scriptTab).toContain('재시도');
    });

    test('모든 탭에 삭제 버튼이 마지막에 위치해야 함', () => {
      expect(buttonStructures.allTabVideo[buttonStructures.allTabVideo.length - 1]).toBe('삭제');
      expect(buttonStructures.allTabScript[buttonStructures.allTabScript.length - 1]).toBe('삭제');
      expect(buttonStructures.videoTab[buttonStructures.videoTab.length - 1]).toBe('삭제');
      expect(buttonStructures.scriptTab[buttonStructures.scriptTab.length - 1]).toBe('삭제');
    });

    test('모든 대본 카드에 이미지크롤링 버튼이 포함되어야 함', () => {
      expect(buttonStructures.allTabScript).toContain('이미지크롤링');
      expect(buttonStructures.scriptTab).toContain('이미지크롤링');
    });

    test('모든 영상 카드에 이미지크롤링 버튼이 포함되어야 함', () => {
      expect(buttonStructures.allTabVideo).toContain('이미지크롤링');
      expect(buttonStructures.videoTab).toContain('이미지크롤링');
    });
  });
});
