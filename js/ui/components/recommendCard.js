// 추천 출발 시각 카드 (브랜드 핵심 컴포넌트).
// 구성 순서: 항적선 → 말풍선 → 추천 출발 시각(+"출발") → 핵심 안내 문장 → 상태 배지 → 근거 칩 → 확인 시각·예상 안내
import { renderBadge } from './badge.js';
import { icon } from './icon.js';

/** 두 길(비행기가 지나온 길 / 내가 나가는 길)이 한 점에서 만나는 항적선 */
function trailGraphic() {
  return `
    <svg class="trail" viewBox="0 0 96 32" width="96" height="32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true" focusable="false">
      <path class="trail__line" vector-effect="non-scaling-stroke" d="M3 5C40 5 60 16 84 16"/>
      <path class="trail__line" vector-effect="non-scaling-stroke" d="M3 27C40 27 60 16 84 16"/>
      <circle class="trail__dot" cx="88" cy="16" r="3" fill="currentColor" stroke="none"/>
    </svg>`;
}

/**
 * 확인 시각 줄의 안쪽. 세 가지 모습이 있다.
 *  - 확인 중:   "확인 중이에요"            (이전에 확인한 값을 최신처럼 보이게 하지 않는다)
 *  - 오래됨:    "마지막 확인은 14:00예요. 최신 정보를 확인하지 못했어요."  (Sunset Deep + 정보 아이콘, 마지막 확인 시각은 가리지 않는다)
 *  - 정상:      "14:00에 확인했어요"
 * "달라질 수 있어요" 안내(추정치 표시)는 어떤 경우에도 지우지 않는다.
 * 카드 전체를 다시 그리지 않고 이 줄만 바꿀 때도 쓴다.
 *
 * @param {{checking?: boolean, stale?: boolean, checkedText: string, checkedSpoken: string}} vm
 */
export function renderCheckedLine(vm) {
  let checked;
  if (vm.checking) {
    checked = '<span>확인 중이에요</span>';
  } else if (vm.stale) {
    checked = `<span class="stale-text">${icon('info')}<span aria-hidden="true">마지막 확인은 ${vm.checkedText}예요.</span><span class="sr-only">마지막 확인은 ${vm.checkedSpoken}예요.</span> 최신 정보를 확인하지 못했어요.</span>`;
  } else {
    checked = `<span aria-hidden="true">${vm.checkedText}에 확인했어요</span><span class="sr-only">${vm.checkedSpoken}에 확인했어요</span>`;
  }
  return `${checked} · 실제 도착과 교통에 따라 달라질 수 있어요`;
}

/**
 * 카드 안쪽 내용. 값이 바뀔 때는 바깥 aria-live 영역(<section class="reco" aria-live="polite">)은 그대로 두고
 * 이 내용만 갈아 끼워야 화면 읽기 프로그램이 변경을 알려 준다. (바깥 영역은 screens/result.js가 만든다.)
 *
 * @param {object} vm
 * @param {string|null} vm.dayText       추천 시각이 다른 날일 때만: "내일" / "10월 30일"
 * @param {string} vm.timeText           "17:10"
 * @param {string} vm.timeSpoken         "오후 5시 10분"
 * @param {string} vm.badgeKey           relaxed | soon | changed | stale | passed
 * @param {string} vm.bubbleText         다정한 한 문장
 * @param {string} vm.chipsHtml
 * @param {boolean} [vm.checking]        최신 정보를 확인하는 중인가
 * @param {boolean} [vm.stale]           마지막 확인이 오래되었는가
 * @param {string} vm.checkedText        "14:00"
 * @param {string} vm.checkedSpoken      "오후 2시"
 */
export function renderRecommendCardContent(vm) {
  const day = vm.dayText ? `${vm.dayText} ` : '';

  return `
      ${trailGraphic()}
      <p class="bubble">${vm.bubbleText}</p>
      <div class="reco__time-row">
        <div class="reco__time-group">
          ${vm.dayText ? `<span class="reco__day" aria-hidden="true">${vm.dayText}</span>` : ''}
          <span class="reco__time tabular" aria-hidden="true">${vm.timeText}</span>
        </div>
        <span class="pill-depart" aria-hidden="true">출발</span>
      </div>
      <p class="reco__lead">
        <span aria-hidden="true">${day}${vm.timeText} 출발을 추천해요</span>
        <span class="sr-only">${day}${vm.timeSpoken} 출발을 추천해요</span>
      </p>
      <div>${renderBadge(vm.badgeKey)}</div>
      ${vm.chipsHtml}
      <p class="caption reco__checked">${renderCheckedLine(vm)}</p>`;
}
