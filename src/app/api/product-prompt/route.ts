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
  // 사용자 인증 확인 (관리자 체크는 편집 모드에서만)
  const user = await getCurrentUser(request);
  const isAdmin = user?.isAdmin || false;

  try {
    // prompts 디렉토리에서 prompt_product로 시작하는 .txt 파일 찾기
    const projectRoot = process.cwd();
    const promptsDir = path.join(projectRoot, 'prompts');
    const files = await fs.readdir(promptsDir);

    const promptFile = files.find(file =>
      file.startsWith('prompt_product') && file.endsWith('.txt')
    );

    if (!promptFile) {
      return NextResponse.json(
        { error: 'prompts/prompt_product로 시작하는 .txt 파일을 찾을 수 없습니다.' },
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
      console.log('📋 상품 프롬프트 캐시 사용:', promptFile);
      content = promptCache.content;
      cached = true;
    } else {
      console.log('📄 상품 프롬프트 파일 읽기:', promptFile);
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

    // 브라우저에서 직접 접근 시 HTML로 보기 좋게 표시 (관리자만)
    if (wantsHtml && isAdmin) {
      const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>상품 프롬프트 편집기 - ${promptFile}</title>
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
      background: #10b981;
      color: white;
    }
    .btn-primary:hover { background: #059669; }
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
  </style>
</head>
<body>
  <!-- 네비게이션 -->
  <div style="margin-bottom: 20px;">
    <a href="/" style="color: #10b981; text-decoration: none; font-weight: 600; font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='#6ee7b7'" onmouseout="this.style.color='#10b981'">
      🏠 HOME
    </a>
    <span style="color: #64748b; margin: 0 8px;">/</span>
    <a href="/admin" style="color: #10b981; text-decoration: none; font-weight: 600; font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='#6ee7b7'" onmouseout="this.style.color='#10b981'">
      관리자
    </a>
    <span style="color: #64748b; margin: 0 8px;">/</span>
    <a href="/admin/prompts" style="color: #10b981; text-decoration: none; font-weight: 600; font-size: 14px; transition: color 0.2s;" onmouseover="this.style.color='#6ee7b7'" onmouseout="this.style.color='#10b981'">
      프롬프트 관리
    </a>
    <span style="color: #64748b; margin: 0 8px;">/</span>
    <span style="color: #94a3b8; font-weight: 600; font-size: 14px;">상품 프롬프트</span>
  </div>

  <div class="header">
    <div>
      <h1>🛍️ ${promptFile} <span class="badge ${cached ? 'cached' : 'fresh'}">${cached ? '캐시됨' : '새로 읽음'}</span></h1>
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
    <button class="btn btn-success" id="saveBtn" onclick="savePrompt()" style="display: none;">💾 저장</button>
    <button class="btn btn-secondary" id="cancelBtn" onclick="cancelEdit()" style="display: none;">✕ 취소</button>
  </div>

  <div class="editor-container">
    <div id="lineNumbers" class="line-numbers"></div>
    <textarea id="editor" readonly></textarea>
  </div>

  <script>
    const originalContent = ${JSON.stringify(content)};
    const editor = document.getElementById('editor');
    const lineNumbers = document.getElementById('lineNumbers');
    const editBtn = document.getElementById('editBtn');
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

    // 클립보드에 복사
    async function copyToClipboard() {
      try {
        await navigator.clipboard.writeText(editor.value);
        showStatus('✅ 클립보드에 복사되었습니다!', 'success');

        const copyBtn = document.getElementById('copyBtn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ 복사됨';
        copyBtn.style.background = '#10b981';

        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 2000);
      } catch (error) {
        editor.select();
        document.execCommand('copy');
        showStatus('✅ 클립보드에 복사되었습니다!', 'success');
      }
    }

    function toggleEdit() {
      editor.readOnly = false;
      editor.setSelectionRange(0, 0);
      editor.scrollTop = 0;
      lineNumbers.scrollTop = 0;
      editor.focus();
      editBtn.style.display = 'none';
      saveBtn.style.display = 'block';
      cancelBtn.style.display = 'block';
      document.body.classList.remove('readonly-mode');
      showStatus('편집 모드 활성화', 'success');
    }

    function cancelEdit() {
      editor.value = originalContent;
      editor.readOnly = true;
      editBtn.style.display = 'block';
      saveBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      document.body.classList.add('readonly-mode');
      updateLineNumbers();
      showStatus('변경 사항이 취소되었습니다', 'success');
    }

    async function savePrompt() {
      const newContent = editor.value;

      try {
        showStatus('💾 저장 중...', 'success');

        const response = await fetch('/api/product-prompt', {
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
    console.error('Error reading product prompt file:', error);
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
    const { content } = body;

    const projectRoot = process.cwd();
    const promptsDir = path.join(projectRoot, 'prompts');
    const files = await fs.readdir(promptsDir);

    const promptFile = files.find(file =>
      file.startsWith('prompt_product') && file.endsWith('.txt')
    );

    if (!promptFile) {
      return NextResponse.json(
        { error: 'prompts/prompt_product로 시작하는 .txt 파일을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const filePath = path.join(promptsDir, promptFile);

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: '올바른 내용을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 백업 디렉토리 생성
    const backupDir = path.join(projectRoot, 'backup', 'product-prompt-history');
    try {
      await fs.access(backupDir);
    } catch {
      await fs.mkdir(backupDir, { recursive: true });
    }

    // 현재 버전 백업 (타임스탬프 포함)
    try {
      const currentContent = await fs.readFile(filePath, 'utf-8');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = path.join(backupDir, `prompt_product_${timestamp}.txt`);
      await fs.writeFile(backupPath, currentContent, 'utf-8');
      console.log('📦 이전 버전 백업:', `prompt_product_${timestamp}.txt`);
    } catch (error) {
      console.error('백업 실패 (계속 진행):', error);
    }

    // 파일 저장
    await fs.writeFile(filePath, content, 'utf-8');

    // ai_aggregator 폴더에도 동시 저장 (실제 스크립트 생성용)
    try {
      const multiAiPath = path.join(projectRoot, '..', 'trend-video-backend', 'src', 'ai_aggregator', 'prompt_product.txt');
      await fs.writeFile(multiAiPath, content, 'utf-8');
      console.log('✅ ai_aggregator 상품 프롬프트 동기화 완료');
    } catch (error) {
      console.warn('⚠️ ai_aggregator 동기화 실패 (계속 진행):', error);
    }

    // 캐시 무효화
    promptCache = null;

    console.log('✅ 상품 프롬프트 파일 저장 완료:', promptFile);

    return NextResponse.json({
      success: true,
      message: '상품 프롬프트가 성공적으로 저장되었습니다.',
      filename: promptFile
    });
  } catch (error) {
    console.error('Error saving product prompt file:', error);
    return NextResponse.json(
      { error: '파일 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
