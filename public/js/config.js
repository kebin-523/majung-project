// 설정 상수의 단일 출처. 숫자를 바꾸려면 이 파일만 고친다. (화면·계산·테스트 모두 여기서 import)

export const TIME_ZONE = 'Asia/Seoul';

// 여유 시간 기본값(분). 사용자가 바텀시트에서 직접 바꾸는 "설정값"이다.
export const DEFAULT_AIRPORT_BUFFER_MIN = 20; // 공항 도착 여유
export const DEFAULT_MEETUP_MIN = 40;         // 입국 후 만남까지 예상 시간
export const BUFFER_STEP_MIN = 5;             // 바텀시트 −/+ 단위
export const BUFFER_MIN_MIN = 0;              // 항목별 조절 범위(가정)
export const BUFFER_MAX_MIN = 120;

// 출발지 주소 검색: 입력할 때마다 호출하지 않도록 잠깐 기다렸다가 검색한다. (호출 한도를 아끼기 위한 가정값)
export const ADDRESS_SEARCH_DEBOUNCE_MS = 400;
export const ADDRESS_MIN_QUERY_LENGTH = 2;

// 상태 판단 기준 (가정, 갱신 주기 확정 후 조정)
export const SOON_THRESHOLD_MIN = 60; // 추천 출발 60분 전부터 "곧 출발"
// 마지막 확인 후 10분이 지나면 "오래됨". 화면을 연 채 이 시간이 지나면 자동으로 한 번 다시 확인하는 간격으로도 쓴다.
// 자동 확인은 항공편 조회 API를 호출하므로 호출 한도를 확인한 뒤 조정한다.
export const STALE_AFTER_MIN = 10;

// 추천 시각 화면을 열어 둔 동안, 시간이 흐른 것을 배지(곧 출발·지남·오래됨)에 반영하려고 다시 판단하는 간격.
// 이 판단 자체는 API 호출이 아니다. 다만 "오래됨"이 된 것을 이 간격으로 알아채므로,
// 자동 재확인은 STALE_AFTER_MIN보다 최대 이 간격만큼 늦게 일어난다.
export const STATUS_RECHECK_INTERVAL_MS = 60 * 1000;

// 상태 배지가 겹칠 때 먼저 보여줄 순서 (앞쪽이 우선)
export const BADGE_PRIORITY = ['passed', 'stale', 'changed', 'soon', 'relaxed'];

// 도착 시각 안내 기준 (가정, 제품 판단. 공식 문서에는 기준이 없다)
// scheduleDiffMinutes(변경−예정, 분)가 -EARLY_NOTICE_MIN 이하이면 "일찍", +LATE_NOTICE_MIN 이상이면 "늦게" 안내 대상이다. (경계 포함)
// - 안내를 띄울지에만 쓴다. 추천 출발 시각 계산에는 쓰지 않는다. (항상 최신 변경 시각을 쓴다)
// - 도착까지 남은 시간에 따라 바꾸지 않는다. (시간대별 비율이 일정하게 늘지 않고 표본이 작아 근거가 부족하다)
// - 일찍 오는 편을 놓치면 승객이 기다리게 되므로 일찍 쪽을 더 민감하게 잡았다.
//   늦게 쪽은 공항의 지연 표시가 16분 이상으로 관찰된 것과 비슷하게 맞췄다.
// 근거: 2026-10-30 11:47 스냅샷, 착륙 전 750건 — 변경 시각이 예정과 다른 편 369건(49%)(일찍 221, 늦게 148),
//   10분 이상 일찍 132 · 15분 이상 늦게 49 → 안내 대상 181건(24%).
//   도착까지 2시간 이내 103건 중 41건(약 40%)이 10분 이상 달라져 있었다.
//   (이 103건에는 예정 시각이 이미 지났는데 아직 도착하지 않은 4건이 포함된다. 이를 뺀 정확히 2시간 이내는 99건 중 37건, 37%.)
//   시간대별 비율: 0~1시간 53% · 1~2시간 23% · 2~4시간 29% · 4~8시간 35% · 8시간 이상 10%.
export const EARLY_NOTICE_MIN = 10;
export const LATE_NOTICE_MIN = 15;
