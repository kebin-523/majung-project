// 항공편 조회 어댑터 (현재는 목업). 실제 API로 바꿀 때 이 파일의 내부만 교체하고 반환 형태는 유지한다.
//
// 반환: { ok: true, data } | { ok: false, reason: 'notfound' | 'error' | 'timeout' }
//   notfound = 조회는 됐지만 해당 항공편이 없음 / error·timeout = 조회 자체가 실패
// 항공편: { flightId, flightNo, arrivalDate, scheduled, changed, landed, departureCity?, airline?, fetchedAt, source }
//   scheduled·changed·fetchedAt 은 epoch ms. changed 는 변경 도착 시각이 없으면 null.
import { STALE_AFTER_MIN } from '../config.js';
import { normalizeFlightNo } from '../domain/flightNo.js';
import { minutes } from '../domain/time.js';
import { findFlight, findFlights } from '../mock/flights.js';
import { getScenario, mockNow, wait } from '../mock/scenarios.js';

function toFlight(raw, { scenario, showChange }) {
  const now = mockNow(scenario);
  return {
    flightId: raw.flightId,
    flightNo: raw.flightNo,
    arrivalDate: raw.arrivalDate,
    scheduled: raw.scheduled,
    changed: showChange ? raw.changedTo : null,
    landed: scenario === 'landed',
    departureCity: raw.departureCity ?? null,
    airline: raw.airline ?? null,
    // stale: 마지막으로 확인한 시각이 이미 오래된 상태로 돌려준다.
    fetchedAt: scenario === 'stale' ? now - minutes(STALE_AFTER_MIN + 5) : now,
    source: 'mock',
  };
}

/** 편명과 도착 날짜("YYYY-MM-DD")로 항공편 목록을 찾는다. */
export async function searchFlights(flightNo, arrivalDate) {
  const scenario = getScenario();
  await wait();

  if (scenario === 'fail') return { ok: false, reason: 'error' };
  if (scenario === 'notfound') return { ok: false, reason: 'notfound' };

  const found = findFlights(normalizeFlightNo(flightNo), arrivalDate);
  if (found.length === 0) return { ok: false, reason: 'notfound' };

  // 처음 조회한 값은 아직 변경 전이다. (changed 시나리오의 변경은 getFlight 로 다시 확인할 때 나타난다.)
  return { ok: true, data: found.map((raw) => toFlight(raw, { scenario, showChange: false })) };
}

/** 이미 등록한 항공편의 최신 정보를 다시 확인한다. */
export async function getFlight(flightId) {
  const scenario = getScenario();
  await wait();

  if (scenario === 'fail') return { ok: false, reason: 'error' };
  if (scenario === 'stale') return { ok: false, reason: 'timeout' };

  const raw = findFlight(flightId);
  if (!raw) return { ok: false, reason: 'notfound' };

  return { ok: true, data: toFlight(raw, { scenario, showChange: scenario === 'changed' }) };
}
