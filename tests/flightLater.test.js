// 화면을 열어 둔 사이 상태가 바뀌는 시나리오(later-*)와 receivedAt. 목업과 가짜 fetch 만 쓰고 네트워크는 쓰지 않는다.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getFlight, searchFlights } from '../public/js/adapters/flightAdapter.js';
import { SCENARIO_SPEED, SCENARIOS, mockNow, todayKst } from '../public/js/mock/scenarios.js';
import { minutes } from '../public/js/domain/time.js';
import { STALE_AFTER_MIN } from '../public/js/config.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

afterEach(() => {
  delete globalThis.location;
});

test('later-* 시나리오: 검색과 첫 재확인은 상태 없음, 두 번째 재확인부터 바뀐다', async () => {
  const date = todayKst();
  const targets = { 'later-touchdown': 'touchdown', 'later-arrived': 'arrived', 'later-unknown': 'unknown' };

  for (const [scenario, target] of Object.entries(targets)) {
    assert.ok(SCENARIOS.includes(scenario));
    globalThis.location = { search: `?scenario=${scenario}` };

    const found = await searchFlights('KE123', date);
    assert.equal(found.data[0].status, 'none', `${scenario} 검색`);
    const { flightId, arrivalDate } = found.data[0];

    const first = await getFlight(flightId, { arrivalDate });
    assert.equal(first.data.status, 'none', `${scenario} 첫 재확인`);

    const second = await getFlight(flightId, { arrivalDate });
    assert.equal(second.data.status, target, `${scenario} 두 번째 재확인`);
    assert.equal(second.data.landed, target === 'arrived');

    const third = await getFlight(flightId, { arrivalDate });
    assert.equal(third.data.status, target, `${scenario} 이후에도 그대로`);
  }
});

test('later-* 시나리오의 데모 시계는 11배 빨리 흘러, 실제 1분이 오래됨 기준(10분)을 넘긴다', () => {
  for (const scenario of Object.keys(SCENARIO_SPEED)) {
    assert.ok(SCENARIO_SPEED[scenario] * 1 > STALE_AFTER_MIN, scenario); // 1분 틱 × 속도 > 10분
  }
  assert.equal(SCENARIO_SPEED.normal, undefined); // 다른 시나리오는 실제 속도
  const before = mockNow('later-arrived');
  assert.ok(before >= mockNow('normal')); // 같은 14:00 에서 시작해 같거나 더 빨리 간다
});

test('목업 항공편에는 응답을 받은 시각(receivedAt)이 있고, stale 시나리오는 이미 오래된 값이다', async () => {
  const date = todayKst();
  globalThis.location = { search: '?scenario=normal' };
  const fresh = (await searchFlights('KE123', date)).data[0];
  assert.equal(fresh.receivedAt, fresh.fetchedAt);

  globalThis.location = { search: '?scenario=stale' };
  const stale = (await searchFlights('KE123', date)).data[0];
  assert.ok(stale.receivedAt <= fresh.receivedAt - minutes(STALE_AFTER_MIN) + 5000);
});

test('실제 모드: receivedAt 은 기기 시계의 받은 시각이고 서버가 적은 fetchedAt 과 별개다', async () => {
  const original = globalThis.fetch;
  const row = {
    flightId: 'F1', flightNo: 'KE123', arrivalDate: '2026-10-30', scheduled: 1, changed: null, status: 'none',
    origin: '도쿄', airline: '대한항공', fetchedAt: 1_000, source: 'icn',
  };
  globalThis.fetch = async (url) => ({
    json: async () => ({ ok: true, data: String(url).includes('mode=refresh') ? row : [row], fetchedAt: 1_000 }),
  });
  try {
    const before = Date.now();
    const result = await searchFlights('KE123', '2026-10-30');
    const after = Date.now();
    const [flight] = result.data;
    assert.equal(flight.fetchedAt, 1_000); // 서버 시각은 표시용으로 그대로
    assert.ok(flight.receivedAt >= before && flight.receivedAt <= after);

    const refreshed = await getFlight('F1', { arrivalDate: '2026-10-30' });
    assert.ok(refreshed.data.receivedAt >= before);
    assert.equal(refreshed.data.fetchedAt, 1_000);
  } finally {
    globalThis.fetch = original;
  }
});
