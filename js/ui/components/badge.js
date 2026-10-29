// 상태 배지. 항상 아이콘 + 문구를 함께 쓰고, 색만으로 구분하지 않는다.
// 키는 domain/status.js의 resolveBadge 결과와 같다. ('landed'는 배지가 아니라 별도 안내로 처리한다.)
import { icon } from './icon.js';

const BADGES = {
  relaxed: { text: '여유 있어요', icon: 'check' },
  soon: { text: '곧 나갈 시간이에요', icon: 'clock' },
  changed: { text: '도착 시각이 바뀌었어요', icon: 'clock' },
  stale: { text: '최신 정보를 확인하지 못했어요', icon: 'info' },
  passed: { text: '추천 출발 시각이 지났어요', icon: 'clock' },
};

export function renderBadge(key) {
  const badge = BADGES[key];
  if (!badge) throw new RangeError(`알 수 없는 배지: ${key}`);
  return `<span class="badge badge--${key}">${icon(badge.icon)}<span>${badge.text}</span></span>`;
}
