// 항공편 어댑터(public/js/adapters/flightAdapter.js). 실제 모드는 가짜 fetch 로, 시나리오 모드는 목업으로 확인한다.
// 네트워크는 쓰지 않는다.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getFlight, searchFlights, searchFlightsByWindow } from '../public/js/adapters/flightAdapter.js';
import { todayKst } from '../public/js/mock/scenarios.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

let original;
let calls;
beforeEach(() => {
  original = globalThis.fetch;
  calls = [];
});
afterEach(() => {
  globalThis.fetch = original; // blockNetwork 가 시작할 때 막아 둔 fetch 로 되돌린다
  delete globalThis.location;
});

const server = (flight = {}) => ({
  flightId: 'FID1',
  flightNo: 'KE123',
  arrivalDate: '2026-10-30',
  scheduled: Date.UTC(2026, 9, 30, 2, 0),
  estimated: Date.UTC(2026, 9, 30, 2, 20),
  changed: Date.UTC(2026, 9, 30, 2, 20),
  scheduleDiffMinutes: 20,
  status: 'none',
  statusRaw: null,
  estimateBasis: 'forecast',
  terminal: { code: 'P01', name: '제1터미널' },
  origin: '도쿄/나리타',
  originCode: 'NRT',
  airline: '대한항공',
  fetchedAt: 1_000,
  source: 'icn',
  ...flight,
});

/** 다음 fetch 호출에 줄 본문. 던질 오류를 줄 수도 있다. */
function stubFetch(reply) {
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (reply instanceof Error) throw reply;
    return { json: async () => (typeof reply === 'function' ? reply() : reply) };
  };
}

test('검색 성공: 서버 값을 그대로 넘기고 landed·departureCity 를 더한다 (fetchedAt 은 서버가 정한 값)', async () => {
  stubFetch({ ok: true, data: [server()], skippedRows: 0, truncated: false, fetchedAt: 1_000 });
  const result = await searchFlights('ke 123', '2026-10-30');

  assert.equal(result.ok, true);
  const [flight] = result.data;
  assert.equal(flight.fetchedAt, 1_000);
  assert.equal(flight.landed, false);
  assert.equal(flight.departureCity, '도쿄/나리타');
  assert.equal(flight.terminal.code, 'P01'); // 화면에 쓰지는 않지만 값은 잃지 않는다
  assert.equal(flight.source, 'icn');
  assert.deepEqual(result.meta, { truncated: false, skippedRows: 0 });

  const url = new URL(calls[0], 'https://x.example');
  assert.equal(url.pathname, '/api/flights');
  assert.equal(url.searchParams.get('mode'), 'search');
  assert.equal(url.searchParams.get('flightNo'), 'KE123'); // 정규화해서 보낸다
  assert.equal(url.searchParams.get('date'), '2026-10-30');
});

test('landed: arrived 일 때만 true, touchdown·none·unknown 은 false', async () => {
  const statuses = ['arrived', 'touchdown', 'none', 'delayed', 'unknown'];
  stubFetch({ ok: true, data: statuses.map((status, i) => server({ flightId: `F${i}`, status })), fetchedAt: 1 });
  const result = await searchFlights('KE123', '2026-10-30');
  assert.deepEqual(result.data.map((f) => f.landed), [true, false, false, false, false]);
  assert.deepEqual(result.data.map((f) => f.status), statuses);
});

test('요청한 날짜와 다른 행도 거르지 않고 arrivalDate 를 담아 그대로 넘긴다', async () => {
  stubFetch({
    ok: true,
    data: [server({ flightId: 'A', arrivalDate: '2026-10-30' }), server({ flightId: 'B', arrivalDate: '2026-10-31' })],
    fetchedAt: 1,
  });
  const result = await searchFlights('KE123', '2026-10-30');
  assert.deepEqual(result.data.map((f) => f.arrivalDate), ['2026-10-30', '2026-10-31']);
});

test('잘림 표시는 meta 에만 담는다', async () => {
  stubFetch({ ok: true, data: [server()], truncated: true, skippedRows: 2, fetchedAt: 1 });
  const result = await searchFlights('KE123', '2026-10-30');
  assert.deepEqual(result.meta, { truncated: true, skippedRows: 2 });
  assert.equal('truncated' in result.data[0], false);
});

test('reason: quota 는 따로, config 는 error 로, 모르는 값도 error', async () => {
  const cases = [
    ['notfound', 'notfound'],
    ['quota', 'quota'],
    ['config', 'error'],
    ['error', 'error'],
    ['something', 'error'],
  ];
  for (const [serverReason, expected] of cases) {
    stubFetch({ ok: false, reason: serverReason });
    assert.deepEqual(await searchFlights('KE123', '2026-10-30'), { ok: false, reason: expected }, serverReason);
  }
});

test('연결 실패는 error, 시간 초과는 timeout, JSON 이 아닌 응답과 빈 목록은 error', async () => {
  stubFetch(new TypeError('network'));
  assert.deepEqual(await searchFlights('KE123', '2026-10-30'), { ok: false, reason: 'error' });

  const timeout = new Error('timeout');
  timeout.name = 'TimeoutError';
  stubFetch(timeout);
  assert.deepEqual(await searchFlights('KE123', '2026-10-30'), { ok: false, reason: 'timeout' });

  stubFetch(() => {
    throw new SyntaxError('Unexpected token <');
  });
  assert.deepEqual(await searchFlights('KE123', '2026-10-30'), { ok: false, reason: 'error' });

  stubFetch({ ok: true, data: [] });
  assert.deepEqual(await searchFlights('KE123', '2026-10-30'), { ok: false, reason: 'error' });
});

test('재확인: fid 와 날짜를 보내고 한 건을 받는다. missing 은 따로 돌려준다', async () => {
  stubFetch({ ok: true, data: server({ status: 'arrived' }), fetchedAt: 5 });
  const result = await getFlight('FID1', { arrivalDate: '2026-10-30' });
  assert.equal(result.ok, true);
  assert.equal(result.data.landed, true);

  const url = new URL(calls[0], 'https://x.example');
  assert.equal(url.searchParams.get('mode'), 'refresh');
  assert.equal(url.searchParams.get('fid'), 'FID1');
  assert.equal(url.searchParams.get('date'), '2026-10-30');

  stubFetch({ ok: false, reason: 'missing' });
  assert.deepEqual(await getFlight('FID1', { arrivalDate: '2026-10-30' }), { ok: false, reason: 'missing' });
  stubFetch({ ok: false, reason: 'quota' });
  assert.deepEqual(await getFlight('FID1', { arrivalDate: '2026-10-30' }), { ok: false, reason: 'quota' });
});

test('재확인에 날짜가 없으면 서버를 부르지 않고 error', async () => {
  stubFetch({ ok: true, data: server() });
  assert.deepEqual(await getFlight('FID1'), { ok: false, reason: 'error' });
  assert.equal(calls.length, 0);
});

test('시나리오 모드는 서버를 부르지 않고 목업을 쓴다: landed / touchdown / unknown', async () => {
  stubFetch({ ok: true, data: [server()] });
  const date = todayKst();
  const expected = {
    landed: { status: 'arrived', landed: true },
    touchdown: { status: 'touchdown', landed: false },
    unknown: { status: 'unknown', landed: false },
    normal: { status: 'none', landed: false },
  };
  for (const [scenario, want] of Object.entries(expected)) {
    globalThis.location = { search: `?scenario=${scenario}` };
    const result = await searchFlights('KE123', date);
    assert.equal(result.ok, true, scenario);
    assert.equal(result.data[0].status, want.status, scenario);
    assert.equal(result.data[0].landed, want.landed, scenario);
    assert.equal(result.data[0].source, 'mock');
  }
  assert.equal(calls.length, 0);
});

// ── 시간대 조회(window) ─────────────────────────────────────

test('실제 모드: window 는 /api/flights?mode=window&date&from&to 로 한 번 부르고 항공편을 변환한다', async () => {
  stubFetch({ ok: true, data: [server()], truncated: false, skippedRows: 0, fetchedAt: 1_000 });
  const result = await searchFlightsByWindow('2026-10-30', '1700', '1800');

  assert.equal(result.ok, true);
  assert.equal(result.data[0].departureCity, '도쿄/나리타');
  assert.deepEqual(result.meta, { truncated: false, skippedRows: 0 });
  assert.equal(calls.length, 1);
  const url = new URL(calls[0], 'https://x.example');
  assert.equal(url.searchParams.get('mode'), 'window');
  assert.equal(url.searchParams.get('date'), '2026-10-30');
  assert.equal(url.searchParams.get('from'), '1700');
  assert.equal(url.searchParams.get('to'), '1800');
});

test('실제 모드: window 의 notfound 는 notfound 로, 빈 data 는 error 로', async () => {
  stubFetch({ ok: false, reason: 'notfound' });
  assert.deepEqual(await searchFlightsByWindow('2026-10-30', '1700', '1800'), { ok: false, reason: 'notfound' });
  stubFetch({ ok: true, data: [], fetchedAt: 1 });
  assert.deepEqual(await searchFlightsByWindow('2026-10-30', '1700', '1800'), { ok: false, reason: 'error' });
});

test('실제 모드: window 의 quota 는 quota', async () => {
  stubFetch({ ok: false, reason: 'quota' });
  assert.deepEqual(await searchFlightsByWindow('2026-10-30', '1700', '1800'), { ok: false, reason: 'quota' });
});

test('시나리오 모드: window 는 시간대에 드는 목업만 돌려준다', async () => {
  globalThis.location = { search: '?scenario=normal' };
  const result = await searchFlightsByWindow(todayKst(), '1700', '1800');
  assert.equal(result.ok, true);
  assert.ok(result.data.length >= 2);
  assert.ok(result.data.every((f) => new Date(f.scheduled + 9 * 3600_000).getUTCHours() === 17));
  assert.ok(new Set(result.data.map((f) => f.departureCity)).size >= 2);
  assert.equal(calls.length, 0); // 목업은 서버를 부르지 않는다
});

test('시나리오 모드: 시간대에 목업이 없으면 notfound, fail 시나리오는 error', async () => {
  globalThis.location = { search: '?scenario=normal' };
  assert.deepEqual(await searchFlightsByWindow(todayKst(), '0300', '0400'), { ok: false, reason: 'notfound' });
  globalThis.location = { search: '?scenario=fail' };
  assert.deepEqual(await searchFlightsByWindow(todayKst(), '1700', '1800'), { ok: false, reason: 'error' });
});
