// 카카오모빌리티 자동차 길찾기 응답을 앱의 이동 시간으로 바꾸는 순수 함수. (네트워크·환경변수·로그 없음)
// 응답 모양은 2026-10-31 샘플 호출(docs/samples/kakao-dir-*)과 문서(https://developers.kakaomobility.com/guide/navi-api/directions.html)로 확인했다.
//
// 반환: { ok: true, data: { minutes, distanceKm } } | { ok: false, reason: 'noroute' | 'error' }
//   minutes    ← routes[0].summary.duration(초)을 올림한 분. 2400초 → 40분, 2401초 → 41분. (늦게 도착하는 쪽이 더 나빠서 올림)
//   distanceKm ← routes[0].summary.distance(미터)를 km 로, 소수 첫째 자리까지 반올림. 38366m → 38.4
//                (화면은 아직 거리를 쓰지 않고, 목업 값은 정수 km 다. 정수로 줄이면 짧은 거리가 0 이 될 수 있어 한 자리를 남겼다)
//   - routes[0].result_code 가 0 일 때만 summary 를 읽는다. 0 이 아니면 classifyRouteResultCode 로 noroute · error 를 나눈다.
//   - duration · distance 가 숫자가 아니거나(문자열 포함) 유한하지 않거나 0 이하이면 error.
//   - routes 가 없거나 비었거나 배열이 아니면 error. 잘못된 입력(HTTP 400)의 최상위 { code, msg } 모양도 error.
//   - fare · sections · summary.origin·destination(좌표) · trans_id 는 읽지 않고 결과에 담지 않는다.
// HTTP 상태 코드는 이 함수가 보지 않는다. 호출한 쪽이 classifyRouteHttpStatus 로 먼저 거른 뒤 본문을 넘긴다.
import { classifyRouteResultCode } from './classifyRouteError.js';

const fail = (reason) => ({ ok: false, reason });

const isPositiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** 잘못된 입력(HTTP 400)이 주는 최상위 { code, msg } 모양인가 */
function hasTopLevelError(body) {
  return body.code !== undefined && body.msg !== undefined;
}

export function normalizeRoute(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return fail('error');
  if (hasTopLevelError(body)) return fail('error');
  if (!Array.isArray(body.routes) || body.routes.length === 0) return fail('error');

  const route = body.routes[0];
  if (route === null || typeof route !== 'object' || Array.isArray(route)) return fail('error');

  const reason = classifyRouteResultCode(route.result_code);
  if (reason !== null) return fail(reason);

  const summary = route.summary;
  if (summary === null || typeof summary !== 'object') return fail('error');
  const { duration, distance } = summary;
  if (!isPositiveNumber(duration) || !isPositiveNumber(distance)) return fail('error');

  return {
    ok: true,
    data: {
      minutes: Math.ceil(duration / 60),
      distanceKm: Math.round(distance / 100) / 10,
    },
  };
}
