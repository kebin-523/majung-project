// 항공편 조회 함수(server/icn/handleFlights.js)를 직접 불러 확인한다. fetch·키·시계는 모두 가짜이고 네트워크는 쓰지 않는다.
// 응답 본문은 이 파일 안에서 합성한 값이라 tests/fixtures 가 없어도 통과한다.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleFlights, NUM_OF_ROWS } from '../server/icn/handleFlights.js';
import { blockNetwork } from './helpers/blockNetwork.js';

blockNetwork();

const NOW = Date.UTC(2026, 9, 30, 3, 0);
const KEY = 'secret-KEY+/=value';

const row = (overrides = {}) => ({
  flightId: 'KE123',
  fid: '2026103000000000000001',
  scheduleDateTime: '202610301100',
  estimatedDateTime: '202610301120',
  remark: null,
  airport: '도쿄/나리타',
  airportCode: 'NRT',
  airline: '대한항공',
  terminalid: 'P01',
  ...overrides,
});

const body = (items, totalCount = items.length) =>
  JSON.stringify({
    response: {
      header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
      body: { numOfRows: 500, pageNo: 1, totalCount, items },
    },
  });

/** 호출을 기록하는 가짜 fetch. reply 는 { status, text } 이거나 던질 오류 */
function fakeFetch(reply) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (reply instanceof Error) throw reply;
    return { status: reply.status ?? 200, text: async () => reply.text };
  };
  return { impl, calls };
}

const request = (path, method = 'GET') => new Request(`https://majung.example${path}`, { method });
const SEARCH = '/api/flights?mode=search&flightNo=KE123&date=2026-10-30';
const REFRESH = '/api/flights?mode=refresh&fid=2026103000000000000001&date=2026-10-30';

async function run(path, reply, options = {}) {
  const { method = 'GET' } = options;
  const apiKey = 'apiKey' in options ? options.apiKey : KEY; // apiKey: undefined 는 "환경변수 없음"을 뜻한다
  const upstream = fakeFetch(reply);
  const response = await handleFlights(request(path, method), { apiKey, fetch: upstream.impl, now: () => NOW });
  return { response, calls: upstream.calls };
}
const json = (response) => response.clone().json();

let logged;
let originalError;
beforeEach(() => {
  logged = [];
  originalError = console.error;
  console.error = (...args) => logged.push(args.join(' '));
});
afterEach(() => {
  console.error = originalError;
});

test('검색 성공: https 로 한 번만 부르고 numOfRows 500, 편명·날짜·JSON 형식을 담는다', async () => {
  const { response, calls } = await run(SEARCH, { text: body([row()]) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);

  const url = new URL(calls[0].url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'apis.data.go.kr');
  assert.equal(url.searchParams.get('type'), 'json');
  assert.equal(url.searchParams.get('searchday'), '20261030');
  assert.equal(url.searchParams.get('flight_id'), 'KE123');
  assert.equal(url.searchParams.get('f_id'), null);
  assert.equal(url.searchParams.get('numOfRows'), String(NUM_OF_ROWS));
  assert.equal(NUM_OF_ROWS, 500);
  assert.equal(url.searchParams.get('pageNo'), '1');
  assert.equal(url.searchParams.get('serviceKey'), KEY); // 인코딩은 한 번만 (읽어 내면 원래 키)
});

test('성공 응답: 서버가 부른 시각이 fetchedAt 으로 담기고, 변환된 항공편이 그대로 나간다', async () => {
  const { response } = await run(SEARCH, { text: body([row()]) });
  const result = await json(response);
  assert.equal(result.ok, true);
  assert.equal(result.fetchedAt, NOW);
  assert.equal(result.truncated, false);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].flightNo, 'KE123');
  assert.equal(result.data[0].fetchedAt, NOW);
  assert.equal(result.data[0].status, 'none');
  assert.equal('landed' in result.data[0], false); // landed 는 화면 어댑터가 정한다
});

test('성공 응답에만 CDN 캐시 5분 헤더가 붙는다 (브라우저는 매번 다시 확인)', async () => {
  const { response } = await run(SEARCH, { text: body([row()]) });
  assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=300');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(response.headers.get('Netlify-Vary'), 'query');
});

test('잘림 표시(truncated)는 검색 성공 응답에 그대로 전달하고 다음 페이지를 부르지 않는다', async () => {
  const { response, calls } = await run(SEARCH, { text: body([row()], 1153) });
  const result = await json(response);
  assert.equal(result.truncated, true);
  assert.equal(calls.length, 1);
});

test('재확인: f_id 로 부르고 한 건을 돌려주며 truncated 는 없다', async () => {
  const { response, calls } = await run(REFRESH, { text: body([row()]) });
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('f_id'), '2026103000000000000001');
  assert.equal(url.searchParams.get('flight_id'), null);
  const result = await json(response);
  assert.equal(result.ok, true);
  assert.equal(Array.isArray(result.data), false);
  assert.equal(result.data.flightId, '2026103000000000000001');
  assert.equal('truncated' in result, false);
});

test('0건(notfound·missing)은 캐시하지 않는다', async () => {
  for (const [path, reason] of [[SEARCH, 'notfound'], [REFRESH, 'missing']]) {
    const { response } = await run(path, { text: body([], 0) });
    assert.equal(response.status, 200);
    assert.deepEqual(await json(response), { ok: false, reason });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), null);
  }
});

test('오류 응답은 캐시하지 않고 reason 을 나눠 돌려준다: quota / config / error', async () => {
  const cases = [
    [{ status: 200, text: 'API token quota exceeded' }, 'quota', 429],
    [{ status: 200, text: 'Unauthorized' }, 'config', 500],
    [{ status: 502, text: 'Bad Gateway' }, 'error', 502],
    [{ status: 200, text: 'not json' }, 'error', 502],
  ];
  for (const [reply, reason, status] of cases) {
    const { response } = await run(SEARCH, reply);
    assert.equal(response.status, status, reason);
    assert.deepEqual(await json(response), { ok: false, reason });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), null);
  }
});

test('연결 실패·시간 초과는 error 이고, http 로 바꿔 다시 부르지 않는다', async () => {
  for (const name of ['TypeError', 'TimeoutError']) {
    const failure = new Error(`boom ${KEY}`);
    failure.name = name;
    const { response, calls } = await run(SEARCH, failure);
    assert.deepEqual(await json(response), { ok: false, reason: 'error' });
    assert.equal(calls.length, 1);
    assert.ok(calls.every((call) => call.url.startsWith('https://')));
  }
});

test('응답과 로그에 서비스 키가 없다', async () => {
  const failure = new Error(`failed for serviceKey=${KEY}`);
  const results = [
    await run(SEARCH, failure),
    await run(SEARCH, { text: 'Unauthorized' }),
    await run(SEARCH, { text: body([row()]) }),
  ];
  for (const { response } of results) {
    const text = await response.clone().text();
    assert.ok(!text.includes(KEY) && !text.includes(encodeURIComponent(KEY)));
  }
  assert.ok(logged.length > 0);
  assert.ok(logged.every((line) => !line.includes(KEY) && !line.includes(encodeURIComponent(KEY))));
});

test('실패 로그에 메시지·HTTP 상태·본문 앞부분·keyEmpty 가 남고 키는 가려진다', async () => {
  await run(SEARCH, { status: 502, text: `Bad Gateway ${KEY} ${'x'.repeat(500)}` });
  const upstreamLog = logged.at(-1);
  assert.match(upstreamLog, /httpStatus=502/);
  assert.match(upstreamLog, /body=Bad Gateway \*\*\*/);
  assert.match(upstreamLog, /keyEmpty=false/);
  assert.ok(upstreamLog.length < 400);
  assert.ok(!upstreamLog.includes(KEY));

  const failure = new Error(`failed for serviceKey=${KEY}`);
  failure.name = 'TypeError';
  await run(SEARCH, failure);
  const thrownLog = logged.at(-1);
  assert.match(thrownLog, /TypeError: failed for serviceKey=\*\*\*/);
  assert.match(thrownLog, /keyEmpty=false/);
  assert.ok(!thrownLog.includes(KEY) && !thrownLog.includes(encodeURIComponent(KEY)));

  await run(SEARCH, { text: body([row()]) }, { apiKey: undefined });
  assert.match(logged.at(-1), /keyEmpty=true/);
});

test('키가 없으면 외부를 부르지 않고 config', async () => {
  for (const apiKey of [undefined, '', '   ']) {
    const { response, calls } = await run(SEARCH, { text: body([row()]) }, { apiKey });
    assert.equal(calls.length, 0);
    assert.deepEqual(await json(response), { ok: false, reason: 'config' });
  }
});

test('이미 인코딩된 키는 한 번 풀어서 이중 인코딩을 막는다', async () => {
  const { calls } = await run(SEARCH, { text: body([row()]) }, { apiKey: 'ab%2Bc%2Fd%3D' });
  assert.equal(new URL(calls[0].url).searchParams.get('serviceKey'), 'ab+c/d=');
});

test('잘못된 요청 값은 외부를 부르지 않고 400 config', async () => {
  const bad = [
    '/api/flights?mode=search&flightNo=KE123',
    '/api/flights?mode=search&date=2026-10-30',
    '/api/flights?mode=search&flightNo=KE123&date=2026-13-40',
    '/api/flights?mode=search&flightNo=KE123&date=20261030',
    '/api/flights?mode=search&flightNo=ke%20123&date=2026-10-30',
    '/api/flights?mode=search&flightNo=K&date=2026-10-30',
    '/api/flights?mode=refresh&date=2026-10-30',
    '/api/flights?mode=refresh&fid=a%26b&date=2026-10-30',
    '/api/flights?mode=other&flightNo=KE123&date=2026-10-30',
  ];
  for (const path of bad) {
    const { response, calls } = await run(path, { text: body([row()]) });
    assert.equal(response.status, 400, path);
    assert.deepEqual(await json(response), { ok: false, reason: 'config' });
    assert.equal(calls.length, 0, path);
  }
});

test('GET 이 아니면 405 이고 외부를 부르지 않는다', async () => {
  const { response, calls } = await run(SEARCH, { text: body([row()]) }, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET');
  assert.equal(calls.length, 0);
});

test('착륙·도착·모르는 상태는 변환 결과의 status 로 그대로 나간다', async () => {
  const items = [
    row({ fid: 'A1', remark: '착륙' }),
    row({ fid: 'A2', remark: '도착' }),
    row({ fid: 'A3', remark: '결항' }),
  ];
  const { response } = await run(SEARCH, { text: body(items) });
  const result = await json(response);
  assert.deepEqual(result.data.map((f) => f.status), ['touchdown', 'arrived', 'unknown']);
});

// ── 시간대 조회(window) ─────────────────────────────────────

const WINDOW = '/api/flights?mode=window&date=2026-10-30&from=1700&to=1800';

test('window 성공: searchday·from_time·to_time 을 담아 한 번만 부르고 flight_id·f_id·inqtimechcd 는 보내지 않는다', async () => {
  const { response, calls } = await run(WINDOW, { text: body([row()]) });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);

  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('searchday'), '20261030');
  assert.equal(url.searchParams.get('from_time'), '1700');
  assert.equal(url.searchParams.get('to_time'), '1800');
  assert.equal(url.searchParams.get('flight_id'), null);
  assert.equal(url.searchParams.get('f_id'), null);
  assert.equal(url.searchParams.get('inqtimechcd'), null);
  assert.equal(url.searchParams.get('numOfRows'), '500');
  assert.equal(Array.isArray((await json(response)).data), true);
});

test('window: 종료 2400 은 받아들인다', async () => {
  const { response, calls } = await run('/api/flights?mode=window&date=2026-10-30&from=2100&to=2400', { text: body([row()]) });
  assert.equal(response.status, 200);
  assert.equal(new URL(calls[0].url).searchParams.get('to_time'), '2400');
});

test('window: 잘못된 시간은 외부를 부르지 않고 config 400', async () => {
  const bad = ['from=2400&to=2400', 'from=1800&to=1700', 'from=1700&to=1700', 'from=1700&to=2100', 'from=1760&to=1800', 'from=17&to=18', 'to=1800', 'from=1700&to=2401'];
  for (const query of bad) {
    const { response, calls } = await run(`/api/flights?mode=window&date=2026-10-30&${query}`, { text: body([row()]) });
    assert.equal(response.status, 400, query);
    assert.equal((await json(response)).reason, 'config', query);
    assert.equal(calls.length, 0, query);
  }
});

test('window: 0건이면 notfound 이고 캐시하지 않는다', async () => {
  const { response } = await run(WINDOW, { text: body([], 0) });
  assert.deepEqual(await json(response), { ok: false, reason: 'notfound' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('window: 성공은 CDN 캐시 5분, totalCount 가 받은 행보다 크면 truncated true', async () => {
  const { response, calls } = await run(WINDOW, { text: body([row()], 800) });
  assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), 'public, s-maxage=300');
  assert.equal((await json(response)).truncated, true);
  assert.equal(calls.length, 1);
});
