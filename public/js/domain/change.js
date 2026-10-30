// 도착 정보 변경 감지. 문자열이 아니라 정규화한 시각 값(epoch ms)으로 비교한다.
// API 명세 확인 전이라 운항 상태 값은 비교하지 않는다. (상태 필드가 확정되면 여기에 추가)
import { latestArrival, recommendDeparture } from './recommend.js';

/**
 * @param {{flightId: string, scheduled: *, changed?: *}} prev  이전 조회 결과
 * @param {{flightId: string, scheduled: *, changed?: *}} next  최신 조회 결과
 * @returns {null | {id: string, fromMs: number, toMs: number}}  변경이 없으면 null
 */
export function detectArrivalChange(prev, next) {
  if (prev.flightId !== next.flightId) {
    throw new Error('서로 다른 항공편은 비교할 수 없어요.');
  }
  const fromMs = latestArrival(prev);
  const toMs = latestArrival(next);
  if (fromMs === toMs) return null;
  return { id: changeId(next.flightId, fromMs, toMs), fromMs, toMs };
}

/**
 * 도착 시각이 바뀌었을 때 "이전 → 새 값"을 한 번에 정리한다.
 * 이동 시간을 다시 조회했다면(nextTravelMin) 그 값으로, 못 했다면 이전 이동 시간으로 추천 출발 시각을 다시 계산한다.
 * (도착이 늦어진 만큼 출발을 기계적으로 미루지 않는다.)
 *
 * @param {object} input
 * @param {{flightId: string, scheduled: *, changed?: *}} input.prev
 * @param {{flightId: string, scheduled: *, changed?: *}} input.next
 * @param {number} input.prevTravelMin              이전에 쓰던 이동 시간(분)
 * @param {number|null} input.nextTravelMin         다시 조회한 이동 시간(분). 다시 조회하지 못했으면 null
 * @param {{airportBufferMin: number, meetupMin: number}} input.buffers
 * @returns {null | {
 *   id: string,
 *   arrival: {fromMs: number, toMs: number},
 *   departure: {fromMs: number, toMs: number},
 *   travel: {fromMin: number, toMin: number, rechecked: boolean},
 * }}  도착 시각이 그대로면 null
 */
export function summarizeChange({ prev, next, prevTravelMin, nextTravelMin, buffers }) {
  const change = detectArrivalChange(prev, next);
  if (!change) return null;

  const rechecked = nextTravelMin != null;
  const toTravelMin = rechecked ? nextTravelMin : prevTravelMin;
  const lead = { airportBufferMin: buffers.airportBufferMin, meetupMin: buffers.meetupMin };

  return {
    id: change.id,
    arrival: { fromMs: change.fromMs, toMs: change.toMs },
    departure: {
      fromMs: recommendDeparture({ arrival: change.fromMs, travelMin: prevTravelMin, ...lead }).departureMs,
      toMs: recommendDeparture({ arrival: change.toMs, travelMin: toTravelMin, ...lead }).departureMs,
    },
    travel: { fromMin: prevTravelMin, toMin: toTravelMin, rechecked },
  };
}

/** 같은 변경을 같은 값으로 식별하기 위한 ID */
export function changeId(flightId, fromMs, toMs) {
  return `${flightId}:${fromMs}->${toMs}`;
}

/** 이미 안내한 변경이면 다시 보여주지 않는다. */
export function shouldAnnounce(change, lastAnnouncedId) {
  return change !== null && change.id !== lastAnnouncedId;
}
