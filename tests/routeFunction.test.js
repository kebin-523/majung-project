// 길찾기 함수(server/kakao/handleRoute.js)를 직접 불러 확인한다. fetch·키는 모두 가짜이고 네트워크는 쓰지 않는다.
// 카카오 응답은 이 파일 안에서 합성한 값이다. docs/samples 의 파일은 쓰지 않는다.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleRoute, UPSTREAM_TIMEOUT_MS } from '../server/kakao/handleRoute.js';
import { getDestination } from '../server/kakao/destinations.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

const KEY = 'secret-KAKAO-key+/=value';
const ORIGIN = { lng: 126.987654, lat: 37.123456 }; // 합성한 출발지. 로그·응답에 나오면 안 된다

/** 성공 응답. 쓰지 않는 필드(fare·sections·좌표)를 일부러 채워 두어 응답에 새지 않는지 본다. */
const kakaoOk = (duration = 2383, distance = 38366) =>
  JSON.stringify({
    trans_id: 'synthetic-trans-id',
    routes: [
      {
        result_code: 0,
        result_msg: '길찾기 성공',
        summary: {
          origin: { name: '', x: 126.111111, y: 37.222222 },
          destination: { name: '', x: 126.333333, y: 37.444444 },
          fare: { taxi: 51000, toll: 1700 },
          distance,
          duration,
        },
        sections: [{ distance, duration, roads: [{ name: '합성대로', vertexes: [126.5, 37.5] }] }],
      },
    ],
  });
const kakaoCode = (code) => JSON.stringify({ trans_id: 'synthetic-trans-id', routes: [{ result_code: code, result_msg: '합성 메시지' }] });

/** 호출을 기록하는 가짜 fetch. reply 는 { status, text } 이거나 던질 오류, 'hang' 은 신호가 중단될 때까지 기다린다. */
function fakeFetch(reply) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (reply === 'hang') {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    }
    if (reply instanceof Error) throw reply;
    return { status: reply.status ?? 200, text: async () => reply.text };
  };
  return { impl, calls };
}

const bodyOf = (overrides = {}) => JSON.stringify({ origin: { ...ORIGIN }, terminal: 'P01', ...overrides });

const post = (rawBody, { method = 'POST' } = {}) =>
  new Request('https://majung.example/api/route', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' || method === 'HEAD' ? undefined : rawBody,
  });

async function run(rawBody, reply, options = {}) {
  const apiKey = 'apiKey' in options ? options.apiKey : KEY; // apiKey: undefined 는 "환경변수 없음"
  const upstream = fakeFetch(reply);
  const response = await handleRoute(post(rawBody, options), {
    apiKey,
    fetch: upstream.impl,
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
  return { response, calls: upstream.calls };
}
const json = (response) => response.clone().json();

let logged;
let originals;
beforeEach(() => {
  logged = [];
  originals = { error: console.error, log: console.log, info: console.info, warn: console.warn };
  for (const name of Object.keys(originals)) console[name] = (...args) => logged.push(args.join(' '));
});
afterEach(() => {
  Object.assign(console, originals);
});

test('성공(두 터미널): 카카오를 한 번만 부르고 { minutes, distanceKm } 만 200 으로 돌려준다', async () => {
  for (const terminal of ['P01', 'P03']) {
    const { response, calls } = await run(bodyOf({ terminal }), { text: kakaoOk() });
    assert.equal(response.status, 200, terminal);
    assert.equal(calls.length, 1, terminal);
    assert.deepEqual(await json(response), { ok: true, data: { minutes: 40, distanceKm: 38.4 } }, terminal);
  }
});

test('요청 주소와 헤더: 터미널 코드로 서버가 목적지를 고르고, 키는 헤더에만 있다', async () => {
  for (const terminal of ['P01', 'P03']) {
    const { calls } = await run(bodyOf({ terminal }), { text: kakaoOk() });
    const url = new URL(calls[0].url);
    const destination = getDestination(terminal);

    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'apis-navi.kakaomobility.com');
    assert.equal(url.pathname, '/v1/directions');
    assert.deepEqual([...url.searchParams.keys()], ['origin', 'destination', 'priority']);
    assert.equal(url.searchParams.get('origin'), `${ORIGIN.lng},${ORIGIN.lat}`);
    assert.equal(url.searchParams.get('destination'), `${destination.lng},${destination.lat}`);
    assert.equal(url.searchParams.get('priority'), 'RECOMMEND');
    assert.equal(calls[0].init.method ?? 'GET', 'GET');
    assert.equal(calls[0].init.headers.Authorization, `KakaoAK ${KEY}`);
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    assert.ok(!calls[0].url.includes(KEY));
  }
});

test('클라이언트가 보낸 목적지 좌표는 쓰지 않는다', async () => {
  const { calls } = await run(bodyOf({ destination: { lng: 127, lat: 37 }, lng: 127, lat: 37 }), { text: kakaoOk() });
  const destination = getDestination('P01');
  assert.equal(new URL(calls[0].url).searchParams.get('destination'), `${destination.lng},${destination.lat}`);
});

test('시간 제한 기본값은 8초', () => {
  assert.equal(UPSTREAM_TIMEOUT_MS, 8000);
});

test('경로 없음(result_code 1 · 101~104)은 HTTP 200 에 { ok: false, reason: noroute }', async () => {
  for (const code of [1, 101, 102, 103, 104]) {
    const { response, calls } = await run(bodyOf(), { text: kakaoCode(code) });
    assert.equal(response.status, 200, String(code));
    assert.deepEqual(await json(response), { ok: false, reason: 'noroute' }, String(code));
    assert.equal(calls.length, 1);
  }
});

test('오류 reason 과 HTTP 상태: 429 quota, 401·403 config, 400 은 error, 5xx 는 error', async () => {
  const cases = [
    [{ status: 429, text: '' }, 'quota', 429],
    [{ status: 401, text: '{}' }, 'config', 500],
    [{ status: 403, text: '{}' }, 'config', 500],
    [{ status: 400, text: JSON.stringify({ code: -2, msg: '출발지가 유효하지 않습니다.' }) }, 'error', 502], // 우리 쪽 버그일 가능성이 큼
    [{ status: 404, text: '' }, 'error', 502],
    [{ status: 500, text: 'oops' }, 'error', 502],
    [{ status: 502, text: '' }, 'error', 502],
    [{ status: 503, text: '' }, 'error', 502],
    [{ status: 200, text: 'not json' }, 'error', 502],
    [{ status: 200, text: JSON.stringify({ routes: [] }) }, 'error', 502],
    [{ status: 200, text: JSON.stringify({ code: -2, msg: 'x' }) }, 'error', 502],
    [{ status: 200, text: kakaoCode(105) }, 'error', 502], // 주변 유고는 일시적일 수 있어 error (가정)
    [{ status: 200, text: kakaoOk(0, 100) }, 'error', 502],
    [{ status: 200, text: kakaoOk(100, 0) }, 'error', 502],
  ];
  for (const [reply, reason, status] of cases) {
    const { response, calls } = await run(bodyOf(), reply);
    assert.equal(response.status, status, `${reply.status} ${reply.text}`);
    assert.deepEqual(await json(response), { ok: false, reason });
    assert.equal(calls.length, 1); // 재시도하지 않는다
  }
});

test('연결 실패는 error 이고 한 번만 부른다', async () => {
  const { response, calls } = await run(bodyOf(), new TypeError('fetch failed'));
  assert.equal(response.status, 502);
  assert.deepEqual(await json(response), { ok: false, reason: 'error' });
  assert.equal(calls.length, 1);
});

test('시간 초과도 error 로 돌려주고 다시 부르지 않는다', async () => {
  const { response, calls } = await run(bodyOf(), 'hang', { timeoutMs: 20 });
  assert.equal(response.status, 502);
  assert.deepEqual(await json(response), { ok: false, reason: 'error' });
  assert.equal(calls.length, 1);
});

test('잘못된 본문은 카카오를 부르지 않고 400 invalid', async () => {
  const withOrigin = (origin) => JSON.stringify({ origin, terminal: 'P01' });
  const bad = {
    '빈 본문': '',
    'JSON 이 아님': 'origin=1&terminal=P01',
    '깨진 JSON': '{"origin": {"lng": 126.9',
    null: 'null',
    '배열': JSON.stringify([{ lng: 126.9, lat: 37.1 }, 'P01']),
    '문자열': JSON.stringify('P01'),
    '빈 객체': '{}',
    'origin 누락': JSON.stringify({ terminal: 'P01' }),
    'origin null': withOrigin(null),
    'origin 문자열': withOrigin('126.9,37.1'),
    'origin 배열': withOrigin([126.9, 37.1]),
    'lat 누락': withOrigin({ lng: 126.9 }),
    'lng 누락': withOrigin({ lat: 37.1 }),
    '문자열 좌표': withOrigin({ lng: '126.9', lat: '37.1' }),
    '좌표가 null': withOrigin({ lng: null, lat: 37.1 }),
    '한국 밖(도쿄)': withOrigin({ lng: 139.7, lat: 35.7 }),
    '한국 밖(런던)': withOrigin({ lng: -0.12, lat: 51.5 }),
    '한국 밖(0,0)': withOrigin({ lng: 0, lat: 0 }),
    '경도·위도 순서 바뀜': withOrigin({ lng: 37.1, lat: 126.9 }),
    '범위를 크게 벗어남': withOrigin({ lng: 1e9, lat: 37.1 }),
    'terminal 누락': JSON.stringify({ origin: ORIGIN }),
    'terminal P02(탑승동)': bodyOf({ terminal: 'P02' }),
    'terminal 소문자': bodyOf({ terminal: 'p01' }),
    'terminal 공백 포함': bodyOf({ terminal: 'P01 ' }),
    'terminal 모르는 값': bodyOf({ terminal: 'P04' }),
    'terminal 숫자': bodyOf({ terminal: 1 }),
    'terminal null': bodyOf({ terminal: null }),
    'terminal 배열': bodyOf({ terminal: ['P01'] }),
    'terminal constructor': bodyOf({ terminal: 'constructor' }),
    'terminal __proto__': bodyOf({ terminal: '__proto__' }),
    '본문이 너무 큼': bodyOf({ memo: 'x'.repeat(5000) }),
  };
  for (const [name, raw] of Object.entries(bad)) {
    const { response, calls } = await run(raw, { text: kakaoOk() });
    assert.equal(response.status, 400, name);
    assert.deepEqual(await json(response), { ok: false, reason: 'invalid' }, name);
    assert.equal(calls.length, 0, name);
  }
});

test('POST 가 아니면 405 이고 외부를 부르지 않는다', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const { response, calls } = await run(bodyOf(), { text: kakaoOk() }, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('Allow'), 'POST');
    assert.equal(calls.length, 0);
  }
});

test('키가 없으면 외부를 부르지 않고 config', async () => {
  for (const apiKey of [undefined, '', '   ']) {
    const { response, calls } = await run(bodyOf(), { text: kakaoOk() }, { apiKey });
    assert.equal(response.status, 500);
    assert.deepEqual(await json(response), { ok: false, reason: 'config' });
    assert.equal(calls.length, 0);
  }
});

test('모든 응답에 Cache-Control: no-store (성공·경로 없음·오류·잘못된 본문·405·키 없음)', async () => {
  const replies = [
    { text: kakaoOk() },
    { text: kakaoCode(104) },
    { status: 429, text: '' },
    { status: 401, text: '' },
    { status: 400, text: '{}' },
    { status: 503, text: '' },
    { status: 200, text: 'not json' },
  ];
  for (const reply of replies) {
    const { response } = await run(bodyOf(), reply);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', `${reply.status} ${reply.text.slice(0, 20)}`);
  }
  const failures = [
    await run(bodyOf(), new TypeError('x')),
    await run('not json', { text: '' }),
    await run(bodyOf({ terminal: 'P02' }), { text: '' }),
    await run(bodyOf(), { text: '' }, { apiKey: undefined }),
    await run(bodyOf(), { text: '' }, { method: 'GET' }),
  ];
  for (const { response } of failures) assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('응답과 로그에 키가 없다', async () => {
  const failure = new Error(`failed with Authorization: KakaoAK ${KEY}`);
  const results = [
    await run(bodyOf(), failure),
    await run(bodyOf(), { status: 401, text: `bad key ${KEY}` }),
    await run(bodyOf(), { status: 200, text: `${KEY} not json` }),
    await run(bodyOf(), { text: kakaoOk() }),
  ];
  for (const { response } of results) {
    const text = await response.clone().text();
    assert.ok(!text.includes(KEY) && !text.includes(encodeURIComponent(KEY)));
  }
  assert.ok(logged.length > 0);
  assert.ok(logged.every((line) => !line.includes(KEY) && !line.includes(encodeURIComponent(KEY))));
});

test('응답에 좌표·요금·구간이 새지 않고 minutes 와 distanceKm 만 있다', async () => {
  const { response } = await run(bodyOf(), { text: kakaoOk() });
  const text = await response.clone().text();
  for (const leaked of ['fare', 'taxi', 'toll', 'sections', 'roads', 'vertexes', 'synthetic', '합성', '126.', '37.']) {
    assert.ok(!text.includes(leaked), leaked);
  }
  assert.deepEqual(Object.keys((await json(response)).data), ['minutes', 'distanceKm']);
});

test('로그에는 좌표·장소 이름·터미널 코드가 없고 reason, 상태 코드, 분만 남는다', async () => {
  const thrown = new Error(`failed origin=${ORIGIN.lng},${ORIGIN.lat} terminal=P01 key=${KEY}`);
  await run(bodyOf(), { text: kakaoOk() });
  await run(bodyOf({ terminal: 'P03' }), { text: kakaoOk(2400, 1000) });
  await run(bodyOf(), { text: kakaoCode(104) });
  await run(bodyOf(), { status: 429, text: `${ORIGIN.lng}` });
  await run(bodyOf(), { status: 401, text: '' });
  await run(bodyOf(), { status: 400, text: JSON.stringify({ code: -2, msg: `${ORIGIN.lat}` }) });
  await run(bodyOf(), { status: 503, text: '' });
  await run(bodyOf(), thrown);
  await run(bodyOf(), { text: `not json ${ORIGIN.lng}` });
  await run(bodyOf(), { text: '' }, { apiKey: undefined });
  await run(bodyOf({ terminal: 'P02' }), { text: '' }); // invalid
  await run(JSON.stringify({ origin: { lng: 139.7, lat: 35.7 }, terminal: 'P01' }), { text: '' }); // invalid(한국 밖)
  await run(`{"origin": {"lng": ${ORIGIN.lng}`, { text: '' }); // 깨진 JSON

  assert.ok(logged.length >= 12);
  const everything = logged.join('\n');
  const destinations = ['P01', 'P03'].map(getDestination);
  const forbidden = [
    String(ORIGIN.lng), String(ORIGIN.lat), '139.7', '35.7',
    ...destinations.flatMap((d) => [String(d.lng), String(d.lat), d.name, d.placeId]),
    'P01', 'P02', 'P03', '인천국제공항', '터미널', 'origin', 'terminal', KEY, encodeURIComponent(KEY),
  ];
  for (const word of forbidden) assert.ok(!everything.includes(word), word);

  assert.ok(logged.some((line) => line.includes('minutes=40')));
  assert.ok(logged.some((line) => line.includes('noroute') && line.includes('200')));
  assert.ok(logged.some((line) => line.includes('quota') && line.includes('429')));
  assert.ok(logged.some((line) => line.includes('config') && line.includes('401')));
  assert.ok(logged.some((line) => line.includes('error') && line.includes('503')));
});
