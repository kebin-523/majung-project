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
