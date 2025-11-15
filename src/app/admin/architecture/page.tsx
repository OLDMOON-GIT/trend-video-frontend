'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import mermaid from 'mermaid';

type TabType = 'architecture' | 'erd';

export const dynamic = 'force-dynamic';

function ArchitectureContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<{ id: string; email: string; isAdmin: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mermaidInitialized = useRef(false);

  // 탭 상태 (URL에서 읽기)
  const [activeTab, setActiveTab] = useState<TabType>('architecture');

  // 다이어그램 확대 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSvg, setModalSvg] = useState<string>('');
  const [modalTable, setModalTable] = useState<string>(''); // 테이블 HTML 저장
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // AI 자동 업데이트 관련 상태
  const [updateInfo, setUpdateInfo] = useState<{
    lastUpdate: string | null;
    daysSinceLastCommit: number;
    needsUpdate: boolean;
    updateCount: number;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const getAuthHeaders = (): HeadersInit => {
    return {};
  };

  // URL에서 탭 읽기
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'erd') {
      setActiveTab('erd');
    } else {
      setActiveTab('architecture');
    }
  }, [searchParams]);

  useEffect(() => {
    checkAuth();
  }, []);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        handleCloseModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  useEffect(() => {
    if (!mermaidInitialized.current) {
      // Mermaid 초기화 - 매우 밝은 색상 테마 (가독성 최대화)
      mermaid.initialize({
        startOnLoad: true,
        theme: 'dark',
        themeVariables: {
          // 기본 색상 - 매우 밝은 보라색 계열
          primaryColor: '#d8b4fe',
          primaryTextColor: '#ffffff',
          primaryBorderColor: '#c4b5fd',

          // 선 및 화살표 - 매우 밝은 보라색
          lineColor: '#f3e8ff',

          // 보조 색상 - 매우 밝은 청록색
          secondaryColor: '#bfdbfe',
          secondaryTextColor: '#ffffff',
          secondaryBorderColor: '#93c5fd',

          // 3차 색상 - 매우 밝은 녹색
          tertiaryColor: '#bbf7d0',
          tertiaryTextColor: '#ffffff',
          tertiaryBorderColor: '#86efac',

          // 배경색 - 밝은 회색
          background: '#64748b',
          mainBkg: '#94a3b8',
          secondBkg: '#cbd5e1',

          // 텍스트 - 흰색으로 통일
          textColor: '#ffffff',
          labelTextColor: '#ffffff',
          fontSize: '16px',

          // 노트 및 액터 - 밝은 보라색
          noteBkgColor: '#c4b5fd',
          noteTextColor: '#ffffff',
          noteBorderColor: '#a78bfa',

          actorBkg: '#c4b5fd',
          actorTextColor: '#ffffff',
          actorBorder: '#a78bfa',
          actorLineColor: '#f3e8ff',

          // 그리드 및 축
          gridColor: '#cbd5e1',
          gridTextColor: '#ffffff',

          // 클래스 다이어그램 (ERD용) - 엔티티 박스
          classText: '#ffffff',

          // ERD 엔티티 색상
          entityBkg: '#7c3aed',
          entityBorder: '#a78bfa',
          entityTextColor: '#ffffff',

          // 속성 색상
          attributeBackgroundColorOdd: '#8b5cf6',
          attributeBackgroundColorEven: '#7c3aed',
        },
      });
      mermaidInitialized.current = true;
    }

    // 탭이 변경되거나 마크다운이 로드될 때 다이어그램 렌더링
    const renderMermaid = () => {
      setTimeout(() => {
        // .language-mermaid와 .mermaid 둘 다 렌더링
        const mermaidNodes = Array.from(document.querySelectorAll('.language-mermaid, .mermaid')) as HTMLElement[];
        mermaid.run({
          nodes: mermaidNodes,
        });

        // Mermaid 다이어그램의 모든 텍스트를 흰색으로 강제 설정
        const mermaidElements = document.querySelectorAll('.language-mermaid svg, .mermaid svg');
        mermaidElements.forEach((svg) => {
          // SVG 내 모든 text 요소를 흰색으로
          const textElements = svg.querySelectorAll('text, tspan');
          textElements.forEach((text) => {
            text.setAttribute('fill', '#ffffff');
            text.setAttribute('style', 'fill: #ffffff !important;');
          });

          (svg as HTMLElement).style.cursor = 'pointer';
          (svg as HTMLElement).onclick = () => handleDiagramClick(svg as SVGElement);
        });
      }, 100);
    };

    renderMermaid();
  }, []);

  // 탭 변경 시 Mermaid 재렌더링
  useEffect(() => {
    if (mermaidInitialized.current) {
      setTimeout(() => {
        // 현재 활성화된 탭의 다이어그램만 찾기
        const activeContent = document.querySelector(`[data-tab="${activeTab}"]`);
        if (!activeContent) return;

        // data-processed 속성 제거하여 강제 재렌더링
        const allMermaidNodes = activeContent.querySelectorAll('.language-mermaid, .mermaid');
        allMermaidNodes.forEach(node => {
          node.removeAttribute('data-processed');
        });

        // 다시 렌더링
        if (allMermaidNodes.length > 0) {
          mermaid.run({
            nodes: Array.from(allMermaidNodes) as HTMLElement[],
          });
        }

        // 다이어그램에 클릭 핸들러 추가
        setTimeout(() => {
          const mermaidElements = activeContent.querySelectorAll('.language-mermaid svg, .mermaid svg');
          mermaidElements.forEach((svg) => {
            // 텍스트 색상 흰색으로
            const textElements = svg.querySelectorAll('text, tspan');
            textElements.forEach((text) => {
              text.setAttribute('fill', '#ffffff');
              text.setAttribute('style', 'fill: #ffffff !important;');
            });

            (svg as HTMLElement).style.cursor = 'pointer';
            (svg as HTMLElement).onclick = () => handleDiagramClick(svg as SVGElement);
          });
        }, 100);
      }, 300);
    }
  }, [activeTab]);

  // 다이어그램 클릭 핸들러
  const handleDiagramClick = (svg: SVGElement) => {
    const svgClone = svg.cloneNode(true) as SVGElement;
    setModalSvg(svgClone.outerHTML);
    setModalTable(''); // 테이블 초기화
    setZoomLevel(300); // 300%로 시작
    setPosition({ x: 0, y: 0 });
    setIsModalOpen(true);
  };

  // 테이블 클릭 핸들러
  const handleTableClick = (element: HTMLElement) => {
    setModalTable(element.outerHTML);
    setModalSvg(''); // SVG 초기화
    setZoomLevel(150); // 150%로 시작
    setPosition({ x: 0, y: 0 });
    setIsModalOpen(true);
  };

  // 확대
  const handleZoomIn = () => {
    setZoomLevel((prev) => {
      // 100%일 때는 150%로 점프
      if (prev === 100) {
        return 150;
      }
      // 그 외에는 25%씩 증가, 최대 1500%
      return Math.min(prev + 25, 1500);
    });
  };

  // 축소
  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 25, 50));
  };

  // 리셋
  const handleZoomReset = () => {
    setZoomLevel(100);
    setPosition({ x: 0, y: 0 });
  };

  // 모달 닫기
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalSvg('');
    setModalTable('');
  };

  // 드래그 시작
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  // 드래그 중
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  // 드래그 종료
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 마우스 휠로 확대/축소
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      // 휠 올림 = 확대
      setZoomLevel((prev) => Math.min(prev + 10, 1500));
    } else {
      // 휠 내림 = 축소
      setZoomLevel((prev) => Math.max(prev - 10, 50));
    }
  };

  // 탭 변경 핸들러
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'erd') {
      router.push('/admin/architecture?tab=erd');
    } else {
      router.push('/admin/architecture');
    }
  };

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session', {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await response.json();

      if (!data.user || !data.user.isAdmin) {
        alert('관리자 권한이 필요합니다.');
        router.push('/');
        return;
      }

      setUser(data.user);

      // 인증 성공 후 업데이트 정보 로드
      loadUpdateInfo();
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/auth');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUpdateInfo = async () => {
    try {
      const response = await fetch('/api/admin/architecture/auto-update', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setUpdateInfo({
          lastUpdate: data.lastUpdate,
          daysSinceLastCommit: data.daysSinceLastCommit,
          needsUpdate: data.needsUpdate,
          updateCount: data.updateCount
        });
      }
    } catch (error) {
      console.error('업데이트 정보 로드 실패:', error);
    }
  };

  const handleAIUpdate = async () => {
    if (!confirm('AI를 사용하여 아키텍처 문서를 자동 업데이트하시겠습니까?\n\n이 작업은 1-2분 정도 소요될 수 있습니다.')) {
      return;
    }

    setIsUpdating(true);
    setUpdateError(null);

    try {
      const response = await fetch('/api/admin/architecture/auto-update', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('✅ AI 아키텍처 업데이트가 완료되었습니다!\n\n페이지를 새로고침하여 업데이트된 내용을 확인하세요.');

        // 업데이트 정보 다시 로드
        await loadUpdateInfo();

        // 페이지 새로고침
        window.location.reload();
      } else {
        setUpdateError(data.error || '업데이트 실패');
        alert('❌ 업데이트 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error: any) {
      console.error('AI 업데이트 오류:', error);
      setUpdateError(error.message || '알 수 없는 오류');
      alert('❌ 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        /* Mermaid 다이어그램 텍스트 강제 흰색 - 모든 가능한 선택자 */
        .mermaid svg text,
        .mermaid svg tspan,
        .mermaid text,
        .mermaid tspan,
        .language-mermaid svg text,
        .language-mermaid svg tspan,
        svg.mermaid text,
        svg.mermaid tspan,
        .mermaid *[class*="label"],
        .mermaid *[class*="nodeLabel"],
        .mermaid *[class*="edgeLabel"],
        .mermaid g text,
        .mermaid g tspan,
        .language-mermaid g text,
        .language-mermaid g tspan {
          fill: #ffffff !important;
          color: #ffffff !important;
          stroke: none !important;
        }

        /* 모든 SVG 텍스트 흰색 강제 */
        svg text,
        svg tspan {
          fill: #ffffff !important;
          color: #ffffff !important;
        }

        /* ERD 엔티티 박스 배경 */
        .mermaid svg .er.entityBox,
        .mermaid svg rect.er.entityBox,
        .mermaid .er.entityBox,
        .er.entityBox {
          fill: #7c3aed !important;
          stroke: #a78bfa !important;
        }

        /* ERD 속성 배경 */
        .mermaid svg .er.attributeBoxOdd,
        .mermaid .er.attributeBoxOdd,
        .er.attributeBoxOdd {
          fill: #8b5cf6 !important;
        }

        .mermaid svg .er.attributeBoxEven,
        .mermaid .er.attributeBoxEven,
        .er.attributeBoxEven {
          fill: #7c3aed !important;
        }
      `}} />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="mx-auto max-w-7xl">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white">🏗️ 시스템 아키텍처 & ERD</h1>
            <p className="mt-2 text-sm text-slate-400">시스템 구조 및 데이터베이스 문서</p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white transition hover:bg-slate-600"
          >
            ← 관리자 대시보드
          </Link>
        </div>

        {/* AI 자동 업데이트 */}
        <div className={`mb-6 rounded-xl border p-4 backdrop-blur transition ${
          updateInfo?.needsUpdate
            ? 'border-yellow-500/50 bg-yellow-500/10'
            : 'border-green-500/30 bg-slate-800/30'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {updateInfo?.needsUpdate ? '⚠️' : '🤖'}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    AI 자동 업데이트
                  </h3>
                  <div className="mt-1 space-y-1 text-xs text-slate-400">
                    {updateInfo?.lastUpdate ? (
                      <>
                        <p>마지막 업데이트: {new Date(updateInfo.lastUpdate).toLocaleString('ko-KR')}</p>
                        <p>마지막 커밋 이후 {updateInfo.daysSinceLastCommit}일 경과</p>
                        <p>총 업데이트 횟수: {updateInfo.updateCount}회</p>
                      </>
                    ) : (
                      <p>아직 AI 업데이트를 실행하지 않았습니다.</p>
                    )}
                  </div>
                </div>
              </div>
              {updateInfo?.needsUpdate && (
                <div className="mt-2 text-sm text-yellow-300">
                  💡 2일 이상 커밋이 없습니다. 아키텍처 문서 업데이트를 권장합니다.
                </div>
              )}
              {updateError && (
                <div className="mt-2 text-sm text-red-400">
                  ❌ {updateError}
                </div>
              )}
            </div>
            <button
              onClick={handleAIUpdate}
              disabled={isUpdating}
              className={`ml-4 rounded-lg px-6 py-3 font-semibold text-white transition ${
                isUpdating
                  ? 'bg-slate-600 cursor-not-allowed'
                  : updateInfo?.needsUpdate
                  ? 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500'
              }`}
            >
              {isUpdating ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>업데이트 중...</span>
                </div>
              ) : (
                <>🤖 AI 업데이트 실행</>
              )}
            </button>
          </div>
        </div>

        {/* 탭 버튼 */}
        <div className="mb-8 flex gap-4">
          <button
            onClick={() => handleTabChange('architecture')}
            className={`flex-1 rounded-xl border py-4 px-6 text-lg font-semibold transition ${
              activeTab === 'architecture'
                ? 'border-purple-500 bg-purple-500/20 text-white shadow-lg shadow-purple-500/20'
                : 'border-white/10 bg-slate-800/50 text-slate-400 hover:border-purple-500/50 hover:text-white'
            }`}
          >
            🏗️ 시스템 아키텍처
          </button>
          <button
            onClick={() => handleTabChange('erd')}
            className={`flex-1 rounded-xl border py-4 px-6 text-lg font-semibold transition ${
              activeTab === 'erd'
                ? 'border-blue-500 bg-blue-500/20 text-white shadow-lg shadow-blue-500/20'
                : 'border-white/10 bg-slate-800/50 text-slate-400 hover:border-blue-500/50 hover:text-white'
            }`}
          >
            📊 데이터베이스 ERD
          </button>
        </div>

        {/* 콘텐츠 */}
        {activeTab === 'architecture' && (
        <div data-tab="architecture">
        {/* Mermaid 시스템 아키텍처 다이어그램 */}
        <div className="mb-8 rounded-2xl border border-purple-500/30 bg-slate-800/50 p-8 backdrop-blur">
          <h2 className="mb-6 text-2xl font-bold text-white">🏗️ 시스템 아키텍처 다이어그램</h2>
          <div
            className="rounded-lg border border-purple-500/20 bg-slate-900/50 p-6 overflow-x-auto relative group cursor-pointer hover:border-purple-500/50 transition-all"
            onClick={(e) => {
              const svg = e.currentTarget.querySelector('svg');
              if (svg) {
                handleDiagramClick(svg as SVGElement);
              }
            }}
          >
            {/* 클릭 힌트 */}
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg bg-purple-600 px-3 py-1 text-xs text-white shadow-lg pointer-events-none">
              🔍 클릭하여 확대
            </div>
            <pre className="language-mermaid mermaid bg-transparent border-none p-0">
{`graph TB
    subgraph Browser["🌐 사용자 브라우저"]
        UI["React/Next.js UI<br/>쿠키 기반 인증"]
    end

    subgraph Frontend["⚛️ Next.js API Routes"]
        Auth["/api/auth/*<br/>인증/세션"]
        Scripts["/api/scripts/generate<br/>대본 생성"]
        Video["/api/generate-video-upload<br/>영상 생성"]
        Merge["/api/video-merge<br/>비디오 병합"]
        Sora["/api/sora2/generate<br/>SORA2"]
    end

    subgraph Backend["🐍 Python Backend"]
        AIAgg["run_ai_aggregator.py<br/>Multi-AI 대본"]
        VideoGen["video_generator_main.py<br/>롱폼 영상"]
        ShortGen["short_video_generator.py<br/>숏폼 영상"]
        VideoMerge["video_merge.py<br/>병합 + TTS"]
        Sora2Gen["sora2_generator.py<br/>SORA2"]
    end

    subgraph Storage["💾 저장소"]
        DB["SQLite Database<br/>users, jobs, scripts"]
        Files["File System<br/>output/, uploaded/"]
    end

    UI -->|"HTTP POST"| Auth
    UI -->|"HTTP POST"| Scripts
    UI -->|"HTTP POST + Files"| Video
    UI -->|"HTTP POST + Files"| Merge
    UI -->|"HTTP POST"| Sora

    Auth --> DB
    Scripts -->|"spawn(python)"| AIAgg
    Video -->|"spawn(python)"| VideoGen
    Video -->|"spawn(python)"| ShortGen
    Merge -->|"spawn(python)"| VideoMerge
    Sora -->|"spawn(python)"| Sora2Gen

    AIAgg --> Files
    VideoGen --> Files
    ShortGen --> Files
    VideoMerge --> Files
    Sora2Gen --> Files

    Scripts --> DB
    Video --> DB
    Merge --> DB
    Sora --> DB

    Files -.->|"폴링(2초)"| UI

    style Browser fill:#1e40af,stroke:#3b82f6,color:#fff
    style Frontend fill:#7c3aed,stroke:#a78bfa,color:#fff
    style Backend fill:#059669,stroke:#34d399,color:#fff
    style Storage fill:#0891b2,stroke:#22d3ee,color:#fff`}
            </pre>
          </div>
        </div>

        {/* 전체 아키텍처 다이어그램 */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-slate-800/50 p-8 backdrop-blur">
          <h2 className="mb-6 text-2xl font-bold text-white">📐 전체 시스템 구조 (상세)</h2>

          <div className="space-y-6">
            {/* 사용자 브라우저 */}
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">🌐</span>
                <h3 className="text-xl font-bold text-blue-300">사용자 브라우저</h3>
              </div>
              <div className="space-y-2 text-sm text-slate-300">
                <p>• React/Next.js UI 컴포넌트</p>
                <p>• 쿠키 기반 인증 (httpOnly)</p>
                <p>• Fetch API로 Next.js API Routes 호출</p>
              </div>
            </div>

            <div className="text-center text-2xl text-purple-400">↓ HTTP Request</div>

            {/* Next.js Frontend Server */}
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">⚛️</span>
                <h3 className="text-xl font-bold text-purple-300">Next.js API Routes (Frontend Server)</h3>
              </div>
              <div className="mb-4 space-y-2 text-sm text-slate-300">
                <p>• <code className="rounded bg-slate-700 px-2 py-1">/api/auth/*</code> - 인증 (로그인, 세션 관리)</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">/api/scripts/generate</code> - 대본 생성 요청</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">/api/generate-video-upload</code> - 롱폼/숏폼 영상 생성</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">/api/video-merge</code> - 비디오 병합</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">/api/sora2/generate</code> - SORA2 비디오 생성</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">/api/convert-format</code> - 대본 형식 변환</p>
              </div>
              <div className="rounded-lg bg-purple-900/30 p-4">
                <p className="text-sm font-semibold text-purple-200">주요 역할:</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  <li>✅ 세션 검증 (쿠키 기반)</li>
                  <li>✅ 파일 업로드 처리 (이미지, 비디오)</li>
                  <li>✅ 파일 정렬 (lastModified 기준)</li>
                  <li>✅ Python 스크립트 spawn 및 PID 관리</li>
                  <li>✅ 작업 상태 추적 (DB 저장)</li>
                  <li>✅ 에러 처리 및 로깅</li>
                </ul>
              </div>
            </div>

            <div className="text-center text-2xl text-green-400">↓ spawn('python', [...])</div>

            {/* Python Backend */}
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">🐍</span>
                <h3 className="text-xl font-bold text-green-300">Python Backend (Subprocess)</h3>
              </div>
              <div className="mb-4 space-y-2 text-sm text-slate-300">
                <p>• <code className="rounded bg-slate-700 px-2 py-1">run_ai_aggregator.py</code> - Multi-AI 대본 생성</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">video_generator_main.py</code> - 롱폼 영상 생성</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">short_video_generator.py</code> - 숏폼 영상 생성</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">video_merge.py</code> - 비디오 병합 + TTS</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">sora2_generator.py</code> - SORA2 비디오 생성</p>
              </div>
              <div className="rounded-lg bg-green-900/30 p-4">
                <p className="text-sm font-semibold text-green-200">주요 역할:</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">
                  <li>✅ AI 대본 생성 (Claude, GPT, Gemini, Grok)</li>
                  <li>✅ 비디오 처리 (FFmpeg)</li>
                  <li>✅ TTS 생성 (Edge TTS + WordBoundary)</li>
                  <li>✅ 자막 싱크 (ASS 포맷)</li>
                  <li>✅ 트랜지션 효과 적용</li>
                  <li>✅ 결과 파일 생성 및 상태 업데이트</li>
                </ul>
              </div>
            </div>

            <div className="text-center text-2xl text-yellow-400">↓ 파일 시스템 I/O</div>

            {/* 파일 시스템 */}
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">📁</span>
                <h3 className="text-xl font-bold text-yellow-300">파일 시스템 (공유 스토리지)</h3>
              </div>
              <div className="space-y-2 text-sm text-slate-300">
                <p>• <code className="rounded bg-slate-700 px-2 py-1">output/</code> - 생성된 영상 파일</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">uploaded/</code> - 업로드된 이미지/비디오</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">scripts/</code> - 생성된 대본 JSON</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">status.json</code> - 작업 진행 상태</p>
              </div>
            </div>

            <div className="text-center text-2xl text-cyan-400">↑ 폴링 (2초마다 status.json 체크)</div>

            {/* 데이터베이스 */}
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">💾</span>
                <h3 className="text-xl font-bold text-cyan-300">SQLite 데이터베이스</h3>
              </div>
              <div className="space-y-2 text-sm text-slate-300">
                <p>• <code className="rounded bg-slate-700 px-2 py-1">users</code> - 사용자 정보, 크레딧</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">scripts_temp</code> - 대본 생성 작업 (진행중/완료)</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">video_generation_tasks</code> - 영상 생성 작업</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">charge_requests</code> - 충전 요청</p>
                <p>• <code className="rounded bg-slate-700 px-2 py-1">user_activity_logs</code> - 사용자 활동 로그</p>
              </div>
            </div>
          </div>
        </div>

        {/* 데이터 흐름 상세 */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* 대본 생성 워크플로우 */}
          <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
            <h3 className="mb-4 text-xl font-bold text-white">📝 대본 생성 워크플로우</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-lg bg-blue-900/20 p-3">
                <p className="font-semibold text-blue-300">1. 사용자 요청</p>
                <p className="mt-1 text-xs">주제 입력 → /api/scripts/generate POST</p>
              </div>
              <div className="rounded-lg bg-purple-900/20 p-3">
                <p className="font-semibold text-purple-300">2. Frontend 처리</p>
                <p className="mt-1 text-xs">세션 검증 → 크레딧 확인 → DB에 PENDING 작업 생성</p>
              </div>
              <div className="rounded-lg bg-green-900/20 p-3">
                <p className="font-semibold text-green-300">3. Python Spawn</p>
                <p className="mt-1 text-xs">run_ai_aggregator.py 실행 → PID 저장</p>
              </div>
              <div className="rounded-lg bg-yellow-900/20 p-3">
                <p className="font-semibold text-yellow-300">4. AI 대본 생성</p>
                <p className="mt-1 text-xs">Multi-AI 호출 → 대본 JSON 생성</p>
              </div>
              <div className="rounded-lg bg-cyan-900/20 p-3">
                <p className="font-semibold text-cyan-300">5. 완료 처리</p>
                <p className="mt-1 text-xs">status.json 업데이트 → Frontend 폴링으로 감지 → DB COMPLETED</p>
              </div>
            </div>
          </div>

          {/* 영상 생성 워크플로우 */}
          <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
            <h3 className="mb-4 text-xl font-bold text-white">🎬 영상 생성 워크플로우</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-lg bg-blue-900/20 p-3">
                <p className="font-semibold text-blue-300">1. 사용자 업로드</p>
                <p className="mt-1 text-xs">이미지 업로드 → /api/generate-video-upload POST</p>
              </div>
              <div className="rounded-lg bg-purple-900/20 p-3">
                <p className="font-semibold text-purple-300">2. 파일 정렬</p>
                <p className="mt-1 text-xs">lastModified 기준 정렬 → image_01.jpg, image_02.jpg...</p>
              </div>
              <div className="rounded-lg bg-green-900/20 p-3">
                <p className="font-semibold text-green-300">3. Python Spawn</p>
                <p className="mt-1 text-xs">video_generator_main.py 또는 short_video_generator.py</p>
              </div>
              <div className="rounded-lg bg-yellow-900/20 p-3">
                <p className="font-semibold text-yellow-300">4. 비디오 처리</p>
                <p className="mt-1 text-xs">FFmpeg로 트랜지션 + TTS + 자막 병합</p>
              </div>
              <div className="rounded-lg bg-cyan-900/20 p-3">
                <p className="font-semibold text-cyan-300">5. 완료</p>
                <p className="mt-1 text-xs">final_video.mp4 생성 → 다운로드 가능</p>
              </div>
            </div>
          </div>

          {/* 비디오 병합 워크플로우 */}
          <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
            <h3 className="mb-4 text-xl font-bold text-white">🔗 비디오 병합 워크플로우</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-lg bg-blue-900/20 p-3">
                <p className="font-semibold text-blue-300">1. 비디오 업로드</p>
                <p className="mt-1 text-xs">여러 MP4 파일 + JSON 업로드 → /api/video-merge POST</p>
              </div>
              <div className="rounded-lg bg-purple-900/20 p-3">
                <p className="font-semibold text-purple-300">2. 파일 정렬</p>
                <p className="mt-1 text-xs">시퀀스 번호 우선 → lastModified 폴백</p>
              </div>
              <div className="rounded-lg bg-green-900/20 p-3">
                <p className="font-semibold text-green-300">3. Python Spawn</p>
                <p className="mt-1 text-xs">video_merge.py --mode merge</p>
              </div>
              <div className="rounded-lg bg-yellow-900/20 p-3">
                <p className="font-semibold text-yellow-300">4. TTS + 자막</p>
                <p className="mt-1 text-xs">Edge TTS WordBoundary → ASS 자막 → FFmpeg 병합</p>
              </div>
              <div className="rounded-lg bg-cyan-900/20 p-3">
                <p className="font-semibold text-cyan-300">5. 제목 파일명</p>
                <p className="mt-1 text-xs">JSON의 title 추출 → 안전한 파일명으로 변환</p>
              </div>
            </div>
          </div>

          {/* SORA2 생성 워크플로우 */}
          <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur">
            <h3 className="mb-4 text-xl font-bold text-white">✨ SORA2 생성 워크플로우</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-lg bg-blue-900/20 p-3">
                <p className="font-semibold text-blue-300">1. 대본 선택</p>
                <p className="mt-1 text-xs">SORA2 대본 선택 → /api/sora2/generate POST</p>
              </div>
              <div className="rounded-lg bg-purple-900/20 p-3">
                <p className="font-semibold text-purple-300">2. Frontend 처리</p>
                <p className="mt-1 text-xs">JSON 파일 저장 → Python spawn</p>
              </div>
              <div className="rounded-lg bg-green-900/20 p-3">
                <p className="font-semibold text-green-300">3. Python Spawn</p>
                <p className="mt-1 text-xs">sora2_generator.py --input [script.json]</p>
              </div>
              <div className="rounded-lg bg-yellow-900/20 p-3">
                <p className="font-semibold text-yellow-300">4. SORA2 API</p>
                <p className="mt-1 text-xs">프롬프트 기반 비디오 생성 (외부 API 호출)</p>
              </div>
              <div className="rounded-lg bg-cyan-900/20 p-3">
                <p className="font-semibold text-cyan-300">5. 다운로드</p>
                <p className="mt-1 text-xs">생성된 비디오 다운로드 → 최종 파일 저장</p>
              </div>
            </div>
          </div>
        </div>

        {/* 핵심 기술 스택 */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-800/50 p-8 backdrop-blur">
          <h2 className="mb-6 text-2xl font-bold text-white">🛠️ 핵심 기술 스택</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-lg bg-blue-500/10 p-4">
              <h4 className="mb-3 font-bold text-blue-300">Frontend</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Next.js 14 (App Router)</li>
                <li>• React 18</li>
                <li>• TypeScript</li>
                <li>• Tailwind CSS</li>
                <li>• Fetch API</li>
              </ul>
            </div>
            <div className="rounded-lg bg-green-500/10 p-4">
              <h4 className="mb-3 font-bold text-green-300">Backend</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Python 3.11+</li>
                <li>• Selenium (브라우저 자동화)</li>
                <li>• Edge TTS (음성 합성)</li>
                <li>• FFmpeg (비디오 처리)</li>
                <li>• Multi-AI APIs</li>
              </ul>
            </div>
            <div className="rounded-lg bg-purple-500/10 p-4">
              <h4 className="mb-3 font-bold text-purple-300">Database & Storage</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• SQLite</li>
                <li>• 파일 시스템 (로컬)</li>
                <li>• JSON 상태 파일</li>
                <li>• better-sqlite3</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 중요 패턴 및 규칙 */}
        <div className="mt-6 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-8 backdrop-blur">
          <h2 className="mb-4 text-2xl font-bold text-orange-300">⚠️ 중요 패턴 및 규칙</h2>
          <div className="space-y-3 text-sm text-slate-300">
            <div className="rounded-lg bg-orange-900/30 p-4">
              <p className="font-semibold text-orange-200">1. 파일 정렬 규칙 (CRITICAL)</p>
              <p className="mt-2">• 이미지/비디오는 <strong>lastModified 오래된 순</strong>으로 정렬</p>
              <p>• ImageFX/Whisk 랜덤 ID 대응</p>
              <p>• Frontend에서 정렬 → Python에서 재정렬 금지</p>
            </div>
            <div className="rounded-lg bg-orange-900/30 p-4">
              <p className="font-semibold text-orange-200">2. 프로세스 관리</p>
              <p className="mt-2">• Python spawn 시 PID 저장</p>
              <p>• 취소 시 taskkill /F /T로 프로세스 트리 전체 종료</p>
              <p>• 좀비 프로세스 방지 (ShimGen.exe 정리)</p>
            </div>
            <div className="rounded-lg bg-orange-900/30 p-4">
              <p className="font-semibold text-orange-200">3. 인증 시스템</p>
              <p className="mt-2">• 쿠키 기반 세션 (httpOnly)</p>
              <p>• localStorage 사용 금지</p>
              <p>• 모든 API는 getCurrentUser()로 인증 확인</p>
            </div>
            <div className="rounded-lg bg-orange-900/30 p-4">
              <p className="font-semibold text-orange-200">4. 에러 처리</p>
              <p className="mt-2">• HTTP 404는 엔드포인트 없을 때만</p>
              <p>• 데이터 없음: 400 + errorCode (예: SCRIPT_NOT_FOUND)</p>
              <p>• 모든 에러에 커스텀 에러 코드 포함</p>
            </div>
            <div className="rounded-lg bg-orange-900/30 p-4">
              <p className="font-semibold text-orange-200">5. 자막 싱크</p>
              <p className="mt-2">• Edge TTS WordBoundary로 단어별 타임스탬프 수집</p>
              <p>• ASS 포맷으로 자막 생성</p>
              <p>• 오디오가 비디오보다 길면 tpad로 프레임 freeze</p>
            </div>
          </div>
        </div>

        {/* 참고 문서 링크 */}
        <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-6 backdrop-blur">
          <h3 className="mb-3 text-lg font-bold text-blue-300">📚 참고 문서</h3>
          <div className="space-y-2 text-sm text-slate-300">
            <p>• <strong>DEVELOPMENT_GUIDE.md:</strong> 전체 개발 가이드 (파일 정렬, 자막 싱크, Regression Test 등)</p>
            <p>• <strong>Frontend 테스트:</strong> <code className="rounded bg-slate-700 px-2 py-1">__tests__/api/file-sorting.test.ts</code></p>
            <p>• <strong>Backend 테스트:</strong> <code className="rounded bg-slate-700 px-2 py-1">tests/test_regression.py</code></p>
            <p>• <strong>API 구조:</strong> <code className="rounded bg-slate-700 px-2 py-1">src/app/api/*/route.ts</code></p>
          </div>
        </div>
        </div>
      )}
      </div>

      {/* 다이어그램 확대 모달 */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/95 p-2"
          onClick={handleCloseModal}
        >
          <div
            className="relative h-[98vh] w-[99vw] overflow-hidden rounded-xl border border-purple-500/30 bg-slate-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 컨트롤 버튼 */}
            <div className="absolute right-6 top-6 z-10 flex gap-2">
              <button
                onClick={handleZoomOut}
                className="rounded-lg bg-purple-600 px-4 py-2 text-white shadow-lg transition hover:bg-purple-500"
                title="축소"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <button
                onClick={handleZoomReset}
                className="rounded-lg bg-slate-600 px-4 py-2 text-white shadow-lg transition hover:bg-slate-500"
                title="리셋 (100%)"
              >
                {zoomLevel}%
              </button>
              <button
                onClick={handleZoomIn}
                className="rounded-lg bg-purple-600 px-4 py-2 text-white shadow-lg transition hover:bg-purple-500"
                title="확대"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={handleCloseModal}
                className="rounded-lg bg-red-600 px-4 py-2 text-white shadow-lg transition hover:bg-red-500"
                title="닫기"
              >
                ✕
              </button>
            </div>

            {/* 다이어그램/테이블 컨테이너 */}
            <div
              className="relative overflow-auto flex items-center justify-center"
              style={{
                height: 'calc(98vh - 8rem)',
                width: 'calc(99vw - 2rem)',
                cursor: isDragging ? 'grabbing' : 'grab'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <div
                className="inline-block"
                style={{
                  transform: `scale(${zoomLevel / 100}) translate(${position.x / (zoomLevel / 100)}px, ${position.y / (zoomLevel / 100)}px)`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                  minWidth: 'max-content',
                  minHeight: 'max-content',
                }}
              >
                {modalSvg && (
                  <div dangerouslySetInnerHTML={{ __html: modalSvg }} />
                )}
                {modalTable && (
                  <div
                    className="bg-slate-800 rounded-lg p-8"
                    dangerouslySetInnerHTML={{ __html: modalTable }}
                  />
                )}
              </div>
            </div>

            {/* 안내 메시지 */}
            <div className="mt-4 text-center text-sm text-slate-400">
              💡 드래그로 이동 | 마우스 휠로 확대/축소 | 버튼으로 25% 단위 조절 | ESC로 닫기
            </div>
          </div>
        </div>
      )}

        {/* ERD 탭 */}
        {activeTab === 'erd' && (
          <div data-tab="erd">
            {/* Mermaid ERD 다이어그램 */}
            <div className="mb-8 rounded-2xl border border-blue-500/30 bg-slate-800/50 p-8 backdrop-blur">
              <h2 className="mb-6 text-2xl font-bold text-white">📊 데이터베이스 ERD</h2>
              <div
                className="rounded-lg border border-blue-500/20 bg-slate-900/50 p-6 overflow-x-auto relative group cursor-pointer hover:border-blue-500/50 transition-all"
                onClick={(e) => {
                  const svg = e.currentTarget.querySelector('svg');
                  if (svg) {
                    handleDiagramClick(svg as SVGElement);
                  }
                }}
              >
                {/* 클릭 힌트 */}
                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg bg-blue-600 px-3 py-1 text-xs text-white shadow-lg pointer-events-none">
                  🔍 클릭하여 확대
                </div>
                <div
                  id="erd-diagram"
                  className="mermaid"
                  style={{ minHeight: '600px' }}
                >
{`erDiagram
    USERS {
        string id PK "사용자 ID"
        string email UK "이메일"
        string password "비밀번호 해시"
        int credits "크레딧 잔액"
        boolean emailVerified "이메일 인증 여부"
        boolean isAdmin "관리자 여부"
        datetime createdAt "생성 시간"
        datetime lastLogin "마지막 로그인"
    }

    CONTENTS {
        string id PK "컨텐츠 ID (UUID)"
        string userId FK "사용자 ID"
        string type "타입 (script/video)"
        string format "포맷 (longform/shortform/sora2)"
        string title "제목"
        string originalTitle "원본 제목"
        text content "대본 내용 (type=script일 때)"
        string status "상태 (pending/processing/completed/failed)"
        int progress "진행률 0-100"
        string error "에러 메시지"
        int pid "프로세스 ID"
        string videoPath "영상 경로 (type=video일 때)"
        string thumbnailPath "썸네일 경로"
        int published "유튜브 업로드 여부"
        datetime publishedAt "업로드 시간"
        int inputTokens "입력 토큰"
        int outputTokens "출력 토큰"
        int useClaudeLocal "로컬 Claude 사용"
        string sourceContentId FK "원본 컨텐츠 ID"
        string conversionType "변환 타입"
        int isRegenerated "재생성 여부"
        datetime createdAt "생성 시간"
        datetime updatedAt "수정 시간"
    }

    CREDIT_HISTORY {
        string id PK "내역 ID"
        string userId FK "사용자 ID"
        string type "타입 (USE/CHARGE/REFUND/ADMIN_GRANT)"
        int amount "금액"
        int balanceAfter "잔액 (거래 후)"
        string description "설명"
        datetime createdAt "생성 시간"
    }

    CHARGE_REQUESTS {
        string id PK "요청 ID"
        string userId FK "사용자 ID"
        int amount "충전 금액"
        string status "상태 (pending/approved/rejected)"
        datetime createdAt "요청 시간"
        datetime processedAt "처리 시간"
    }

    USER_ACTIVITY_LOGS {
        string id PK "로그 ID"
        string userId FK "사용자 ID"
        string action "액션 (login/logout/content_create 등)"
        text details "상세 정보 (JSON)"
        datetime createdAt "생성 시간"
    }

    SETTINGS {
        string key PK "설정 키"
        text value "설정 값"
        datetime updatedAt "수정 시간"
    }

    YOUTUBE_UPLOADS {
        string id PK "업로드 ID"
        string userId FK "사용자 ID"
        string contentId FK "컨텐츠 ID"
        string youtubeVideoId "YouTube 비디오 ID"
        string channelId "채널 ID"
        string status "상태 (uploading/completed/failed)"
        text metadata "메타데이터 (제목/설명/태그)"
        datetime createdAt "업로드 시간"
    }

    USERS ||--o{ CONTENTS : "creates"
    USERS ||--o{ CREDIT_HISTORY : "has"
    USERS ||--o{ CHARGE_REQUESTS : "requests"
    USERS ||--o{ USER_ACTIVITY_LOGS : "logs"
    CONTENTS ||--o{ YOUTUBE_UPLOADS : "uploads"
    CONTENTS ||--o{ CONTENTS : "converts-to"`}
                </div>
              </div>
            </div>

            {/* 테이블 설명 */}
            <div className="space-y-6">
                {/* USERS 테이블 */}
                <div className="rounded-xl border border-blue-500/30 bg-slate-800/50 p-6 backdrop-blur">
                  <h3 className="mb-4 text-2xl font-bold text-blue-300">👤 USERS (사용자)</h3>
                  <div className="table-content overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-blue-500/30">
                          <th className="p-3 text-left font-bold text-blue-200 bg-slate-900/50">컬럼명</th>
                          <th className="p-3 text-left font-bold text-blue-200 bg-slate-900/50">타입</th>
                          <th className="p-3 text-left font-bold text-blue-200 bg-slate-900/50">제약조건</th>
                          <th className="p-3 text-left font-bold text-blue-200 bg-slate-900/50">설명</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">id</td>
                          <td className="p-3">string (UUID)</td>
                          <td className="p-3"><span className="rounded bg-purple-600 px-2 py-0.5 text-xs">PK</span></td>
                          <td className="p-3">사용자 고유 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">email</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-orange-600 px-2 py-0.5 text-xs">UK</span></td>
                          <td className="p-3">로그인 이메일 (중복 불가)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">password</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-slate-600 px-2 py-0.5 text-xs">NOT NULL</span></td>
                          <td className="p-3">bcrypt 해시 비밀번호</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">credits</td>
                          <td className="p-3">int</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT 0</span></td>
                          <td className="p-3">크레딧 잔액</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">emailVerified</td>
                          <td className="p-3">boolean</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT false</span></td>
                          <td className="p-3">이메일 인증 여부</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">isAdmin</td>
                          <td className="p-3">boolean</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT false</span></td>
                          <td className="p-3">관리자 권한 여부</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">createdAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">계정 생성 시간</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">lastLogin</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">마지막 로그인 시간</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CONTENTS 테이블 */}
                <div
                  className="rounded-xl border border-purple-500/30 bg-slate-800/50 p-6 backdrop-blur"
                >
                  <h3 className="mb-4 text-2xl font-bold text-purple-300">📦 CONTENTS (대본 & 영상 통합)</h3>
                  <p className="mb-4 text-sm text-slate-400">
                    <strong>설명:</strong> 대본(script)과 영상(video)을 단일 테이블로 관리하며, <code className="rounded bg-slate-700 px-1.5 py-0.5">type</code> 컬럼으로 구분합니다.
                  </p>
                  <div className="table-content overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-purple-500/30">
                          <th className="p-3 text-left font-bold text-purple-200 bg-slate-900/50">컬럼명</th>
                          <th className="p-3 text-left font-bold text-purple-200 bg-slate-900/50">타입</th>
                          <th className="p-3 text-left font-bold text-purple-200 bg-slate-900/50">제약조건</th>
                          <th className="p-3 text-left font-bold text-purple-200 bg-slate-900/50">설명</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">id</td>
                          <td className="p-3">string (UUID)</td>
                          <td className="p-3"><span className="rounded bg-purple-600 px-2 py-0.5 text-xs">PK</span></td>
                          <td className="p-3">컨텐츠 고유 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">userId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-blue-600 px-2 py-0.5 text-xs">FK</span></td>
                          <td className="p-3">사용자 ID (USERS 참조)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">type</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-slate-600 px-2 py-0.5 text-xs">NOT NULL</span></td>
                          <td className="p-3">script | video</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">format</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">longform | shortform | sora2</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">title</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-slate-600 px-2 py-0.5 text-xs">NOT NULL</span></td>
                          <td className="p-3">제목</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">originalTitle</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">원본 제목</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">content</td>
                          <td className="p-3">text (JSON)</td>
                          <td className="p-3"></td>
                          <td className="p-3">대본 내용 (type=script일 때)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">status</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT pending</span></td>
                          <td className="p-3">pending | processing | completed | failed</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">progress</td>
                          <td className="p-3">int</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT 0</span></td>
                          <td className="p-3">진행률 (0~100)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">error</td>
                          <td className="p-3">text</td>
                          <td className="p-3"></td>
                          <td className="p-3">에러 메시지</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">pid</td>
                          <td className="p-3">int</td>
                          <td className="p-3"></td>
                          <td className="p-3">프로세스 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">videoPath</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">영상 파일 경로 (type=video일 때)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">thumbnailPath</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">썸네일 경로</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">published</td>
                          <td className="p-3">int</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT 0</span></td>
                          <td className="p-3">유튜브 업로드 여부 (0/1)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">publishedAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">업로드 시간</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">inputTokens</td>
                          <td className="p-3">int</td>
                          <td className="p-3"></td>
                          <td className="p-3">입력 토큰 수 (AI 사용량)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">outputTokens</td>
                          <td className="p-3">int</td>
                          <td className="p-3"></td>
                          <td className="p-3">출력 토큰 수 (AI 사용량)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">useClaudeLocal</td>
                          <td className="p-3">int</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT 0</span></td>
                          <td className="p-3">로컬 Claude 사용 여부 (0/1)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">sourceContentId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-blue-600 px-2 py-0.5 text-xs">FK</span></td>
                          <td className="p-3">원본 컨텐츠 ID (변환 시)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">conversionType</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">변환 타입 (script_to_video 등)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">isRegenerated</td>
                          <td className="p-3">int</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT 0</span></td>
                          <td className="p-3">재생성 여부 (0/1)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">createdAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">생성 시간</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">updatedAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">수정 시간</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CREDIT_HISTORY 테이블 */}
                <div
                  className="rounded-xl border border-yellow-500/30 bg-slate-800/50 p-6 backdrop-blur"
                >
                  <h3 className="mb-4 text-2xl font-bold text-yellow-300">💰 CREDIT_HISTORY (크레딧 내역)</h3>
                  <div className="table-content overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-yellow-500/30">
                          <th className="p-3 text-left font-bold text-yellow-200 bg-slate-900/50">컬럼명</th>
                          <th className="p-3 text-left font-bold text-yellow-200 bg-slate-900/50">타입</th>
                          <th className="p-3 text-left font-bold text-yellow-200 bg-slate-900/50">제약조건</th>
                          <th className="p-3 text-left font-bold text-yellow-200 bg-slate-900/50">설명</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">id</td>
                          <td className="p-3">string (UUID)</td>
                          <td className="p-3"><span className="rounded bg-purple-600 px-2 py-0.5 text-xs">PK</span></td>
                          <td className="p-3">내역 고유 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">userId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-blue-600 px-2 py-0.5 text-xs">FK</span></td>
                          <td className="p-3">사용자 ID (USERS 참조)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">type</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">USE | CHARGE | REFUND | ADMIN_GRANT</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">amount</td>
                          <td className="p-3">int</td>
                          <td className="p-3"></td>
                          <td className="p-3">변동 금액</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">balanceAfter</td>
                          <td className="p-3">int</td>
                          <td className="p-3"></td>
                          <td className="p-3">거래 후 잔액</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">description</td>
                          <td className="p-3">text</td>
                          <td className="p-3"></td>
                          <td className="p-3">설명</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">createdAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">생성 시간</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CHARGE_REQUESTS 테이블 */}
                <div
                  className="rounded-xl border border-orange-500/30 bg-slate-800/50 p-6 backdrop-blur"
                >
                  <h3 className="mb-4 text-2xl font-bold text-orange-300">💸 CHARGE_REQUESTS (충전 요청)</h3>
                  <div className="table-content overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-orange-500/30">
                          <th className="p-3 text-left font-bold text-orange-200 bg-slate-900/50">컬럼명</th>
                          <th className="p-3 text-left font-bold text-orange-200 bg-slate-900/50">타입</th>
                          <th className="p-3 text-left font-bold text-orange-200 bg-slate-900/50">제약조건</th>
                          <th className="p-3 text-left font-bold text-orange-200 bg-slate-900/50">설명</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">id</td>
                          <td className="p-3">string (UUID)</td>
                          <td className="p-3"><span className="rounded bg-purple-600 px-2 py-0.5 text-xs">PK</span></td>
                          <td className="p-3">요청 고유 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">userId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-blue-600 px-2 py-0.5 text-xs">FK</span></td>
                          <td className="p-3">사용자 ID (USERS 참조)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">amount</td>
                          <td className="p-3">int</td>
                          <td className="p-3"><span className="rounded bg-slate-600 px-2 py-0.5 text-xs">NOT NULL</span></td>
                          <td className="p-3">충전 요청 금액</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">status</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-green-600 px-2 py-0.5 text-xs">DEFAULT pending</span></td>
                          <td className="p-3">pending | approved | rejected</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">createdAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">요청 시간</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">processedAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">처리 시간</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* USER_ACTIVITY_LOGS 테이블 */}
                <div
                  className="rounded-xl border border-cyan-500/30 bg-slate-800/50 p-6 backdrop-blur"
                >
                  <h3 className="mb-4 text-2xl font-bold text-cyan-300">📊 USER_ACTIVITY_LOGS (활동 로그)</h3>
                  <div className="table-content overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-cyan-500/30">
                          <th className="p-3 text-left font-bold text-cyan-200 bg-slate-900/50">컬럼명</th>
                          <th className="p-3 text-left font-bold text-cyan-200 bg-slate-900/50">타입</th>
                          <th className="p-3 text-left font-bold text-cyan-200 bg-slate-900/50">제약조건</th>
                          <th className="p-3 text-left font-bold text-cyan-200 bg-slate-900/50">설명</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">id</td>
                          <td className="p-3">string (UUID)</td>
                          <td className="p-3"><span className="rounded bg-purple-600 px-2 py-0.5 text-xs">PK</span></td>
                          <td className="p-3">로그 고유 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">userId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-blue-600 px-2 py-0.5 text-xs">FK</span></td>
                          <td className="p-3">사용자 ID (USERS 참조)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">action</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">login | logout | content_create 등</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">details</td>
                          <td className="p-3">text (JSON)</td>
                          <td className="p-3"></td>
                          <td className="p-3">상세 정보 (JSON)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">createdAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">로그 생성 시간</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SETTINGS 테이블 */}
                <div
                  className="rounded-xl border border-slate-500/30 bg-slate-800/50 p-6 backdrop-blur"
                >
                  <h3 className="mb-4 text-2xl font-bold text-slate-300">⚙️ SETTINGS (설정)</h3>
                  <div className="table-content overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-slate-500/30">
                          <th className="p-3 text-left font-bold text-slate-200 bg-slate-900/50">컬럼명</th>
                          <th className="p-3 text-left font-bold text-slate-200 bg-slate-900/50">타입</th>
                          <th className="p-3 text-left font-bold text-slate-200 bg-slate-900/50">제약조건</th>
                          <th className="p-3 text-left font-bold text-slate-200 bg-slate-900/50">설명</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">key</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-purple-600 px-2 py-0.5 text-xs">PK</span></td>
                          <td className="p-3">설정 키</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">value</td>
                          <td className="p-3">text</td>
                          <td className="p-3"></td>
                          <td className="p-3">설정 값</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">updatedAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">수정 시간</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* YOUTUBE_UPLOADS 테이블 */}
                <div
                  className="rounded-xl border border-pink-500/30 bg-slate-800/50 p-6 backdrop-blur"
                >
                  <h3 className="mb-4 text-2xl font-bold text-pink-300">📤 YOUTUBE_UPLOADS (업로드 기록)</h3>
                  <div className="table-content overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-pink-500/30">
                          <th className="p-3 text-left font-bold text-pink-200 bg-slate-900/50">컬럼명</th>
                          <th className="p-3 text-left font-bold text-pink-200 bg-slate-900/50">타입</th>
                          <th className="p-3 text-left font-bold text-pink-200 bg-slate-900/50">제약조건</th>
                          <th className="p-3 text-left font-bold text-pink-200 bg-slate-900/50">설명</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">id</td>
                          <td className="p-3">string (UUID)</td>
                          <td className="p-3"><span className="rounded bg-purple-600 px-2 py-0.5 text-xs">PK</span></td>
                          <td className="p-3">업로드 기록 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">userId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-blue-600 px-2 py-0.5 text-xs">FK</span></td>
                          <td className="p-3">사용자 ID (USERS 참조)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">contentId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"><span className="rounded bg-blue-600 px-2 py-0.5 text-xs">FK</span></td>
                          <td className="p-3">컨텐츠 ID (CONTENTS 참조)</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">youtubeVideoId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">YouTube 비디오 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">channelId</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">채널 ID</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">status</td>
                          <td className="p-3">string</td>
                          <td className="p-3"></td>
                          <td className="p-3">uploading | completed | failed</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">metadata</td>
                          <td className="p-3">text (JSON)</td>
                          <td className="p-3"></td>
                          <td className="p-3">제목/설명/태그 등 메타데이터</td>
                        </tr>
                        <tr className="border-t border-slate-700 hover:bg-slate-700/30">
                          <td className="p-3 font-mono">createdAt</td>
                          <td className="p-3">datetime</td>
                          <td className="p-3"></td>
                          <td className="p-3">업로드 시간</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 테이블 설명 */}
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-6">
                <h3 className="mb-4 text-xl font-bold text-blue-300">📋 핵심 테이블 설명</h3>
                <div className="space-y-4 text-sm text-slate-300">
                  <div>
                    <h4 className="font-semibold text-white">👤 USERS</h4>
                    <p>사용자 계정 정보, 크레딧 잔액, 이메일 인증 상태 관리</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">📦 CONTENTS</h4>
                    <p>대본(script)과 영상(video)을 통합 관리. type 컬럼으로 구분하며, format으로 longform/shortform/sora2 지정</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">💰 CREDIT_HISTORY</h4>
                    <p>크레딧 충전/사용/환불/관리자 부여 내역 및 거래 후 잔액 추적</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">💸 CHARGE_REQUESTS</h4>
                    <p>사용자의 크레딧 충전 요청 및 관리자 승인 처리</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">📊 USER_ACTIVITY_LOGS</h4>
                    <p>사용자 활동 로그 (로그인/로그아웃/컨텐츠 생성 기록)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">⚙️ SETTINGS</h4>
                    <p>시스템 전역 설정 관리 (key-value 구조)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">📤 YOUTUBE_UPLOADS</h4>
                    <p>YouTube 업로드 기록 및 메타데이터 관리</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6">
                <h3 className="mb-4 text-xl font-bold text-green-300">🔑 주요 관계</h3>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>• USERS → CONTENTS: 1:N (한 사용자가 여러 대본/영상 생성)</p>
                  <p>• CONTENTS → CONTENTS: 1:N (한 대본을 영상으로 변환)</p>
                  <p>• USERS → CREDIT_HISTORY: 1:N (크레딧 변동 내역)</p>
                  <p>• USERS → CHARGE_REQUESTS: 1:N (충전 요청 관리)</p>
                  <p>• USERS → USER_ACTIVITY_LOGS: 1:N (사용자 활동 로그)</p>
                  <p>• CONTENTS → YOUTUBE_UPLOADS: 1:N (영상 업로드 기록)</p>
                </div>
              </div>

              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-6">
                <h3 className="mb-4 text-xl font-bold text-purple-300">🔐 제약 조건 및 인덱스</h3>
                <div className="space-y-4 text-sm text-slate-300">
                  <div>
                    <h4 className="font-semibold text-white mb-2">Primary Keys (PK)</h4>
                    <p>• USERS, CONTENTS, CREDIT_HISTORY 등 대부분의 테이블은 UUID 기반 id 필드</p>
                    <p>• SETTINGS는 key 필드를 Primary Key로 사용 (문자열)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">Unique Constraints (UK)</h4>
                    <p>• USERS.email: 이메일 중복 방지</p>
                    <p>• SETTINGS.key: 설정 키 중복 방지 (PK)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">Foreign Keys (FK)</h4>
                    <p>• ON DELETE CASCADE: USERS 삭제 시 관련 CONTENTS, CREDIT_HISTORY 등 모두 삭제</p>
                    <p>• sourceContentId: CONTENTS 자기 참조 (대본 → 영상 변환 추적)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">인덱스 최적화</h4>
                    <p>• CONTENTS(userId, type, status, createdAt): 사용자별 컨텐츠 목록 조회</p>
                    <p>• CREDIT_HISTORY(userId, createdAt): 크레딧 내역 조회</p>
                    <p>• USER_ACTIVITY_LOGS(userId, createdAt): 활동 로그 조회</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-6">
                <h3 className="mb-4 text-xl font-bold text-orange-300">🔄 데이터 흐름</h3>
                <div className="space-y-4 text-sm text-slate-300">
                  <div>
                    <h4 className="font-semibold text-white mb-2">1️⃣ 회원가입 프로세스</h4>
                    <p className="mb-1">USERS 테이블에 신규 레코드 생성</p>
                    <p className="ml-4 text-slate-400">→ emailVerified = false</p>
                    <p className="ml-4 text-slate-400">→ credits = 0 (초기 크레딧)</p>
                    <p className="ml-4 text-slate-400">→ 이메일 인증 토큰 발송</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">2️⃣ 크레딧 충전 프로세스</h4>
                    <p className="mb-1">사용자가 CHARGE_REQUESTS에 충전 요청 생성</p>
                    <p className="ml-4 text-slate-400">→ status = pending</p>
                    <p className="ml-4 text-slate-400">→ 관리자가 입금 확인 후 approved로 변경</p>
                    <p className="ml-4 text-slate-400">→ USERS.credits 증가</p>
                    <p className="ml-4 text-slate-400">→ CREDIT_HISTORY에 CHARGE 타입 기록 (balanceAfter 업데이트)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">3️⃣ 대본 생성 프로세스</h4>
                    <p className="mb-1">사용자가 대본 생성 요청 (제목, format 입력)</p>
                    <p className="ml-4 text-slate-400">→ 크레딧 체크 (USERS.credits ≥ 10)</p>
                    <p className="ml-4 text-slate-400">→ CONTENTS 테이블에 레코드 생성 (type=script, status=pending)</p>
                    <p className="ml-4 text-slate-400">→ USERS.credits 차감 (대본 생성 비용: 10 크레딧)</p>
                    <p className="ml-4 text-slate-400">→ CREDIT_HISTORY에 USE 타입 기록</p>
                    <p className="ml-4 text-slate-400">→ AI 서비스로 대본 생성 요청 (백그라운드 작업)</p>
                    <p className="ml-4 text-slate-400">→ 생성 완료 시 status=completed, content 저장</p>
                    <p className="ml-4 text-slate-400">→ 실패 시 status=failed, 크레딧 환불</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">4️⃣ 영상 생성 프로세스</h4>
                    <p className="mb-1">사용자가 완료된 대본으로 영상 생성 요청</p>
                    <p className="ml-4 text-slate-400">→ 크레딧 체크 (USERS.credits ≥ 50)</p>
                    <p className="ml-4 text-slate-400">→ CONTENTS 테이블에 레코드 생성 (type=video, sourceContentId=대본ID)</p>
                    <p className="ml-4 text-slate-400">→ USERS.credits 차감 (영상 생성 비용: 50 크레딧)</p>
                    <p className="ml-4 text-slate-400">→ CREDIT_HISTORY에 USE 타입 기록</p>
                    <p className="ml-4 text-slate-400">→ 백엔드 작업 큐에 추가 (Celery/Redis)</p>
                    <p className="ml-4 text-slate-400">→ 씬별 이미지 생성 (ImageFX/Whisk/DALL-E)</p>
                    <p className="ml-4 text-slate-400">→ TTS 생성 (OpenAI TTS)</p>
                    <p className="ml-4 text-slate-400">→ 자막 생성 (ASS/SRT)</p>
                    <p className="ml-4 text-slate-400">→ FFmpeg로 씬 병합 및 최종 영상 생성</p>
                    <p className="ml-4 text-slate-400">→ status=completed, videoPath/thumbnailPath 저장</p>
                    <p className="ml-4 text-slate-400">→ 실패 시 status=failed, 크레딧 환불</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">5️⃣ YouTube 업로드 프로세스</h4>
                    <p className="mb-1">사용자가 완료된 영상을 YouTube에 업로드</p>
                    <p className="ml-4 text-slate-400">→ YouTube Data API v3 호출 (OAuth 인증)</p>
                    <p className="ml-4 text-slate-400">→ YOUTUBE_UPLOADS에 업로드 기록 생성 (contentId 연결)</p>
                    <p className="ml-4 text-slate-400">→ youtubeVideoId 저장 (업로드 완료 시)</p>
                    <p className="ml-4 text-slate-400">→ CONTENTS.published=1, publishedAt 업데이트</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
                <h3 className="mb-4 text-xl font-bold text-red-300">⚠️ 크레딧 환불 로직</h3>
                <div className="space-y-3 text-sm text-slate-300">
                  <div>
                    <h4 className="font-semibold text-white mb-1">환불 트리거 조건</h4>
                    <p>• 대본 생성 실패 (CONTENTS.type=script, status=failed)</p>
                    <p>• 영상 생성 실패 (CONTENTS.type=video, status=failed)</p>
                    <p>• 사용자가 진행 중인 작업 취소</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">환불 프로세스</h4>
                    <p className="mb-1">1. USERS.credits에 사용한 크레딧 복원</p>
                    <p className="mb-1">2. CREDIT_HISTORY에 REFUND 타입 레코드 생성</p>
                    <p className="ml-4 text-slate-400">→ amount: 환불 금액</p>
                    <p className="ml-4 text-slate-400">→ balanceAfter: 환불 후 잔액</p>
                    <p className="ml-4 text-slate-400">→ description: 실패/취소 사유</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">환불 제약 사항</h4>
                    <p>• 이미 completed 상태인 작업은 환불 불가</p>
                    <p>• 환불은 1회만 가능 (중복 환불 방지)</p>
                    <p>• 관리자는 ADMIN_GRANT로 수동 크레딧 부여 가능</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6">
                <h3 className="mb-4 text-xl font-bold text-yellow-300">📈 성능 최적화 전략</h3>
                <div className="space-y-3 text-sm text-slate-300">
                  <div>
                    <h4 className="font-semibold text-white mb-1">데이터베이스 레벨</h4>
                    <p>• 복합 인덱스: (userId, status, createdAt) 순서 최적화</p>
                    <p>• 페이지네이션: LIMIT/OFFSET 대신 커서 기반 페이징 권장</p>
                    <p>• N+1 쿼리 방지: JOIN 또는 dataloader 사용</p>
                    <p>• 파티셔닝: USER_ACTIVITY_LOGS는 월별 파티션 권장</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">캐싱 전략</h4>
                    <p>• SETTINGS: Redis 캐싱 (TTL: 1시간)</p>
                    <p>• USERS.credits: 트랜잭션 내에서만 읽기 (동시성 이슈 방지)</p>
                    <p>• CONTENTS 목록: 페이지별 캐싱 권장 (TTL: 5분)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">파일 저장 최적화</h4>
                    <p>• CONTENTS.videoPath: S3/R2 같은 오브젝트 스토리지 사용</p>
                    <p>• 썸네일: CDN 캐싱 (CloudFront/Cloudflare)</p>
                    <p>• 임시 파일: 생성 완료 후 자동 삭제 (cleanup job)</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-6">
                <h3 className="mb-4 text-xl font-bold text-cyan-300">🔍 모니터링 & 로깅</h3>
                <div className="space-y-3 text-sm text-slate-300">
                  <div>
                    <h4 className="font-semibold text-white mb-1">USER_ACTIVITY_LOGS 활용</h4>
                    <p>• 사용자별 활동 패턴 분석</p>
                    <p>• 비정상적인 API 호출 감지 (rate limiting)</p>
                    <p>• 인기 기능 파악 (대본/영상 생성 빈도)</p>
                    <p>• IP 기반 접근 제어 (악의적 사용자 차단)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">크레딧 시스템 모니터링</h4>
                    <p>• 일별/월별 크레딧 사용량 추이</p>
                    <p>• 환불 발생 빈도 (생성 실패율 지표)</p>
                    <p>• 충전 요청 처리 시간 (관리자 응답 속도)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">작업 큐 모니터링</h4>
                    <p>• SCRIPTS/VIDEOS의 PENDING → PROCESSING 시간</p>
                    <p>• PROCESSING → COMPLETED 평균 소요 시간</p>
                    <p>• 실패율 (FAILED 상태 비율)</p>
                    <p>• 재시도 횟수 (retryCount 통계)</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-pink-500/30 bg-pink-500/10 p-6">
                <h3 className="mb-4 text-xl font-bold text-pink-300">🛡️ 보안 고려사항</h3>
                <div className="space-y-3 text-sm text-slate-300">
                  <div>
                    <h4 className="font-semibold text-white mb-1">인증 & 인가</h4>
                    <p>• USERS.password: bcrypt 해싱 (salt rounds: 12)</p>
                    <p>• 세션 토큰: HTTP-only 쿠키 + CSRF 토큰</p>
                    <p>• 이메일 인증 강제: emailVerified = true 체크</p>
                    <p>• 관리자 권한: isAdmin = true 체크 (API 레벨)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">민감 데이터 암호화</h4>
                    <p>• YOUTUBE_CHANNELS.accessToken: AES-256 암호화</p>
                    <p>• YOUTUBE_CHANNELS.refreshToken: 별도 암호화 키 관리</p>
                    <p>• 환경 변수로 암호화 키 관리 (KMS 권장)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">SQL Injection 방어</h4>
                    <p>• Prepared Statements 사용 (파라미터 바인딩)</p>
                    <p>• ORM(Prisma/TypeORM) 활용</p>
                    <p>• 사용자 입력 검증 (Zod/Joi 스키마)</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-1">Rate Limiting</h4>
                    <p>• API 호출 제한: 사용자당 100req/분</p>
                    <p>• 대본 생성: 사용자당 10개/일</p>
                    <p>• 영상 생성: 사용자당 5개/일</p>
                    <p>• IP 기반 제한: 익명 사용자 차단</p>
                  </div>
                </div>
              </div>
          </div>
        )}

      {/* 맨 위로 버튼 */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 z-50 cursor-pointer rounded-full bg-purple-600 p-4 text-white shadow-lg transition hover:bg-purple-500 hover:shadow-xl"
        title="맨 위로"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>
      </div>
    </>
  );
}

export default function ArchitecturePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">로딩 중...</div>
      </div>
    }>
      <ArchitectureContent />
    </Suspense>
  );
}
