// 항공편 조회 함수의 본체. netlify/functions/flights.mjs 가 이 함수에 키·fetch·시계를 넣어 부른다.
// 키·fetch·현재 시각을 모두 바깥에서 받으므로 테스트에서 네트워크 없이 부를 수 있다.
//
// 요청(GET): /api/flights?mode=search&flightNo=KE123&date=2026-10-30
//            /api/flights?mode=refresh&fid=<API의 fid>&date=2026-10-30   (이미 고른 항공편의 재확인)
// 응답(JSON):
//   성공   { ok: true, data, skippedRows, fetchedAt, truncated? }   data 는 search 면 배열, refresh 면 한 건. truncated 는 search 에만
//   실패   { ok: false, reason: 'notfound' | 'missing' | 'quota' | 'config' | 'error' }
// fetchedAt 은 공공 API 를 부르기 직전의 서버 시각(epoch ms)이다. 응답이 캐시에서 나가도 값이 그대로라 "마지막으로 확인한 시각"이 거짓이 되지 않는다.
//
// 호출 한도 대책
// - 공공데이터포털은 https 로만 부른다. 실패해도 http 로 바꿔 다시 부르지 않고 reason 으로 돌려 준다.
// - 한 요청에 외부 호출은 최대 1번이다. 다음 페이지를 자동으로 부르지 않는다. (numOfRows 500, 잘리면 truncated 만 전달한다)
// - 성공 응답에만 Netlify CDN 캐시(5분, 가정)를 붙인다. 오류·0건(notfound/missing) 응답은 캐시하지 않는다.
//   헤더 이름과 뜻은 docs.netlify.com "Caching overview" 로 확인했다: Netlify-CDN-Cache-Control 은 Netlify CDN 에만 적용되고,
//   Cache-Control 은 브라우저에도 적용된다. 브라우저는 매번 다시 확인(max-age=0, must-revalidate)하게 두고 CDN 만 5분 캐시한다.
//   서버리스 함수 응답은 쿼리 문자열이 기본으로 캐시 키에 들어가지만, 같은 URL 이 항상 같은 Netlify-Vary 값을 주도록 모든 응답에 붙인다.
import { classifyThrown } from './classifyError.js';
import { interpretArrivalsResponse } from './normalizeArrivals.js';

export const ARRIVALS_URL = 'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp/getPassengerArrivalsDeOdp';
export const NUM_OF_ROWS = 500; // 2026-10-30 샘플 조사에서 받아들여지는 것이 관찰됐다. 상한은 확인 못 함.
export const UPSTREAM_TIMEOUT_MS = 8000;
export const CDN_CACHE_SECONDS = 5 * 60; // (가정)

// 편명 형식은 public/js/domain/flightNo.js 의 FLIGHT_NO 와 같은 모양이다. (서버는 public/ 을 불러오지 않아 따로 둔다)
const FLIGHT_NO = /^(?:[A-Z][A-Z0-9]|[0-9][A-Z])\d{1,4}[A-Z]?$/;
const FID = /^[A-Za-z0-9]{1,50}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const STATUS_BY_REASON = {
  notfound: 200, // 조회는 성공했고 해당 항공편이 없는 것
  missing: 200,
  quota: 429,
  config: 500,
  error: 502,
};

const SUCCESS_HEADERS = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': `public, s-maxage=${CDN_CACHE_SECONDS}`,
  'Netlify-Vary': 'query',
};
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store',
  'Netlify-Vary': 'query',
};

function respond(body, status, headers) {
  return Response.json(body, { status, headers });
}

const failure = (reason, status = STATUS_BY_REASON[reason]) => respond({ ok: false, reason }, status, NO_CACHE_HEADERS);

/** "2026-10-30" → "20261030". 실제 있는 날짜가 아니면 null. */
function toSearchDay(text) {
  const match = DATE.exec(text ?? '');
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${match[1]}${match[2]}${match[3]}`;
}

/** 요청 값을 서버에서 다시 검증한다. 잘못되면 null. (날짜 범위는 API 가 거절하는 기준을 몰라 검사하지 않는다) */
function readQuery(url) {
  const params = url.searchParams;
  const mode = params.get('mode') ?? 'search';
  const searchDay = toSearchDay(params.get('date'));
  if (searchDay === null) return null;

  if (mode === 'search') {
    const flightNo = params.get('flightNo') ?? '';
    return FLIGHT_NO.test(flightNo) ? { mode, searchDay, flightNo } : null;
  }
  if (mode === 'refresh') {
    const fid = params.get('fid') ?? '';
    return FID.test(fid) ? { mode, searchDay, fid } : null;
  }
  return null;
}

/** 서비스 키는 URLSearchParams 가 인코딩한다. 이미 인코딩된 키(% 가 든 키)를 넣었다면 먼저 풀어서 이중 인코딩을 막는다. */
function readServiceKey(apiKey) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (key === '') return null;
  if (!/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function buildArrivalsUrl(query, serviceKey) {
  const params = new URLSearchParams({
    serviceKey,
    type: 'json',
    searchday: query.searchDay,
    numOfRows: String(NUM_OF_ROWS),
    pageNo: '1',
  });
  if (query.mode === 'search') params.set('flight_id', query.flightNo);
  else params.set('f_id', query.fid);
  return `${ARRIVALS_URL}?${params}`;
}

/**
 * @param {Request} request
 * @param {{ apiKey?: string, fetch: typeof fetch, now: () => number, timeoutMs?: number }} deps
 * @returns {Promise<Response>}
 */
export async function handleFlights(request, { apiKey, fetch: fetchImpl, now, timeoutMs = UPSTREAM_TIMEOUT_MS }) {
  if (request.method !== 'GET') {
    return respond({ ok: false, reason: 'config' }, 405, { ...NO_CACHE_HEADERS, Allow: 'GET' });
  }

  const query = readQuery(new URL(request.url));
  if (query === null) return failure('config', 400);

  const serviceKey = readServiceKey(apiKey);
  if (serviceKey === null) {
    console.error('[flights] config: 서비스 키가 설정되지 않았어요.');
    return failure('config');
  }

  const fetchedAt = now();
  let status;
  let text;
  try {
    const upstream = await fetchImpl(buildArrivalsUrl(query, serviceKey), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    status = upstream.status;
    text = await upstream.text();
  } catch (error) {
    // 오류 객체 전체는 키가 든 주소를 담을 수 있어 이름만 남긴다.
    console.error(`[flights] ${classifyThrown()}: ${error?.name ?? 'Error'}`);
    return failure(classifyThrown());
  }

  const result = interpretArrivalsResponse(
    { status, text },
    { mode: query.mode, fid: query.fid, fetchedAt },
  );
  if (!result.ok) {
    console.error(`[flights] ${result.reason} (${query.mode})`);
    return failure(result.reason);
  }
  return respond({ ...result, fetchedAt }, 200, SUCCESS_HEADERS);
}
