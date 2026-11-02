// 결과 화면의 안내 카드(도착 · 운항 상태 확인 필요 · 도착 터미널 확인 못 함 · 이동 시간 오류 · 조회 실패)는 모두 비행기 티켓 모양이고,
// 모두 같은 정보 위계를 따른다. (DesignGuide 6장 "안내 티켓", 가정)
//   ▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨   윗 띠 (장식)
//   (i) 핵심 문장              ① 무슨 일인가: 20px SemiBold · Sunset Deep
//       보조 문장              ② 그래서 어떻게 하면 되나: 16px Regular · Ink
//   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   절취선 (양옆이 파인 홈) — ③·④가 있을 때만
//   도착 예정          19:10   ③ 곁들이는 정보: 라벨 14px Warm Gray · 값 16px SemiBold Ink
//   항공편 바꾸기              ④ 행동: Text 버튼 (16px SemiBold · Sunset Deep)
// 색은 단계마다 하나씩이다. 상태를 알리는 Sunset Deep은 ①과 ④에만, 설명은 Ink, 보조 라벨은 Warm Gray. 빨강은 쓰지 않는다.
// ①만 있어도 되고, 없는 단계는 만들지 않는다. 카드 안에는 Primary·Secondary 버튼을 두지 않는다.
import { escapeHtml } from '../html.js';
import { icon } from './icon.js';

/**
 * @param {object} input
 * @param {string|string[]} input.lead      핵심 문장. 여러 개면 한 구역 안에서 아이콘과 함께 차례로 보여 준다
 * @param {string} [input.detail]           보조 문장 (핵심 문장 아래, 핵심 문장 글자 시작 위치에 맞춘다)
 * @param {{label: string, value: string, spoken: string}[]} [input.facts]  쪽지의 곁들이는 정보. 눈에는 라벨·값, 화면 읽기에는 "라벨 spoken"
 * @param {{label: string, attr: string}} [input.action]  쪽지의 Text 버튼. attr 는 코드가 정한 data 속성 (예: 'data-action="change-flight"')
 */
export function renderNoticeTicket({ lead, detail, facts = [], action }) {
  const leads = [lead].flat().map((line) => `
        <p class="notice-ticket__lead">${icon('info')}<span>${escapeHtml(line)}</span></p>`).join('');
  const factRows = facts.map(({ label, value, spoken }) => `
        <p class="notice-ticket__fact">
          <span class="notice-ticket__fact-label" aria-hidden="true">${escapeHtml(label)}</span>
          <span class="notice-ticket__fact-value tabular"><span aria-hidden="true">${escapeHtml(value)}</span></span>
          <span class="sr-only">${escapeHtml(label)} ${escapeHtml(spoken)}</span>
        </p>`).join('');
  const stub = facts.length || action
    ? `
      <div class="ticket__stub">${factRows}${action ? `
        <button class="btn btn--text" type="button" ${action.attr}>${escapeHtml(action.label)}</button>` : ''}
      </div>`
    : '';
  return `
    <section class="notice-ticket">
      <div class="ticket__band" aria-hidden="true"></div>
      <div class="ticket__section ticket__section--first notice-ticket__top">${leads}${detail ? `
        <p class="notice-ticket__detail">${escapeHtml(detail)}</p>` : ''}
      </div>${stub}
    </section>`;
}
