/**
 * JSON 파싱 유틸리티 함수
 * Claude AI 등에서 생성된 JSON 응답을 안전하게 파싱
 *
 * @description
 * AI가 생성한 JSON은 다음과 같은 문제가 있을 수 있습니다:
 * 1. 코드 블록 마커 (```json, ```)
 * 2. 설명문 ("I'll create...", "Here's the JSON...")
 * 3. JSON 앞뒤의 불필요한 텍스트
 * 4. 이스케이프되지 않은 따옴표
 * 5. Trailing commas
 *
 * 이 함수는 위의 문제들을 자동으로 수정하여 안전하게 파싱합니다.
 */

export interface ParseJsonOptions {
  /** 에러 발생 시 로그 출력 여부 (기본값: true) */
  logErrors?: boolean;
  /** 수정 시도 여부 (기본값: true) */
  attemptFix?: boolean;
}

export interface ParseJsonResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  fixed?: boolean; // 자동 수정이 적용되었는지 여부
}

/**
 * JSON 문자열을 안전하게 파싱
 *
 * @param jsonString - 파싱할 JSON 문자열
 * @param options - 파싱 옵션
 * @returns 파싱 결과 객체
 *
 * @example
 * const result = parseJsonSafely<MyType>(content);
 * if (result.success) {
 *   console.log('파싱 성공:', result.data);
 *   if (result.fixed) {
 *     console.log('자동 수정이 적용되었습니다');
 *   }
 * } else {
 *   console.error('파싱 실패:', result.error);
 * }
 */
export function parseJsonSafely<T = any>(
  jsonString: string,
  options: ParseJsonOptions = {}
): ParseJsonResult<T> {
  const { logErrors = true, attemptFix = true } = options;

  // 1단계: 원본 그대로 파싱 시도
  try {
    const data = JSON.parse(jsonString);
    if (logErrors) {
      console.log('✅ JSON 파싱 성공 (원본)');
    }
    return { success: true, data, fixed: false };
  } catch (firstError: any) {
    if (logErrors) {
      console.warn('⚠️ JSON 파싱 실패, 자동 수정 시도 중...', firstError.message);
    }

    // 자동 수정을 시도하지 않는 경우
    if (!attemptFix) {
      return {
        success: false,
        error: firstError.message
      };
    }

    // 2단계: 자동 수정 후 파싱 시도
    try {
      const fixed = fixJsonString(jsonString, logErrors);
      const data = JSON.parse(fixed);

      if (logErrors) {
        console.log('✅ JSON 자동 수정 후 파싱 성공');
      }

      return { success: true, data, fixed: true };
    } catch (secondError: any) {
      // 3단계: 최종 시도 - 더 강력한 수정
      if (logErrors) {
        console.warn('⚠️ 2차 수정 시도 중...');
      }

      try {
        const ultraFixed = fixJsonStringUltra(jsonString, logErrors);
        const data = JSON.parse(ultraFixed);

        if (logErrors) {
          console.log('✅ JSON 강력 수정 후 파싱 성공');
        }

        return { success: true, data, fixed: true };
      } catch (thirdError: any) {
        // 최종 실패
        const errorMessage = `JSON 자동 수정 실패: ${thirdError.message}`;

        // JSON이 아닌 것으로 판명된 경우 로그 최소화
        const isNotJson = thirdError.message.includes('Not a JSON') ||
                          thirdError.message.includes('No JSON object found');

        if (logErrors && !isNotJson) {
          console.error('❌', errorMessage);
          console.log('파싱 시도한 내용 (처음 1000자):', jsonString.substring(0, 1000));
          console.log('파싱 시도한 내용 (마지막 500자):', jsonString.substring(Math.max(0, jsonString.length - 500)));

          // 에러 위치 주변 확인
          const errorMatch = thirdError.message.match(/position (\d+)/);
          if (errorMatch) {
            const errorPos = parseInt(errorMatch[1], 10);
            const start = Math.max(0, errorPos - 200);
            const end = Math.min(jsonString.length, errorPos + 200);
            console.log(`에러 위치 주변 (${start}-${end}):`, jsonString.substring(start, end));
            console.log(`에러 위치 문자: "${jsonString[errorPos]}" (코드: ${jsonString.charCodeAt(errorPos)})`);
          }
        } else if (logErrors && isNotJson) {
          // JSON이 아닌 경우 간단한 경고만
          console.warn('⚠️ JSON이 아닌 데이터:', jsonString.substring(0, 100) + (jsonString.length > 100 ? '...' : ''));
        }

        return {
          success: false,
          error: errorMessage
        };
      }
    }
  }
}

/**
 * JSON 문자열 자동 수정
 *
 * @param jsonString - 수정할 JSON 문자열
 * @param log - 로그 출력 여부
 * @returns 수정된 JSON 문자열
 */
function fixJsonString(jsonString: string, log: boolean = false): string {
  let fixed = jsonString;

  // Step -1: JSON이 아닌 에러 메시지 감지 (에러를 던져서 상위에서 처리하도록)
  // "Error", "error", "오류", "실패" 등으로 시작하고 { 가 없으면 JSON이 아님
  const trimmed = fixed.trim();
  const hasOpenBrace = trimmed.includes('{');
  const looksLikeError = /^(Error|error|오류|실패|Warning|경고)/i.test(trimmed);

  if (looksLikeError && !hasOpenBrace) {
    // JSON이 아닌 에러 메시지임
    throw new Error(`Not a JSON: ${trimmed.substring(0, 100)}`);
  }

  // Step 0: 코드 블록 마커 및 설명 텍스트 제거
  fixed = fixed.replace(/^```json?\s*/i, '');
  fixed = fixed.replace(/```\s*$/i, '');
  fixed = fixed.replace(/^\s*json\s*$/im, '');

  // Step 1: JSON 시작점 찾기
  const titleMatch = fixed.match(/\{\s*"title"/);
  if (titleMatch && titleMatch.index !== undefined && titleMatch.index > 0) {
    fixed = fixed.substring(titleMatch.index);
  } else {
    const firstBrace = fixed.indexOf('{');
    if (firstBrace > 0) {
      fixed = fixed.substring(firstBrace);
    } else if (firstBrace === -1) {
      // { 가 아예 없으면 JSON이 아님
      throw new Error('No JSON object found in string');
    }
  }

  // Step 2: JSON 끝점 찾기
  const lastBrace = fixed.lastIndexOf('}');
  if (lastBrace > 0 && lastBrace < fixed.length - 1) {
    fixed = fixed.substring(0, lastBrace + 1);
  }

  // Step 3: 긴 필드들의 값 내부 따옴표를 이스케이프
  // narration은 scene의 마지막 속성이므로 다음 } 전까지가 값
  // 다른 긴 필드들은 다음 속성명 전까지가 값

  // narration 특별 처리 - 다음 } 전의 마지막 " 까지
  fixed = fixed.replace(
    /"narration"\s*:\s*"([\s\S]+?)"\s*\n?\s*\}/g,
    (match, value) => {
      let fixedValue = '';
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '\\' && i + 1 < value.length) {
          fixedValue += value[i] + value[i + 1];
          i++;
        } else if (value[i] === '"') {
          fixedValue += '\\"';
        } else {
          fixedValue += value[i];
        }
      }
      return `"narration": "${fixedValue}"\n  }`;
    }
  );

  // 다른 긴 필드들 처리
  const otherLongFields = ['image_prompt', 'description', 'text', 'visual_description', 'prompt', 'audio_description'];

  for (const field of otherLongFields) {
    // 다음 ," (다음 속성 시작) 또는 } 전의 마지막 " 까지
    const regex = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]+?)"\\s*,`, 'g');

    fixed = fixed.replace(regex, (match, value) => {
      let fixedValue = '';
      for (let i = 0; i < value.length; i++) {
        if (value[i] === '\\' && i + 1 < value.length) {
          fixedValue += value[i] + value[i + 1];
          i++;
        } else if (value[i] === '"') {
          fixedValue += '\\"';
        } else {
          fixedValue += value[i];
        }
      }
      return `"${field}": "${fixedValue}",`;
    });
  }

  // Step 4: 짧은 필드들의 값 내부 따옴표 이스케이프
  // "key": "value" 패턴 (한 줄) - 긴 필드는 이미 처리했으므로 제외
  const allLongFields = ['narration', 'image_prompt', 'description', 'text', 'visual_description', 'prompt', 'audio_description'];

  fixed = fixed.replace(
    /"([^"]+)"\s*:\s*"([^"\n]*?)"/g,
    (match, key, value) => {
      // 긴 필드가 아닌 경우에만 처리
      if (allLongFields.includes(key)) {
        return match; // 이미 처리했으므로 건너뜀
      }

      // 값 내부의 이스케이프되지 않은 따옴표를 이스케이프
      let fixedValue = '';
      let i = 0;

      while (i < value.length) {
        if (value[i] === '\\' && i + 1 < value.length) {
          fixedValue += value[i] + value[i + 1];
          i += 2;
        } else if (value[i] === '"') {
          fixedValue += '\\"';
          i++;
        } else {
          fixedValue += value[i];
          i++;
        }
      }

      return `"${key}": "${fixedValue}"`;
    }
  );

  // Step 5: Trailing comma 제거
  fixed = fixed.replace(/,(\s*})/g, '$1');
  fixed = fixed.replace(/,(\s*\])/g, '$1');

  return fixed;
}

/**
 * JSON 문자열 강력 수정 (최후의 수단)
 *
 * @param jsonString - 수정할 JSON 문자열
 * @param log - 로그 출력 여부
 * @returns 수정된 JSON 문자열
 */
function fixJsonStringUltra(jsonString: string, log: boolean = false): string {
  // 먼저 기본 수정 적용
  let fixed = fixJsonString(jsonString, false);

  if (log) {
    console.log('🔧 강력 수정 모드 시작...');
  }

  // 추가 수정 1: 속성 이름 뒤에 콜론이 없는 경우 (이스케이프 문자 고려)
  // "key" <whitespace> "value" → "key": "value"
  // "key" <whitespace> { → "key": {
  // "key" <whitespace> [ → "key": [
  // 이스케이프된 따옴표도 처리: "key\"with\"quotes"
  fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s+(?=["{\[])/g, '"$1": ');

  if (log) {
    console.log('  ✓ 콜론 없는 속성 수정');
  }

  // 추가 수정 2: 콜론은 있지만 따옴표가 없는 값
  // "key": value → "key": "value" (단, 숫자/불린/null 제외)
  fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*([^"{}\[\],\s\n][^,}\]\n]*)/g, (match, key, value) => {
    const trimmedValue = value.trim();
    // 숫자, true, false, null이 아니면 따옴표로 감싸기
    if (!/^(-?\d+(\.\d+)?|true|false|null)$/.test(trimmedValue)) {
      return `"${key}": "${trimmedValue.replace(/"/g, '\\"')}"`;
    }
    return match;
  });

  if (log) {
    console.log('  ✓ 따옴표 없는 값 수정');
  }

  // 추가 수정 3: 줄바꿈으로 분리된 key-value 쌍 수정
  // "key"
  // "value" → "key": "value"
  fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*\n\s*"/g, '"$1": "');

  if (log) {
    console.log('  ✓ 줄바꿈으로 분리된 속성 수정');
  }

  // 추가 수정 4: 속성 이름 뒤에 콜론이 없고 숫자/불린이 오는 경우
  // "key" 123 → "key": 123
  // "key" true → "key": true
  fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s+(?=\d|true|false|null)/g, '"$1": ');

  if (log) {
    console.log('  ✓ 숫자/불린 앞 콜론 추가');
  }

  if (log) {
    console.log('✅ 강력 수정 완료');
  }

  return fixed;
}

/**
 * JSON 문자열에서 순수 JSON 부분만 추출
 * (설명문, 코드 블록 마커 등 제거)
 *
 * @param content - 추출할 내용
 * @returns 순수 JSON 문자열
 *
 * @example
 * const json = extractPureJson(`
 *   I'll create a JSON for you.
 *   \`\`\`json
 *   {"title": "Hello"}
 *   \`\`\`
 *   Thank you!
 * `);
 * // 결과: {"title": "Hello"}
 */
export function extractPureJson(content: string): string {
  let cleaned = content;

  // 1. 코드펜스 제거
  cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

  // 2. 첫 번째 { 찾기
  const jsonStart = cleaned.indexOf('{');

  // 3. 마지막 } 찾기
  const jsonEnd = cleaned.lastIndexOf('}');

  // 4. { 이전과 } 이후 제거
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }

  return cleaned;
}

/**
 * JSON 파일을 안전하게 읽고 파싱
 * - File 객체에서 텍스트를 읽음
 * - 자동으로 정리 및 수정 적용
 * - 파싱된 데이터 반환
 *
 * @param file - 읽을 JSON 파일
 * @returns 파싱 결과
 *
 * @example
 * const result = await parseJsonFile(uploadedFile);
 * if (result.success) {
 *   console.log('파싱 성공:', result.data);
 * }
 */
export async function parseJsonFile<T = any>(file: File): Promise<ParseJsonResult<T>> {
  try {
    const rawText = await file.text();
    return parseJsonSafely<T>(rawText);
  } catch (error: any) {
    return {
      success: false,
      error: `파일 읽기 실패: ${error.message}`
    };
  }
}
