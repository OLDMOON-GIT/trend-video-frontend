import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getCurrentUser } from '@/lib/session';

// 캐시 저장소
let promptCache: {
  content: string;
  filename: string;
  lastModified: number;
} | null = null;

export async function GET(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    // prompts 디렉토리에서 sora2_prompt로 시작하는 .txt 파일 찾기
    const projectRoot = process.cwd();
    const promptsDir = path.join(projectRoot, 'prompts');
    const files = await fs.readdir(promptsDir);

    const promptFile = files.find(file =>
      file.startsWith('sora2_prompt') && file.endsWith('.txt')
    );

    if (!promptFile) {
      return NextResponse.json(
        { error: 'prompts/sora2_prompt로 시작하는 .txt 파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const filePath = path.join(promptsDir, promptFile);
    const stats = await fs.stat(filePath);
    const lastModified = stats.mtimeMs;

    // 파일이 변경되었거나 캐시가 없으면 새로 읽기
    let content: string;
    let cached = false;

    if (promptCache &&
        promptCache.filename === promptFile &&
        promptCache.lastModified === lastModified) {
      console.log('📋 Sora2 프롬프트 캐시 사용:', promptFile);
      content = promptCache.content;
      cached = true;
    } else {
      console.log('📄 Sora2 프롬프트 파일 읽기:', promptFile);
      content = await fs.readFile(filePath, 'utf-8');

      // 캐시 업데이트
      promptCache = {
        content,
        filename: promptFile,
        lastModified
      };
    }

    // Accept 헤더 확인 - HTML 요청인지 JSON 요청인지
    const acceptHeader = request.headers.get('accept') || '';
    const wantsHtml = acceptHeader.includes('text/html');

    // 브라우저에서 직접 접근 시 HTML로 보기 좋게 표시
    if (wantsHtml) {
      const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sora2 프롬프트 편집기 - ${promptFile}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.8;
    }
    .header {
      border-bottom: 2px solid #334155;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 {
      margin: 0;
      color: #f1f5f9;
      font-size: 28px;
    }
    .meta {
      color: #94a3b8;
      font-size: 14px;
      margin-top: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 10px;
    }
    .badge.cached { background: #059669; color: white; }
    .badge.fresh { background: #2563eb; color: white; }
    .controls {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    .btn-primary:hover { background: #2563eb; }
    .btn-success {
      background: #10b981;
      color: white;
    }
    .btn-success:hover { background: #059669; }
    .btn-secondary {
      background: #64748b;
      color: white;
    }
    .btn-secondary:hover { background: #475569; }
    .editor-container {
      background: #1e293b;
      border-radius: 12px;
      border: 1px solid #334155;
      overflow: hidden;
      display: flex;
    }
    .line-numbers {
      background: #0f172a;
      color: #64748b;
      padding: 30px 10px;
      text-align: right;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      line-height: 1.6;
      user-select: none;
      border-right: 1px solid #334155;
      min-width: 50px;
    }
    .line-numbers div {
      padding: 0 5px;
    }
    #editor {
      flex: 1;
      min-height: 600px;
      padding: 30px;
      background: #1e293b;
      color: #e2e8f0;
      border: none;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      line-height: 1.6;
      resize: vertical;
    }
    #editor:focus {
      outline: none;
      background: #1e293b;
    }
    .status {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .status.success {
      background: #064e3b;
      border: 1px solid #059669;
      color: #6ee7b7;
      display: block;
    }
    .status.error {
      background: #7f1d1d;
      border: 1px solid #dc2626;
      color: #fca5a5;
      display: block;
    }
    .readonly-mode .btn-success,
    .readonly-mode .btn-secondary { display: none; }
    .readonly-mode #editor {
      background: #0f172a;
      cursor: not-allowed;
    }
    .version-panel {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      width: 400px;
      background: #1e293b;
      border-left: 1px solid #334155;
      box-shadow: -4px 0 20px rgba(0,0,0,0.5);
      z-index: 1000;
      padding: 20px;
      overflow-y: auto;
    }
    .version-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #334155;
    }
    .version-header h3 {
      margin: 0;
      color: #f1f5f9;
      font-size: 18px;
    }
    .version-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .version-item {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .version-item:hover {
      border-color: #3b82f6;
      background: #1e293b;
    }
    .version-date {
      font-size: 14px;
      font-weight: 600;
      color: #e2e8f0;
      margin-bottom: 5px;
    }
    .version-filename {
      font-size: 12px;
      color: #94a3b8;
      font-family: monospace;
    }
    #validationResults {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .validation-title {
      color: #f59e0b;
      font-size: 20px;
      margin: 0 0 20px 0;
      padding-bottom: 15px;
      border-bottom: 1px solid #334155;
    }
    .issue-section {
      margin-bottom: 20px;
    }
    .issue-section h3 {
      color: #ef4444;
      font-size: 16px;
      margin-bottom: 10px;
    }
    .warning-section h3 {
      color: #f59e0b;
    }
    .success-section h3 {
      color: #10b981;
    }
    .issue-item, .warning-item {
      background: #0f172a;
      border-left: 3px solid #ef4444;
      padding: 12px;
      margin-bottom: 10px;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.5;
      color: #e2e8f0;
      cursor: pointer;
      transition: all 0.2s;
    }
    .issue-item:hover, .warning-item:hover {
      background: #1e293b;
      border-left-width: 4px;
    }
    .warning-item {
      border-left-color: #f59e0b;
    }
    .fix-suggestions {
      margin-top: 20px;
      padding: 15px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
    }
    .fix-suggestions h3 {
      color: #3b82f6;
      font-size: 16px;
      margin-bottom: 15px;
    }
    .fix-item {
      background: #1e293b;
      border: 1px solid #475569;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 6px;
    }
    .fix-item-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 10px;
    }
    .fix-title {
      color: #60a5fa;
      font-weight: 600;
      font-size: 14px;
    }
    .fix-description {
      color: #94a3b8;
      font-size: 13px;
      margin-bottom: 10px;
    }
    .btn-apply {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-apply:hover {
      background: #2563eb;
    }
    .diff-view {
      margin-top: 10px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 10px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      max-height: 200px;
      overflow-y: auto;
    }
    .diff-line {
      padding: 2px 5px;
      line-height: 1.5;
    }
    .diff-line.removed {
      background: #7f1d1d40;
      color: #fca5a5;
    }
    .diff-line.added {
      background: #064e3b40;
      color: #6ee7b7;
    }
    .diff-line.context {
      color: #94a3b8;
    }
    .side-by-side-diff {
      display: flex;
      gap: 2px;
      margin-top: 10px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      overflow: hidden;
      position: relative;
    }
    .diff-column {
      flex: 1;
      overflow-y: auto;
      max-height: 500px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
    }
    .diff-column-header {
      background: #1e293b;
      padding: 8px 12px;
      font-weight: 600;
      border-bottom: 1px solid #334155;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .diff-column-header.original {
      color: #fca5a5;
      background: #7f1d1d30;
    }
    .diff-column-header.modified {
      color: #6ee7b7;
      background: #064e3b30;
    }
    .diff-column-content {
      padding: 0;
    }
    .diff-code-line {
      padding: 4px 12px;
      line-height: 1.8;
      white-space: pre-wrap;
      word-break: break-all;
      min-height: 28px;
      border-left: 3px solid transparent;
      transition: all 0.15s;
    }
    .diff-code-line:hover {
      background: #1e293b !important;
    }
    .diff-code-line.removed {
      background: #7f1d1d40;
      color: #fca5a5;
      border-left-color: #dc2626;
    }
    .diff-code-line.added {
      background: #064e3b40;
      color: #6ee7b7;
      border-left-color: #10b981;
    }
    .diff-code-line.unchanged {
      color: #64748b;
      background: #0f172a;
    }
    .diff-code-line.empty {
      background: #1e293b;
      color: #475569;
    }
    .line-number {
      display: inline-block;
      width: 40px;
      color: #475569;
      text-align: right;
      margin-right: 12px;
      user-select: none;
    }
    .char-removed {
      background: #991b1b;
      color: #fca5a5;
      padding: 0 2px;
    }
    .char-added {
      background: #065f46;
      color: #6ee7b7;
      padding: 0 2px;
    }
    .diff-stats {
      display: flex;
      gap: 20px;
      padding: 10px;
      background: #1e293b;
      border-radius: 6px;
      margin-bottom: 10px;
      font-size: 13px;
    }
    .diff-stat-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .diff-stat-item.added {
      color: #6ee7b7;
    }
    .diff-stat-item.removed {
      color: #fca5a5;
    }
    .diff-stat-item.unchanged {
      color: #94a3b8;
    }
    .scroll-to-top {
      position: fixed;
      right: 30px;
      bottom: 30px;
      width: 50px;
      height: 50px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 50%;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      transition: all 0.3s;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .scroll-to-top.visible {
      opacity: 1;
      visibility: visible;
    }
    .scroll-to-top:hover {
      background: #2563eb;
      transform: translateY(-3px);
      box-shadow: 0 6px 16px rgba(59, 130, 246, 0.6);
    }
    .scroll-to-top:active {
      transform: translateY(-1px);
    }
  </style>
</head>
<body>
  <!-- 네비게이션 -->
  <div style="margin-bottom: 20px;">
    <a href="/" style="color: #a78bfa; text-decoration: none; font-weight: 600; font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='#c4b5fd'" onmouseout="this.style.color='#a78bfa'">
      🏠 HOME
    </a>
    <span style="color: #64748b; margin: 0 8px;">/</span>
    <a href="/admin" style="color: #a78bfa; text-decoration: none; font-weight: 600; font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='#c4b5fd'" onmouseout="this.style.color='#a78bfa'">
      관리자
    </a>
    <span style="color: #64748b; margin: 0 8px;">/</span>
    <a href="/admin/prompts" style="color: #a78bfa; text-decoration: none; font-weight: 600; font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='#c4b5fd'" onmouseout="this.style.color='#a78bfa'">
      프롬프트 관리
    </a>
    <span style="color: #64748b; margin: 0 8px;">/</span>
    <span style="color: #94a3b8; font-weight: 600; font-size: 14px;">Sora2 프롬프트</span>
  </div>

  <div class="header">
    <div>
      <h1>📱 ${promptFile} <span class="badge ${cached ? 'cached' : 'fresh'}">${cached ? '캐시됨' : '새로 읽음'}</span></h1>
      <div class="meta">
        마지막 수정: ${new Date(lastModified).toLocaleString('ko-KR')}
        • 크기: ${(content.length / 1024).toFixed(2)} KB
        • 줄 수: ${content.split('\n').length}줄
      </div>
    </div>
  </div>

  <div id="status" class="status"></div>

  <div class="controls">
    <button class="btn btn-primary" id="editBtn" onclick="toggleEdit()">✏️ 편집 모드</button>
    <button class="btn btn-secondary" id="copyBtn" onclick="copyToClipboard()">📋 복사</button>
    <button class="btn btn-primary" id="checkBtn" onclick="checkPrompt()" style="display: none;">🔍 검사</button>
    <button class="btn btn-success" id="saveBtn" onclick="savePrompt()" style="display: none;">💾 저장</button>
    <button class="btn btn-secondary" id="cancelBtn" onclick="cancelEdit()" style="display: none;">✕ 취소</button>
    <button class="btn btn-secondary" onclick="toggleVersions()">📜 버전 히스토리</button>
  </div>

  <div id="versionPanel" class="version-panel" style="display: none;">
    <div class="version-header">
      <h3>📜 버전 히스토리</h3>
      <button onclick="toggleVersions()" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 24px;">✕</button>
    </div>
    <div id="versionList" class="version-list">
      <p style="color: #94a3b8; text-align: center;">로딩 중...</p>
    </div>
  </div>

  <div class="editor-container">
    <div id="lineNumbers" class="line-numbers"></div>
    <textarea id="editor" readonly></textarea>
  </div>

  <!-- 검사 결과 영역 (페이지 내 표시) -->
  <div id="validationResults" style="margin-top: 20px; display: none;">
  </div>

  <!-- 맨 위로 가기 플로팅 버튼 -->
  <button id="scrollToTop" class="scroll-to-top" onclick="scrollToTop()">
    ↑
  </button>

  <script>
    const originalContent = ${JSON.stringify(content)};
    const editor = document.getElementById('editor');
    const lineNumbers = document.getElementById('lineNumbers');
    const editBtn = document.getElementById('editBtn');
    const checkBtn = document.getElementById('checkBtn');
    const saveBtn = document.getElementById('saveBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const status = document.getElementById('status');

    editor.value = originalContent;

    // 라인 번호 업데이트 함수
    function updateLineNumbers() {
      const lines = editor.value.split('\\n').length;
      let numbersHtml = '';
      for (let i = 1; i <= lines; i++) {
        numbersHtml += \`<div>\${i}</div>\`;
      }
      lineNumbers.innerHTML = numbersHtml;
    }

    // 스크롤 동기화
    editor.addEventListener('scroll', () => {
      lineNumbers.scrollTop = editor.scrollTop;
    });

    // 입력 시 라인 번호 업데이트
    editor.addEventListener('input', updateLineNumbers);

    // 초기 라인 번호 생성
    updateLineNumbers();

    // 맨 위로 가기 버튼 관련
    const scrollToTopBtn = document.getElementById('scrollToTop');

    // 스크롤 이벤트 감지
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        scrollToTopBtn.classList.add('visible');
      } else {
        scrollToTopBtn.classList.remove('visible');
      }
    });

    // 맨 위로 스크롤 함수
    function scrollToTop() {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }

    // 클립보드에 복사
    async function copyToClipboard() {
      try {
        await navigator.clipboard.writeText(editor.value);
        showStatus('✅ 클립보드에 복사되었습니다!', 'success');

        // 버튼 텍스트 일시적으로 변경
        const copyBtn = document.getElementById('copyBtn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ 복사됨';
        copyBtn.style.background = '#10b981';

        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 2000);
      } catch (error) {
        // 클립보드 API가 실패하면 폴백 방법 사용
        editor.select();
        document.execCommand('copy');
        showStatus('✅ 클립보드에 복사되었습니다!', 'success');
      }
    }

    function toggleEdit() {
      editor.readOnly = false;
      editor.setSelectionRange(0, 0); // 커서를 맨 앞으로 이동
      editor.scrollTop = 0; // 스크롤을 맨 위로
      lineNumbers.scrollTop = 0; // 라인 번호도 맨 위로
      editor.focus();
      editBtn.style.display = 'none';
      checkBtn.style.display = 'block';
      saveBtn.style.display = 'block';
      cancelBtn.style.display = 'block';
      document.body.classList.remove('readonly-mode');
      showStatus('편집 모드 활성화', 'success');
    }

    function cancelEdit() {
      editor.value = originalContent;
      editor.readOnly = true;
      editBtn.style.display = 'block';
      checkBtn.style.display = 'none';
      saveBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      document.body.classList.add('readonly-mode');
      updateLineNumbers();
      showStatus('변경 사항이 취소되었습니다', 'success');
    }

    function validatePrompt(content) {
      const issues = [];
      const warnings = [];
      const contentLines = content.split('\\n');

      // 기본 검사
      if (!content.trim()) {
        issues.push({ message: '프롬프트 내용이 비어있습니다.', line: null });
        return { valid: false, issues, warnings };
      }

      // 길이 검사
      const lines = contentLines.length;
      if (lines < 50) {
        warnings.push({ message: \`프롬프트가 너무 짧습니다 (\${lines}줄). 최소 50줄 권장.\`, line: null });
      }
      if (lines > 1000) {
        warnings.push({ message: \`프롬프트가 매우 깁니다 (\${lines}줄). Claude가 모든 내용을 처리하지 못할 수 있습니다.\`, line: null });
      }

      // 필수 키워드 검사
      const requiredKeywords = [
        { keyword: '주제', name: '주제' },
        { keyword: 'JSON', name: 'JSON' },
        { keyword: '씬', name: '씬' },
        { keyword: '대본', name: '대본' },
        { keyword: 'ImageFX', name: 'ImageFX' }
      ];

      const missingKeywords = [];
      requiredKeywords.forEach(({ keyword, name }) => {
        const lineNum = contentLines.findIndex(line => line.includes(keyword));
        if (lineNum === -1) {
          missingKeywords.push(name);
        }
      });

      if (missingKeywords.length > 0) {
        warnings.push({
          message: \`필수 키워드 누락: \${missingKeywords.join(', ')}\`,
          line: 1
        });
      }

      // 중복 문장 검사 (3줄 이상 동일한 패턴)
      const filteredLines = contentLines.filter(line => line.trim().length > 20);
      const lineMap = new Map();

      filteredLines.forEach((line, idx) => {
        const normalized = line.trim().toLowerCase();
        if (!lineMap.has(normalized)) {
          lineMap.set(normalized, []);
        }
        // 원본 라인 번호 찾기
        const originalLineNum = contentLines.findIndex((l, i) => i >= (lineMap.get(normalized).length > 0 ? lineMap.get(normalized)[lineMap.get(normalized).length - 1] + 1 : 0) && l.trim().toLowerCase() === normalized);
        lineMap.get(normalized).push(originalLineNum);
      });

      lineMap.forEach((lineNumbers, text) => {
        if (lineNumbers.length >= 3) {
          warnings.push({
            message: \`중복된 문장 발견: "\${text.substring(0, 50)}..." (x\${lineNumbers.length})\`,
            line: lineNumbers[0] + 1
          });
        }
      });

      // JSON 스키마 존재 확인
      const jsonLineNum = contentLines.findIndex(line => line.includes('{'));
      if (jsonLineNum === -1) {
        warnings.push({
          message: 'JSON 예시 스키마가 없습니다. 출력 형식이 불명확할 수 있습니다.',
          line: null
        });
      }

      // 모순된 지시사항 검사
      const contradictionChecks = [
        { check1: '무질문', check2: '질문', message: '"무질문"과 "질문" 지시가 동시에 존재합니다.' },
        { check1: '무요약', check2: '요약', message: '"무요약"과 "요약" 지시가 동시에 존재합니다.' },
        { check1: 'JSON만', check2: '설명', message: '"JSON만 출력"과 "설명" 지시가 동시에 존재합니다.' }
      ];

      contradictionChecks.forEach(({ check1, check2, message }) => {
        const line1 = contentLines.findIndex(line => line.includes(check1));
        const line2 = contentLines.findIndex(line => line.includes(check2));
        if (line1 !== -1 && line2 !== -1) {
          warnings.push({
            message,
            line: line1 + 1
          });
        }
      });

      return {
        valid: issues.length === 0,
        issues,
        warnings
      };
    }

    // 자동 수정 제안 생성
    function generateFixSuggestions(content, validation) {
      const suggestions = [];

      // 중복 문장 제거 제안
      const contentLines = content.split('\\n').filter(line => line.trim().length > 20);
      const lineCount = {};
      const duplicateLines = new Set();

      contentLines.forEach(line => {
        const normalized = line.trim().toLowerCase();
        lineCount[normalized] = (lineCount[normalized] || 0) + 1;
      });

      Object.entries(lineCount).forEach(([line, count]) => {
        if (count >= 3) {
          duplicateLines.add(line);
        }
      });

      if (duplicateLines.size > 0) {
        duplicateLines.forEach(dupLine => {
          const original = contentLines.find(l => l.trim().toLowerCase() === dupLine);
          suggestions.push({
            title: '중복 문장 제거',
            description: \`"\${original.substring(0, 60)}..." 문장이 \${lineCount[dupLine]}번 반복됩니다\`,
            type: 'remove-duplicates',
            target: original,
            replacement: null
          });
        });
      }

      // 모순된 지시사항 제거 제안
      if (content.includes('무질문') && content.includes('질문')) {
        suggestions.push({
          title: '모순 제거: 무질문',
          description: '"무질문" 지시가 있는데 "질문"도 포함되어 있습니다. "무질문" 제거를 제안합니다.',
          type: 'remove-text',
          target: '무질문',
          replacement: ''
        });
      }

      if (content.includes('무요약') && content.includes('요약')) {
        suggestions.push({
          title: '모순 제거: 무요약',
          description: '"무요약" 지시가 있는데 "요약"도 포함되어 있습니다. "무요약" 제거를 제안합니다.',
          type: 'remove-text',
          target: '무요약',
          replacement: ''
        });
      }

      // 너무 긴 프롬프트 경고
      const lines = content.split('\\n').length;
      if (lines > 500) {
        suggestions.push({
          title: '프롬프트 길이 최적화',
          description: \`현재 \${lines}줄입니다. 핵심 내용만 남기고 불필요한 설명을 줄이는 것을 권장합니다.\`,
          type: 'manual',
          target: null,
          replacement: null
        });
      }

      return suggestions;
    }

    // 문자 단위 diff 계산 (IntelliJ 스타일)
    function getCharDiff(str1, str2) {
      if (!str1 || !str2) return { html1: escapeHtml(str1 || ''), html2: escapeHtml(str2 || '') };

      const len1 = str1.length;
      const len2 = str2.length;
      const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

      // LCS 계산
      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          if (str1[i - 1] === str2[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }

      // 역추적하여 diff 생성
      let i = len1, j = len2;
      const result1 = [], result2 = [];

      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && str1[i - 1] === str2[j - 1]) {
          result1.unshift(escapeHtml(str1[i - 1]));
          result2.unshift(escapeHtml(str2[j - 1]));
          i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          result2.unshift(\`<span class="char-added">\${escapeHtml(str2[j - 1])}</span>\`);
          j--;
        } else if (i > 0) {
          result1.unshift(\`<span class="char-removed">\${escapeHtml(str1[i - 1])}</span>\`);
          i--;
        }
      }

      return {
        html1: result1.join(''),
        html2: result2.join('')
      };
    }

    // side-by-side diff 생성 함수 (IntelliJ 스타일 문자 단위 diff 포함)
    function generateSideBySideDiff(original, modified) {
      const originalLines = original.split('\\n');
      const modifiedLines = modified.split('\\n');
      const maxLines = Math.max(originalLines.length, modifiedLines.length);

      let addedCount = 0;
      let removedCount = 0;
      let unchangedCount = 0;

      const originalHtml = [];
      const modifiedHtml = [];

      for (let i = 0; i < maxLines; i++) {
        const origLine = originalLines[i];
        const modLine = modifiedLines[i];

        // 원본 줄 처리
        if (origLine !== undefined) {
          if (modLine === undefined) {
            // 삭제된 줄
            originalHtml.push(\`<div class="diff-code-line removed" data-line="\${i}"><span class="line-number">\${i + 1}</span>\${escapeHtml(origLine) || ' '}</div>\`);
            removedCount++;
          } else if (origLine === modLine) {
            // 변경되지 않은 줄
            originalHtml.push(\`<div class="diff-code-line unchanged" data-line="\${i}"><span class="line-number">\${i + 1}</span>\${escapeHtml(origLine) || ' '}</div>\`);
            unchangedCount++;
          } else {
            // 변경된 줄 - 문자 단위 diff 적용
            const charDiff = getCharDiff(origLine, modLine);
            originalHtml.push(\`<div class="diff-code-line removed" data-line="\${i}"><span class="line-number">\${i + 1}</span>\${charDiff.html1 || ' '}</div>\`);
            removedCount++;
          }
        } else {
          // 빈 줄 (추가된 줄과 매칭)
          originalHtml.push(\`<div class="diff-code-line empty" data-line="\${i}"><span class="line-number"></span> </div>\`);
        }

        // 수정본 줄 처리
        if (modLine !== undefined) {
          if (origLine === undefined) {
            // 추가된 줄
            modifiedHtml.push(\`<div class="diff-code-line added" data-line="\${i}"><span class="line-number">\${i + 1}</span>\${escapeHtml(modLine) || ' '}</div>\`);
            addedCount++;
          } else if (origLine === modLine) {
            // 변경되지 않은 줄
            modifiedHtml.push(\`<div class="diff-code-line unchanged" data-line="\${i}"><span class="line-number">\${i + 1}</span>\${escapeHtml(modLine) || ' '}</div>\`);
          } else {
            // 변경된 줄 - 문자 단위 diff 적용
            const charDiff = getCharDiff(origLine, modLine);
            modifiedHtml.push(\`<div class="diff-code-line added" data-line="\${i}"><span class="line-number">\${i + 1}</span>\${charDiff.html2 || ' '}</div>\`);
            addedCount++;
          }
        } else {
          // 빈 줄 (삭제된 줄과 매칭)
          modifiedHtml.push(\`<div class="diff-code-line empty" data-line="\${i}"><span class="line-number"></span> </div>\`);
        }
      }

      return {
        originalHtml: originalHtml.join(''),
        modifiedHtml: modifiedHtml.join(''),
        stats: {
          original: originalLines.length,
          modified: modifiedLines.length,
          added: addedCount,
          removed: removedCount,
          unchanged: unchangedCount,
          changed: addedCount + removedCount
        }
      };
    }

    // 전체 수정 적용 함수
    function applyAllFixes() {
      const validation = validatePrompt(editor.value);
      const suggestions = generateFixSuggestions(editor.value, validation);

      if (suggestions.filter(s => s.type !== 'manual').length === 0) {
        alert('적용할 자동 수정 사항이 없습니다.');
        return;
      }

      let modifiedContent = editor.value;

      // 모든 수정사항 적용
      suggestions.forEach(suggestion => {
        if (suggestion.type === 'remove-duplicates') {
          // 중복 제거: 첫 번째만 남기고 나머지 제거
          const lines = modifiedContent.split('\\n');
          const seen = new Set();
          const filtered = lines.filter(line => {
            const normalized = line.trim().toLowerCase();
            if (normalized === suggestion.target.trim().toLowerCase()) {
              if (seen.has(normalized)) {
                return false; // 중복 제거
              }
              seen.add(normalized);
            }
            return true;
          });
          modifiedContent = filtered.join('\\n');
        } else if (suggestion.type === 'remove-text') {
          // 텍스트 제거
          modifiedContent = modifiedContent.replace(new RegExp(suggestion.target, 'g'), suggestion.replacement);
        }
      });

      // side-by-side diff 생성
      const diff = generateSideBySideDiff(editor.value, modifiedContent);

      const appliedCount = suggestions.filter(s => s.type !== 'manual').length;

      // 수정사항 목록 HTML 생성
      const suggestionsHtml = suggestions
        .filter(s => s.type !== 'manual')
        .map(s => \`
          <div style="padding: 5px 0; border-bottom: 1px solid #334155;">
            ✓ <span style="color: #60a5fa;">\${s.title}</span>: \${s.description}
          </div>
        \`).join('');

      // 전역 변수에 저장 (onclick에서 사용)
      window.__tempModifiedContent = modifiedContent;

      // 페이지 내 결과 영역에 표시
      const resultsContainer = document.getElementById('validationResults');
      resultsContainer.innerHTML = \`
        <h2 class="validation-title">🔧 \${appliedCount}개 수정사항 적용 미리보기</h2>
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 20px;">
          <div style="background: #1e293b; padding: 10px; border-radius: 6px; margin-bottom: 15px;">
            <div style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
              \${suggestionsHtml}
            </div>
          </div>

          <div class="diff-stats">
            <div class="diff-stat-item removed">
              <span>➖ 삭제:</span>
              <strong>\${diff.stats.removed}줄</strong>
            </div>
            <div class="diff-stat-item added">
              <span>➕ 추가:</span>
              <strong>\${diff.stats.added}줄</strong>
            </div>
            <div class="diff-stat-item unchanged">
              <span>⚪ 변경없음:</span>
              <strong>\${diff.stats.unchanged}줄</strong>
            </div>
            <div class="diff-stat-item">
              <span>📊 전체:</span>
              <strong>\${diff.stats.original}줄 → \${diff.stats.modified}줄</strong>
            </div>
          </div>

          <div class="side-by-side-diff" id="sideBySideDiff">
            <div class="diff-column" id="diffOriginalColumn">
              <div class="diff-column-header original">❌ 원본 (\${diff.stats.original}줄)</div>
              <div class="diff-column-content">\${diff.originalHtml}</div>
            </div>
            <div class="diff-column" id="diffModifiedColumn">
              <div class="diff-column-header modified">✅ 수정본 (\${diff.stats.modified}줄)</div>
              <div class="diff-column-content">\${diff.modifiedHtml}</div>
            </div>
          </div>
          <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
            <button onclick="confirmApplyAllFixes()" class="btn-apply" style="padding: 10px 24px; font-size: 14px;">
              ✅ 적용하기
            </button>
            <button onclick="checkPrompt()" class="btn-apply" style="background: #64748b; padding: 10px 24px; font-size: 14px;">
              ← 돌아가기
            </button>
          </div>
        </div>
      \`;

      resultsContainer.style.display = 'block';
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // 스크롤 동기화 설정
      setTimeout(() => {
        const originalCol = document.getElementById('diffOriginalColumn');
        const modifiedCol = document.getElementById('diffModifiedColumn');

        if (originalCol && modifiedCol) {
          originalCol.addEventListener('scroll', () => {
            modifiedCol.scrollTop = originalCol.scrollTop;
          });

          modifiedCol.addEventListener('scroll', () => {
            originalCol.scrollTop = modifiedCol.scrollTop;
          });
        }
      }, 100);

      showStatus(\`🔧 \${appliedCount}개 수정사항 미리보기 준비됨\`, 'success');
    }

    function confirmApplyAllFixes() {
      try {
        const modifiedContent = window.__tempModifiedContent;
        if (!modifiedContent) {
          showStatus('❌ 수정 내용을 찾을 수 없습니다', 'error');
          return;
        }

        editor.value = modifiedContent;
        showStatus('✅ 수정이 적용되었습니다. 재검사 중...', 'success');

        // 재검사
        setTimeout(() => {
          checkPrompt();

          // 재검사 후 문제가 없으면 저장 제안
          setTimeout(() => {
            const validation = validatePrompt(editor.value);
            if (validation.valid && validation.warnings.length === 0) {
              const resultsContainer = document.getElementById('validationResults');
              resultsContainer.innerHTML = \`
                <h2 class="validation-title">✅ 수정 완료</h2>
                <div class="issue-section success-section">
                  <h3>✅ 검사 완료</h3>
                  <div style="background: #064e3b; border-left: 3px solid #10b981; padding: 12px; border-radius: 6px; color: #6ee7b7; margin-bottom: 15px;">
                    프롬프트에 문제가 없습니다!
                  </div>
                  <div style="text-align: center; margin-top: 20px;">
                    <button onclick="savePrompt()" class="btn-apply" style="padding: 12px 30px; font-size: 16px; background: #10b981;">
                      💾 저장하기
                    </button>
                    <button onclick="closeValidationResults()" class="btn-apply" style="background: #64748b; padding: 12px 30px; font-size: 16px; margin-left: 10px;">
                      닫기
                    </button>
                  </div>
                </div>
              \`;
              resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 1000);
        }, 500);
      } catch (e) {
        console.error(e);
        showStatus('❌ 수정 적용 실패', 'error');
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function closeValidationResults() {
      document.getElementById('validationResults').style.display = 'none';
    }

    function goToLine(lineNum) {
      if (!lineNum) return;

      // 편집 모드가 아니면 활성화
      if (editor.readOnly) {
        toggleEdit();
      }

      // 해당 라인으로 이동
      const lines = editor.value.split('\\n');
      let charPos = 0;
      for (let i = 0; i < lineNum - 1 && i < lines.length; i++) {
        charPos += lines[i].length + 1; // +1 for newline
      }

      // 커서 이동 및 선택
      editor.focus();
      editor.setSelectionRange(charPos, charPos + (lines[lineNum - 1]?.length || 0));

      // 스크롤 위치 계산 (대략적)
      const lineHeight = 22.4; // line-height 1.6 * font-size 14px
      const scrollPos = (lineNum - 1) * lineHeight;
      editor.scrollTop = Math.max(0, scrollPos - 200); // 200px 위쪽 여유
      lineNumbers.scrollTop = editor.scrollTop;

      showStatus(\`\${lineNum}번 줄로 이동했습니다\`, 'success');
    }

    function checkPrompt() {
      const newContent = editor.value;

      showStatus('🔍 프롬프트 검사 중...', 'success');
      const validation = validatePrompt(newContent);
      const suggestions = generateFixSuggestions(newContent, validation);

      // 페이지 내에 결과 표시
      const resultsContainer = document.getElementById('validationResults');

      let html = '<h2 class="validation-title">🔍 프롬프트 검사 결과</h2>';

      // 치명적 오류
      if (!validation.valid) {
        html += \`
          <div class="issue-section">
            <h3>❌ 치명적 문제 (\${validation.issues.length}개)</h3>
            \${validation.issues.map(issue => \`
              <div class="issue-item" \${issue.line ? \`onclick="goToLine(\${issue.line})" title="클릭하여 \${issue.line}번 줄로 이동"\` : ''}>
                \${issue.line ? \`<strong>[줄 \${issue.line}]</strong> \` : ''}\${issue.message}
              </div>
            \`).join('')}
          </div>
        \`;
      }

      // 경고
      if (validation.warnings.length > 0) {
        html += \`
          <div class="issue-section warning-section">
            <h3>⚠️ 경고 (\${validation.warnings.length}개)</h3>
            \${validation.warnings.map(warning => \`
              <div class="warning-item" \${warning.line ? \`onclick="goToLine(\${warning.line})" title="클릭하여 \${warning.line}번 줄로 이동"\` : ''}>
                \${warning.line ? \`<strong>[줄 \${warning.line}]</strong> \` : ''}\${warning.message}
              </div>
            \`).join('')}
          </div>
        \`;
      }

      // 성공
      if (validation.valid && validation.warnings.length === 0) {
        html += \`
          <div class="issue-section success-section">
            <h3>✅ 검사 완료</h3>
            <div style="background: #064e3b; border-left: 3px solid #10b981; padding: 12px; border-radius: 6px; color: #6ee7b7;">
              프롬프트에 문제가 없습니다!
            </div>
          </div>
        \`;
      }

      // 자동 수정 제안
      if (suggestions.length > 0) {
        const autoFixCount = suggestions.filter(s => s.type !== 'manual').length;
        html += \`
          <div class="fix-suggestions">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h3 style="margin: 0;">🔧 자동 수정 제안 (\${suggestions.length}개)</h3>
              \${autoFixCount > 0 ? \`
                <button onclick="applyAllFixes()" class="btn-apply" style="padding: 8px 16px; background: #10b981; font-size: 14px;">
                  ⚡ 전체 자동 수정 (\${autoFixCount}개)
                </button>
              \` : ''}
            </div>
            \${suggestions.map((sug, idx) => \`
              <div class="fix-item">
                <div class="fix-item-header">
                  <div class="fix-title">\${sug.title}</div>
                  \${sug.type === 'manual' ? \`<span style="color: #94a3b8; font-size: 12px;">수동 권장</span>\` : \`<span style="color: #10b981; font-size: 12px;">✓ 자동</span>\`}
                </div>
                <div class="fix-description">\${sug.description}</div>
              </div>
            \`).join('')}
          </div>
        \`;
      }

      resultsContainer.innerHTML = html;
      resultsContainer.style.display = 'block';

      // 결과 영역으로 스크롤
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // 상태바 업데이트
      if (!validation.valid) {
        showStatus(\`❌ \${validation.issues.length}개 문제 발견\`, 'error');
      } else if (validation.warnings.length > 0) {
        showStatus(\`⚠️ \${validation.warnings.length}개 경고\`, 'error');
      } else {
        showStatus('✅ 검사 완료!', 'success');
      }
    }

    async function savePrompt() {
      const newContent = editor.value;

      try {
        showStatus('💾 저장 중...', 'success');

        const response = await fetch('/api/sora2-prompt', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: newContent })
        });

        const data = await response.json();

        if (response.ok) {
          showStatus('✅ 저장 완료! 페이지를 새로고침합니다...', 'success');
          setTimeout(() => location.reload(), 1500);
        } else {
          showStatus('❌ 저장 실패: ' + data.error, 'error');
        }
      } catch (error) {
        showStatus('❌ 저장 중 오류 발생: ' + error.message, 'error');
      }
    }

    function showStatus(message, type) {
      status.textContent = message;
      status.className = 'status ' + type;
      setTimeout(() => {
        status.className = 'status';
      }, 5000);
    }

    // 버전 히스토리 관련 함수
    function toggleVersions() {
      const panel = document.getElementById('versionPanel');
      const isVisible = panel.style.display === 'block';

      if (isVisible) {
        panel.style.display = 'none';
      } else {
        panel.style.display = 'block';
        loadVersions();
      }
    }

    async function loadVersions() {
      const versionList = document.getElementById('versionList');

      try {
        versionList.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">🔄 버전 목록 로딩 중...</div>';

        const response = await fetch('/api/sora2-prompt', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'list-versions' })
        });

        const data = await response.json();

        if (response.ok && data.versions) {
          if (data.versions.length === 0) {
            versionList.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">📭 저장된 버전이 없습니다</div>';
            return;
          }

          versionList.innerHTML = data.versions.map(version => \`
            <div class="version-item" onclick="restoreVersion('\${version.filename}')">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div style="font-weight: 600; color: #60a5fa; font-size: 14px;">
                  📄 \${version.filename}
                </div>
                <div style="font-size: 11px; color: #64748b;">
                  \${version.size}
                </div>
              </div>
              <div style="font-size: 12px; color: #94a3b8;">
                ⏰ \${version.timestamp}
              </div>
            </div>
          \`).join('');
        } else {
          versionList.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">❌ 버전 목록을 불러올 수 없습니다</div>';
        }
      } catch (error) {
        versionList.innerHTML = \`<div style="padding: 20px; text-align: center; color: #ef4444;">❌ 오류: \${error.message}</div>\`;
      }
    }

    async function restoreVersion(filename) {
      if (!confirm(\`"\${filename}" 버전으로 복원하시겠습니까?\\n\\n현재 프롬프트는 자동으로 백업됩니다.\`)) {
        return;
      }

      try {
        showStatus('🔄 버전 복원 중...', 'success');

        const response = await fetch('/api/sora2-prompt', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'restore',
            version: filename
          })
        });

        const data = await response.json();

        if (response.ok) {
          showStatus('✅ 복원 완료! 페이지를 새로고침합니다...', 'success');
          setTimeout(() => location.reload(), 1500);
        } else {
          showStatus('❌ 복원 실패: ' + data.error, 'error');
          alert(\`복원 실패:\\n\${data.error}\`);
        }
      } catch (error) {
        showStatus('❌ 복원 중 오류 발생: ' + error.message, 'error');
        alert(\`오류 발생:\\n\${error.message}\`);
      }
    }

    // 초기 상태
    document.body.classList.add('readonly-mode');
  </script>
</body>
</html>
      `.trim();

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    // API 호출 시 JSON 반환
    return NextResponse.json({
      filename: promptFile,
      content: content,
      cached: cached
    });
  } catch (error) {
    console.error('Error reading shortform prompt file:', error);
    return NextResponse.json(
      { error: '파일 읽기 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  // 관리자 인증 확인
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json(
      { error: '관리자만 접근할 수 있습니다.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { content, action } = body;

    const projectRoot = process.cwd();
    const promptsDir = path.join(projectRoot, 'prompts');
    const files = await fs.readdir(promptsDir);

    const promptFile = files.find(file =>
      file.startsWith('sora2_prompt') && file.endsWith('.txt')
    );

    if (!promptFile) {
      return NextResponse.json(
        { error: 'prompts/sora2_prompt로 시작하는 .txt 파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const filePath = path.join(promptsDir, promptFile);

    // 버전 목록 조회
    if (action === 'list-versions') {
      const backupDir = path.join(projectRoot, 'backup', 'sora2-prompt-history');

      try {
        await fs.access(backupDir);
        const backupFiles = await fs.readdir(backupDir);
        const versions = backupFiles
          .filter(f => f.endsWith('.txt'))
          .map(f => {
            // 두 가지 형식 지원: YYYY-MM-DD_HH-MM-SS 또는 YYYY-MM-DDTHH-MM-SS
            const match = f.match(/sora2_prompt_(.+?)(?:_before_restore)?\.txt/);
            if (!match) return null;

            const timestamp = match[1];
            let dateStr = timestamp;

            // ISO 형식 (T 포함)을 날짜로 변환
            if (timestamp.includes('T')) {
              dateStr = timestamp.replace('T', ' ').replace(/-/g, ':');
            } else {
              // 언더스코어 형식을 날짜로 변환
              dateStr = timestamp.replace(/_/g, ' ').replace(/-/g, ':');
            }

            const stats = require('fs').statSync(path.join(backupDir, f));

            return {
              filename: f,
              timestamp: timestamp,
              date: new Date(dateStr).toLocaleString('ko-KR'),
              size: `${(stats.size / 1024).toFixed(1)} KB`
            };
          })
          .filter(v => v !== null)
          .sort((a, b) => b!.timestamp.localeCompare(a!.timestamp));

        return NextResponse.json({ versions });
      } catch (error) {
        console.error('숏폼 버전 목록 조회 실패:', error);
        return NextResponse.json({ versions: [] });
      }
    }

    // 특정 버전으로 롤백
    if (action === 'restore' && body.version) {
      const backupDir = path.join(projectRoot, 'backup', 'sora2-prompt-history');
      const backupPath = path.join(backupDir, body.version);

      const backupContent = await fs.readFile(backupPath, 'utf-8');

      // 현재 버전도 백업
      const currentContent = await fs.readFile(filePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const currentBackupPath = path.join(backupDir, `sora2_prompt_${timestamp}_before_restore.txt`);
      await fs.writeFile(currentBackupPath, currentContent, 'utf-8');

      // 롤백
      await fs.writeFile(filePath, backupContent, 'utf-8');

      // ai_aggregator 폴더에도 동시 롤백
      try {
        const multiAiPath = path.join(projectRoot, '..', 'trend-video-backend', 'src', 'ai_aggregator', 'prompt_sora2.txt');
        await fs.writeFile(multiAiPath, backupContent, 'utf-8');
        console.log('✅ ai_aggregator Sora2 프롬프트 동기화 완료 (롤백)');
      } catch (error) {
        console.warn('⚠️ ai_aggregator 동기화 실패 (계속 진행):', error);
      }

      promptCache = null;

      console.log('✅ Sora2 프롬프트 롤백 완료:', body.version);

      return NextResponse.json({
        success: true,
        message: '이전 버전으로 복원되었습니다.',
        restored_version: body.version
      });
    }

    // 일반 저장
    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: '올바른 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 백업 디렉토리 생성
    const backupDir = path.join(projectRoot, 'backup', 'sora2-prompt-history');
    try {
      await fs.access(backupDir);
    } catch {
      await fs.mkdir(backupDir, { recursive: true });
    }

    // 현재 버전 백업 (타임스탬프 포함)
    try {
      const currentContent = await fs.readFile(filePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = path.join(backupDir, `sora2_prompt_${timestamp}.txt`);
      await fs.writeFile(backupPath, currentContent, 'utf-8');
      console.log('📦 이전 버전 백업:', `sora2_prompt_${timestamp}.txt`);
    } catch (error) {
      console.error('백업 실패 (계속 진행):', error);
    }

    // 파일 저장
    await fs.writeFile(filePath, content, 'utf-8');

    // ai_aggregator 폴더에도 동시 저장 (실제 스크립트 생성용)
    try {
      const multiAiPath = path.join(projectRoot, '..', 'trend-video-backend', 'src', 'ai_aggregator', 'prompt_sora2.txt');
      await fs.writeFile(multiAiPath, content, 'utf-8');
      console.log('✅ ai_aggregator Sora2 프롬프트 동기화 완료');
    } catch (error) {
      console.warn('⚠️ ai_aggregator 동기화 실패 (계속 진행):', error);
    }

    // 캐시 무효화
    promptCache = null;

    console.log('✅ Sora2 프롬프트 파일 저장 완료:', promptFile);

    return NextResponse.json({
      success: true,
      message: 'Sora2 프롬프트가 성공적으로 저장되었습니다.',
      filename: promptFile
    });
  } catch (error) {
    console.error('Error saving shortform prompt file:', error);
    return NextResponse.json(
      { error: '파일 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
