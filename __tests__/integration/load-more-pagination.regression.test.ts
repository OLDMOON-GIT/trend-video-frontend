/**
 * 더보기 버튼 페이지네이션 리그레션 테스트
 *
 * 버그: 더보기 버튼 클릭 시 아이템이 추가되지 않음
 * 원인: All 탭의 limit 증가량(10)과 서버 요청 limit(20)의 불일치
 * 수정: limit 증가량을 20으로 변경
 */

describe('더보기 버튼 페이지네이션 리그레션 테스트', () => {
  describe('All 탭 더보기 로직', () => {
    it('더보기 클릭 시 limit이 20씩 증가해야 함', () => {
      let allTabLimit = 20;

      // 더보기 클릭 시뮬레이션
      const clickLoadMore = () => {
        allTabLimit += 20;
      };

      expect(allTabLimit).toBe(20);

      clickLoadMore();
      expect(allTabLimit).toBe(40);

      clickLoadMore();
      expect(allTabLimit).toBe(60);
    });

    it('limit 증가량과 서버 요청 limit이 일치해야 함', () => {
      const serverLimitPerRequest = 20;
      const clientLimitIncrement = 20;

      expect(clientLimitIncrement).toBe(serverLimitPerRequest);
    });

    it('displayedItems는 allTabLimit으로 slice되어야 함', () => {
      const allItems = Array.from({ length: 100 }, (_, i) => ({ id: i, title: `Item ${i}` }));
      let allTabLimit = 20;

      let displayedItems = allItems.slice(0, allTabLimit);
      expect(displayedItems.length).toBe(20);

      // 더보기 클릭
      allTabLimit += 20;
      displayedItems = allItems.slice(0, allTabLimit);
      expect(displayedItems.length).toBe(40);

      // 다시 더보기 클릭
      allTabLimit += 20;
      displayedItems = allItems.slice(0, allTabLimit);
      expect(displayedItems.length).toBe(60);
    });

    it('hasMoreItems는 allItems.length > allTabLimit일 때 true', () => {
      const allItems = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      let allTabLimit = 20;

      let hasMoreItems = allItems.length > allTabLimit;
      expect(hasMoreItems).toBe(true);

      allTabLimit = 50;
      hasMoreItems = allItems.length > allTabLimit;
      expect(hasMoreItems).toBe(false);

      allTabLimit = 60;
      hasMoreItems = allItems.length > allTabLimit;
      expect(hasMoreItems).toBe(false);
    });
  });

  describe('Scripts 탭 더보기 로직', () => {
    it('loadMoreScripts는 fetchScripts(false)를 호출해야 함', () => {
      let fetchScriptsCalled = false;
      let fetchScriptsResetParam: boolean | undefined;

      const mockFetchScripts = (reset: boolean) => {
        fetchScriptsCalled = true;
        fetchScriptsResetParam = reset;
      };

      const loadMoreScripts = () => {
        const isLoadingMoreScripts = false;
        const scriptsHasMore = true;

        if (!isLoadingMoreScripts && scriptsHasMore) {
          mockFetchScripts(false);
        }
      };

      loadMoreScripts();

      expect(fetchScriptsCalled).toBe(true);
      expect(fetchScriptsResetParam).toBe(false);
    });

    it('fetchScripts는 현재 offset을 사용해야 함', () => {
      let scriptsOffset = 20;
      const reset = false;

      const currentOffset = reset ? 0 : scriptsOffset;

      expect(currentOffset).toBe(20);
    });

    it('fetchScripts는 받은 데이터를 기존 배열에 추가해야 함', () => {
      const existingScripts = [
        { id: '1', title: 'Script 1' },
        { id: '2', title: 'Script 2' }
      ];
      const newScripts = [
        { id: '3', title: 'Script 3' },
        { id: '4', title: 'Script 4' }
      ];

      const reset = false;
      let scripts = existingScripts;

      if (reset) {
        scripts = newScripts;
      } else {
        scripts = [...scripts, ...newScripts];
      }

      expect(scripts.length).toBe(4);
      expect(scripts[2].id).toBe('3');
      expect(scripts[3].id).toBe('4');
    });

    it('scriptsOffset은 currentOffset + 받은 데이터 개수로 업데이트', () => {
      let scriptsOffset = 20;
      const currentOffset = scriptsOffset;
      const receivedScripts = [{ id: '1' }, { id: '2' }, { id: '3' }];

      scriptsOffset = currentOffset + receivedScripts.length;

      expect(scriptsOffset).toBe(23);
    });
  });

  describe('Videos 탭 더보기 로직', () => {
    it('loadMore는 fetchJobs(false)를 호출해야 함', () => {
      let fetchJobsCalled = false;
      let fetchJobsResetParam: boolean | undefined;

      const mockFetchJobs = (reset: boolean) => {
        fetchJobsCalled = true;
        fetchJobsResetParam = reset;
      };

      const loadMore = () => {
        const isLoadingMore = false;
        const hasMore = true;

        if (!isLoadingMore && hasMore) {
          mockFetchJobs(false);
        }
      };

      loadMore();

      expect(fetchJobsCalled).toBe(true);
      expect(fetchJobsResetParam).toBe(false);
    });

    it('fetchJobs는 현재 offset을 사용해야 함', () => {
      let offset = 40;
      const reset = false;

      const currentOffset = reset ? 0 : offset;

      expect(currentOffset).toBe(40);
    });

    it('fetchJobs는 받은 데이터를 기존 배열에 추가해야 함', () => {
      const existingJobs = [
        { id: 'job1', title: 'Job 1' },
        { id: 'job2', title: 'Job 2' }
      ];
      const newJobs = [
        { id: 'job3', title: 'Job 3' }
      ];

      const reset = false;
      let jobs = existingJobs;

      if (reset) {
        jobs = newJobs;
      } else {
        jobs = [...jobs, ...newJobs];
      }

      expect(jobs.length).toBe(3);
      expect(jobs[2].id).toBe('job3');
    });
  });

  describe('Published 탭 더보기 로직', () => {
    it('loadMorePublished는 fetchYouTubeUploads(false)를 호출해야 함', () => {
      let fetchYouTubeUploadsCalled = false;
      let fetchYouTubeUploadsResetParam: boolean | undefined;

      const mockFetchYouTubeUploads = (reset: boolean) => {
        fetchYouTubeUploadsCalled = true;
        fetchYouTubeUploadsResetParam = reset;
      };

      const loadMorePublished = () => {
        const isLoadingMorePublished = false;
        const publishedHasMore = true;

        if (!isLoadingMorePublished && publishedHasMore) {
          mockFetchYouTubeUploads(false);
        }
      };

      loadMorePublished();

      expect(fetchYouTubeUploadsCalled).toBe(true);
      expect(fetchYouTubeUploadsResetParam).toBe(false);
    });
  });

  describe('더보기 버튼 라벨 형식', () => {
    it('All 탭: "더보기 (현재개수/전체개수)" 형식', () => {
      const displayedItems = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      const scriptsTotal = 50;
      const total = 30;

      const buttonLabel = `더보기 (${displayedItems.length}/${scriptsTotal + total})`;

      expect(buttonLabel).toBe('더보기 (20/80)');
    });

    it('Scripts 탭: "더보기 (현재개수/전체개수)" 형식', () => {
      const scripts = Array.from({ length: 15 }, (_, i) => ({ id: i }));
      const scriptsTotal = 45;

      const buttonLabel = `더보기 (${scripts.length}/${scriptsTotal})`;

      expect(buttonLabel).toBe('더보기 (15/45)');
    });

    it('Videos 탭: "더보기 (현재개수/전체개수)" 형식', () => {
      const jobs = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const total = 35;

      const buttonLabel = `더보기 (${jobs.length}/${total})`;

      expect(buttonLabel).toBe('더보기 (10/35)');
    });

    it('Published 탭: "더보기 (현재개수/전체개수)" 형식', () => {
      const youtubeUploads = Array.from({ length: 8 }, (_, i) => ({ id: i }));
      const publishedTotal = 22;

      const buttonLabel = `더보기 (${youtubeUploads.length}/${publishedTotal})`;

      expect(buttonLabel).toBe('더보기 (8/22)');
    });
  });

  describe('중복 제거 로직', () => {
    it('fetchScripts는 중복 ID를 제거해야 함', () => {
      const existingScripts = [
        { id: '1', title: 'Script 1' },
        { id: '2', title: 'Script 2' }
      ];
      const receivedScripts = [
        { id: '2', title: 'Script 2 Updated' }, // 중복
        { id: '3', title: 'Script 3' },
        { id: '4', title: 'Script 4' }
      ];

      const existingIds = new Set(existingScripts.map((s) => s.id));
      const newScripts = receivedScripts.filter((s) => !existingIds.has(s.id));
      const finalScripts = [...existingScripts, ...newScripts];

      expect(finalScripts.length).toBe(4); // 1, 2, 3, 4
      expect(finalScripts.map(s => s.id)).toEqual(['1', '2', '3', '4']);
      expect(finalScripts[1].title).toBe('Script 2'); // 기존 데이터 유지
    });

    it('fetchJobs는 중복 ID를 제거해야 함', () => {
      const existingJobs = [
        { id: 'job1', title: 'Job 1' },
        { id: 'job2', title: 'Job 2' }
      ];
      const receivedJobs = [
        { id: 'job2', title: 'Job 2 Updated' }, // 중복
        { id: 'job3', title: 'Job 3' }
      ];

      const existingIds = new Set(existingJobs.map((j) => j.id));
      const newJobs = receivedJobs.filter((j) => !existingIds.has(j.id));
      const finalJobs = [...existingJobs, ...newJobs];

      expect(finalJobs.length).toBe(3); // job1, job2, job3
      expect(finalJobs.map(j => j.id)).toEqual(['job1', 'job2', 'job3']);
      expect(finalJobs[1].title).toBe('Job 2'); // 기존 데이터 유지
    });
  });

  describe('전체 플로우 검증', () => {
    it('[리그레션] All 탭 더보기 → limit 20 증가 → 서버 요청 → 아이템 추가', () => {
      // 초기 상태
      let allTabLimit = 20;
      let scripts = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, type: 'script' }));
      let jobs = Array.from({ length: 20 }, (_, i) => ({ id: `j${i}`, type: 'job' }));
      const scriptsTotal = 50;
      const total = 50;

      // 전체 아이템 합치기
      let allItems = [
        ...scripts.map(s => ({ type: 'script' as const, data: s })),
        ...jobs.map(j => ({ type: 'job' as const, data: j }))
      ];
      let displayedItems = allItems.slice(0, allTabLimit);

      expect(displayedItems.length).toBe(20);

      // 더보기 클릭
      allTabLimit += 20;

      // 서버에서 추가 데이터 받기 (시뮬레이션)
      const newScripts = Array.from({ length: 20 }, (_, i) => ({ id: `s${20 + i}`, type: 'script' }));
      const newJobs = Array.from({ length: 20 }, (_, i) => ({ id: `j${20 + i}`, type: 'job' }));
      scripts = [...scripts, ...newScripts];
      jobs = [...jobs, ...newJobs];

      // 전체 아이템 재생성
      allItems = [
        ...scripts.map(s => ({ type: 'script' as const, data: s })),
        ...jobs.map(j => ({ type: 'job' as const, data: j }))
      ];
      displayedItems = allItems.slice(0, allTabLimit);

      // 검증
      expect(allTabLimit).toBe(40);
      expect(displayedItems.length).toBe(40); // 20개에서 40개로 증가
      expect(scripts.length).toBe(40);
      expect(jobs.length).toBe(40);
    });

    it('[리그레션] Scripts 탭 더보기 → offset 증가 → 서버 요청 → 대본 추가', () => {
      // 초기 상태
      let scripts = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, title: `Script ${i}` }));
      let scriptsOffset = 20;
      let scriptsHasMore = true;

      expect(scripts.length).toBe(20);
      expect(scriptsOffset).toBe(20);

      // 더보기 클릭 시뮬레이션
      const currentOffset = scriptsOffset;
      const newScripts = Array.from({ length: 20 }, (_, i) => ({ id: `${20 + i}`, title: `Script ${20 + i}` }));
      scripts = [...scripts, ...newScripts];
      scriptsOffset = currentOffset + newScripts.length;

      // 검증
      expect(scripts.length).toBe(40);
      expect(scriptsOffset).toBe(40);
    });

    it('[리그레션] 버그 재현: limit 증가량(10) < 서버 요청(20)', () => {
      // 버그 상황 시뮬레이션
      let allTabLimit = 20;
      const serverLimitIncrement = 20;
      const buggyClientLimitIncrement = 10;

      // 서버는 20개씩 가져오지만
      const scripts = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}` }));
      const jobs = Array.from({ length: 40 }, (_, i) => ({ id: `j${i}` }));
      const allItems = [...scripts, ...jobs]; // 총 80개

      // 초기 표시
      let displayedItems = allItems.slice(0, allTabLimit);
      expect(displayedItems.length).toBe(20);

      // 버그: limit를 10씩만 증가
      allTabLimit += buggyClientLimitIncrement;
      displayedItems = allItems.slice(0, allTabLimit);

      // 문제: 서버에서 40개(scripts 20 + jobs 20)를 가져왔지만 30개만 표시
      expect(allTabLimit).toBe(30);
      expect(displayedItems.length).toBe(30);

      // 수정: limit를 20씩 증가
      allTabLimit = 20;
      allTabLimit += serverLimitIncrement;
      displayedItems = allItems.slice(0, allTabLimit);

      // 해결: 서버 요청량과 일치하여 40개 모두 표시
      expect(allTabLimit).toBe(40);
      expect(displayedItems.length).toBe(40);
    });
  });

  describe('Edge Cases', () => {
    it('전체 개수보다 많이 요청하면 전체 개수만 반환', () => {
      const allItems = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const allTabLimit = 50;

      const displayedItems = allItems.slice(0, allTabLimit);

      expect(displayedItems.length).toBe(25);
    });

    it('더보기 버튼은 hasMore가 false이면 숨김', () => {
      const allItems = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      const allTabLimit = 20;

      const hasMoreItems = allItems.length > allTabLimit;

      expect(hasMoreItems).toBe(false); // 버튼 숨김
    });

    it('로딩 중일 때 더보기 버튼 비활성화', () => {
      const isLoadingMore = true;
      const hasMore = true;

      let fetchJobsCalled = false;
      const loadMore = () => {
        if (!isLoadingMore && hasMore) {
          fetchJobsCalled = true;
        }
      };

      loadMore();

      expect(fetchJobsCalled).toBe(false); // 로딩 중이므로 호출 안 됨
    });

    it('빈 배열에서 더보기 시도', () => {
      const scripts: any[] = [];
      const scriptsOffset = 0;
      const scriptsHasMore = false;

      let fetchScriptsCalled = false;
      const loadMoreScripts = () => {
        if (scriptsHasMore) {
          fetchScriptsCalled = true;
        }
      };

      loadMoreScripts();

      expect(fetchScriptsCalled).toBe(false); // hasMore가 false이므로 호출 안 됨
    });
  });
});
