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

// ---------- 출발 도시 검색 ----------

/** 검색에서 무시하는 글자: 공백, "/", 괄호, 가운뎃점, 마침표, 하이픈. ("오사카/ 간사이"를 "오사카간사이"로 이어 써도 찾는다) */
const IGNORED_IN_SEARCH = /[\s/()·.\-]/g;
const normalizeForSearch = (text) => String(text ?? '').toLowerCase().replace(IGNORED_IN_SEARCH, '');

/**
 * 출발 도시 이름이 검색어에 맞는가. 부분 일치이고 순서가 같아야 한다.
 * 검색어가 비어 있으면(공백만 있어도) 모두 맞는다. 출발 도시 값이 없는 편은 검색어가 있을 때만 맞지 않는다.
 */
export function matchesOrigin(city, query) {
  const needle = normalizeForSearch(query);
  if (needle === '') return true;
  return normalizeForSearch(city).includes(needle);
}

/** 검색어에 맞는 출발 도시의 편만 (입력 순서 유지). 빈 검색어는 전체. */
export function filterByQuery(flights, query) {
  return flights.filter((flight) => matchesOrigin(flight.departureCity, query));
}

/** 검색어에 맞는 출발 도시 목록 (값 없는 편 제외, 중복 없이 가나다순) */
export function listOriginsMatching(flights, query) {
  return listOrigins(flights).filter((city) => matchesOrigin(city, query));
}

/**
 * 칩 순서. 접었을 때는 선택한 도시를 맨 앞으로 옮겨 가려진 줄에 선택이 숨지 않게 하고, 펼쳤을 때는 그대로 둔다.
 * 항상 새 배열을 돌려준다. (원본을 바꾸지 않는다)
 */
export function orderOrigins(origins, selected, expanded) {
  if (expanded || selected === null || !origins.includes(selected)) return [...origins];
  return [selected, ...origins.filter((city) => city !== selected)];
}
