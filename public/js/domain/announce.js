// 화면 읽기 프로그램 알림과 포커스 판단. DOM 접근 없음.
// 추천 시각 화면이 이미 보인 뒤 항공편 상태가 바뀌어 추천 카드와 안내 상자(도착, 운항 상태 확인 필요)가 서로 바뀔 때만 알린다.
// 처음 화면을 그릴 때(이전 화면이 없을 때)와 같은 종류의 화면 안에서 바뀌는 것(착륙 말풍선 등)은 알리지 않는다.
// 착륙 말풍선은 카드 안에서 바뀌므로 카드의 기존 aria-live 영역이 이미 알린다.
// 문장은 DesignGuide 의 기존 문장을 그대로 쓴다.

export const ANNOUNCEMENTS = Object.freeze({
  arrived: '이 항공편은 이미 도착했어요.',
  unknown: '이 항공편의 운항 상태를 확인해 주세요.',
});

/** 추천 카드의 핵심 안내 문장을 화면 읽기용으로: "내일 오후 5시 10분 출발을 추천해요" */
export function cardLeadSpoken({ dayText, timeSpoken }) {
  return `${dayText ? `${dayText} ` : ''}${timeSpoken} 출발을 추천해요`;
}

/**
 * 화면이 바뀌었을 때 화면 읽기 프로그램에 알릴 문장. 알릴 것이 없으면 null.
 * @param {{ screen: 'card'|'arrived'|'unknown' } | null} before  바뀌기 전 화면. 처음 그리는 것이면 null
 * @param {{ screen: 'card'|'arrived'|'unknown' }} after          바뀐 뒤 화면 (domain/status.js 의 resolveFlightView 결과)
 * @param {{ cardLead?: string | null }} [options]                카드로 돌아올 때 읽을 핵심 안내 문장 (cardLeadSpoken 결과)
 * @returns {string | null}
 */
export function announcementFor(before, after, { cardLead = null } = {}) {
  if (!before || before.screen === after.screen) return null;
  if (after.screen === 'card') return cardLead;
  return ANNOUNCEMENTS[after.screen] ?? null;
}

/**
 * 화면이 카드 ↔ 안내 상자로 바뀔 때, 포커스를 어디로 돌려줄지. (사라진 요소에 포커스가 있었을 때만 옮긴다)
 *  - 'change-flight': 바뀐 화면의 "항공편 바꾸기" 버튼 (안내 상자 안의 버튼, 카드로 돌아오면 아래쪽 버튼)
 *  - null: 포커스를 옮기지 않는다.
 * @param {{ before: {screen: string} | null, after: {screen: string}, focusInRemoved: boolean }} input
 *   focusInRemoved: 바뀌기 전에 포커스가 사라질 요소(카드·행동 버튼·아래쪽 "항공편 바꾸기"·열려 있던 시트) 안에 있었는가
 * @returns {'change-flight' | null}
 */
export function focusTargetAfterTransition({ before, after, focusInRemoved }) {
  if (!before || before.screen === after.screen) return null;
  return focusInRemoved ? 'change-flight' : null;
}
