// 목업 항공편. 실제 API 응답 형태가 아니라, 어댑터가 화면에 돌려줄 정규화된 모양의 원본이다.
// departureCity / airline 은 API가 제공하는지 아직 확인하지 않았다. (명세 확인 후 확정 — 없으면 화면에서 숨긴다)
import { partsKst, toMs } from '../domain/time.js';
import { todayKst } from './scenarios.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const pad2 = (n) => String(n).padStart(2, '0');

function dateAfter(dateStr, days) {
  const { y, m, d } = partsKst(toMs(`${dateStr} 12:00`) + days * DAY_MS);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * 오늘·내일 기준으로 만든 목업 항공편 원본.
 * changedTo 는 'changed' 시나리오에서 다시 확인했을 때 바뀌어 있을 도착 시각이다.
 */
function buildFlights() {
  const today = todayKst();
  const tomorrow = dateAfter(today, 1);
  const at = (date, clock) => toMs(`${date} ${clock}`);

  return [
    // 정상 예시. 같은 편명이 날짜별로 따로 있다.
    { flightNo: 'KE123', arrivalDate: today, scheduled: at(today, '17:30'), changedTo: at(today, '17:50'), departureCity: '도쿄', airline: '대한항공' },
    { flightNo: 'KE123', arrivalDate: tomorrow, scheduled: at(tomorrow, '17:30'), changedTo: at(tomorrow, '17:50'), departureCity: '도쿄', airline: '대한항공' },
    // 자정을 넘겨 도착일이 바뀌는 변경 예시. 구분 정보가 일부 없는 경우도 보여 준다.
    { flightNo: 'OZ541', arrivalDate: today, scheduled: at(today, '23:50'), changedTo: at(tomorrow, '00:20'), departureCity: '방콕' },
    // 구분 정보가 전혀 없는 경우
    { flightNo: 'LJ202', arrivalDate: today, scheduled: at(today, '19:05'), changedTo: at(today, '19:25') },
  ].map((flight) => ({ ...flight, flightId: `${flight.flightNo}@${flight.arrivalDate}` }));
}

/** 편명(정규화된 값)과 도착 날짜("YYYY-MM-DD")로 찾는다. */
export function findFlights(flightNo, arrivalDate) {
  return buildFlights().filter((f) => f.flightNo === flightNo && f.arrivalDate === arrivalDate);
}

export function findFlight(flightId) {
  return buildFlights().find((f) => f.flightId === flightId) ?? null;
}
