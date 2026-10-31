// 장소 어댑터(public/js/adapters/placeAdapter.js)와 이동 시간 어댑터의 새 장소 처리. fetch 는 가짜이고 네트워크는 쓰지 않는다.
// 카카오 응답은 서버 함수가 변환한 뒤의 모양을 이 파일 안에서 합성했다. (docs/samples 는 쓰지 않는다)
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchAddress, CLIENT_TIMEOUT_MS } from '../public/js/adapters/placeAdapter.js';
import { getDriveTime } from '../public/js/adapters/routeAdapter.js';
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

const place = (overrides = {}) => ({ id: '2001', name: '가상역 4호선', address: '서울 가상구 가상로 1', lng: 126.5, lat: 37.5, ...overrides });

/** 다음 fetch 호출에 줄 본문. 오류를 주면 던진다. 호출은 calls 에 기록한다. */
function stubFetch(reply) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (reply instanceof Error) throw reply;
    return { json: async () => (typeof reply === 'function' ? reply() : reply) };
  };
}

test('실제 모드: POST /api/places 에 본문 { query } 로 보내고, 한글 검색어는 본문에 그대로 들어간다', async () => {
  stubFetch({ ok: true, data: [place()] });
  const result = await searchAddress('  합정역  ');

  assert.deepEqual(result, { ok: true, data: [place()] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/places'); // 검색어는 주소·쿼리에 들어가지 않는다
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, JSON.stringify({ query: '합정역' })); // 앞뒤 공백은 뺀다
  assert.ok(calls[0].init.body.includes('합정역')); // 퍼센트 인코딩되지 않은 그대로
  assert.ok(!calls[0].url.includes('합정') && !calls[0].url.includes(encodeURIComponent('합정')));
});

test('2글자 미만(공백 제외)은 서버를 부르지 않는다', async () => {
  stubFetch({ ok: true, data: [place()] });
  for (const query of ['', '  ', '역', '  역  ', undefined, null]) {
    assert.deepEqual(await searchAddress(query), { ok: true, data: [] }, String(query));
  }
  assert.equal(calls.length, 0);
});

test('시나리오 모드는 서버를 부르지 않고 목업 목록을 쓴다', async () => {
  stubFetch({ ok: true, data: [place()] });
  globalThis.location = { search: '?scenario=normal' };
  const result = await searchAddress('합정');
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.map((p) => p.id), ['p-hapjeong']);
  assert.equal(calls.length, 0);
});

test('결과 없음(빈 배열)은 오류가 아니라 ok: true 와 빈 배열', async () => {
  stubFetch({ ok: true, data: [] });
  assert.deepEqual(await searchAddress('없는장소이름'), { ok: true, data: [] });
});

test('같은 역이 두 줄로 와도 합치지 않고 받은 순서 그대로 돌려준다', async () => {
  const data = [place({ id: '2001', name: '가상역 4호선' }), place({ id: '2002', name: '가상역 수인분당선' }), place({ id: '2003', name: '가상역 4호선' })];
  stubFetch({ ok: true, data });
  const result = await searchAddress('가상역');
  assert.deepEqual(result.data.map((p) => p.id), ['2001', '2002', '2003']);
});

test('서버 reason: quota 는 따로, invalid · config · error · 모르는 값은 error', async () => {
  const cases = [
    ['quota', 'quota'],
    ['invalid', 'error'],
    ['config', 'error'],
    ['error', 'error'],
    ['something', 'error'],
  ];
  for (const [serverReason, expected] of cases) {
    stubFetch({ ok: false, reason: serverReason });
    assert.deepEqual(await searchAddress('합정역'), { ok: false, reason: expected }, serverReason);
  }
});

test('연결 실패는 error, 시간 초과는 timeout, JSON 이 아닌 응답과 이상한 본문은 error', async () => {
  stubFetch(new TypeError('network'));
  assert.deepEqual(await searchAddress('합정역'), { ok: false, reason: 'error' });

  const timeout = new Error('timeout');
  timeout.name = 'TimeoutError';
  stubFetch(timeout);
  assert.deepEqual(await searchAddress('합정역'), { ok: false, reason: 'timeout' });

  stubFetch(() => {
    throw new SyntaxError('Unexpected token <');
  });
  assert.deepEqual(await searchAddress('합정역'), { ok: false, reason: 'error' });

  for (const body of [null, {}, { ok: true }, { ok: true, data: 'x' }, { ok: true, data: {} }]) {
    stubFetch(body);
    assert.deepEqual(await searchAddress('합정역'), { ok: false, reason: 'error' }, JSON.stringify(body));
  }
});

test('시간 제한은 서버(8초)보다 길다', () => {
  assert.ok(CLIENT_TIMEOUT_MS > 8000);
});

test('취소 신호를 주면 요청에 연결되고, 취소되면 aborted 로 돌려준다 (시간 초과와 구분)', async () => {
  const controller = new AbortController();
  globalThis.fetch = (url, init) => {
    calls.push({ url: String(url), init });
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
  };
  const pending = searchAddress('합정역', { signal: controller.signal });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  controller.abort();
  assert.deepEqual(await pending, { ok: false, reason: 'aborted' });
});

test('클라이언트 콘솔에 검색어를 남기지 않는다 (성공·실패 모두)', async () => {
  const secret = '비밀스러운검색어';
  stubFetch({ ok: true, data: [place()] });
  await searchAddress(secret);
  stubFetch({ ok: false, reason: 'quota' });
  await searchAddress(secret);
  stubFetch(new Error(`failed for ${secret}`));
  await searchAddress(secret);
  stubFetch(() => {
    throw new SyntaxError(secret);
  });
  await searchAddress(secret);
  assert.ok(logged.every((line) => !line.includes(secret)));
});

test('이동 시간(시나리오 모드): 목업 id 는 기존 값, 목업에 없는 새 장소는 고정 예시 값과 source: mock', async () => {
  // 실제 모드에서는 이동 시간 어댑터가 서버 함수(/api/route)를 부르고 고정 예시 값을 쓰지 않는다. (tests/routeAdapter.test.js)
  globalThis.location = { search: '?scenario=normal' };
  const known = await getDriveTime({ id: 'p-gangnam' });
  assert.equal(known.data.minutes, MOCK_DRIVE['p-gangnam'].minutes);

  const fresh = await getDriveTime({ id: '2001', name: '가상역 4호선' });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.data.minutes, EXAMPLE_DRIVE.minutes);
  assert.equal(fresh.data.distanceKm, EXAMPLE_DRIVE.distanceKm);
  assert.equal(fresh.data.source, 'mock'); // 실제 값이 아니므로 "이동 시간도 다시 확인했어요"를 쓰지 않게 한다
  assert.equal(calls.length, 0); // 길찾기는 연결하지 않았다
});

test('고정 예시 이동 시간은 기존 목업 값의 범위 안이다', () => {
  const minutes = Object.values(MOCK_DRIVE).map((d) => d.minutes);
  const km = Object.values(MOCK_DRIVE).map((d) => d.distanceKm);
  assert.ok(EXAMPLE_DRIVE.minutes >= Math.min(...minutes) && EXAMPLE_DRIVE.minutes <= Math.max(...minutes));
  assert.ok(EXAMPLE_DRIVE.distanceKm >= Math.min(...km) && EXAMPLE_DRIVE.distanceKm <= Math.max(...km));
});

test('시나리오 routefail 은 새 장소여도 실패한다', async () => {
  globalThis.location = { search: '?scenario=routefail' };
  assert.deepEqual(await getDriveTime({ id: '2001' }), { ok: false, reason: 'error' });
});
