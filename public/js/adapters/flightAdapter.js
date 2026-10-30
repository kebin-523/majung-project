// 항공편 조회 어댑터.
//   실제 모드    서버 함수(GET /api/flights)로 인천공항 API 를 조회한다. 브라우저는 인천공항 API 와 키를 직접 다루지 않는다.
//   시나리오 모드 주소에 ?scenario=이름 이 있으면 목업을 쓴다. (clock.js 의 isScenarioMode)
//
// 반환: { ok: true, data, meta? } | { ok: false, reason }
//   reason: 'notfound' 조회는 됐지만 해당 항공편이 없음 / 'missing' 이미 찾은 항공편의 재확인에서 이번 응답에 없음
//           'quota' 호출 한도 초과 / 'timeout' 응답 시간 초과 / 'error' 그 밖의 조회 실패(서버의 설정 문제 config 도 여기로 합친다)
//   meta: 검색 성공 시 { truncated, skippedRows }. 내부 기록용이고 화면에 보여 주지 않는다. ("결과가 더 있어요" 안내는 만들지 않기로 했다)
// 항공편(실제 모드는 서버 변환 결과 전체 + landed·departureCity): server/icn/normalizeArrivals.js 의 주석 참고.
//   화면이 쓰는 값: flightId, flightNo, arrivalDate, scheduled, changed, landed, status, departureCity?, airline?, fetchedAt, source
//   scheduled·changed·fetchedAt 은 epoch ms. changed 는 변경 도착 시각이 없으면 null.
//   arrivalDate 는 요청한 날짜와 다른 행도 걸러 내지 않고 그대로 담는다.
//   fetchedAt 은 실제 모드에서 서버가 인천공항 API 를 부른 시각이다. (화면이 그대로 쓴다)
//
// landed (임시 결정): status 가 'arrived'(도착)일 때만 true 이고, 'touchdown'(착륙)은 false 다.
//   DesignGuide 에서 "도착"은 추천 카드 대신 안내 상자, "착륙"은 추천 카드 유지로 정했다. README 에도 임시 결정으로 적어 두었다.
import { STALE_AFTER_MIN } from '../config.js';
import { isScenarioMode, clockNow } from '../clock.js';
import { normalizeFlightNo } from '../domain/flightNo.js';
import { minutes } from '../domain/time.js';
import { findFlight, findFlights } from '../mock/flights.js';
import { getScenario, wait } from '../mock/scenarios.js';

const API_PATH = '/api/flights';
export const CLIENT_TIMEOUT_MS = 15000; // 서버가 공공 API 를 기다리는 시간(8초)보다 길게

// ---------- 목업 (시나리오 모드) ----------

const MOCK_STATUS = { landed: 'arrived', touchdown: 'touchdown', unknown: 'unknown' };

function toMockFlight(raw, { scenario, showChange }) {
  const now = clockNow();
  const status = MOCK_STATUS[scenario] ?? 'none';
  return {
    flightId: raw.flightId,
    flightNo: raw.flightNo,
    arrivalDate: raw.arrivalDate,
    scheduled: raw.scheduled,
    changed: showChange ? raw.changedTo : null,
    status,
    landed: status === 'arrived',
    departureCity: raw.departureCity ?? null,
    airline: raw.airline ?? null,
    // stale: 마지막으로 확인한 시각이 이미 오래된 상태로 돌려준다.
    fetchedAt: scenario === 'stale' ? now - minutes(STALE_AFTER_MIN + 5) : now,
    source: 'mock',
  };
}

async function mockSearch(flightNo, arrivalDate) {
  const scenario = getScenario();
  await wait();

  if (scenario === 'fail') return { ok: false, reason: 'error' };
  if (scenario === 'notfound') return { ok: false, reason: 'notfound' };

  const found = findFlights(normalizeFlightNo(flightNo), arrivalDate);
  if (found.length === 0) return { ok: false, reason: 'notfound' };

  // 처음 조회한 값은 아직 변경 전이다. (changed 시나리오의 변경은 getFlight 로 다시 확인할 때 나타난다.)
  return { ok: true, data: found.map((raw) => toMockFlight(raw, { scenario, showChange: false })) };
}

async function mockRefresh(flightId) {
  const scenario = getScenario();
  await wait();

  if (scenario === 'fail') return { ok: false, reason: 'error' };
  if (scenario === 'stale') return { ok: false, reason: 'timeout' };

  const raw = findFlight(flightId);
  if (!raw) return { ok: false, reason: 'notfound' };

  return { ok: true, data: toMockFlight(raw, { scenario, showChange: scenario === 'changed' }) };
}

// ---------- 실제 (서버 함수) ----------

const fail = (reason) => ({ ok: false, reason });

/** 서버 reason → 화면 reason. config 는 error 로 합치고, quota 는 따로 둔다. 모르는 값도 error. */
function mapReason(reason) {
  return ['notfound', 'missing', 'quota', 'timeout'].includes(reason) ? reason : 'error';
}

function fromServer(flight) {
  return {
    ...flight,
    landed: flight.status === 'arrived',
    departureCity: flight.origin ?? null,
    airline: flight.airline ?? null,
  };
}

/** 서버 함수를 GET 으로 부른다. 성공하면 본문, 실패하면 { ok: false, reason }. */
async function callServer(params) {
  let response;
  try {
    response = await fetch(`${API_PATH}?${new URLSearchParams(params)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (error) {
    return fail(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'error');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return fail('error'); // 함수가 없거나(404) 서버 오류 등으로 JSON 이 아닌 응답이 왔다.
  }
  if (body?.ok === true) return body;
  return fail(mapReason(body?.reason));
}

async function realSearch(flightNo, arrivalDate) {
  const body = await callServer({ mode: 'search', flightNo: normalizeFlightNo(flightNo), date: arrivalDate });
  if (!body.ok) return body;
  if (!Array.isArray(body.data) || body.data.length === 0) return fail('error');
  return {
    ok: true,
    data: body.data.map(fromServer),
    meta: { truncated: body.truncated === true, skippedRows: body.skippedRows ?? 0 },
  };
}

async function realRefresh(flightId, arrivalDate) {
  if (!flightId || !arrivalDate) return fail('error');
  const body = await callServer({ mode: 'refresh', fid: flightId, date: arrivalDate });
  if (!body.ok) return body;
  if (body.data === null || typeof body.data !== 'object' || Array.isArray(body.data)) return fail('error');
  return { ok: true, data: fromServer(body.data) };
}

// ---------- 화면이 부르는 함수 ----------

/** 편명과 도착 날짜("YYYY-MM-DD")로 항공편 목록을 찾는다. */
export function searchFlights(flightNo, arrivalDate) {
  return isScenarioMode() ? mockSearch(flightNo, arrivalDate) : realSearch(flightNo, arrivalDate);
}

/**
 * 이미 등록한 항공편의 최신 정보를 다시 확인한다.
 * 실제 모드에서는 조회 날짜가 필요하므로 고른 항공편의 arrivalDate 를 함께 넘긴다.
 */
export function getFlight(flightId, { arrivalDate } = {}) {
  return isScenarioMode() ? mockRefresh(flightId) : realRefresh(flightId, arrivalDate);
}
