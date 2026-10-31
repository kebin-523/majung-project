// 근거 타임라인: 추천 시각을 어떻게 계산했는지 "시간이 흐르는 순서"로 보여 준다. (DesignGuide 6장 "근거 타임라인")
// 비행기 티켓 모양(가정)으로 두 구역에 놓는다. DOM 순서가 곧 시간 순서다:
//   [출발지] ───🚗 이동 N분 · 자동차 기준─── [인천공항]      ← 항공권의 "출발지 ✈ 도착지" 줄
//   여유 N분 (수정 가능)  |  터미널 도착 08:00 (예상)  |  비행기 도착 17:50   ← 항공권의 칸 나누기
// 합계가 맞다: 추천 출발 시각 + 이동 = 터미널 도착(예상), 터미널 도착 + 여유 = 비행기 도착 시각.
// "비행기 도착"은 비행기의 도착 시각이다. 승객을 만나는 시각이 아니라는 점이 흐려지지 않게 한다.
import { escapeHtml } from '../html.js';
import { icon } from './icon.js';

/**
 * @param {object} vm
 * @param {string|null} [vm.originName]      사용자가 고른 출발지 이름 (없으면 "출발지")
 * @param {string|null} [vm.originAddress]   출발지 주소 (없으면 줄을 만들지 않는다)
 * @param {string} vm.destinationText        "인천공항 제1터미널" / 터미널을 모르면 "인천공항"
 * @param {number} vm.travelMin              이동 시간(분)
 * @param {number} vm.bufferTotalMin         공항 도착 여유 + 입국 후 만남까지 예상 시간(분)
 * @param {string} vm.terminalArrivalText     내가 터미널에 도착할 예상 시각 "08:00" (추천 출발 시각 + 이동 시간. 다른 날이면 "내일 00:20")
 * @param {string} vm.terminalArrivalSpoken   "오전 8시"
 * @param {string} vm.arrivalText            "17:50" (다른 날이면 "내일 00:20")
 * @param {string} vm.arrivalSpoken          "오후 5시 50분"
 */
export function renderTimeline(vm) {
  const origin = escapeHtml(vm.originName || '출발지');
  const address = vm.originAddress ? `<span class="route__sub">${escapeHtml(vm.originAddress)}</span>` : '';

  return `
    <div class="route-group" role="group" aria-label="추천 시각을 계산한 근거">
      <ol class="route">
        <li class="route__stop route__stop--from">
          <span class="route__place">${origin}</span>${address}
        </li>
        <li class="route__leg">
          <span class="route__track" aria-hidden="true"><span class="route__car">${icon('car')}</span></span>
          <span class="route__leg-text">이동 ${vm.travelMin}분<span class="route__sub">자동차 기준</span></span>
        </li>
        <li class="route__stop route__stop--to">
          <span class="route__place">${escapeHtml(vm.destinationText)}</span>
        </li>
      </ol>
      <ul class="route route--fields">
        <li class="route__field">
          <!-- 수정 가능한 칸. 누르면 "여유 시간 정하기" 바텀시트가 열린다. (연결: screens/result.js) -->
          <button class="route__edit" type="button" data-chip="buffer" aria-haspopup="dialog"
            aria-label="여유 시간 ${vm.bufferTotalMin}분, 수정하려면 누르세요">
            <span class="route__label">여유</span>
            <span class="route__value"><span>${vm.bufferTotalMin}분</span>${icon('pencil')}</span>
          </button>
        </li>
        <li class="route__field route__field--terminal">
          <span class="route__label">터미널 도착</span>
          <span class="route__value tabular" aria-hidden="true">${vm.terminalArrivalText}</span>
          <span class="route__sub" aria-hidden="true">예상</span>
          <span class="sr-only">예상 ${vm.terminalArrivalSpoken}</span>
        </li>
        <li class="route__field route__field--arrival">
          <span class="route__label">비행기 도착</span>
          <span class="route__value tabular" aria-hidden="true">${vm.arrivalText}</span>
          <span class="sr-only">${vm.arrivalSpoken}</span>
        </li>
      </ul>
    </div>`;
}
