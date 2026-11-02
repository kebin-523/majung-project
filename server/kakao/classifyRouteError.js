// 카카오모빌리티 자동차 길찾기 오류를 이동 시간 어댑터의 reason 으로 나눈다. 체계는 server/kakao/classifyError.js(장소 검색)와 같고 noroute · invalid 를 더했다.
//   quota   = 호출 허용량 초과 (HTTP 429)
//   config  = 키·사용 설정·권한 문제. 다시 시도해도 해결되지 않는다 (HTTP 401 · 403)
//   noroute = 요청은 맞았지만 경로를 찾지 못함 (HTTP 200 + result_code 1 · 101~104). 출발지를 바꿔야 한다
//   invalid = 요청 값 오류. 서버가 카카오를 부르기 전에 출발지·터미널 코드를 검사해서 정한다. 카카오 응답에서는 정하지 않는다
//   error   = 일시적인 오류(연결 실패, 시간 초과, 서버 오류, 해석할 수 없는 응답) 와 그 밖의 모든 경우
//
// 기존 server/kakao/classifyError.js 의 REASONS(quota · config · error)는 늘리지 않고 이 파일에서 따로 확장한다.
//   이유: REASONS 는 장소 검색 쪽 테스트가 세 개로 고정해 두었고, 같은 이름은 같은 뜻으로만 쓰면 어긋나지 않는다.
//   HTTP 400 의 뜻이 두 API 에서 다르다(장소 검색: config, 길찾기: error)고 보아 상태 코드 함수는 따로 둔다.
//
// 확인한 것 (샘플 호출, 2026-10-31, docs/samples/kakao-dir-*)
//   - 성공은 HTTP 200 + routes[0].result_code 0 + routes[0].summary.
//   - 경로 없음은 HTTP 200 + routes[0].result_code 102(시작 지점 주변 도로 없음) · 104(출발지·도착지 5m 이내) + summary 없음.
//   - 잘못된 입력은 HTTP 400 + 최상위 { code: -2, msg } (routes 없음).
// 문서로만 아는 것(샘플로는 확인 못 함): result_code 목록 (https://developers.kakaomobility.com/guide/navi-api/reference.html, 2026-10-31 확인),
//   HTTP 오류 표 (…/solution.html, 2026-10-31 확인). 401·403 이 키 오류일 때 실제로 오는지는 확인 못 함.

export { classifyThrown } from './classifyError.js';

export const ROUTE_REASONS = Object.freeze(['quota', 'config', 'noroute', 'invalid', 'error']);

// 경로를 찾지 못한 result_code. 1=결과 없음, 101~103=경유지·시작·도착 지점 주변 도로 없음, 104=출발지·도착지 5m 이내.
const NOROUTE_CODES = new Set([1, 101, 102, 103, 104]);

/**
 * HTTP 상태 코드로 reason 을 정한다. 성공(2xx)이면 null.
 * 429 → quota, 401·403 → config, 그 밖의 실패 → error.
 * 400 은 config 가 아니라 error 다: 서버가 좌표를 먼저 검사해서 보내므로 카카오가 400 을 주면 사용자 입력 탓이 아니라
 * 우리 요청 조립의 버그(필수 값 누락 등)일 가능성이 크다. 사용자가 설정을 고쳐서 해결되는 문제가 아니므로 config 로 보지 않는다.
 */
export function classifyRouteHttpStatus(status) {
  if (!Number.isInteger(status)) return 'error';
  if (status >= 200 && status < 300) return null;
  if (status === 429) return 'quota';
  if (status === 401 || status === 403) return 'config';
  return 'error';
}

/**
 * 응답의 routes[0].result_code 로 reason 을 정한다. 성공(0)이면 null.
 * 1 · 101~104 → noroute. 105~107(출발·도착·경유지 주변 유고)은 일시적일 수 있어 error 로 둔다. (제품 판단, 가정)
 * 201~207, 301~304(다중 출발지·목적지 전용)와 모르는 값, 정수가 아닌 값도 error 다.
 */
export function classifyRouteResultCode(code) {
  if (code === 0) return null;
  if (NOROUTE_CODES.has(code)) return 'noroute';
  return 'error';
}
