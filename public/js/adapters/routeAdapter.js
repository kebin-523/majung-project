// 이동 시간 조회 어댑터 (현재는 목업). 실제로는 카카오모빌리티 자동차 길찾기 API를 서버 경유로 호출한다.
//
// 반환: { ok: true, data: { minutes, distanceKm, fetchedAt, source } } | { ok: false, reason: 'error' | 'timeout' }
// refresh: true 는 "도착 정보가 바뀌어 이동 시간을 다시 조회"하는 경우다.
import { MOCK_DRIVE, MOCK_DRIVE_REFRESH_DELTA_MIN } from '../mock/places.js';
import { getScenario, mockNow, wait } from '../mock/scenarios.js';

export async function getDriveTime(origin, { refresh = false } = {}) {
  const scenario = getScenario();
  await wait();

  if (scenario === 'routefail') return { ok: false, reason: 'error' };
  // recheckfail: 처음 조회는 성공하고, 다시 조회(refresh)만 실패한다.
  if (scenario === 'recheckfail' && refresh) return { ok: false, reason: 'error' };

  const base = MOCK_DRIVE[origin?.id];
  if (!base) return { ok: false, reason: 'error' };

  // changed 시나리오: 다시 조회하면 이동 시간도 달라진다.
  const delta = scenario === 'changed' && refresh ? MOCK_DRIVE_REFRESH_DELTA_MIN : 0;

  return {
    ok: true,
    data: {
      minutes: base.minutes + delta,
      distanceKm: base.distanceKm,
      fetchedAt: mockNow(scenario),
      source: 'mock',
    },
  };
}
