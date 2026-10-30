// 상태 배지 결정. 여러 상태가 겹치면 config.js의 BADGE_PRIORITY 순서로 하나만 고른다.
import { BADGE_PRIORITY, SOON_THRESHOLD_MIN, STALE_AFTER_MIN } from '../config.js';
import { minutes, toMs } from './time.js';

/**
 * 마지막 확인으로부터 기준 시간(STALE_AFTER_MIN)을 넘겼는가. 확인한 적이 없으면 오래된 것으로 본다.
 * @param {{ now: number|string|Date, lastChecked: number|string|Date|null }} input
 */
export function isStale({ now, lastChecked }) {
  return lastChecked == null || toMs(now) - toMs(lastChecked) > minutes(STALE_AFTER_MIN);
}

/**
 * 화면을 연 채 마지막 확인이 오래되었을 때, 자동으로 한 번 다시 확인해야 하는가.
 * 이미 자동으로 시도했다면(실패했다면) 반복하지 않고 사용자의 "다시 시도"로 넘긴다.
 * 간격은 "오래됨" 기준(STALE_AFTER_MIN)을 그대로 쓴다.
 *
 * @param {{ now: number|string|Date, lastChecked: number|string|Date|null, alreadyTried: boolean }} input
 *   alreadyTried: 이번 "오래됨" 구간에서 자동 확인을 이미 했는가 (확인에 성공하면 호출하는 쪽이 false로 되돌린다)
 */
export function shouldAutoRecheck({ now, lastChecked, alreadyTried }) {
  return !alreadyTried && isStale({ now, lastChecked });
}

/**
 * @param {object} input
 * @param {number|string|Date} input.now
 * @param {number|string|Date} input.departure          추천 출발 시각
 * @param {number|string|Date|null} input.lastChecked   마지막으로 최신 정보를 확인한 시각
 * @param {boolean} [input.hasUnseenChange]             아직 사용자가 확인하지 않은 도착 정보 변경이 있는가
 * @param {boolean} [input.landed]                      이미 도착한 항공편인가 (API가 상태를 제공할 때만 true)
 * @returns {'landed'|'passed'|'stale'|'changed'|'soon'|'relaxed'}
 */
export function resolveBadge({ now, departure, lastChecked, hasUnseenChange = false, landed = false }) {
  // 이미 도착했다면 추천 시각 자체가 의미 없으므로 배지 우선순위와 별개로 먼저 처리한다.
  if (landed) return 'landed';

  const nowMs = toMs(now);
  const untilDepartureMs = toMs(departure) - nowMs;

  const active = {
    passed: untilDepartureMs < 0,
    stale: isStale({ now: nowMs, lastChecked }),
    changed: hasUnseenChange,
    soon: untilDepartureMs <= minutes(SOON_THRESHOLD_MIN),
    relaxed: true,
  };

  return BADGE_PRIORITY.find((key) => active[key]);
}

/**
 * 추천 카드 대신 안내 상자를 보여 줘야 하는 항공편인가. (DOM 접근 없음)
 *  - 'arrived': 이미 도착한 편 (status 'arrived'). 착륙('touchdown')은 해당하지 않고 추천 카드를 유지한다.
 *  - 'unknown': 운항 상태를 알아보지 못한 편 (결항·회항 포함). 추천 출발 시각을 계산하지 않는다.
 *  - null: 추천 카드를 그린다.
 * @param {{ status?: string, landed?: boolean }} flight
 * @returns {'arrived'|'unknown'|null}
 */
export function flightNoticeKind({ status, landed } = {}) {
  if (landed === true || status === 'arrived') return 'arrived';
  if (status === 'unknown') return 'unknown';
  return null;
}

/**
 * 항공편의 최신 상태에 맞는 화면을 결정한다. 재확인 결과가 올 때마다 이 함수로 다시 정하므로, 상태가 되돌아와도 최신 상태를 따라간다. (DOM 접근 없음)
 *  - screen 'card'    추천 카드. 착륙(touchdown)이면 touchdown 이 true 이고 말풍선만 바뀐다.
 *  - screen 'arrived' 도착 안내 상자. 추천 시각을 계산·표시하지 않는다.
 *  - screen 'unknown' 운항 상태 확인 필요 안내 상자. 추천 시각을 계산·표시하지 않는다.
 * @param {{ status?: string, landed?: boolean }} flight
 * @returns {{ screen: 'card'|'arrived'|'unknown', touchdown: boolean }}
 */
export function resolveFlightView(flight) {
  const notice = flightNoticeKind(flight);
  if (notice) return { screen: notice, touchdown: false };
  return { screen: 'card', touchdown: flight?.status === 'touchdown' };
}

/**
 * "오래됨"과 자동 재확인을 판단하는 기준 시각: 화면이 항공편 응답을 받은 시각(receivedAt)이다.
 * 서버가 인천공항 API 를 부른 시각(fetchedAt)은 서버 시계라서 기기 시계와 어긋날 수 있으므로 "N:NN에 확인했어요" 표시에만 쓴다.
 * receivedAt 이 없는 예전 저장값만 fetchedAt 으로 대신한다.
 * @param {{ receivedAt?: number|null, fetchedAt?: number|null }} flight
 */
export function lastConfirmedAt(flight) {
  return flight?.receivedAt ?? flight?.fetchedAt ?? null;
}
