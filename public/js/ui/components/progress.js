// 진행 정도(1/3 ~ 3/3) 바. 출발 신호·선택 색인 Departure Amber로 채운다.
const TOTAL = 3;

export function renderProgress(step) {
  return `
    <div class="progress" role="progressbar" aria-label="진행 정도" aria-valuemin="1" aria-valuemax="${TOTAL}" aria-valuenow="${step}" aria-valuetext="${TOTAL}단계 중 ${step}단계">
      <div class="progress__track" aria-hidden="true"><div class="progress__fill" style="--step:${step};--total:${TOTAL}"></div></div>
      <span class="progress__label caption tabular" aria-hidden="true">${step}/${TOTAL}</span>
    </div>`;
}
