// 목업 주소 검색 결과와 이동 시간. 좌표·이동 시간은 모두 가짜 값이다. (실제 API 연결 시 카카오 응답으로 대체)
export const MOCK_PLACES = [
  { id: 'p-hapjeong', name: '합정역', address: '서울 마포구 양화로 지하 55', lng: 126.9147, lat: 37.5496 },
  { id: 'p-gangnam', name: '강남역', address: '서울 강남구 강남대로 지하 396', lng: 127.0276, lat: 37.4979 },
  { id: 'p-seoul-station', name: '서울역', address: '서울 용산구 한강대로 405', lng: 126.9707, lat: 37.5547 },
  { id: 'p-pangyo', name: '판교역', address: '경기 성남시 분당구 판교역로 160', lng: 127.1112, lat: 37.3948 },
  { id: 'p-songdo', name: '송도 센트럴파크', address: '인천 연수구 컨벤시아대로 160', lng: 126.6396, lat: 37.3924 },
];

// 출발지별 목업 이동 시간(분)·거리(km). 자동차 기준.
export const MOCK_DRIVE = {
  'p-hapjeong': { minutes: 55, distanceKm: 53 },
  'p-gangnam': { minutes: 70, distanceKm: 63 },
  'p-seoul-station': { minutes: 60, distanceKm: 55 },
  'p-pangyo': { minutes: 80, distanceKm: 78 },
  'p-songdo': { minutes: 35, distanceKm: 30 },
};

// 'changed' 시나리오에서 이동 시간을 다시 조회했을 때 달라지는 값(분)
export const MOCK_DRIVE_REFRESH_DELTA_MIN = 5;
