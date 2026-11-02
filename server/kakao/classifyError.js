// 카카오 로컬 API 오류를 어댑터의 reason 으로 나눈다. 체계는 server/icn/classifyError.js 와 같다.
//   quota  = 호출 허용량 초과 (HTTP 429)
//   config = 키·사용 설정·요청 값 문제. 다시 시도해도 해결되지 않는다
//   error  = 일시적인 오류(연결 실패, 시간 초과, 서버 오류, 해석할 수 없는 응답)
// 항공편 함수의 notfound · missing 은 쓰지 않는다. 장소 검색의 "결과 없음"은 오류가 아니라 빈 결과다.
//
// 확인한 것 (샘플 호출, 2026-10-30)
//   - 잘못된 값(query.size 가 숫자가 아님)은 JSON 본문 { errorType: 'ValidationError', message, details } 로 왔다. 이때의 HTTP 상태 코드는 확인 못 함.
//   - 429 는 무료 제공량을 모두 쓴 경우라고 문서(FAQ)에 있다. 429 응답의 본문 모양은 확인 못 함.
// 확인 못 한 것
//   - 키 오류(잘못된 키, 키 없음)와 카카오맵 사용 설정 OFF 일 때의 상태 코드와 본문 모양.
//     401·403 을 config 로 두는 것은 추정이다. 실제 응답을 받아 본 뒤 고친다.
//   - 429 가 일일 한도 초과뿐 아니라 순간 호출량 초과에도 오는지.

export const REASONS = Object.freeze(['quota', 'config', 'error']);

/**
 * HTTP 상태 코드로 reason 을 정한다. 성공(2xx)이면 null.
 * 429 → quota, 400·401·403 → config (401·403 은 추정), 그 밖의 실패 → error.
 */
export function classifyHttpStatus(status) {
  if (!Number.isInteger(status)) return 'error';
  if (status >= 200 && status < 300) return null;
  if (status === 429) return 'quota';
  if (status === 400 || status === 401 || status === 403) return 'config';
  return 'error';
}

/** 본문이 카카오의 요청 값 오류(ValidationError)면 true. 상태 코드를 확인하지 못해 본문으로도 알아본다. */
export function isValidationError(body) {
  return body !== null && typeof body === 'object' && body.errorType === 'ValidationError';
}

/** fetch 가 던진 오류(연결 실패, DNS, TLS, 시간 초과)는 모두 일시 오류로 본다. */
export function classifyThrown() {
  return 'error';
}
