/**
 * 폴더 열기 API 테스트
 * /api/open-folder 엔드포인트 검증
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('/api/open-folder API', () => {
  const apiPath = path.join(process.cwd(), 'src', 'app', 'api', 'open-folder', 'route.ts');

  it('API 파일이 존재해야 함', () => {
    expect(fs.existsSync(apiPath)).toBe(true);
  });

  it('GET과 POST 메소드가 모두 export 되어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('export async function POST');
    expect(content).toContain('export async function GET');
  });

  it('explorer.exe를 사용해야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('explorer.exe');
    expect(content).toContain('spawn');
  });

  it('직접 경로(directPath) 지원이 있어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('directPath');
    expect(content).toContain('path.isAbsolute');
  });

  it('project_ 폴더 자동 생성 로직이 있어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain("folderBasename.startsWith('project_')");
    expect(content).toContain('fs.mkdirSync');
  });

  it('story.json 생성 로직이 있어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('story.json');
    expect(content).toContain('storyJsonPath');
    expect(content).toContain('writeFileSync');
  });

  it('권한 확인이 있어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('getCurrentUser');
    expect(content).toContain('isAdmin');
  });
});
