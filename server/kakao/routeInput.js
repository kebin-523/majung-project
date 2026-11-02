// 길찾기 호출 입력: 출발지 검사와 호출 주소 만들기. (순수 함수, 네트워크·환경변수 없음)
// 호출 주소는 https://apis-navi.kakaomobility.com/v1/directions 에 origin · destination · priority=RECOMMEND 만 쓴다.
// 키는 주소에 넣지 않는다. 인증은 호출하는 쪽이 Authorization 헤더(KakaoAK {키})로 한다.
// origin · destination 은 "경도,위도"(X,Y) 순서다. (문서: https://developers.kakaomobility.com/guide/navi-api/directions.html, 2026-10-31 확인)

export const DIRECTIONS_URL = 'https://apis-navi.kakaomobility.com/v1/directions';

// 출발지 허용 범위: 한국을 넉넉히 덮는 사각형 (가정, 공식 값이 아니라 제품 판단이다).
//   경도 124~132, 위도 33~39. 서해 최서단 섬들·독도·마라도를 포함하고도 남도록 잡았다. 북쪽에 북한 일부가 들어오는 것은 허용한다.
//   목적은 정확한 국경선이 아니라 지구 반대편·적도 원점(0,0)·좌표 순서를 바꿔 보낸 값(위도 126 등)처럼 명백히 잘못된 값을
//   카카오를 부르기 전에 거르는 것이다. 사각형 안인데 길이 없는 곳은 카카오가 noroute 로 알려 준다.
//   (이 숫자의 지리적 근거는 일반 상식에 의존하며 공식 자료로 확인하지 못했다.)
export const ORIGIN_BOUNDS = Object.freeze({ minLng: 124, maxLng: 132, minLat: 33, maxLat: 39 });

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * 요청 본문의 출발지를 검사한다. 통과하면 { lng, lat } (다른 필드는 버린다), 아니면 null (invalid).
 * 숫자(문자열 아님)이고 유한해야 하며, 경도 -180~180 · 위도 -90~90 안에서 ORIGIN_BOUNDS 안이어야 한다.
 */
export function readOrigin(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { lng, lat } = value;
  if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  const { minLng, maxLng, minLat, maxLat } = ORIGIN_BOUNDS;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return null;
  return { lng, lat };
}

/** { lng, lat } 을 "경도,위도" 문자열로. 숫자가 아니거나 유한하지 않으면 던진다. (검사를 거치지 않은 값이 주소에 들어가지 않게) */
export function formatLngLat(point) {
  if (point === null || typeof point !== 'object' || !isFiniteNumber(point.lng) || !isFiniteNumber(point.lat)) {
    throw new TypeError('lng, lat 은 유한한 숫자여야 해요.');
  }
  return `${point.lng},${point.lat}`;
}

/**
 * 호출 주소를 만든다. origin 은 readOrigin 을 통과한 값, destination 은 getDestination 이 돌려준 값이다.
 * 좌표 문자열은 숫자와 마침표·쉼표·빼기 기호뿐이라 따로 인코딩하지 않는다. (문서의 예시도 쉼표를 그대로 쓴다)
 */
export function buildDirectionsUrl(origin, destination) {
  return `${DIRECTIONS_URL}?origin=${formatLngLat(origin)}&destination=${formatLngLat(destination)}&priority=RECOMMEND`;
}
