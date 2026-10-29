// 변경 안내 띠: 도착 정보가 바뀌었을 때 카드 위에 나타난다.
// 바뀐 항목만 "이전 → 새 값"으로 보여 준다. (취소선 + 화살표 + 문구로 구분하고, 빨강·경고·"지연" 표현은 쓰지 않는다.)
// 이동 시간은 다시 조회해서 값이 달라진 경우에만 비교 줄을 보여 주고,
// "이동 시간도 다시 확인했어요"는 실제로 다시 조회에 성공한 경우에만 쓴다.
import { formatClockWithDay, formatSpokenWithDay } from '../../domain/time.js';
import { icon } from './icon.js';

function row(label, fromText, toText, fromSpoken, toSpoken) {
  return `
    <li>
      <span aria-hidden="true">${label} <del class="change-banner__from">${fromText}</del> → <strong>${toText}</strong></span>
      <span class="sr-only">${label} ${fromSpoken}에서 ${toSpoken}으로 바뀌었어요</span>
    </li>`;
}

/**
 * @param {ReturnType<import('../../domain/change.js').summarizeChange>} change  null이 아닌 변경 요약
 * @param {number} now  날짜 라벨(오늘/내일) 기준 시각
 */
export function renderChangeBanner(change, now) {
  const rows = [
    row(
      '비행기 도착',
      formatClockWithDay(change.arrival.fromMs, now),
      formatClockWithDay(change.arrival.toMs, now),
      formatSpokenWithDay(change.arrival.fromMs, now),
      formatSpokenWithDay(change.arrival.toMs, now),
    ),
  ];

  if (change.departure.fromMs !== change.departure.toMs) {
    rows.push(
      row(
        '추천 출발 시각',
        formatClockWithDay(change.departure.fromMs, now),
        formatClockWithDay(change.departure.toMs, now),
        formatSpokenWithDay(change.departure.fromMs, now),
        formatSpokenWithDay(change.departure.toMs, now),
      ),
    );
  }

  if (change.travel.rechecked && change.travel.fromMin !== change.travel.toMin) {
    rows.push(row('이동 시간', `${change.travel.fromMin}분`, `${change.travel.toMin}분`, `${change.travel.fromMin}분`, `${change.travel.toMin}분`));
  }

  return `
    <section class="change-banner">
      ${icon('clock', 24)}
      <div class="change-banner__body">
        <ul class="change-banner__rows">${rows.join('')}</ul>
        <p class="change-banner__lead">도착 시각이 변경되어 출발 시각을 다시 계산했어요.</p>
        ${change.travel.rechecked ? '<p>이동 시간도 다시 확인했어요.</p>' : ''}
        <p class="caption change-banner__soft">바뀐 시각에 맞춰 새로 정리해 뒀어요.</p>
      </div>
    </section>`;
}
