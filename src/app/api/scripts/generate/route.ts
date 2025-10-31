import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { getCurrentUser } from '@/lib/session';
import { promises as fs } from 'fs';
import { createBackup } from '@/lib/backup';

const execAsync = promisify(exec);
const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// 실행 중인 프로세스를 추적하는 Map (로컬 참조용)
const runningProcesses = new Map<string, any>();

// 숏폼 프롬프트를 파일에서 읽어오는 함수
async function getShortFormPrompt(): Promise<string> {
  try {
    // multi-ai-aggregator 경로에서 찾기
    const multiAIPath = path.join(process.cwd(), '..', 'multi-ai-aggregator');
    const files = await fs.readdir(multiAIPath);

    // prompt_shortform.txt 또는 prompt.txt 검색
    let promptFile = files.find(file => file === 'prompt_shortform.txt');
    if (!promptFile) {
      promptFile = files.find(file => file === 'prompt.txt');
    }

    if (promptFile) {
      const filePath = path.join(multiAIPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('✅ 숏폼 프롬프트 파일 읽기 완료:', promptFile);
      return content;
    }

    // 파일이 없으면 기본 프롬프트 반환
    console.warn('⚠️ 숏폼 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');
    return `당신은 유튜브 쇼츠 영상 대본 작가입니다.

다음 제목에 대해 1분 이내의 짧고 임팩트 있는 영상 대본을 즉시 작성해주세요.

제목: {title}

중요: 질문하지 말고, 바로 대본을 작성해주세요. 추가 정보 요청 없이 제목만으로 완성된 대본을 만들어주세요.

대본 작성 가이드:
1. 첫 3초 안에 시청자의 관심을 끌 수 있는 훅(Hook) 문장으로 시작
2. 핵심 메시지를 명확하고 간결하게 전달
3. 구어체를 사용하여 친근하게 작성
4. 시청자에게 행동을 유도하는 CTA(Call To Action)로 마무리
5. 약 200-300자 정도의 분량으로 작성

지금 바로 대본만 작성해주세요:`;
  } catch (error) {
    console.error('❌ 숏폼 프롬프트 파일 읽기 실패:', error);
    throw error;
  }
}

// 롱폼 프롬프트를 파일에서 읽어오는 함수
async function getLongFormPrompt(): Promise<string> {
  try {
    // multi-ai-aggregator 경로에서 찾기
    const multiAIPath = path.join(process.cwd(), '..', 'multi-ai-aggregator');
    const files = await fs.readdir(multiAIPath);

    // prompt_longform.txt 우선 검색
    let promptFile = files.find(file => file === 'prompt_longform.txt');

    if (promptFile) {
      const filePath = path.join(multiAIPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('✅ 롱폼 프롬프트 파일 읽기 완료:', promptFile);
      return content;
    }

    // 파일이 없으면 기본 프롬프트 반환
    console.warn('⚠️ 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');
    return `당신은 유튜브 쇼츠 영상 대본 작가입니다.

다음 제목에 대해 1분 이내의 짧고 임팩트 있는 영상 대본을 즉시 작성해주세요.

제목: {title}

중요: 질문하지 말고, 바로 대본을 작성해주세요. 추가 정보 요청 없이 제목만으로 완성된 대본을 만들어주세요.

대본 작성 가이드:
1. 첫 3초 안에 시청자의 관심을 끌 수 있는 훅(Hook) 문장으로 시작
2. 핵심 메시지를 명확하고 간결하게 전달
3. 구어체를 사용하여 친근하게 작성
4. 시청자에게 행동을 유도하는 CTA(Call To Action)로 마무리
5. 약 200-300자 정도의 분량으로 작성

지금 바로 대본만 작성해주세요:`;
  } catch (error) {
    console.error('❌ 프롬프트 파일 읽기 실패:', error);
    throw error;
  }
}

// SORA2 프롬프트를 파일에서 읽어오는 함수
async function getSora2Prompt(): Promise<string> {
  try {
    // multi-ai-aggregator 경로에서 찾기
    const multiAIPath = path.join(process.cwd(), '..', 'multi-ai-aggregator');
    const files = await fs.readdir(multiAIPath);

    // prompt_sora2.txt 검색
    let promptFile = files.find(file => file === 'prompt_sora2.txt');

    if (promptFile) {
      const filePath = path.join(multiAIPath, promptFile);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('✅ SORA2 프롬프트 파일 읽기 완료:', promptFile);
      return content;
    }

    // 파일이 없으면 기본 SORA2 프롬프트 반환
    console.warn('⚠️ SORA2 프롬프트 파일을 찾을 수 없어 기본 프롬프트 사용');
    return `당신은 SORA2 AI 비디오 생성을 위한 프롬프트 작성 전문가입니다.

다음 제목에 대해 SORA2 영상 생성용 프롬프트를 작성해주세요.

제목: {title}

중요: 질문하지 말고, 바로 프롬프트를 작성해주세요. 추가 정보 요청 없이 제목만으로 완성된 프롬프트를 만들어주세요.

SORA2 프롬프트 작성 가이드:
1. 시각적 요소를 구체적으로 묘사 (장면, 색감, 조명, 카메라 움직임)
2. 8초 길이에 적합한 단일 장면 또는 매끄러운 전환
3. 영어로 작성 (SORA2는 영어 프롬프트를 선호)
4. 감정과 분위기를 명확하게 표현
5. 100-200 단어 정도의 상세한 묘사

예시 형식:
"A cinematic shot of [주요 주제], [시각적 디테일], [조명과 색감], [카메라 움직임], [분위기와 감정]"

지금 바로 SORA2 프롬프트만 작성해주세요:`;
  } catch (error) {
    console.error('❌ SORA2 프롬프트 파일 읽기 실패:', error);
    throw error;
  }
}

// 로그 추가 헬퍼 함수
function addLog(taskId: string, message: string) {
  try {
    const db = new Database(dbPath);

    // 현재 로그 가져오기
    const row: any = db.prepare('SELECT logs FROM scripts_temp WHERE id = ?').get(taskId);
    const logs = row?.logs ? JSON.parse(row.logs) : [];

    // 새 로그 추가
    const newLog = {
      timestamp: new Date().toISOString(),
      message
    };
    logs.push(newLog);

    // 업데이트
    db.prepare('UPDATE scripts_temp SET logs = ? WHERE id = ?').run(JSON.stringify(logs), taskId);
    db.close();

    // 디버깅: 로그가 제대로 추가되었는지 확인
    console.log(`[LOG ${taskId}] ${message}`);
  } catch (error) {
    console.error('Failed to add log:', error);
    console.error('TaskId:', taskId);
    console.error('Message:', message);
  }
}

export async function POST(request: NextRequest) {
  try {
    // 사용자 인증 확인
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 대본 생성 전 자동 백업 (매 10번째 요청마다)
    if (Math.random() < 0.1) { // 10% 확률
      try {
        await createBackup('auto_before_script');
        console.log('✅ 자동 백업 완료');
      } catch (error) {
        console.error('⚠️ 자동 백업 실패 (무시하고 진행):', error);
      }
    }

    const body = await request.json();
    const { title, type, videoFormat } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // videoFormat 또는 type으로 스크립트 타입 결정
    let scriptType: 'short' | 'long' | 'sora2' = 'short';
    if (videoFormat === 'sora2' || type === 'sora2') {
      scriptType = 'sora2';
    } else if (videoFormat === 'longform' || type === 'long') {
      scriptType = 'long';
    } else if (videoFormat === 'shortform' || type === 'short') {
      scriptType = 'short';
    }

    const db = new Database(dbPath);

    // scripts_temp 테이블 생성 (admin/titles 페이지용)
    db.exec(`
      CREATE TABLE IF NOT EXISTS scripts_temp (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        message TEXT,
        createdAt TEXT NOT NULL,
        scriptId TEXT,
        type TEXT,
        pid INTEGER,
        logs TEXT DEFAULT '[]'
      )
    `);

    // type, pid 컬럼이 없으면 추가 (기존 데이터 보존)
    try {
      db.exec(`ALTER TABLE scripts_temp ADD COLUMN type TEXT`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column')) {
        console.error('scripts_temp type 컬럼 추가 실패:', e);
      }
    }
    try {
      db.exec(`ALTER TABLE scripts_temp ADD COLUMN pid INTEGER`);
    } catch (e: any) {
      if (!e.message.includes('duplicate column')) {
        console.error('scripts_temp pid 컬럼 추가 실패:', e);
      }
    }

    // 새 스크립트 작업 생성
    const taskId = `task_${Date.now()}`;
    const createdAt = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO scripts_temp (id, title, status, message, createdAt, type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // scriptType을 저장용 포맷으로 변환 (short -> shortform, long -> longform, sora2 -> sora2)
    const savedType = scriptType === 'short' ? 'shortform' : scriptType === 'long' ? 'longform' : 'sora2';
    insert.run(taskId, title, 'PENDING', '대본 생성 대기 중...', createdAt, savedType);

    db.close();

    // 백그라운드에서 대본 생성 실행
    // 타입에 따라 다른 프롬프트 사용
    let prompt: string;
    if (scriptType === 'short') {
      // 숏폼: 파일에서 읽어온 짧은 프롬프트 사용 (빠름)
      const shortFormPromptTemplate = await getShortFormPrompt();
      prompt = shortFormPromptTemplate.replace(/{title}/g, title);
      console.log('✅ 숏폼 프롬프트 사용');
    } else if (scriptType === 'sora2') {
      // SORA2: SORA2 전용 프롬프트 사용
      const sora2PromptTemplate = await getSora2Prompt();
      prompt = sora2PromptTemplate.replace(/{title}/g, title);
      console.log('✅ SORA2 프롬프트 사용');
    } else {
      // 롱폼: 파일에서 읽어온 상세 프롬프트 사용
      const longFormPromptTemplate = await getLongFormPrompt();
      prompt = longFormPromptTemplate.replace(/{title}/g, title);  // 전역 치환 (여러 개 있을 수 있음)
      console.log('✅ 롱폼 프롬프트 사용');
    }

    const multiAIPath = path.join(process.cwd(), '..', 'multi-ai-aggregator');

    // 프롬프트 내용 확인 로그
    console.log('\n' + '='.repeat(80));
    console.log('📝 생성된 프롬프트 내용:');
    console.log('  타입:', scriptType === 'short' ? '⚡ 숏폼' : scriptType === 'sora2' ? '🎥 SORA2' : '📝 롱폼');
    console.log('  제목:', title);
    console.log('  프롬프트 길이:', prompt.length, '자');
    console.log('  프롬프트 미리보기:', prompt.substring(0, 200) + '...');
    console.log('  제목 포함 여부:', prompt.includes(title) ? '✅ 포함됨' : '❌ 미포함');
    console.log('='.repeat(80) + '\n');

    // userId를 클로저에 저장
    const userId = user.userId;

    // 비동기로 실행
    setTimeout(async () => {
      try {
        addLog(taskId, '작업 시작됨');

        const db2 = new Database(dbPath);

        // 상태를 ING로 업데이트
        const message = scriptType === 'short'
          ? '⚡ Claude가 숏폼 대본을 생성하고 있습니다...'
          : scriptType === 'sora2'
          ? '🎥 Claude가 SORA2 프롬프트를 생성하고 있습니다...'
          : '📝 Claude가 롱폼 대본을 생성하고 있습니다...';
        db2.prepare(`
          UPDATE scripts_temp
          SET status = ?, message = ?
          WHERE id = ?
        `).run('ING', message, taskId);

        db2.close();

        // 프롬프트를 임시 파일로 저장 (명령줄 길이 제한 및 특수문자 문제 회피)
        const promptFileName = `prompt_${Date.now()}.txt`;
        const promptFilePath = path.join(multiAIPath, promptFileName);

        const fsSync = require('fs');
        fsSync.writeFileSync(promptFilePath, prompt, 'utf-8');
        addLog(taskId, `프롬프트 파일 생성: ${promptFileName}`);
        const typeEmoji = scriptType === 'short' ? '⚡' : scriptType === 'sora2' ? '🎥' : '📝';
        const typeName = scriptType === 'short' ? '숏폼' : scriptType === 'sora2' ? 'SORA2' : '롱폼';
        addLog(taskId, `${typeEmoji} 타입: ${typeName}`);
        addLog(taskId, `📝 제목: "${title}"`);
        addLog(taskId, `📄 프롬프트 길이: ${prompt.length}자`);
        addLog(taskId, `✅ 프롬프트에 제목 포함: ${prompt.includes(title) ? 'Yes' : 'No'}`);

        // 실행할 명령어 구성
        const pythonArgs = ['main.py', '-f', promptFileName, '-a', 'claude', '--headless'];
        const commandStr = `python ${pythonArgs.join(' ')}`;

        addLog(taskId, '📌 Python 스크립트 실행 시작');
        addLog(taskId, `💻 실행 명령어: ${commandStr}`);
        addLog(taskId, `📂 작업 디렉토리: ${multiAIPath}`);
        addLog(taskId, '🌐 브라우저 자동화로 Claude.ai 웹사이트 접속 중...');
        addLog(taskId, '⏱️ 1-2분 소요 예상');

        console.log(`\n${'='.repeat(80)}`);
        console.log(`[${taskId}] 실행 명령어:`);
        console.log(`  작업 디렉토리: ${multiAIPath}`);
        console.log(`  명령어: ${commandStr}`);
        console.log(`${'='.repeat(80)}\n`);

        // -f 옵션으로 파일 경로 전달
        const pythonProcess = spawn('python', pythonArgs, {
          cwd: multiAIPath,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1'  // Python 출력 버퍼링 비활성화 (실시간 로그)
          }
        });

        // 프로세스 저장
        runningProcesses.set(taskId, pythonProcess);

        // PID를 DB에 저장
        if (pythonProcess.pid) {
          const dbPid = new Database(dbPath);
          dbPid.prepare('UPDATE scripts_temp SET pid = ? WHERE id = ?').run(pythonProcess.pid, taskId);
          dbPid.close();
          addLog(taskId, `🔢 프로세스 PID: ${pythonProcess.pid}`);
          console.log(`✅ PID 저장됨: ${pythonProcess.pid} for task ${taskId}`);
        }

        let stdout = '';
        let stderr = '';

        // stdout 버퍼 (부분적인 줄 처리용)
        let stdoutBuffer = '';

        pythonProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          stdoutBuffer += output;

          // 줄바꿈으로 완성된 줄들만 처리
          const lines = stdoutBuffer.split('\n');
          // 마지막 요소는 불완전할 수 있으므로 버퍼에 보관
          stdoutBuffer = lines.pop() || '';

          // 완성된 줄들만 로그에 추가
          lines.forEach((line: string) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              console.log('[Python]', trimmedLine);
              addLog(taskId, trimmedLine);
            }
          });
        });

        // stderr 버퍼
        let stderrBuffer = '';

        pythonProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          stderr += error;
          stderrBuffer += error;

          // 줄바꿈으로 완성된 줄들만 처리
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() || '';

          lines.forEach((line: string) => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              console.error('[Python stderr]', trimmedLine);
              addLog(taskId, `⚠️ ${trimmedLine}`);
            }
          });
        });

        // 프로세스 완료 대기
        await new Promise<void>((resolve, reject) => {
          pythonProcess.on('close', (code) => {
            runningProcesses.delete(taskId);

            // 버퍼에 남은 내용 처리 (마지막 줄이 줄바꿈 없이 끝난 경우)
            if (stdoutBuffer.trim()) {
              console.log('[Python] (final)', stdoutBuffer.trim());
              addLog(taskId, stdoutBuffer.trim());
            }
            if (stderrBuffer.trim()) {
              console.error('[Python stderr] (final)', stderrBuffer.trim());
              addLog(taskId, `⚠️ ${stderrBuffer.trim()}`);
            }

            if (code === 0 || code === null) {
              resolve();
            } else {
              reject(new Error(`Process exited with code ${code}`));
            }
          });

          pythonProcess.on('error', (error) => {
            runningProcesses.delete(taskId);
            reject(error);
          });
        });

        console.log('Python output:', stdout);
        if (stderr) console.error('Python stderr:', stderr);

        addLog(taskId, '✅ Python 스크립트 실행 완료!');

        // 프롬프트 파일 삭제
        try {
          fsSync.unlinkSync(promptFilePath);
          addLog(taskId, '🗑️ 프롬프트 파일 정리 완료');
        } catch (e) {
          console.error('프롬프트 파일 삭제 실패:', e);
        }

        addLog(taskId, '📂 Claude 응답 파일 검색 중...');

        // 최신 ai_responses 파일 찾기
        const fs = require('fs');
        const aiResponseFiles = fs.readdirSync(multiAIPath)
          .filter((f: string) => f.startsWith('ai_responses_') && f.endsWith('.txt'))
          .map((f: string) => ({
            name: f,
            path: path.join(multiAIPath, f),
            time: fs.statSync(path.join(multiAIPath, f)).mtime.getTime()
          }))
          .sort((a: any, b: any) => b.time - a.time);

        let scriptContent = '';
        if (aiResponseFiles.length > 0) {
          addLog(taskId, `✓ 응답 파일 발견: ${aiResponseFiles[0].name}`);
          // 가장 최신 파일 읽기
          const fullContent = fs.readFileSync(aiResponseFiles[0].path, 'utf-8');

          // Claude의 응답만 추출
          const claudeMatch = fullContent.match(/--- Claude ---\s+([\s\S]*?)(?=\n-{80}|\n--- |$)/);
          if (claudeMatch && claudeMatch[1]) {
            scriptContent = claudeMatch[1].trim();
            addLog(taskId, `✓ Claude 응답 추출 완료 (${scriptContent.length} 글자)`);
          } else {
            // Claude 섹션을 찾지 못한 경우 전체 내용 사용
            scriptContent = fullContent;
            addLog(taskId, `✓ 대본 내용 읽기 완료 (${scriptContent.length} 글자)`);
          }
        } else {
          addLog(taskId, '⚠️ 경고: 응답 파일을 찾을 수 없음');
        }

        addLog(taskId, '💾 데이터베이스에 저장 중...');

        // scripts 테이블에 저장 (user_id는 관리자 또는 시스템으로)
        const db3 = new Database(dbPath);

        // scripts 테이블이 있는지 확인하고 없으면 생성
        db3.exec(`
          CREATE TABLE IF NOT EXISTS scripts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT,
            status TEXT DEFAULT 'completed',
            progress INTEGER DEFAULT 100,
            error TEXT,
            input_tokens INTEGER,
            output_tokens INTEGER,
            original_topic TEXT,
            type TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `);

        // type 컬럼이 없으면 추가 (기존 데이터 보존)
        try {
          db3.exec(`ALTER TABLE scripts ADD COLUMN type TEXT`);
          console.log('✅ scripts 테이블에 type 컬럼 추가됨');
        } catch (e: any) {
          // 컬럼이 이미 존재하면 에러 무시
          if (!e.message.includes('duplicate column')) {
            console.error('type 컬럼 추가 실패:', e);
          }
        }

        // 대본을 scripts 테이블에 저장
        const scriptId = `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // scriptType을 저장용 포맷으로 변환
        const savedType = scriptType === 'short' ? 'shortform' : scriptType === 'long' ? 'longform' : 'sora2';
        db3.prepare(`
          INSERT INTO scripts (id, user_id, title, content, status, progress, original_topic, type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(scriptId, userId, title, scriptContent, 'completed', 100, title, savedType);

        db3.close();

        addLog(taskId, `✓ 데이터베이스 저장 완료! (ID: ${scriptId})`);
        addLog(taskId, '🎉 모든 작업 완료!');

        // 임시 scripts 상태 테이블 업데이트 (admin/titles 페이지용)
        const db4 = new Database(dbPath);

        // 임시 테이블이 있으면 업데이트 (없으면 무시)
        try {
          db4.prepare(`
            UPDATE scripts_temp
            SET status = ?, message = ?, scriptId = ?
            WHERE id = ?
          `).run('DONE', '대본 생성 완료!', scriptId, taskId);
        } catch (e) {
          // 테이블이 없으면 무시
        }

        db4.close();
      } catch (error: any) {
        console.error('Error generating script:', error);

        addLog(taskId, `❌ 오류 발생: ${error.message}`);

        // 에러 발생 시에도 프롬프트 파일 정리
        try {
          if (promptFilePath && fsSync.existsSync(promptFilePath)) {
            fsSync.unlinkSync(promptFilePath);
            console.log('프롬프트 파일 정리 완료 (에러 후)');
          }
        } catch (e) {
          console.error('프롬프트 파일 삭제 실패:', e);
        }

        const db5 = new Database(dbPath);
        db5.prepare(`
          UPDATE scripts_temp
          SET status = ?, message = ?
          WHERE id = ?
        `).run('ERROR', `오류: ${error.message}`, taskId);

        db5.close();
      }
    }, 100);

    return NextResponse.json({
      success: true,
      taskId,
      message: '대본 생성이 시작되었습니다'
    });
  } catch (error: any) {
    console.error('Error creating script task:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create script task' },
      { status: 500 }
    );
  }
}
