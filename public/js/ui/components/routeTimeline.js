// 근거 타임라인: 추천 시각을 어떻게 계산했는지 "시간이 흐르는 순서"로 보여 준다. (DesignGuide 6장 "근거 타임라인", 기존 근거 칩을 대체)
//   ● 내 출발지  →  이동 N분 (자동차 기준)  →  ● 인천공항  →  여유 N분 (수정 가능)  →  ● 비행기 도착 17:50
// 지점(출발지·공항·비행기 도착)은 점, 구간(이동·여유)은 점 사이의 글자로 구분한다. 칩 모양은 쓰지 않는다.
// 합계가 맞다: 추천 출발 시각 + 이동 + 여유 = 비행기 도착 시각.
// "비행기 도착"은 비행기의 도착 시각이다. 승객을 만나는 시각이 아니라는 점이 흐려지지 않게 한다.
import { escapeHtml } from '../html.js';
import { icon } from './icon.js';

/**
 * 이동 시간 확인 줄: 이동 구간 바로 아래의 한 줄. "이동 시간은 18:45에 확인했어요" (DesignGuide §6 초안)
 * 보여 주지 않는 경우(vm.travelChecked 가 없음)는 빈 문자열이다. 문구와 숨김 조건은 domain/travelChecked.js 가 정한다.
 * 카드를 다시 그릴 때(이동 시간을 다시 확인해 성공한 뒤 포함) 새 값으로 바뀐다. 항공편 확인 시각 줄과는 따로이고 서로 비교하지 않는다.
 *
 * @param {{travelChecked?: {sentence: string, spokenSentence: string} | null}} vm
 */
export function renderTravelCheckedLine(vm) {
  const line = vm.travelChecked;
  if (!line) return '';
  return `
      <p class="caption reco__travel-checked"><span aria-hidden="true">${line.sentence}</span><span class="sr-only">${line.spokenSentence}</span></p>`;
}

/**
 * @param {object} vm
 * @param {string|null} [vm.originName]      사용자가 고른 출발지 이름 (없으면 "출발지")
 * @param {string|null} [vm.originAddress]   출발지 주소 (없으면 줄을 만들지 않는다)
 * @param {string} vm.destinationText        "인천공항 제1터미널" / 터미널을 모르면 "인천공항"
 * @param {number} vm.travelMin              이동 시간(분)
 * @param {number} vm.bufferTotalMin         공항 도착 여유 + 입국 후 만남까지 예상 시간(분)
 * @param {string} vm.arrivalText            "17:50" (다른 날이면 "내일 00:20")
 * @param {string} vm.arrivalSpoken          "오후 5시 50분"
 */
export function renderTimeline(vm) {
  const origin = escapeHtml(vm.originName || '출발지');
  const address = vm.originAddress ? `<span class="route__sub">${escapeHtml(vm.originAddress)}</span>` : '';

  return `
    <ol class="route" aria-label="추천 시각을 계산한 근거">
      <li class="route__row route__row--node">
        <span class="route__dot" aria-hidden="true"></span>
        <span class="route__body"><span class="route__place">${origin}</span>${address}</span>
      </li>
      <li class="route__row route__row--leg">
        <span class="route__body">
          <span class="route__leg">${icon('car')}<span>이동 ${vm.travelMin}분 · 자동차 기준</span></span>${renderTravelCheckedLine(vm)}
        </span>
      </li>
      <li class="route__row route__row--node">
        <span class="route__dot" aria-hidden="true"></span>
        <span class="route__body"><span class="route__place">${escapeHtml(vm.destinationText)}</span></span>
      </li>
      <li class="route__row route__row--leg">
        <!-- 수정 가능한 구간. 누르면 "여유 시간 정하기" 바텀시트가 열린다. (연결: screens/result.js) -->
        <button class="route__edit" type="button" data-chip="buffer" aria-haspopup="dialog"
          aria-label="여유 시간 ${vm.bufferTotalMin}분, 수정하려면 누르세요">
          ${icon('clock')}<span>여유 ${vm.bufferTotalMin}분</span>${icon('pencil')}
        </button>
      </li>
      <li class="route__row route__row--node route__row--end">
        <span class="route__dot" aria-hidden="true"></span>
        <span class="route__body route__arrival">
          <span class="route__plane">${icon('plane')}<span>비행기 도착</span></span>
          <span class="route__time tabular" aria-hidden="true">${vm.arrivalText}</span>
          <span class="sr-only">${vm.arrivalSpoken}</span>
        </span>
      </li>
    </ol>`;
}
