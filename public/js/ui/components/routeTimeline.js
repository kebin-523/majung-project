// 시간표: 추천 시각이 어떻게 나왔는지를 "시간이 흐르는 순서"로 보여 준다. (DesignGuide 6장 "시간표")
//   (◎) 출발                 19:20   ← 지점: 왼쪽 점선 원 아이콘 · 가운데 내용 · 오른쪽 시각(20px SemiBold)
//    │  합정역
//    │  이동 40분             ← 구간: 걸리는 시간(16px)은 아이콘들을 잇는 선 옆에 둔다 (실선)
//    │  자동차 기준
//   (🚗) 터미널 도착 · 예상    20:00
//    ┊  인천공항 제2터미널
//    ┊  ◔ 여유 60분 ✎        ← 설정값이라 점선. 누르면 바텀시트가 열린다
//   (✈) 비행기 도착           21:00
//       KE123
// 합계가 맞다: 추천 출발 시각 + 이동 = 터미널 도착(예상), 터미널 도착 + 여유 = 비행기 도착 시각.
// "비행기 도착"은 비행기의 도착 시각이다. "터미널 도착"은 마중하는 내가 터미널에 도착할 예상 시각이고 승객을 만나는 시각이 아니다.
import { escapeHtml } from '../html.js';
import { icon } from './icon.js';

/** 지점 하나: 원형 아이콘 · 종류 라벨 · (이름) · (주소) · 오른쪽에 시각(날짜 라벨이 있으면 위에) */
function stop(kind, iconName, { day, clock, spoken, label, place, sub }) {
  return `
        <li class="itinerary__stop itinerary__stop--${kind}">
          <span class="itinerary__badge" aria-hidden="true">${icon(iconName)}</span>
          <span class="itinerary__what">
            <span class="itinerary__kind">${label}</span>
            ${place ? `<span class="itinerary__place">${escapeHtml(place)}</span>` : ''}
            ${sub ? `<span class="itinerary__sub">${escapeHtml(sub)}</span>` : ''}
          </span>
          <span class="itinerary__when">
            ${day ? `<span class="itinerary__day" aria-hidden="true">${day}</span>` : ''}
            <span class="itinerary__time tabular" aria-hidden="true">${clock}</span>
            <span class="sr-only">${spoken}</span>
          </span>
        </li>`;
}

/**
 * @param {object} vm
 * @param {string|null} [vm.originName]      사용자가 고른 출발지 이름 (없으면 "출발지")
 * @param {string|null} [vm.originAddress]   출발지 주소 (없으면 줄을 만들지 않는다)
 * @param {string} vm.destinationText        "인천공항 제1터미널" / 터미널을 모르면 "인천공항"
 * @param {string|null} [vm.flightNo]        비행기 도착 지점에 함께 보여 줄 항공편명 (없으면 라벨만)
 * @param {number} vm.travelMin              이동 시간(분)
 * @param {number} vm.bufferTotalMin         공항 도착 여유 + 입국 후 만남까지 예상 시간(분)
 * @param {string} vm.timeText               추천 출발 시각 "19:20"
 * @param {string} vm.timeSpoken             "오후 7시 20분"
 * @param {string|null} vm.departureDay      추천 출발 시각의 날짜 라벨 ("내일" 등, 지금과 같은 날이면 null)
 * @param {string} vm.terminalArrivalClock   내가 터미널에 도착할 예상 시각 "20:00" (추천 출발 시각 + 이동 시간)
 * @param {string} vm.terminalArrivalSpoken  "오후 8시" (날짜 라벨이 있으면 "내일 오전 1시")
 * @param {string|null} vm.terminalArrivalDay
 * @param {string} vm.arrivalClock           비행기 도착 시각 "21:00"
 * @param {string} vm.arrivalSpoken
 * @param {string|null} vm.arrivalDay
 */
export function renderTimeline(vm) {
  return `
    <div class="route-group" role="group" aria-label="추천 시각을 계산한 근거">
      <ol class="itinerary">${stop('depart', 'pin', {
    day: vm.departureDay,
    clock: vm.timeText,
    spoken: `${vm.departureDay ? `${vm.departureDay} ` : ''}${vm.timeSpoken}`,
    label: '출발',
    place: vm.originName || '출발지',
    sub: vm.originAddress,
  })}
        <li class="itinerary__leg">
          <span class="itinerary__what">
            <span class="itinerary__leg-main">이동 ${vm.travelMin}분</span>
            <span class="itinerary__sub">자동차 기준</span>
          </span>
        </li>${stop('terminal', 'car', {
    day: vm.terminalArrivalDay,
    clock: vm.terminalArrivalClock,
    spoken: vm.terminalArrivalSpoken,
    label: '터미널 도착 · 예상',
    place: vm.destinationText,
  })}
        <li class="itinerary__leg">
          <!-- 수정 가능한 구간. 누르면 "여유 시간 정하기" 바텀시트가 열린다. (연결: screens/result.js) -->
          <span class="itinerary__what">
            <button class="itinerary__edit" type="button" data-chip="buffer" aria-haspopup="dialog"
              aria-label="여유 시간 ${vm.bufferTotalMin}분, 수정하려면 누르세요">
              ${icon('clock')}<span>여유 ${vm.bufferTotalMin}분</span>${icon('pencil')}
            </button>
          </span>
        </li>${stop('arrival', 'plane', {
    day: vm.arrivalDay,
    clock: vm.arrivalClock,
    spoken: vm.arrivalSpoken,
    label: '비행기 도착',
    place: vm.flightNo,
  })}
      </ol>
    </div>`;
}
