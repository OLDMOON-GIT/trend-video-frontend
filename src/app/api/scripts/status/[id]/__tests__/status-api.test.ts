/**
 * 대본 상태 조회 API 테스트
 * /api/scripts/status/[id] 엔드포인트 검증
 *
 * 버그 수정 검증: 무한 루프 (대본 진행률 100%)
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('/api/scripts/status/[id] API', () => {
  const apiPath = path.join(process.cwd(), 'src', 'app', 'api', 'scripts', 'status', '[id]', 'route.ts');

  it('API 파일이 존재해야 함', () => {
    expect(fs.existsSync(apiPath)).toBe(true);
  });

  it('GET 메소드가 export 되어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('export async function GET');
  });

  describe('버그 수정 검증: 무한 루프 방지', () => {
    it('Invalid JSON 처리 시 failed 상태로 변경해야 함', () => {
      const content = fs.readFileSync(apiPath, 'utf-8');

      // Invalid JSON일 때 failed로 변경하는 로직이 있어야 함
      expect(content).toContain("actualStatus = 'failed'");

      // DB 업데이트도 있어야 함
      expect(content).toContain("SET status = 'failed'");
      expect(content).toContain('Invalid JSON content');
    });

    it('scenes가 없을 때 failed 상태로 변경해야 함', () => {
      const content = fs.readFileSync(apiPath, 'utf-8');

      expect(content).toContain('parsedContent.scenes');
      expect(content).toContain('scenes.length === 0');
      expect(content).toContain('No scenes in generated script');
    });

    it('processing 상태로 반환하면 안 됨 (무한 루프 원인)', () => {
      const content = fs.readFileSync(apiPath, 'utf-8');

      // catch 블록에서 actualStatus = 'processing'을 설정하면 안 됨
      const catchBlocks = content.match(/catch\s*\([^)]*\)\s*{[^}]*}/g) || [];

      catchBlocks.forEach(block => {
        expect(block).not.toContain("actualStatus = 'processing'");
      });
    });
  });

  it('JSON 정리 로직이 있어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');

    expect(content).toContain('contentStr.trim()');
    expect(content).toContain("contentStr.startsWith('JSON')");
    expect(content).toContain('contentStr.indexOf');
  });

  it('데이터베이스 조회가 있어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');

    expect(content).toContain('Database');
    expect(content).toContain('SELECT status, progress, error, content');
    expect(content).toContain('FROM contents');
    expect(content).toContain('WHERE id = ?');
  });
});
