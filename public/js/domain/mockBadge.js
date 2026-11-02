// 상단 표시 문구 결정. (DOM 접근 없음, DesignGuide §7 "구현 중 추가한 문구"의 "상단 표시")
//   시나리오 모드(전부 목업): "목업 데이터" (시나리오 이름이 normal 이 아니면 "목업 · 이름")
//   실제 모드에서 주소·이동 시간이 아직 목업이면(addressRouteIsMock): "주소·이동 시간은 예시"
//   실제 모드에서 항공편·장소·이동 시간이 모두 실제면: 표시 없음(null)
// addressRouteIsMock 는 config.js 의 ADDRESS_ROUTE_IS_MOCK 이고, 이 값은 상단 표시에만 쓰인다.

/**
 * @param {{ scenarioMode: boolean, scenario: string, addressRouteIsMock: boolean }} input
 * @returns {string | null}  보여 줄 문구. 표시가 없으면 null
 */
export function mockBadgeText({ scenarioMode, scenario, addressRouteIsMock }) {
  if (scenarioMode) return scenario === 'normal' ? '목업 데이터' : `목업 · ${scenario}`;
  if (addressRouteIsMock) return '주소·이동 시간은 예시';
  return null;
}
