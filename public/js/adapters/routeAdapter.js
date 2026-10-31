// 이동 시간 조회 어댑터 (현재는 목업). 실제로는 카카오모빌리티 자동차 길찾기 API를 서버 경유로 호출한다.
//
// 반환: { ok: true, data: { minutes, distanceKm, fetchedAt, source } } | { ok: false, reason: 'error' | 'timeout' }
// 주소 검색은 실제(카카오 로컬)가 되었지만 길찾기는 아직 연결하지 않았다. 새 장소의 이동 시간은 고정 예시 값이고 source 는 항상 'mock' 이다.
//   (그래서 domain/change.js 의 isRealTravelRecheck 가 실제 모드에서 "이동 시간도 다시 확인했어요"를 막는다. 이 값은 실제 이동 시간이 아니다.)
// refresh: true 는 "도착 정보가 바뀌어 이동 시간을 다시 조회"하는 경우다.
import { EXAMPLE_DRIVE, MOCK_DRIVE, MOCK_DRIVE_REFRESH_DELTA_MIN } from '../mock/places.js';
import { clockNow } from '../clock.js';
import { getScenario, wait } from '../mock/scenarios.js';

export async function getDriveTime(origin, { refresh = false } = {}) {
  const scenario = getScenario();
  await wait();

  if (scenario === 'routefail') return { ok: false, reason: 'error' };
  // recheckfail: 처음 조회는 성공하고, 다시 조회(refresh)만 실패한다.
  if (scenario === 'recheckfail' && refresh) return { ok: false, reason: 'error' };

  // 목업 id 가 아닌 새 장소(카카오 id)는 길찾기를 아직 연결하지 않아 고정 예시 값을 쓴다. 실제 값이 아니므로 source 는 'mock' 이다.
  const base = MOCK_DRIVE[origin?.id] ?? EXAMPLE_DRIVE;

  // changed 시나리오: 다시 조회하면 이동 시간도 달라진다.
  const delta = scenario === 'changed' && refresh ? MOCK_DRIVE_REFRESH_DELTA_MIN : 0;

  return {
    ok: true,
    data: {
      minutes: base.minutes + delta,
      distanceKm: base.distanceKm,
      fetchedAt: clockNow(), // 시나리오 모드는 데모 시계, 실제 모드는 실제 시각 (이동 시간 값 자체는 두 모드 모두 목업)
      source: 'mock',
    },
  };
}
