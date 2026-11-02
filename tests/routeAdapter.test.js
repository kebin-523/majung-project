// 이동 시간 어댑터(public/js/adapters/routeAdapter.js). 실제 모드는 가짜 fetch 로, 시나리오 모드는 목업으로 확인한다.
// 카카오 응답이 아니라 서버 함수(/api/route)의 응답 모양을 이 파일 안에서 합성했다. 네트워크는 쓰지 않는다.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDriveTime, CLIENT_TIMEOUT_MS } from '../public/js/adapters/routeAdapter.js';
import { EXAMPLE_DRIVE, MOCK_DRIVE } from '../public/js/mock/places.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

let original;
let calls;
let logged;
let originals;
beforeEach(() => {
  original = globalThis.fetch;
  calls = [];
  logged = [];
  originals = { error: console.error, log: console.log, info: console.info, warn: console.warn };
  for (const name of Object.keys(originals)) console[name] = (...args) => logged.push(args.join(' '));
});
afterEach(() => {
  globalThis.fetch = original; // blockNetwork 가 시작할 때 막아 둔 fetch 로 되돌린다
  delete globalThis.location;
  Object.assign(console, originals);
});

const ORIGIN = { id: '2001', name: '가상역 4호선', address: '서울 가상구 가상로 1', lng: 126.987654, lat: 37.123456 };
const okReply = (minutes = 40, distanceKm = 38.4) => ({ ok: true, data: { minutes, distanceKm } });

/** 다음 fetch 호출에 줄 응답. reply 는 본문, { status, body } 로 HTTP 상태를 줄 수도 있고, Error 면 던진다. */
function stubFetch(reply) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (reply instanceof Error) throw reply;
    const { status = 200, body } = reply && 'body' in reply ? reply : { body: reply };
    return { status, ok: status >= 200 && status < 300, json: async () => (typeof body === 'function' ? body() : body) };
  };
}

// ---------- 실제 모드 ----------

test('실제 모드: POST /api/route 에 { origin: { lng, lat }, terminal } 만 보내고, 목적지 좌표·이름·주소는 보내지 않는다', async () => {
  stubFetch(okReply());
  const result = await getDriveTime(ORIGIN, { terminal: 'P01' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/route');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, JSON.stringify({ origin: { lng: 126.987654, lat: 37.123456 }, terminal: 'P01' }));
  for (const leaked of ['가상역', '서울', 'destination', '2001', 'name', 'address']) assert.ok(!calls[0].init.body.includes(leaked), leaked);
  assert.ok(!calls[0].url.includes('126.9') && !calls[0].url.includes('P01')); // 좌표·터미널은 주소(URL)가 아니라 본문
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(result.ok, true);
});

test('성공 반환 형태: { minutes, distanceKm, fetchedAt, source: kakao }', async () => {
  stubFetch(okReply(40, 38.4));
  const before = Date.now();
  const result = await getDriveTime(ORIGIN, { terminal: 'P03' });
  const after = Date.now();

  assert.equal(JSON.parse(calls[0].init.body).terminal, 'P03');
  assert.deepEqual(Object.keys(result.data), ['minutes', 'distanceKm', 'fetchedAt', 'source']);
  assert.equal(result.data.minutes, 40);
  assert.equal(result.data.distanceKm, 38.4);
  assert.equal(result.data.source, 'kakao');
  assert.ok(result.data.fetchedAt >= before && result.data.fetchedAt <= after); // 실제 모드는 실제 시각
});

test('다시 조회(refresh)도 같은 요청이고, 실제 모드에서는 목업 값이 섞이지 않는다', async () => {
  stubFetch(okReply(52, 50));
  const result = await getDriveTime({ ...ORIGIN, id: 'p-gangnam' }, { refresh: true, terminal: 'P01' }); // 목업 id 여도 서버 값만 쓴다
  assert.equal(calls.length, 1);
  assert.equal(result.data.minutes, 52);
  assert.notEqual(result.data.minutes, MOCK_DRIVE['p-gangnam'].minutes);
});

test('터미널 코드가 없거나 P01·P03 이 아니면 서버를 부르지 않고 noterminal', async () => {
  stubFetch(okReply());
  for (const terminal of [undefined, null, '', 'P02', 'p01', 'P04', '제1터미널', 1, { code: 'P01' }, ['P01']]) {
    assert.deepEqual(await getDriveTime(ORIGIN, { terminal }), { ok: false, reason: 'noterminal' }, JSON.stringify(terminal) ?? 'undefined');
  }
  assert.deepEqual(await getDriveTime(ORIGIN), { ok: false, reason: 'noterminal' });
  assert.equal(calls.length, 0);
});

test('출발지 좌표가 숫자가 아니면 서버를 부르지 않고 error', async () => {
  stubFetch(okReply());
  for (const origin of [null, undefined, {}, { lng: '126.9', lat: '37.1' }, { lng: NaN, lat: 37.1 }, { lng: 126.9 }]) {
    assert.deepEqual(await getDriveTime(origin, { terminal: 'P01' }), { ok: false, reason: 'error' }, JSON.stringify(origin) ?? 'undefined');
  }
  assert.equal(calls.length, 0);
});

test('경로 없음(HTTP 200 + ok: false)은 성공이 아니라 noroute', async () => {
  stubFetch({ status: 200, body: { ok: false, reason: 'noroute' } });
  const result = await getDriveTime(ORIGIN, { terminal: 'P01' });
  assert.deepEqual(result, { ok: false, reason: 'noroute' });
  assert.equal('data' in result, false);
});

test('HTTP 상태가 아니라 본문의 ok 로 판단한다', async () => {
  stubFetch({ status: 429, body: { ok: false, reason: 'quota' } });
  assert.deepEqual(await getDriveTime(ORIGIN, { terminal: 'P01' }), { ok: false, reason: 'quota' });
  stubFetch({ status: 200, body: { ok: false, reason: 'error' } });
  assert.deepEqual(await getDriveTime(ORIGIN, { terminal: 'P01' }), { ok: false, reason: 'error' });
});

test('서버 reason: quota · noroute 는 따로, invalid · config · error · 모르는 값은 error', async () => {
  const cases = [
    ['quota', 'quota'],
    ['noroute', 'noroute'],
    ['invalid', 'error'],
    ['config', 'error'],
    ['error', 'error'],
    ['something', 'error'],
  ];
  for (const [serverReason, expected] of cases) {
    stubFetch({ ok: false, reason: serverReason });
    assert.deepEqual(await getDriveTime(ORIGIN, { terminal: 'P01' }), { ok: false, reason: expected }, serverReason);
  }
});

test('연결 실패는 error, 시간 초과는 timeout, JSON 이 아닌 응답은 error', async () => {
  stubFetch(new TypeError('network'));
  assert.deepEqual(await getDriveTime(ORIGIN, { terminal: 'P01' }), { ok: false, reason: 'error' });

  const timeout = new Error('timeout');
  timeout.name = 'TimeoutError';
  stubFetch(timeout);
  assert.deepEqual(await getDriveTime(ORIGIN, { terminal: 'P01' }), { ok: false, reason: 'timeout' });

  stubFetch({
    body: () => {
      throw new SyntaxError('Unexpected token <');
    },
  });
  assert.deepEqual(await getDriveTime(ORIGIN, { terminal: 'P01' }), { ok: false, reason: 'error' });
});

test('성공 본문이 이상하면(분이 숫자가 아니거나 0 이하, 거리 없음, data 없음) error 이고 가짜 값을 만들지 않는다', async () => {
  const bad = [
    { ok: true },
    { ok: true, data: null },
    { ok: true, data: {} },
    { ok: true, data: { minutes: '40', distanceKm: 38.4 } },
    { ok: true, data: { minutes: 0, distanceKm: 38.4 } },
    { ok: true, data: { minutes: -5, distanceKm: 38.4 } },
    { ok: true, data: { minutes: NaN, distanceKm: 38.4 } },
    { ok: true, data: { minutes: 40 } },
    { ok: true, data: { minutes: 40, distanceKm: 'x' } },
    null,
    'text',
  ];
  for (const body of bad) {
    stubFetch(body);
    const result = await getDriveTime(ORIGIN, { terminal: 'P01' });
    assert.deepEqual(result, { ok: false, reason: 'error' }, JSON.stringify(body));
  }
});

test('실제 모드에서는 어떤 실패에서도 고정 예시 값(EXAMPLE_DRIVE)이 쓰이지 않는다', async () => {
  const replies = [
    new TypeError('network'),
    { ok: false, reason: 'noroute' },
    { ok: false, reason: 'quota' },
    { ok: false, reason: 'error' },
    { ok: true },
    { status: 502, body: { ok: false, reason: 'error' } },
  ];
  for (const reply of replies) {
    stubFetch(reply);
    const result = await getDriveTime(ORIGIN, { terminal: 'P01' });
    assert.equal(result.ok, false);
    assert.equal('data' in result, false);
  }
  stubFetch(okReply(40, 38.4));
  const ok = await getDriveTime(ORIGIN, { terminal: 'P01' });
  assert.notEqual(ok.data.minutes, EXAMPLE_DRIVE.minutes);
  assert.notEqual(ok.data.distanceKm, EXAMPLE_DRIVE.distanceKm);
});

test('시간 제한은 서버(8초)보다 길다', () => {
  assert.ok(CLIENT_TIMEOUT_MS > 8000);
});

test('클라이언트 콘솔에 좌표·장소 이름을 남기지 않는다 (성공·실패 모두)', async () => {
  stubFetch(okReply());
  await getDriveTime(ORIGIN, { terminal: 'P01' });
  stubFetch({ ok: false, reason: 'noroute' });
  await getDriveTime(ORIGIN, { terminal: 'P01' });
  stubFetch(new Error(`failed ${ORIGIN.lng},${ORIGIN.lat} ${ORIGIN.name}`));
  await getDriveTime(ORIGIN, { terminal: 'P01' });
  stubFetch({
    body: () => {
      throw new SyntaxError(`${ORIGIN.lng}`);
    },
  });
  await getDriveTime(ORIGIN, { terminal: 'P01' });
  await getDriveTime(ORIGIN, { terminal: 'P02' });
  const everything = logged.join('\n');
  for (const word of ['126.987654', '37.123456', '가상역', 'P01', '서울']) assert.ok(!everything.includes(word), word);
});

// ---------- 시나리오 모드 ----------

test('시나리오 모드는 서버를 부르지 않고 목업을 쓴다 (터미널이 없어도 계산한다)', async () => {
  stubFetch(okReply(99, 99));
  for (const scenario of ['normal', 'changed', 'passed']) {
    globalThis.location = { search: `?scenario=${scenario}` };
    const withTerminal = await getDriveTime({ id: 'p-gangnam' }, { terminal: 'P01' });
    const withoutTerminal = await getDriveTime({ id: 'p-gangnam' });
    for (const result of [withTerminal, withoutTerminal]) {
      assert.equal(result.ok, true, scenario);
      assert.equal(result.data.source, 'mock', scenario);
    }
    assert.equal(withoutTerminal.data.minutes, MOCK_DRIVE['p-gangnam'].minutes);
  }
  assert.equal(calls.length, 0);
});

test('시나리오 모드: routefail 은 실패, 목업에 없는 id 는 고정 예시 값 (실제 모드에서는 쓰지 않는다)', async () => {
  globalThis.location = { search: '?scenario=normal' };
  const fresh = await getDriveTime({ id: '2001' });
  assert.equal(fresh.data.minutes, EXAMPLE_DRIVE.minutes);
  assert.equal(fresh.data.source, 'mock');

  globalThis.location = { search: '?scenario=routefail' };
  assert.deepEqual(await getDriveTime({ id: 'p-gangnam' }, { terminal: 'P01' }), { ok: false, reason: 'error' });
});

test('알 수 없는 시나리오 이름은 실제 모드로 본다 (서버를 부른다)', async () => {
  stubFetch(okReply());
  globalThis.location = { search: '?scenario=typo' };
  const result = await getDriveTime(ORIGIN, { terminal: 'P01' });
  assert.equal(calls.length, 1);
  assert.equal(result.data.source, 'kakao');
});
