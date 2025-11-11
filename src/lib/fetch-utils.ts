/**
 * API 응답을 안전하게 JSON으로 파싱
 * HTML 에러 페이지를 JSON으로 파싱하려고 시도하는 것을 방지
 */
export async function safeJsonResponse<T = any>(response: Response): Promise<T> {
  // 먼저 Content-Type 확인
  const contentType = response.headers.get('content-type');

  // JSON이 아닌 경우 (HTML 에러 페이지 등)
  if (!contentType || !contentType.toLowerCase().includes('application/json')) {
    const text = await response.text();

    // 에러 응답인 경우
    if (!response.ok) {
      throw new Error(`API Error (${response.status}): ${text.substring(0, 200)}`);
    }

    // OK 응답인데 JSON이 아닌 경우 (이상한 케이스)
    throw new Error(`Expected JSON response but got: ${contentType}`);
  }

  // JSON 응답인 경우
  const data = await response.json();

  // 에러 응답이면 에러 던지기
  if (!response.ok) {
    const errorMessage = data.error || data.message || `API Error: ${response.status}`;
    throw new Error(errorMessage);
  }

  return data;
}

/**
 * fetch를 래핑하여 안전한 JSON 응답 반환
 */
export async function fetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  return safeJsonResponse<T>(response);
}
