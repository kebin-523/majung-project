// 주소 검색 어댑터 (현재는 목업). 실제로는 카카오 로컬 API를 서버 경유로 호출한다.
//
// 반환: { ok: true, data: Place[] } | { ok: false, reason: 'error' | 'timeout' }
//   결과가 없으면 ok: true 와 빈 배열이다. (화면에서 "이 주소를 찾지 못했어요" 안내)
// Place: { id, name, address, lng, lat }
import { MOCK_PLACES } from '../mock/places.js';
import { wait } from '../mock/scenarios.js';

export async function searchAddress(query) {
  await wait();

  const q = String(query ?? '').trim().toLowerCase();
  if (q === '') return { ok: true, data: [] };

  const data = MOCK_PLACES.filter(
    (p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q),
  );
  return { ok: true, data };
}
