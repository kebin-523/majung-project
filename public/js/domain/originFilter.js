// 시간대 검색 결과를 출발 도시로 거르는 순수 함수. 도시 목록은 받은 결과에서 만든다. (API가 주지 않는 값을 만들지 않는다)

const hasOrigin = (flight) => typeof flight.departureCity === 'string' && flight.departureCity !== '';

/** 결과에 나온 출발 도시(값이 없는 편은 제외), 중복 없이 가나다순 */
export function listOrigins(flights) {
  return [...new Set(flights.filter(hasOrigin).map((flight) => flight.departureCity))].sort((a, b) => a.localeCompare(b, 'ko'));
}

/** origin 이 null 이면 전체, 아니면 그 도시의 편만 */
export function filterByOrigin(flights, origin) {
  return origin === null ? flights : flights.filter((flight) => flight.departureCity === origin);
}

/** 예정 도착 시각 오름차순. 같은 시각은 입력 순서를 지키고 원본은 바꾸지 않는다. */
export function sortByScheduled(flights) {
  return flights
    .map((flight, index) => ({ flight, index }))
    .sort((a, b) => a.flight.scheduled - b.flight.scheduled || a.index - b.index)
    .map(({ flight }) => flight);
}

/** 보이는 목록에 없는 선택은 null (보이지 않는 항공편으로 진행하지 않게 한다) */
export function visibleSelection(visibleFlights, selectedId) {
  return visibleFlights.some((flight) => flight.flightId === selectedId) ? selectedId : null;
}
