// 공공데이터포털·인천공항 API 오류를 어댑터의 reason 으로 나눈다.
//   notfound = 조회는 됐고 해당 항공편이 없음 (이 파일이 아니라 normalizeArrivals 가 판단한다)
//   quota    = 일일 호출 허용량 초과
//   config   = 키·신청·주소·요청 값 문제. 다시 시도해도 해결되지 않는다
//   error    = 일시적인 오류(연결 실패, 시간 초과, 서버 오류, 해석할 수 없는 응답)
// 재확인(getFlight)에서만 쓰는 'missing' 은 normalizeArrivals 가 정한다.
//
// 공공데이터포털 오류는 JSON이 아니라 "글자"로만 온다. (활용가이드 4-1)
// 이 글자 표는 가이드 기준이고 실제로 받아 본 적이 없다. 이때의 HTTP 상태 코드도 확인 못 함이다.
// 그래서 글자를 먼저 보고, 상태 코드는 서버 오류(5xx)일 때만 보조로 쓴다.

export const REASONS = Object.freeze(['notfound', 'quota', 'config', 'error']);

const REASON_BY_TEXT = new Map([
  ['API token quota exceeded', 'quota'],
  ['Unauthorized', 'config'],
  ['Forbidden', 'config'],
  ['API not found', 'config'],
  ['API rate limit exceeded', 'error'], // 동시 요청 초과. 잠시 뒤 다시 하면 된다
  ['Error forwarding request to backend server', 'error'],
  ['Error receiving response from backend server', 'error'],
  ['Unexpected error', 'error'],
]);

/** 포털의 오류 글자(앞뒤 공백·줄바꿈은 무시, 대소문자는 구분)면 reason, 아니면 null */
export function classifyErrorText(text) {
  if (typeof text !== 'string') return null;
  return REASON_BY_TEXT.get(text.trim()) ?? null;
}

/**
 * 응답 header.resultCode. 정상('00')이면 null.
 * '99'(잘못된 요청 파라미터)는 config 로 둔다. 그 밖의 코드는 가이드에 목록이 없어 확인 못 함이라 error 이다.
 */
export function classifyResultCode(code) {
  const text = String(code ?? '').trim();
  if (text === '00') return null;
  if (text === '99') return 'config';
  return 'error';
}

/** 서버 오류(5xx)면 'error', 아니면 null. 4xx 등은 글자 오류를 못 알아본 경우라 본문을 계속 해석한다. */
export function classifyHttpStatus(status) {
  return Number.isInteger(status) && status >= 500 ? 'error' : null;
}

/** fetch 가 던진 오류(연결 실패, DNS, TLS, 시간 초과)는 모두 일시 오류로 본다. */
export function classifyThrown() {
  return 'error';
}

/**
 * 로그에 남기기 전에 키를 가리고 길이를 줄인다. 키 원문과 주소에 들어간 인코딩 형태를 모두 가린다.
 * 로그에는 reason 과 짧은 글자만 남기고, 키가 든 주소·전체 응답·주소(사용자 입력)는 남기지 않는다.
 */
export function redactSecrets(text, secrets = [], maxLength = 200) {
  let result = String(text ?? '');
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret === '') continue;
    for (const form of new Set([secret, encodeURIComponent(secret)])) {
      result = result.split(form).join('***');
    }
  }
  return result.length > maxLength ? `${result.slice(0, maxLength)}…` : result;
}
