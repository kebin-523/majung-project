// 길찾기 함수의 본체. netlify/functions/route.mjs 가 이 함수에 키·fetch 를 넣어 부른다.
// 키·fetch 를 바깥에서 받으므로 테스트에서 네트워크 없이 부를 수 있다. (구조는 server/kakao/handlePlaces.js 와 같다)
//
// 요청(POST): /api/route   본문 { "origin": { "lng": 126.7, "lat": 37.4 }, "terminal": "P01" }
//   출발지 좌표(사용자 위치)는 주소(URL)가 아니라 본문으로 받는다. 목적지 좌표는 클라이언트가 보내지 않는다.
//   터미널 코드(P01 · P03)로 server/kakao/destinations.js 의 표에서 서버가 고른다. P02 와 모르는 값은 invalid 다.
// 응답(JSON):
//   성공   { ok: true, data: { minutes, distanceKm } }
//   실패   { ok: false, reason: 'invalid' | 'noroute' | 'quota' | 'config' | 'error' }   (reason 은 classifyRouteError.js 의 ROUTE_REASONS)
//
// 경로 없음(noroute)은 HTTP 200 이다. 요청은 올바르게 처리됐고, 카카오도 같은 결과를 HTTP 200 + result_code 로 보내며,
//   항공편 함수(server/icn/handleFlights.js)도 "조회는 됐지만 없음"(notfound·missing)을 200 으로 돌려준다. 화면은 ok 로 구분한다.
//
// 호출 한도 대책
// - 한 요청에 외부 호출은 최대 1번이다. 재시도하지 않는다. 시간 제한은 8초이고 넘으면 error 다.
// - 모든 응답에 Cache-Control: no-store 를 붙인다. 출발지 좌표는 위치 정보라 CDN·브라우저에 남기지 않는다.
//
// 로그에는 reason, 상태 코드, 분(minutes)만 남긴다. 좌표·장소 이름·터미널 코드·키·오류 메시지는 남기지 않는다.
import { classifyRouteHttpStatus, classifyThrown } from './classifyRouteError.js';
import { getDestination } from './destinations.js';
import { normalizeRoute } from './normalizeRoute.js';
import { buildDirectionsUrl, readOrigin } from './routeInput.js';

export const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_BODY_LENGTH = 1000; // 올바른 본문은 100자 안팎이다. 소수점 자리가 길고 공백·여분 필드가 있어도 충분히 넉넉한 상한

const STATUS_BY_REASON = {
  invalid: 400,
  noroute: 200, // 요청은 처리됐고 경로가 없는 것
  quota: 429,
  config: 500,
  error: 502,
};

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store' };

function respond(body, status, headers = NO_CACHE_HEADERS) {
  return Response.json(body, { status, headers });
}

const failure = (reason) => respond({ ok: false, reason }, STATUS_BY_REASON[reason]);

/** 본문에서 출발지와 목적지를 읽는다. 형식이 맞지 않으면 null. 목적지는 터미널 코드로 서버 표에서 고른다. */
function readRequest(text) {
  if (text.length > MAX_BODY_LENGTH) return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;

  const origin = readOrigin(body.origin);
  const destination = getDestination(body.terminal);
  return origin === null || destination === null ? null : { origin, destination };
}

/**
 * @param {Request} request
 * @param {{ apiKey?: string, fetch: typeof fetch, timeoutMs?: number }} deps
 * @returns {Promise<Response>}
 */
export async function handleRoute(request, { apiKey, fetch: fetchImpl, timeoutMs = UPSTREAM_TIMEOUT_MS }) {
  if (request.method !== 'POST') {
    return respond({ ok: false, reason: 'config' }, 405, { ...NO_CACHE_HEADERS, Allow: 'POST' });
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    rawBody = '';
  }
  const input = readRequest(rawBody);
  if (input === null) {
    console.error('[route] invalid');
    return failure('invalid');
  }

  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (key === '') {
    console.error('[route] config: REST API 키가 설정되지 않았어요.');
    return failure('config');
  }

  let status;
  let text;
  try {
    const upstream = await fetchImpl(buildDirectionsUrl(input.origin, input.destination), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `KakaoAK ${key}`, Accept: 'application/json' },
    });
    status = upstream.status;
    text = await upstream.text();
  } catch (error) {
    // 오류 객체 전체는 키나 좌표가 든 글을 담을 수 있어 이름만 남긴다.
    console.error(`[route] ${classifyThrown()}: ${error?.name ?? 'Error'}`);
    return failure(classifyThrown());
  }

  const httpReason = classifyRouteHttpStatus(status);
  if (httpReason !== null) {
    console.error(`[route] ${httpReason} status=${status}`);
    return failure(httpReason);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(`[route] error status=${status} (해석할 수 없는 응답)`);
    return failure('error');
  }

  const result = normalizeRoute(parsed);
  if (!result.ok) {
    console.error(`[route] ${result.reason} status=${status}`);
    return failure(result.reason);
  }
  console.log(`[route] ok status=${status} minutes=${result.data.minutes}`);
  return respond({ ok: true, data: result.data }, 200);
}
