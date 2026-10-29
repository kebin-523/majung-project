// 근거 칩 줄: 추천 시각을 어떻게 계산했는지 세 가지를 항상 보여 준다.
//   비행기 도착(수정 불가) · 이동(수정 불가, 자동차 기준) · 여유(수정 가능)
import { icon } from './icon.js';

/**
 * @param {object} input
 * @param {string} input.arrivalText     화면에 보일 도착 시각 (예: "17:50", 다른 날이면 "내일 00:20")
 * @param {string} input.arrivalSpoken   화면 읽기용 (예: "오후 5시 50분")
 * @param {number} input.travelMin       이동 시간(분)
 * @param {number} input.bufferTotalMin  공항 도착 여유 + 입국 후 만남까지 예상 시간(분)
 */
export function renderChips({ arrivalText, arrivalSpoken, travelMin, bufferTotalMin }) {
  return `
    <ul class="chips" aria-label="추천 시각을 계산한 근거">
      <li>
        <span class="chip">
          ${icon('plane')}
          <span aria-hidden="true">비행기 도착 ${arrivalText}</span>
          <span class="sr-only">비행기 도착 ${arrivalSpoken}</span>
        </span>
      </li>
      <li>
        <span class="chip">${icon('car')}<span>이동 ${travelMin}분 · 자동차 기준</span></span>
      </li>
      <li>
        <!-- 수정 가능한 칩. 누르면 "여유 시간 정하기" 바텀시트가 열린다. (연결: screens/result.js) -->
        <button class="chip chip--editable" type="button" data-chip="buffer" aria-haspopup="dialog"
          aria-label="여유 시간 ${bufferTotalMin}분, 수정하려면 누르세요">
          ${icon('clock')}<span>여유 ${bufferTotalMin}분</span>${icon('pencil')}
        </button>
      </li>
    </ul>`;
}
