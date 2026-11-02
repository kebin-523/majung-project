// 결과 화면 하단 버튼 그룹: 항공편 변경 · 공유하기 · 알림 받기. 아이콘이 위, 글자가 아래인 알약 버튼 세 개다. (DesignGuide 6장 "하단 버튼 그룹", 가정)
//   첫 버튼만 Ink 로 채우고 나머지는 Peach 바탕에 Border 선이다. 동작은 screens/result.js 가 연결한다.
//   (항공편 변경 → 항공편 검색 화면, 공유하기 → 링크 복사 + 토스트, 알림 받기 → 알림 시점 팝업)
import { icon } from './icon.js';

const ACTIONS = [
  { action: 'change-flight', iconName: 'swap', label: '항공편 변경', filled: true },
  { action: 'share', iconName: 'share', label: '공유하기' },
  { action: 'alert', iconName: 'bell', label: '알림 받기', popup: true },
];

export function renderActionBar() {
  return `<div class="action-bar" role="group" aria-label="이 항공편으로 할 수 있는 일">${ACTIONS.map(({ action, iconName, label, filled, popup }) => `
      <button class="action-btn${filled ? ' action-btn--filled' : ''}" type="button" data-action="${action}"${popup ? ' aria-haspopup="dialog"' : ''}>
        ${icon(iconName, 24)}
        <span class="action-btn__label">${label}</span>
      </button>`).join('')}
    </div>`;
}
