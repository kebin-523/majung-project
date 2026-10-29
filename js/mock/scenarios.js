// 목업 시나리오 스위치와 데모 시계. 주소창의 ?scenario=... 로 고른다. (예: index.html?scenario=changed)
//
//   normal    정상
//   changed   항공편을 다시 확인하면 도착 시각이 바뀌어 있고, 이동 시간도 다시 조회하면 달라진다
//   stale     처음 조회는 되지만 이후 갱신이 실패해 "마지막 확인"이 오래된 상태
//   fail      항공편 조회 실패 (일시적 오류)
//   notfound  해당 날짜에 항공편 없음
//   routefail 이동 시간 조회 실패 (출발지 단계에서 막힌다)
//   passed    추천 출발 시각이 이미 지난 상태
//   recheckfail 추천 출발 시각이 지난 상태에서 "이동 시간 다시 확인"만 실패 (처음 조회는 성공)
//   landed    이미 도착한 항공편
//
// 실제 API를 연결하면 이 파일과 js/mock/* 은 쓰이지 않는다.
import { partsKst, toMs } from '../domain/time.js';

export const SCENARIOS = ['normal', 'changed', 'stale', 'fail', 'notfound', 'routefail', 'passed', 'recheckfail', 'landed'];

export const MOCK_LATENCY_MS = 300; // 실제 API처럼 응답에 시간이 걸리는 느낌

// 데모 시계: 오늘(한국 날짜)의 고정 시각에서 출발해, 페이지를 연 뒤 지난 시간만큼 흐른다.
// 실제 시각을 쓰면 밤에 열 때마다 "출발 시각 지남"이 나오므로 목업에서만 이렇게 고정한다.
const DEFAULT_CLOCK = '14:00';
const SCENARIO_CLOCK = { passed: '16:00', recheckfail: '16:00' };
const loadedAt = Date.now();

/** 주소창(search)에서 시나리오를 읽는다. 알 수 없는 값은 normal. */
export function getScenario(search = globalThis.location?.search ?? '') {
  const value = new URLSearchParams(search).get('scenario');
  return SCENARIOS.includes(value) ? value : 'normal';
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 오늘의 한국 날짜 "YYYY-MM-DD" */
export function todayKst() {
  const { y, m, d } = partsKst(Date.now());
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** 목업 화면이 "지금"으로 써야 하는 시각(epoch ms) */
export function mockNow(scenario = getScenario()) {
  const clock = SCENARIO_CLOCK[scenario] ?? DEFAULT_CLOCK;
  return toMs(`${todayKst()} ${clock}`) + (Date.now() - loadedAt);
}

export const wait = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms));
