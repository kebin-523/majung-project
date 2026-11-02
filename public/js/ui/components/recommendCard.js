// 추천 출발 시각 카드 (브랜드 핵심 컴포넌트). 비행기 티켓 모양이다. (DesignGuide 6장 "티켓 모양", 가정)
// 위에서 아래로: 줄무늬 띠(장식) → 항공편 정보(편명·항공사 / 출발 도시·도착 날짜) → (상태 줄: 지남·착륙·곧 출발일 때만) → 부제 "추천 출발 시간" + 추천 시각 + "지금" 줄(현재 시각 · 출발까지 남은 시간) → 시간표 → 근거(출발지 → 이동 → 공항 / 여유 · 비행기 도착)
//   ┄┄ 절취선(양옆이 파인 홈) ┄┄ → 쪽지: 확인 시각·예상 안내 + 새로고침
// 시각 옆에는 알약·태그를 두지 않는다. (부제가 이미 "추천 출발 시간"이고 상태는 상태 줄 하나로 알려, 같은 말이 두 번 나오지 않게 한다. 사용자 요청)
// 상태 줄은 말풍선이 아니라 다른 구역과 같은 구분선이 있는 평평한 한 줄이다. 평소 상태에는 없다.
// 상태 중 도착 변경은 카드 위의 변경 안내가, 최신 정보 확인 못 함은 쪽지의 확인 시각 줄이 알린다.
// 부제가 "추천 출발 시간"이라고 알려 주므로 "출발을 추천해요" 알약이나 문장 줄은 따로 두지 않는다. (화면 읽기에는 부제와 시각이 이어서 읽힌다)
import { escapeHtml } from '../html.js';
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
 * 사용자가 앞서 고른 항공편 정보 칸 (항공권 윗부분의 "항공사 · 편명" 줄). 값이 없는 항목은 만들지 않고, 보여 줄 값이 없으면 칸 전체를 만들지 않는다.
 * 왼쪽: 편명(20px SemiBold) + 항공사(14px Warm Gray). 오른쪽: 출발 도시 "방콕/수완나품 출발" + 도착 날짜 "오늘 · 11월 1일 도착".
 * 사용자의 출발지(예: 합정역)와 헷갈리지 않도록 항공편의 출발지는 "도시 + 출발"로 쓴다.
 */
export function renderFlightHeader(vm) {
  if (!vm.flightNo && !vm.airline && !vm.departureCity) return '';
  const left = [
    vm.flightNo ? `<span class="ticket__flight-no">${escapeHtml(vm.flightNo)}</span>` : '',
    vm.airline ? `<span class="route__sub">${escapeHtml(vm.airline)}</span>` : '',
  ].join('');
  const right = [
    vm.departureCity ? `<span class="ticket__flight-city">${escapeHtml(vm.departureCity)} 출발</span>` : '',
    vm.flightDateText ? `<span class="route__sub">${escapeHtml(vm.flightDateText)} 도착</span>` : '',
  ].join('');
  return `
      <div class="ticket__section ticket__section--first ticket__flight" role="group" aria-label="선택한 항공편">
        <div class="ticket__flight-id">${left}</div>
        <div class="ticket__flight-from">${right}</div>
      </div>`;
}

/**
 * "지금" 줄: 현재 시각(기기 시계)과 추천 출발 시각까지 남은(또는 지난) 시간. 추천 시각 바로 아래에 둔다.
 * 매분 값이 바뀌므로 aria-live="off"로 두어 화면 읽기 프로그램이 매분 읽지 않게 한다. (카드 바깥 영역은 aria-live="polite")
 * 카드 전체를 다시 그리지 않고 이 줄만 바꿀 때도 쓴다. (screens/result.js)
 *
 * @param {{nowText: string, nowSpoken: string, untilKind: 'until'|'now'|'passed', untilText: string}} vm
 */
export function renderNowRow(vm) {
  return `<div class="reco__now" aria-live="off">
          <span class="reco__until reco__until--${vm.untilKind}">${vm.untilText}</span>
          <span class="reco__now-clock">
            <span class="reco__now-label">지금</span>
            <span class="reco__now-time tabular" aria-hidden="true">${vm.nowText}</span>
            <span class="sr-only">지금 ${vm.nowSpoken}</span>
          </span>
        </div>`;
}

const STATUS_ICON = { passed: 'clock', soon: 'clock', touchdown: 'plane' };

/**
 * 상태 줄: 왼쪽 원형 아이콘(꾸밈, 화면 읽기에서 숨김) + 한 문장. 상태는 아이콘 모양·원 색·문장으로 함께 구분한다.
 * 지남 = 시계 + Sunset 원, 곧 출발 = 시계 + Amber 원(출발 신호), 착륙 = 비행기 + Dusk Blue 원. (DesignGuide 6장, 가정)
 */
function renderStatusRow(vm, first) {
  return `
      <div class="ticket__section ticket__status ticket__status--${vm.statusKind}${first ? ' ticket__section--first' : ''}">
        <span class="ticket__status-icon" aria-hidden="true">${icon(STATUS_ICON[vm.statusKind], 20)}</span>
        <p class="ticket__status-text">${vm.statusText}</p>
      </div>`;
}

/**
 * 카드 안쪽 내용. 값이 바뀔 때는 바깥 aria-live 영역(<section class="reco" aria-live="polite">)은 그대로 두고
 * 이 내용만 갈아 끼워야 화면 읽기 프로그램이 변경을 알려 준다. (바깥 영역은 screens/result.js가 만든다.)
 *
 * @param {object} vm
 * @param {string|null} vm.dayText       추천 시각이 다른 날일 때만: "내일" / "10월 30일"
 * @param {string} vm.timeText           "17:10"
 * @param {string} vm.timeSpoken         "오후 5시 10분"
 * @param {'passed'|'touchdown'|'soon'|null} vm.statusKind  상태 줄 종류. 평소 상태에는 null 이고 상태 줄 구역을 만들지 않는다
 * @param {string|null} vm.statusText    상태 줄 한 문장
 * @param {string} vm.timelineHtml      근거 타임라인 (ui/components/routeTimeline.js 의 renderTimeline)
 * @param {string|null} [vm.flightNo]    선택한 항공편 정보 (flightNo · airline · departureCity · flightDateText)
 * @param {boolean} [vm.checking]        최신 정보를 확인하는 중인가
 * @param {boolean} [vm.stale]           마지막 확인이 오래되었는가
 * @param {string} vm.checkedText        "14:00"
 * @param {string} vm.checkedSpoken      "오후 2시"
 * @param {boolean} [vm.refreshing]      새로고침 버튼을 막을 때(확인 중이거나 이동 시간을 다시 확인하는 중)
 */
export function renderRecommendCardContent(vm) {
  const day = vm.dayText ? `${vm.dayText} ` : '';
  const busy = vm.refreshing || vm.checking;
  const flightHeader = renderFlightHeader(vm);
  // 가장 위에 오는 구역 하나만 윗 선이 없다. (항공편 정보 칸 → 상태 줄 → 추천 시각 순)
  const heroFirst = !flightHeader && !vm.statusText;

  return `
      <div class="ticket__band" aria-hidden="true"></div>${flightHeader}
      ${vm.statusText ? renderStatusRow(vm, !flightHeader) : ''}
      <div class="ticket__section ticket__hero${heroFirst ? ' ticket__section--first' : ''}">
        <p class="reco__subtitle">추천 출발 시간</p>
        <div class="reco__time-row">
          <div class="reco__time-group">
            ${vm.dayText ? `<span class="reco__day" aria-hidden="true">${vm.dayText}</span>` : ''}
            <span class="reco__time tabular" aria-hidden="true">${vm.timeText}</span>
            <span class="sr-only">${day}${vm.timeSpoken}</span>
          </div>
        </div>
        ${renderNowRow(vm)}
      </div>
      ${vm.timelineHtml}
      <div class="ticket__stub">
        <div class="reco__foot">
          <p class="caption reco__checked">${renderCheckedLine(vm)}</p>
          <button class="icon-btn" type="button" data-action="refresh" aria-label="최신 정보 다시 확인"${busy ? ' disabled' : ''}>${icon('refresh', 20)}</button>
        </div>
      </div>`;
}
