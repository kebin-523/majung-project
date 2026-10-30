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
