// 화면이 쓰는 시계와 모드. 어느 모드에서 어느 시계를 쓰는지가 이 파일 하나에 있다.
//
//   시나리오 모드  주소에 ?scenario=이름(mock/scenarios.js 의 SCENARIOS 중 하나)이 있을 때.
//                  항공편·주소·이동 시간이 모두 목업이고, 시계는 데모 시계(오늘 14:00에서 시작해 흐름)를 쓴다.
//   실제 모드      그 밖의 경우. 항공편은 서버 함수(/api/flights)로 조회한 실제 값이고, 시계는 실제 시각(Date.now)을 쓴다.
//                  주소·이동 시간은 아직 목업이다. (config.js 의 ADDRESS_ROUTE_IS_MOCK)
//
// 알 수 없는 시나리오 이름(오타 등)은 시나리오 모드가 아니라 실제 모드로 본다.
// 날짜(오늘)는 두 모드 모두 실제 날짜다. 데모 시계는 시각(시·분)만 바꾼다.
import { SCENARIOS, mockNow, todayKst } from './mock/scenarios.js';

/** 주소창(search)에 알려진 ?scenario= 가 있으면 true */
export function isScenarioMode(search = globalThis.location?.search ?? '') {
  return SCENARIOS.includes(new URLSearchParams(search).get('scenario'));
}

/** 화면이 "지금"으로 쓰는 시각(epoch ms). 시나리오 모드는 데모 시계, 실제 모드는 실제 시각 */
export function clockNow() {
  return isScenarioMode() ? mockNow() : Date.now();
}

/** 오늘의 한국 날짜 "YYYY-MM-DD" (두 모드 모두 실제 날짜) */
export function clockToday() {
  return todayKst();
}
