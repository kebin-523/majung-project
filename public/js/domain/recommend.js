// 추천 출발 시각 계산. DOM 접근 없음.
//   추천 출발 시각 = 예상 도착 시각 − 이동 시간 − 공항 도착 여유 − 입국 후 만남까지 예상 시간
import { DEFAULT_AIRPORT_BUFFER_MIN, DEFAULT_MEETUP_MIN } from '../config.js';
import { minutes, toMs } from './time.js';

/**
 * 비행기 도착 기준 시각. 변경 도착 시각이 있으면 그것을, 없으면 예정 도착 시각을 쓴다.
 * (예정·변경은 서로 다른 의미라 flight 객체에는 둘 다 보관하고, 계산할 때만 고른다.)
 */
export function latestArrival({ scheduled, changed }) {
  return toMs(changed ?? scheduled);
}

function assertMinutes(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name}은(는) 0 이상의 숫자(분)여야 해요: ${String(value)}`);
  }
}

/**
 * @param {object} input
 * @param {string|number|Date} input.arrival       비행기 도착 시각(최신 기준)
 * @param {number} input.travelMin                 출발지→공항 이동 시간(분). 조회 실패 시 호출하지 않는다.
 * @param {number} [input.airportBufferMin]        공항 도착 여유(분)
 * @param {number} [input.meetupMin]               입국 후 만남까지 예상 시간(분)
 * @returns {{ departureMs: number, totalLeadMin: number }}
 */
export function recommendDeparture({
  arrival,
  travelMin,
  airportBufferMin = DEFAULT_AIRPORT_BUFFER_MIN,
  meetupMin = DEFAULT_MEETUP_MIN,
}) {
  assertMinutes('이동 시간', travelMin);
  assertMinutes('공항 도착 여유', airportBufferMin);
  assertMinutes('입국 후 만남까지 시간', meetupMin);

  const totalLeadMin = travelMin + airportBufferMin + meetupMin;
  return { departureMs: toMs(arrival) - minutes(totalLeadMin), totalLeadMin };
}
