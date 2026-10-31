// 길찾기에 쓸 수 있는 도착 터미널 판단. (DOM 접근 없음)
// 항공편의 terminal 은 { code, name } | null 이다. (server/icn/normalizeArrivals.js: P01 제1터미널, P02 탑승동, P03 제2터미널)
// 길찾기 서버 함수(server/kakao/destinations.js)의 목적지 표에는 P01 과 P03 만 있다. P02(탑승동)는 마중 장소를 확인 못 해 표에 없다.
// 이 목록은 서버를 불러 봐야 invalid 가 될 요청을 미리 거르려는 것이다. 판단의 기준은 서버의 표이고, 표가 바뀌면 이 목록도 같이 고친다.
export const ROUTE_TERMINALS = Object.freeze(['P01', 'P03']);

/** 항공편의 도착 터미널 코드(P01 · P03). 없거나 P02 이거나 모르는 값이면 null. */
export function terminalCodeOf(flight) {
  const code = flight?.terminal?.code;
  return typeof code === 'string' && ROUTE_TERMINALS.includes(code) ? code : null;
}
