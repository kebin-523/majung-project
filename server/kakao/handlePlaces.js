// 장소 검색 함수의 본체. netlify/functions/places.mjs 가 이 함수에 키·fetch 를 넣어 부른다.
// 키·fetch 를 바깥에서 받으므로 테스트에서 네트워크 없이 부를 수 있다. (구조는 server/icn/handleFlights.js 와 같다)
//
// 요청(POST): /api/places   본문 { "query": "합정역" }
//   검색어는 주소(URL)가 아니라 본문으로 받는다. 접속 기록·로그에 검색어(주소)가 남지 않게 하기 위해서다.
// 응답(JSON):
//   성공   { ok: true, data: Place[] }          결과 없음도 성공이다. data 는 빈 배열
//   실패   { ok: false, reason: 'invalid' | 'quota' | 'config' | 'error' }
// reason 은 server/kakao/classifyError.js 의 체계(quota · config · error)에 요청 값 오류 invalid 를 더한 것이다.
// 시간 초과는 항공편 함수(server/icn/classifyError.js)처럼 따로 나누지 않고 error 에 둔다.
//
// 호출 한도 대책
// - 한 요청에 외부 호출은 최대 1번이다. page=1, size=15 만 부르고 다음 페이지를 자동으로 부르지 않는다.
// - 모든 응답에 Cache-Control: no-store 를 붙인다. 검색어가 사용자 입력(주소)이라 CDN·브라우저에 남기지 않는다.
//
// 로그에는 reason, 상태 코드, 받은 건수만 남긴다. 검색어·주소·키·오류 메시지는 남기지 않는다.
import { kakaoFailureInfo } from './diagnose.js';
import { classifyHttpStatus, classifyThrown, isValidationError } from './classifyError.js';
import { buildKeywordUrl, normalizePlaces } from './normalizePlaces.js';

export const UPSTREAM_TIMEOUT_MS = 8000;
export const MIN_QUERY_LENGTH = 2; // 화면(DesignGuide "N글자 이상 입력해 주세요", N = 2)과 같다
// 100글자(가정): 한국 도로명 주소는 건물명까지 붙여도 보통 60글자 안팎이고, 카카오 문서에서 검색어 길이 상한은 확인하지 못했다.
// 실제 주소·장소 이름은 충분히 담고, 붙여 넣은 긴 글이 그대로 외부 호출 주소에 실리지 않게 하는 보수적인 값이다.
export const MAX_QUERY_LENGTH = 100;
const MAX_BODY_LENGTH = 2000; // 검색어 100글자(이스케이프 포함 최대 600자 안팎)보다 넉넉한 본문 상한

const STATUS_BY_REASON = {
  invalid: 400,
  quota: 429,
  config: 500,
  error: 502,
};

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store' };

function respond(body, status, headers = NO_CACHE_HEADERS) {
  return Response.json(body, { status, headers });
}

const failure = (reason) => respond({ ok: false, reason }, STATUS_BY_REASON[reason]);

/** 본문에서 검색어를 읽는다. 앞뒤 공백은 뺀다. 형식이 맞지 않으면 null. 길이는 글자(코드 포인트) 수로 센다. */
function readQuery(text) {
  if (text.length > MAX_BODY_LENGTH) return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object' || typeof body.query !== 'string') return null;
  const query = body.query.trim();
  const length = [...query].length;
  return length >= MIN_QUERY_LENGTH && length <= MAX_QUERY_LENGTH ? query : null;
}

/**
 * @param {Request} request
 * @param {{ apiKey?: string, fetch: typeof fetch, timeoutMs?: number }} deps
 * @returns {Promise<Response>}
 */
export async function handlePlaces(request, { apiKey, fetch: fetchImpl, timeoutMs = UPSTREAM_TIMEOUT_MS }) {
  if (request.method !== 'POST') {
    return respond({ ok: false, reason: 'config' }, 405, { ...NO_CACHE_HEADERS, Allow: 'POST' });
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    rawBody = '';
  }
  const query = readQuery(rawBody);
  if (query === null) {
    console.error('[places] invalid');
    return failure('invalid');
  }

  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (key === '') {
    console.error('[places] config: REST API 키가 설정되지 않았어요.');
    return failure('config');
  }

  let status;
  let text;
  try {
    const upstream = await fetchImpl(buildKeywordUrl(query), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `KakaoAK ${key}`, Accept: 'application/json' },
    });
    status = upstream.status;
    text = await upstream.text();
  } catch (error) {
    // 오류 객체 전체는 키나 검색어가 든 글을 담을 수 있어 이름만 남긴다.
    console.error(`[places] ${classifyThrown()}: ${error?.name ?? 'Error'}`);
    return failure(classifyThrown());
  }

  const httpReason = classifyHttpStatus(status);
  if (httpReason !== null) {
    console.error(`[places] ${httpReason} status=${status} ${kakaoFailureInfo(text, key)}`);
    return failure(httpReason);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(`[places] error status=${status} (해석할 수 없는 응답)`);
    return failure('error');
  }
  if (isValidationError(parsed)) {
    console.error(`[places] config status=${status} (요청 값 오류)`);
    return failure('config');
  }

  const result = normalizePlaces(parsed);
  if (!result.ok) {
    console.error(`[places] ${result.reason} status=${status} (documents 없음)`);
    return failure(result.reason);
  }
  console.log(`[places] ok status=${status} count=${result.data.length} dropped=${result.dropped}`);
  return respond({ ok: true, data: result.data }, 200);
}
