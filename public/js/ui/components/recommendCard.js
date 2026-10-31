// 추천 출발 시각 카드 (브랜드 핵심 컴포넌트).
// 구성 순서: 말풍선 → 추천 출발 시각 + "출발을 추천해요" → 상태 배지 → 근거 타임라인(출발지 → 이동 → 공항 → 여유 → 비행기 도착) → 확인 시각·예상 안내 + 새로고침
// 추천 시각 숫자와 추천 문장은 한 덩어리다. (별도의 "17:10 출발을 추천해요" 문장 줄은 두지 않는다)
import { renderBadge } from './badge.js';
import { icon } from './icon.js';

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
 * @param {string} vm.timelineHtml      근거 타임라인 (ui/components/routeTimeline.js 의 renderTimeline)
 * @param {boolean} [vm.checking]        최신 정보를 확인하는 중인가
 * @param {boolean} [vm.stale]           마지막 확인이 오래되었는가
 * @param {string} vm.checkedText        "14:00"
 * @param {string} vm.checkedSpoken      "오후 2시"
 * @param {boolean} [vm.refreshing]      새로고침 버튼을 막을 때(확인 중이거나 이동 시간을 다시 확인하는 중)
 */
export function renderRecommendCardContent(vm) {
  const day = vm.dayText ? `${vm.dayText} ` : '';
  const busy = vm.refreshing || vm.checking;

  return `
      <p class="bubble">${vm.bubbleText}</p>
      <div class="reco__time-row">
        <div class="reco__time-group">
          ${vm.dayText ? `<span class="reco__day" aria-hidden="true">${vm.dayText}</span>` : ''}
          <span class="reco__time tabular" aria-hidden="true">${vm.timeText}</span>
          <span class="sr-only">${day}${vm.timeSpoken}</span>
        </div>
        <span class="pill-depart">출발을 추천해요</span>
      </div>
      <div>${renderBadge(vm.badgeKey)}</div>
      ${vm.timelineHtml}
      <div class="reco__foot">
        <p class="caption reco__checked">${renderCheckedLine(vm)}</p>
        <button class="icon-btn" type="button" data-action="refresh" aria-label="최신 정보 다시 확인"${busy ? ' disabled' : ''}>${icon('refresh', 20)}</button>
      </div>`;
}
