// 편명 입력 정규화·형식 검사. 입력 형식만 확인하며, 실제 존재 여부는 항공편 조회 결과로 판단한다.

// 항공사 코드 2자(영문 포함) + 숫자 1~4자리 + 선택적 영문 접미
const FLIGHT_NO = /^(?:[A-Z][A-Z0-9]|[0-9][A-Z])\d{1,4}[A-Z]?$/;

/** "ke 123", "KE-123" → "KE123" */
export function normalizeFlightNo(raw) {
  return String(raw ?? '').toUpperCase().replace(/[\s-]+/g, '');
}

/** @returns {{ value: string, valid: boolean }} */
export function parseFlightNo(raw) {
  const value = normalizeFlightNo(raw);
  return { value, valid: FLIGHT_NO.test(value) };
}
