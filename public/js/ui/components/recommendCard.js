// 추천 출발 시각 카드 (브랜드 핵심 컴포넌트). 비행기 티켓 모양이다. (DesignGuide 6장 "티켓 모양", 가정)
// 위에서 아래로: 줄무늬 띠(장식) → (상태 줄: 지남·착륙·곧 출발일 때만) → 상단(보딩패스처럼 왼쪽 추천 출발 시각 · 가운데 점선 · 오른쪽 예상 만남 시각, 두 시각은 같은 크기)
//   → 항공편 정보(편명 · 항공사 · 출발 도시 · 도착 날짜 · 비행기 도착 · 도착 터미널) → 시간표 → 절취선 → 쪽지: 확인 시각·예상 안내 + 새로고침
// 시각 옆에는 알약·태그를 두지 않는다. (부제가 이미 "추천 출발 시간"이고 상태는 상태 줄 하나로 알려, 같은 말이 두 번 나오지 않게 한다. 사용자 요청)
// 상태 줄은 말풍선이 아니라 다른 구역과 같은 구분선이 있는 평평한 한 줄이다. 평소 상태에는 없다.
// 상태 중 도착 변경은 카드 위의 변경 안내가, 최신 정보 확인 못 함은 쪽지의 확인 시각 줄이 알린다.
// 부제가 "추천 출발 시간"이라고 알려 주므로 "출발을 추천해요" 알약이나 문장 줄은 따로 두지 않는다. (화면 읽기에는 부제와 시각이 이어서 읽힌다)
// 상단 오른쪽의 "예상 만남"은 설정값으로 계산한 예상이다. 라벨에 항상 "예상"을 쓰고(6자 이내라 줄바꿈되지 않는다) 실시간 정보처럼 보이지 않는다.

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
 * 항공편 정보 (티켓 상단 아래, 보딩패스의 정보 칸). 라벨(14px Warm Gray) 위에 값(16px SemiBold)을 둔 항목 목록이다.
 * 항목: 편명 · 항공사 · 출발 도시 · 도착 날짜 · 비행기 도착(시각) · 도착 터미널. 2열이라 2개씩 짝이 맞는다.
 * API가 주지 않은 값(항공사, 출발 도시, 도착 터미널)은 만들지 않고,
 * 편명·항공사·출발 도시·도착 터미널이 모두 없으면 칸 전체를 만들지 않는다. (날짜와 도착 시각만으로는 칸을 만들지 않는다)
 * 사용자의 출발지(예: 합정역)와 헷갈리지 않도록 항공편의 출발지는 "출발 도시"라고 쓴다.
 * 비행기 도착 시각은 변경 도착 시각이 있으면 그것이고, 눈에는 24시간제 숫자, 화면 읽기에는 "오후 5시 21분"으로 읽힌다.
 */
export function renderFlightInfo(vm) {
  if (!vm.flightNo && !vm.airline && !vm.departureCity && !vm.terminalName) return '';
  const arrivalHtml = vm.arrivalClock
    ? `<span aria-hidden="true">${escapeHtml(vm.arrivalClock)}</span><span class="sr-only">${escapeHtml(vm.arrivalSpoken)}</span>`
    : '';
  const items = [
    ['편명', vm.flightNo && escapeHtml(vm.flightNo)],
    ['항공사', vm.airline && escapeHtml(vm.airline)],
    ['출발 도시', vm.departureCity && escapeHtml(vm.departureCity)],
    ['도착 날짜', vm.flightDateText && escapeHtml(vm.flightDateText)],
    ['비행기 도착', arrivalHtml],
    ['도착 터미널', vm.terminalName && escapeHtml(vm.terminalName)],
  ].filter(([, value]) => value);
  return `
      <div class="ticket__section ticket__flight" role="group" aria-label="선택한 항공편">
        <dl class="ticket__flight-list">${items.map(([label, value]) => `
          <div class="ticket__flight-item">
            <dt>${label}</dt>
            <dd>${value}</dd>
          </div>`).join('')}
        </dl>
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
 * @param {string} vm.meetClock          승객을 만날 수 있을 예상 시각 "18:25" (상단 오른쪽)
 * @param {string} vm.meetSpoken         "오후 6시 25분"
 * @param {string|null} vm.meetDay       만날 수 있는 시각이 다른 날일 때만 "내일" 등
 * @param {'passed'|'touchdown'|'soon'|null} vm.statusKind  상태 줄 종류. 평소 상태에는 null 이고 상태 줄 구역을 만들지 않는다
 * @param {string|null} vm.statusText    상태 줄 한 문장
 * @param {string} vm.timelineHtml      근거 타임라인 (ui/components/routeTimeline.js 의 renderTimeline)
 * @param {string|null} [vm.flightNo]    선택한 항공편 정보 (flightNo · airline · departureCity · flightDateText · terminalName)
 * @param {boolean} [vm.checking]        최신 정보를 확인하는 중인가
 * @param {boolean} [vm.stale]           마지막 확인이 오래되었는가
 * @param {string} vm.checkedText        "14:00"
 * @param {string} vm.checkedSpoken      "오후 2시"
 * @param {boolean} [vm.refreshing]      새로고침 버튼을 막을 때(확인 중이거나 이동 시간을 다시 확인하는 중)
 */
export function renderRecommendCardContent(vm) {
  const day = vm.dayText ? `${vm.dayText} ` : '';
  const busy = vm.refreshing || vm.checking;
  // 가장 위에 오는 구역 하나만 윗 선이 없다. (상태 줄 → 상단 순. 항공편 정보는 상단 아래라 맨 위가 될 수 없다)
  const heroFirst = !vm.statusText;

  return `
      <div class="ticket__band" aria-hidden="true"></div>
      ${vm.statusText ? renderStatusRow(vm, true) : ''}
      <div class="ticket__section ticket__hero${heroFirst ? ' ticket__section--first' : ''}">
        <div class="reco__route">
          <p class="reco__subtitle">추천 출발 시간</p>
          <div class="reco__time-row">
            <div class="reco__time-group">
              ${vm.dayText ? `<span class="reco__day" aria-hidden="true">${vm.dayText}</span>` : ''}
              <span class="reco__time tabular" aria-hidden="true">${vm.timeText}</span>
              <span class="sr-only">${day}${vm.timeSpoken}</span>
            </div>
          </div>
          <span class="reco__route-line" aria-hidden="true"></span>
          <p class="reco__meet-label">예상 만남</p>
          <div class="reco__meet">
            ${vm.meetDay ? `<span class="reco__meet-day" aria-hidden="true">${vm.meetDay}</span>` : ''}
            <span class="reco__meet-time tabular" aria-hidden="true">${vm.meetClock}</span>
            <span class="sr-only">만날 수 있는 시각 예상 ${vm.meetSpoken}</span>
          </div>
        </div>
      </div>${renderFlightInfo(vm)}
      ${vm.timelineHtml}
      <div class="ticket__stub">
        <div class="reco__foot">
          <p class="caption reco__checked">${renderCheckedLine(vm)}</p>
          <button class="icon-btn" type="button" data-action="refresh" aria-label="최신 정보 다시 확인"${busy ? ' disabled' : ''}>${icon('refresh', 20)}</button>
        </div>
      </div>`;
}
