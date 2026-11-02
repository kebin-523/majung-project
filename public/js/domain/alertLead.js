// "알림 받기": 출발 몇 분 전부터 화면 안에서 "곧 나갈 시간이에요"로 알릴지. (DOM 접근 없음)
// 이번 범위의 알림은 화면 안 상태 안내뿐이다. (푸시 알림은 아직 없다. CLAUDE.md "알림은 이번 범위에서 화면 안 상태 안내만")
// 그래서 이 값은 알림을 보내는 시점이 아니라, 이 화면을 열어 둔 동안 "곧 출발" 상태 줄이 나타나는 시점(domain/status.js 의 soonMin)이다.
import { SOON_THRESHOLD_MIN } from '../config.js';

export const ALERT_LEAD_OPTIONS_MIN = [10, 20, 30, 60, 90]; // 선택지(분). 가정: 필요하면 바꾼다
export const DEFAULT_ALERT_LEAD_MIN = SOON_THRESHOLD_MIN; // 설정하지 않았을 때는 지금까지의 "곧 출발" 기준(60분)이다

/** 저장된 값이 선택지 중 하나면 그대로, 아니면(없음·깨짐·선택지 밖) 기본값 */
export function readAlertLead(value) {
  return ALERT_LEAD_OPTIONS_MIN.includes(value) ? value : DEFAULT_ALERT_LEAD_MIN;
}

/** 선택지 문구 "30분 전" */
export function alertLeadLabel(min) {
  return `${min}분 전`;
}

/** 저장했을 때 토스트 문구. 알림이 발송되는 것처럼 말하지 않는다. (화면 안 안내) */
export function alertSavedMessage(min) {
  return `출발 ${min}분 전부터 화면에서 알려드려요`;
}
