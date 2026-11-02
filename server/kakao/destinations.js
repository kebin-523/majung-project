// 길찾기 목적지 표. 클라이언트는 터미널 코드(P01 · P03)만 보내고, 좌표는 서버가 이 표에서 고른다.
//
// 출처: 카카오 로컬 키워드 검색(샘플 호출) 결과의 해당 장소 id 항목, 확인일 2026-10-31
//   P01  장소 id 551337979   "인천국제공항 제1여객터미널 도착층"  docs/samples/kakao-dest-t1-20261031.json
//   P03  장소 id 1103761188  "인천국제공항 제2여객터미널 도착층"  docs/samples/kakao-dest-t2-20261031.json
//   lng(경도) = 항목의 x, lat(위도) = 항목의 y 를 그대로 옮겼다. 샘플과 같은지는 tests/routeInput.test.js 가 확인한다.
// P02(탑승동)는 표에 없다. 탑승동 도착편의 마중 장소는 확인 못 함이라 모르는 값(invalid)으로 둔다.
// 이 좌표가 마중객이 실제로 가는 곳(승하차장·주차장 등)과 같은지는 확인 못 함이다. 도착층이라는 장소 이름만 확인했다.

export const DESTINATIONS = Object.freeze({
  P01: Object.freeze({ placeId: '551337979', name: '인천국제공항 제1여객터미널 도착층', lng: 126.451634393912, lat: 37.4484224405727 }),
  P03: Object.freeze({ placeId: '1103761188', name: '인천국제공항 제2여객터미널 도착층', lng: 126.433691535291, lat: 37.4686797233549 }),
});

/** 터미널 코드로 목적지를 찾는다. 표에 없는 값(P02 · 대소문자가 다른 값 · 문자열이 아닌 값 포함)은 null. */
export function getDestination(code) {
  if (typeof code !== 'string' || !Object.hasOwn(DESTINATIONS, code)) return null;
  return DESTINATIONS[code];
}
