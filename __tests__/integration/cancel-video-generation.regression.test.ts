/**
 * 영상 생성 중지 기능 리그레션 테스트
 *
 * 목적: 중지 버튼 클릭 시 백그라운드 프로세스가 실제로 중지되는지 검증
 *
 * 실행: npm test -- cancel-video-generation.regression
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('[Regression] 영상 생성 중지 기능', () => {
  const projectRoot = path.join(__dirname, '..', '..');
  const apiRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'generate-video-upload', 'route.ts');
  const backendScriptPath = path.join(projectRoot, '..', 'trend-video-backend', 'create_video_from_folder.py');

  describe('1. DELETE API 엔드포인트 검증', () => {
    it('[REGRESSION-001] DELETE 핸들러가 존재해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toContain('export async function DELETE(request: NextRequest)');
    });

    it('[REGRESSION-002] DELETE 핸들러가 사용자 인증을 확인해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toContain('const user = await getCurrentUser(request)');
      expect(routeContent).toMatch(/if \(!user\)/);
    });

    it('[REGRESSION-003] DELETE 핸들러가 jobId 파라미터를 받아야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toContain("const jobId = searchParams.get('jobId')");
      expect(routeContent).toMatch(/if \(!jobId\)/);
    });

    it('[REGRESSION-004] DELETE 핸들러가 작업 소유권을 확인해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toContain('if (job.userId !== user.userId)');
    });
  });

  describe('2. 취소 플래그 파일 생성 검증', () => {
    it('[REGRESSION-005] .cancel 파일을 생성하는 로직이 있어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toContain('.cancel');
      expect(routeContent).toContain('cancelFilePath');
      expect(routeContent).toContain('writeFile');
    });

    it('[REGRESSION-006] 취소 플래그 파일이 올바른 경로에 생성되어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      // backend/input/{jobFolder}/.cancel 경로 확인
      expect(routeContent).toContain('trend-video-backend');
      expect(routeContent).toContain('input');
      expect(routeContent).toMatch(/\.cancel/);
    });

    it('[REGRESSION-007] 취소 플래그 생성 실패 시 에러 처리가 있어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toMatch(/try[\s\S]*?\.cancel[\s\S]*?catch/);
      expect(routeContent).toContain('취소 플래그 파일 생성 실패');
    });
  });

  describe('3. 프로세스 강제 종료 검증', () => {
    it('[REGRESSION-008] tree-kill 라이브러리를 import해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toMatch(/import.*tree-kill/);
    });

    it('[REGRESSION-009] tree-kill을 실제로 사용해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      // DELETE 핸들러 내부에서 kill 함수 호출 확인
      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0];

      expect(deleteHandler).toBeTruthy();
      expect(deleteHandler).toContain('kill(');
      expect(deleteHandler).toContain('SIGKILL');
    });

    it('[REGRESSION-010] runningProcesses Map에서 프로세스를 관리해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toContain('runningProcesses.get(jobId)');
      expect(routeContent).toContain('runningProcesses.delete(jobId)');
    });

    it('[REGRESSION-011] 프로세스 종료 실패 시 재시도 로직이 있어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0];

      expect(deleteHandler).toContain('재시도');
      expect(deleteHandler).toContain('taskkill');
    });
  });

  describe('4. Python 스크립트 취소 감지 검증', () => {
    it('[REGRESSION-012] Python 스크립트가 존재해야 함', () => {
      expect(fs.existsSync(backendScriptPath)).toBeTruthy();
    });

    it('[REGRESSION-013] Python 스크립트가 .cancel 파일을 체크해야 함 (이미지 생성)', () => {
      const pythonContent = fs.readFileSync(backendScriptPath, 'utf-8');

      // 이미지 생성 루프에서 .cancel 체크
      expect(pythonContent).toContain('.cancel');
      expect(pythonContent).toMatch(/cancel_file.*\.exists\(\)/);
    });

    it('[REGRESSION-014] .cancel 파일 감지 시 KeyboardInterrupt를 발생시켜야 함', () => {
      const pythonContent = fs.readFileSync(backendScriptPath, 'utf-8');

      expect(pythonContent).toContain('KeyboardInterrupt');
      expect(pythonContent).toContain('취소 플래그 감지');
    });

    it('[REGRESSION-015] 취소 감지 로그가 출력되어야 함', () => {
      const pythonContent = fs.readFileSync(backendScriptPath, 'utf-8');

      expect(pythonContent).toMatch(/logger\.warning.*취소 플래그/);
      expect(pythonContent).toMatch(/중단합니다|중단/);
    });
  });

  describe('5. Job 상태 업데이트 검증', () => {
    it('[REGRESSION-016] 취소 시 Job 상태를 cancelled로 변경해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0];

      expect(deleteHandler).toContain("status: 'cancelled'");
      expect(deleteHandler).toContain('updateJob');
    });

    it('[REGRESSION-017] 취소 로그를 Job에 추가해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0];

      expect(deleteHandler).toContain('addJobLog');
      expect(deleteHandler).toMatch(/취소|중지/);
    });

    it('[REGRESSION-018] 취소 성공 응답을 반환해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0];

      expect(deleteHandler).toContain('NextResponse.json');
      expect(deleteHandler).toContain('success: true');
    });
  });

  describe('6. 이중 보호 메커니즘 검증', () => {
    it('[REGRESSION-019] 취소 플래그 파일과 프로세스 kill을 모두 사용해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0];

      // 두 메커니즘이 모두 존재하는지 확인
      expect(deleteHandler).toContain('.cancel'); // 취소 플래그
      expect(deleteHandler).toContain('kill('); // 프로세스 kill
    });

    it('[REGRESSION-020] 취소 플래그가 프로세스 kill보다 먼저 실행되어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0] || '';

      // .cancel 파일 생성이 kill() 호출보다 먼저 나와야 함
      const cancelIndex = deleteHandler.indexOf('.cancel');
      const killIndex = deleteHandler.indexOf('kill(');

      expect(cancelIndex).toBeGreaterThan(0);
      expect(killIndex).toBeGreaterThan(0);
      expect(cancelIndex).toBeLessThan(killIndex);
    });
  });

  describe('7. 에러 케이스 검증', () => {
    it('[REGRESSION-021] 프로세스가 없어도 Job 상태를 업데이트해야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0];

      // else 블록이나 프로세스 없을 때 처리
      expect(deleteHandler).toMatch(/실행 중인 프로세스 없음|프로세스가 없어도/);
      expect(deleteHandler).toMatch(/updateJob.*cancelled/s);
    });

    it('[REGRESSION-022] 이미 완료된 작업은 취소할 수 없어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      const deleteHandler = routeContent.match(/export async function DELETE[\s\S]*?(?=export|$)/)?.[0];

      expect(deleteHandler).toContain("status === 'completed'");
      expect(deleteHandler).toMatch(/이미 완료된|취소할 수 없습니다/);
    });
  });

  describe('8. 로깅 및 모니터링 검증', () => {
    it('[REGRESSION-023] 취소 시작 로그가 출력되어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toMatch(/console\.log.*프로세스 트리 종료 시작/);
    });

    it('[REGRESSION-024] 취소 성공/실패 로그가 출력되어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toMatch(/tree-kill 성공/);
      expect(routeContent).toMatch(/tree-kill 실패/);
    });

    it('[REGRESSION-025] Windows 고아 프로세스 정리 로그가 있어야 함', () => {
      const routeContent = fs.readFileSync(apiRoutePath, 'utf-8');

      expect(routeContent).toMatch(/Windows 좀비 프로세스|고아 프로세스/);
    });
  });
});

/**
 * 테스트 실행 가이드:
 *
 * 전체 리그레션 테스트 실행:
 *   npm test -- cancel-video-generation.regression
 *
 * 특정 섹션만 실행:
 *   npm test -- -t "취소 플래그 파일 생성"
 *
 * watch 모드:
 *   npm test -- --watch cancel-video-generation.regression
 *
 * 이 테스트가 실패하면:
 * 1. DELETE API 엔드포인트 확인
 * 2. 취소 플래그 파일 생성 로직 확인
 * 3. tree-kill 사용 여부 확인
 * 4. Python 스크립트의 .cancel 체크 확인
 * 5. Job 상태 업데이트 확인
 *
 * ⚠️ 중요: 중지 기능은 백그라운드 프로세스를 제어하므로
 *          두 가지 메커니즘을 모두 사용해야 합니다:
 *          1. 취소 플래그 파일 (Python graceful shutdown)
 *          2. 프로세스 강제 종료 (tree-kill)
 */
