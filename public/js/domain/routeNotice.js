// 이동 시간 관련 안내 문구와 실패 종류 판단. (DOM 접근 없음)
// 문구는 DesignGuide §7 "구현 중 추가한 문구"의 초안(가정)과 같다.

/** 터미널을 몰라서 이동 시간을 계산하지 않을 때 추천 카드 대신 보이는 안내 상자 문장 (추천 시각 화면) */
export const TERMINAL_HOLD_MESSAGE = '이 항공편의 도착 터미널을 확인하지 못해서 이동 시간을 계산하지 못했어요.';

/** 출발지에서 공항까지 길을 찾지 못했을 때의 안내 (출발지 화면) */
export const NO_ROUTE_MESSAGE = '이 출발지에서는 공항까지 가는 길을 찾지 못했어요. 다른 출발지를 골라 주실래요?';

/**
 * 어댑터의 실패 reason 을 화면 안내 종류로 정한다.
 *   'noRoute' 경로 없음. 다시 시도해도 같으므로 "다시 시도" 없이 다른 출발지를 고르게 한다.
 *   'error'   그 밖의 모든 실패(한도 초과 · 시간 초과 · 서버 오류 · 터미널 없음 포함). "이동 시간을 불러오지 못해서…" 안내와 "다시 시도".
 * @param {string | null | undefined} reason
 * @returns {'noRoute' | 'error'}
 */
export function routeNoticeKind(reason) {
  return reason === 'noroute' ? 'noRoute' : 'error';
}
