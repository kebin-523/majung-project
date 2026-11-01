// 추천 출발 시각까지 남은 시간 문구. "지금" 줄에 쓴다. (DOM·시계 접근 없음, 현재 시각은 인자로 받는다)
// 남은 시간은 분 단위로 올림(아직 시간이 남았는데 0분이라고 하지 않는다), 지난 시간은 내림한다.
// 이 값은 API 가 주는 것이 아니라 추천 출발 시각과 현재 시각(기기 시계)에서 우리가 계산한 값이다.
const MINUTE = 60 * 1000;
const DAY_MIN = 24 * 60;

/** 분 → "54분" / "2시간 54분" / "1시간" / "1일 3시간" (하루 이상에서는 분을 쓰지 않는다) */
export function durationText(totalMinutes) {
  const days = Math.floor(totalMinutes / DAY_MIN);
  const hours = Math.floor((totalMinutes % DAY_MIN) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  return `${mins}분`;
}

/**
 * @param {number} departureMs  추천 출발 시각 (epoch ms)
 * @param {number} nowMs        현재 시각 (epoch ms)
 * @returns {{ kind: 'until' | 'now' | 'passed', minutes: number, text: string }}
 *   until: 아직 출발 전(1분 이상 남음), now: 출발할 시각(1분 안), passed: 이미 지남
 */
export function describeUntil(departureMs, nowMs) {
  if (!Number.isFinite(departureMs) || !Number.isFinite(nowMs)) {
    throw new TypeError('추천 출발 시각과 현재 시각은 유한한 숫자(epoch ms)여야 해요.');
  }
  const diff = departureMs - nowMs;
  if (diff >= MINUTE) {
    const minutes = Math.ceil(diff / MINUTE);
    return { kind: 'until', minutes, text: `출발까지 ${durationText(minutes)}` };
  }
  if (diff >= 0) return { kind: 'now', minutes: 0, text: '지금 출발할 시간이에요' };
  const minutes = Math.floor(-diff / MINUTE);
  return { kind: 'passed', minutes, text: minutes === 0 ? '방금 지났어요' : `${durationText(minutes)} 지났어요` };
}
