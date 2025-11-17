import { NextRequest } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');

// Ollama 설정
const OLLAMA_MODEL = 'qwen2.5:7b';
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const BATCH_SIZE = 10; // 100개 → 10개로 축소
const MIN_SCORE = 90;
const CATEGORIES = ['시니어사연', '복수극', '탈북자사연', '막장드라마'];
const TIMEOUT_MS = 60000; // 60초 타임아웃

// 규칙 기반 점수 평가
function evaluateTitleWithRules(title: string, category: string): number {
  let score = 0;

  // 1. 제목 길이 (20-60자 최적)
  const length = title.length;
  if (length >= 20 && length <= 60) {
    score += 30;
  } else if (length >= 15 && length < 20) {
    score += 20;
  } else if (length > 60 && length <= 80) {
    score += 20;
  } else if (length < 15) {
    score += 5;
  } else {
    score += 10;
  }

  // 2. 특수문자
  if (title.includes('?')) score += 10;
  if (title.includes('!')) score += 8;
  if (title.includes('...')) score += 5;
  if (title.includes('"') || title.includes("'")) score += 5;

  // 3. 감정 키워드
  const emotionalKeywords = [
    '후회', '복수', '반전', '충격', '눈물', '감동',
    '배신', '비밀', '진실', '최후', '귀환', '성공',
    '통쾌', '화려', '무릎', '외면', '당당', '전설',
    '알고보니', '결국', '드디어', '끝판왕', '최고'
  ];

  let emotionalCount = 0;
  for (const keyword of emotionalKeywords) {
    if (title.includes(keyword)) {
      emotionalCount++;
    }
  }
  score += Math.min(emotionalCount * 5, 20);

  // 4. 숫자 포함
  if (/\d+/.test(title)) {
    score += 8;
  }

  // 5. 카테고리 키워드
  const categoryKeywords: Record<string, string[]> = {
    '시니어사연': ['시어머니', '며느리', '고부갈등', '시댁', '양로원'],
    '복수극': ['복수', '무시', 'CEO', '귀환', '배신자', '신입'],
    '탈북자사연': ['탈북', '북한', '남한', '자유', '대한민국'],
    '막장드라마': ['출생', '비밀', '재벌', '배다른', '친자확인'],
  };

  const keywords = categoryKeywords[category] || [];
  let categoryCount = 0;
  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      categoryCount++;
    }
  }
  score += Math.min(categoryCount * 7, 15);

  // 6. 문장 구조
  const hasComma = (title.match(/,/g) || []).length;
  if (hasComma >= 1 && hasComma <= 2) {
    score += 7;
  }

  return Math.min(100, Math.max(0, score));
}

// 유사도 체크
function calculateSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.split(''));
  const set2 = new Set(str2.split(''));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

// Ollama로 제목 생성
async function generateWithOllama(category: string, count: number): Promise<string[]> {
  const prompt = `한국 유튜브 ${category} 카테고리 제목을 ${count}개만 생성하세요.

제목 형식:
- 40~60자 길이
- 자극적이고 호기심 유발
- 숫자와 감정 키워드 포함

예시:
며느리를 내쫓았던 시어머니, 3년 후 양로원에서 무릎 꿇고 빌어야 했던 이유
청소부를 무시했던 직원들, 5년 후 그녀가 CEO로 나타나자 사색이 된 이유

이제 ${count}개 제목을 생성하세요 (번호 없이):`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.9,
          top_p: 0.95
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama 오류: ${response.statusText}`);
    }

    const data = await response.json();
    const titles = data.response
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.match(/^[\d.]+\s/));

    return titles;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Ollama 응답 시간 초과 (60초)');
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jobId = body.jobId || `title_gen_${Date.now()}`;

    // job_logs에 로그 저장 함수
    function saveLog(message: string) {
      try {
        const db = new Database(dbPath);
        db.prepare(`
          INSERT INTO job_logs (job_id, log_message, created_at)
          VALUES (?, ?, datetime('now'))
        `).run(jobId, message);
        db.close();
      } catch (error) {
        console.error('Failed to save log:', error);
      }
    }

    // 백그라운드에서 실행
    (async () => {
      try {
        saveLog('🚀 Ollama 배치 제목 생성 시작...');

        // Ollama 연결 체크
        try {
          const checkRes = await fetch('http://localhost:11434/api/tags');
          if (!checkRes.ok) {
            throw new Error('Ollama 서버 연결 실패');
          }
        } catch (error) {
          saveLog('❌ Ollama 서버에 연결할 수 없습니다. Ollama를 실행해주세요.');
          return;
        }

        const db = new Database(dbPath);

        // 테이블 생성
        db.exec(`
          CREATE TABLE IF NOT EXISTS title_pool (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            score INTEGER NOT NULL,
            validated INTEGER DEFAULT 0,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, title)
          );
          CREATE INDEX IF NOT EXISTS idx_title_pool_category_score
          ON title_pool(category, score DESC, used ASC);
        `);

        const stats = {
          total: 0,
          generated: 0,
          highScore: 0,
          duplicates: 0
        };

        for (const category of CATEGORIES) {
          saveLog(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          saveLog(`📂 카테고리: ${category}`);
          saveLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

          // 기존 제목 가져오기
          const existingTitles = db.prepare(
            'SELECT title FROM title_pool WHERE category = ?'
          ).all(category).map((row: any) => row.title);

          saveLog(`📊 기존 제목 수: ${existingTitles.length}개`);

          for (let batch = 0; batch < 100; batch++) {
            const startTime = Date.now();
            saveLog(`\n[배치 ${batch + 1}/100] Ollama로 ${BATCH_SIZE}개 제목 생성 요청 중...`);

            try {
              const titles = await generateWithOllama(category, BATCH_SIZE);
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              stats.generated += titles.length;
              saveLog(`✅ ${titles.length}개 생성 완료 (${elapsed}초 소요)`);

              // 점수 평가
              const scoredTitles = titles.map(title => ({
                title,
                score: evaluateTitleWithRules(title, category)
              }));

              const highScoreTitles = scoredTitles.filter(t => t.score >= MIN_SCORE);
              stats.highScore += highScoreTitles.length;
              saveLog(`🎯 ${MIN_SCORE}점 이상: ${highScoreTitles.length}개`);

              // 유사도 체크 및 저장
              let saved = 0;
              let duplicateCount = 0;

              saveLog(`📝 ${highScoreTitles.length}개 제목 검증 중...`);

              for (const item of highScoreTitles) {
                let isDuplicate = false;
                for (const existing of existingTitles) {
                  const similarity = calculateSimilarity(item.title, existing);
                  if (similarity > 0.7) {
                    isDuplicate = true;
                    duplicateCount++;
                    stats.duplicates++;
                    break;
                  }
                }

                if (!isDuplicate) {
                  const id = `pool_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

                  try {
                    db.prepare(`
                      INSERT INTO title_pool (id, category, title, score)
                      VALUES (?, ?, ?, ?)
                    `).run(id, category, item.title, item.score);

                    existingTitles.push(item.title);
                    saved++;

                    if (saved <= 3) {
                      saveLog(`  ✓ [${item.score}점] ${item.title}`);
                    }
                  } catch (err) {
                    duplicateCount++;
                    stats.duplicates++;
                  }
                }
              }

              if (saved > 3) {
                saveLog(`  ... ${saved - 3}개 더 저장됨`);
              }
              saveLog(`💾 저장 완료: ${saved}개 | 중복 제거: ${duplicateCount}개`);
              saveLog(`📈 현재까지 총 ${stats.total + saved}개 제목 확보`);
              stats.total += saved;

              // 딜레이 (Ollama 과부하 방지)
              await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error: any) {
              saveLog(`❌ 배치 생성 실패: ${error.message}`);
            }
          }
        }

        db.close();

        saveLog(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        saveLog(`🎉 배치 생성 완료!`);
        saveLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        saveLog(`📊 생성된 제목: ${stats.generated}개`);
        saveLog(`🎯 ${MIN_SCORE}점 이상: ${stats.highScore}개`);
        saveLog(`💾 저장된 제목: ${stats.total}개`);
        saveLog(`🔄 중복 제거: ${stats.duplicates}개`);
        saveLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      } catch (error: any) {
        saveLog(`❌ 오류: ${error.message}`);
      }
    })();

    // 즉시 jobId 반환
    return NextResponse.json({ jobId, message: '제목 생성 시작됨 (백그라운드 실행)' });
  } catch (error: any) {
    console.error('Failed to start title generation:', error);
    return NextResponse.json(
      { error: '제목 생성 시작 실패', details: error.message },
      { status: 500 }
    );
  }
}
