/**
 * 다운로드 API 테스트
 * /api/automation/download 엔드포인트 검증
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('/api/automation/download API', () => {
  const apiPath = path.join(process.cwd(), 'src', 'app', 'api', 'automation', 'download', 'route.ts');

  it('API 파일이 존재해야 함', () => {
    expect(fs.existsSync(apiPath)).toBe(true);
  });

  it('GET 메소드가 export 되어야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('export async function GET');
  });

  it('4가지 다운로드 타입을 지원해야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');

    expect(content).toContain("case 'video':");
    expect(content).toContain("case 'script':");
    expect(content).toContain("case 'materials':");
    expect(content).toContain("case 'all':");
  });

  it('PowerShell Compress-Archive를 사용해야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('Compress-Archive');
    expect(content).toContain('powershell.exe');
  });

  it('파일명 sanitize를 해야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('sanitizedTitle');
    expect(content).toContain('replace');
  });

  it('input과 output 경로를 사용해야 함', () => {
    const content = fs.readFileSync(apiPath, 'utf-8');
    expect(content).toContain('inputPath');
    expect(content).toContain('outputPath');
    expect(content).toContain('project_');
  });
});
