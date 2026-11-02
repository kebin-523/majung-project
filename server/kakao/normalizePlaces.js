// 카카오 로컬 "키워드로 장소 검색" 응답을 앱의 Place 로 바꾸는 순수 함수. (네트워크·환경변수·로그 없음)
// 응답 모양은 2026-10-30 샘플 호출과 문서(https://developers.kakao.com/docs/ko/local/dev-guide)로 확인했다.
//
// Place: { id, name, address, lng, lat }   (public/js/adapters/placeAdapter.js 와 같은 모양)
//   id       ← documents[].id
//   name     ← documents[].place_name
//   address  ← documents[].road_address_name, 비어 있으면 address_name
//   lng, lat ← documents[].x, y (문자열이라 숫자로 바꾼다)
//
// 반환: { ok: true, data: Place[], dropped: number } | { ok: false, reason: 'error' }
//   - documents 가 빈 배열이면 오류가 아니라 { ok: true, data: [], dropped: 0 } 이다.
//   - 건수는 받은 항목(data.length)으로 센다. meta.total_count 는 쓰지 않는다. (화면 "검색 결과 N건"은 받은 개수)
//   - meta.same_name 은 호출마다 모양이 달라서 읽지 않는다.
//   - 쓸 수 없는 항목(id·이름이 없거나 x·y 가 숫자가 아님)은 버리고 dropped 에 센다. 화면에는 쓰지 않는 내부 기록이다.

export const KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
export const PAGE_SIZE = 15; // 문서: size 1~15, 기본 15. 다음 페이지는 자동으로 부르지 않는다.

/**
 * 검색어를 UTF-8 퍼센트 인코딩해 호출 주소를 만든다. 항상 page=1, size=PAGE_SIZE.
 * (Windows 의 curl 이 한글을 CP949 로 바꿔 보낸 적이 있어, 인코딩은 이 함수에서 encodeURIComponent 로 한다.)
 */
export function buildKeywordUrl(query) {
  return `${KEYWORD_URL}?query=${encodeURIComponent(String(query ?? ''))}&page=1&size=${PAGE_SIZE}`;
}

const isFilledString = (value) => typeof value === 'string' && value.trim() !== '';

/** "126.97" 같은 문자열을 숫자로. 비어 있거나 숫자가 아니면 null. (Number('') 는 0 이라 따로 거른다) */
function toCoordinate(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toPlace(document) {
  if (document === null || typeof document !== 'object') return null;
  if (!isFilledString(document.id) || !isFilledString(document.place_name)) return null;

  const lng = toCoordinate(document.x);
  const lat = toCoordinate(document.y);
  if (lng === null || lat === null) return null;

  const road = isFilledString(document.road_address_name) ? document.road_address_name : null;
  const lot = isFilledString(document.address_name) ? document.address_name : '';

  return {
    id: document.id.trim(),
    name: document.place_name.trim(),
    address: (road ?? lot).trim(),
    lng,
    lat,
  };
}

export function normalizePlaces(body) {
  if (body === null || typeof body !== 'object' || !Array.isArray(body.documents)) {
    return { ok: false, reason: 'error' };
  }

  const data = [];
  let dropped = 0;
  for (const document of body.documents) {
    const place = toPlace(document);
    if (place) data.push(place);
    else dropped += 1;
  }
  return { ok: true, data, dropped };
}
